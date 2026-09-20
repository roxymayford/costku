/**
 * OtpService — generate, hash, verify, invalidate.
 *
 * Follows the pseudocode in otpplan.md §4.5 and §4.6:
 *   - attempts are incremented BEFORE the comparison
 *   - the decisive state changes are atomic (consumeOtp / activateProfile),
 *     which is what makes parallel verify requests safe
 *   - resend invalidates the previous active OTP rather than leaving two live
 */

import { getOtpLength, generateOtpCode, hashOtpCode, verifyOtpCode, getDevFixedCode } from './otp.crypto.js';
import {
  OtpChannelType,
  OtpErrorCode,
  OtpErrorCodeType,
  OtpPurpose,
  OtpPurposeType,
  OTP_ERROR_MESSAGE,
  UserStatus,
} from './otp.constants.js';
import { otpConfig } from './otp.config.js';
import * as repo from './otp.repository.js';
import * as limiter from './otp.rate-limiter.js';
import { enqueueSendOtp } from './jobs/send-otp.job.js';

/** Error carrying a machine-readable OTP code plus optional extra fields. */
export class OtpError extends Error {
  readonly code: OtpErrorCodeType;
  readonly extra: Record<string, unknown>;

  constructor(code: OtpErrorCodeType, extra: Record<string, unknown> = {}) {
    super(OTP_ERROR_MESSAGE[code]);
    this.name = 'OtpError';
    this.code = code;
    this.extra = extra;
  }
}

export interface IssuedOtp {
  otpId: string;
  destinationMasked: string;
  channel: OtpChannelType;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

/* ──────────────────────────────────────────────────────────
   Audit log (otpplan.md §5) — never records the code itself
   ────────────────────────────────────────────────────────── */
export type OtpAuditEvent =
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'otp_locked'
  | 'otp_delivery_succeeded'
  | 'otp_delivery_failed';

let auditSink: ((event: OtpAuditEvent, data: Record<string, unknown>) => void) | null = null;

export function setOtpAuditSink(
  sink: ((event: OtpAuditEvent, data: Record<string, unknown>) => void) | null
): void {
  auditSink = sink;
}

export function audit(event: OtpAuditEvent, data: Record<string, unknown>): void {
  if (auditSink) {
    auditSink(event, data);
    return;
  }
  // Default sink: structured stdout line. Never contains a plaintext code.
  console.log(`[OTP Audit] ${event} ${JSON.stringify(data)}`);
}

/* ──────────────────────────────────────────────────────────
   Create + dispatch a new OTP
   ────────────────────────────────────────────────────────── */
export async function issueOtp(params: {
  userId: string;
  purpose?: OtpPurposeType;
  channel: OtpChannelType;
  destination: string;
  recipientName?: string | null;
  requestIp?: string | null;
}): Promise<IssuedOtp> {
  const purpose = params.purpose ?? OtpPurpose.REGISTER;
  const otpId = repo.newOtpId();

  // The dev fixed code keeps local testing deterministic; the generator
  // is only invoked when no override applies.
  const devCode = getDevFixedCode();
  const code = devCode ?? generateOtpCode(getOtpLength());

  const expiresAt = new Date(Date.now() + otpConfig.ttlSeconds * 1000);
  const codeHash = hashOtpCode(otpId, code);

  await repo.insertOtp({
    id: otpId,
    userId: params.userId,
    purpose,
    channel: params.channel,
    destination: params.destination,
    codeHash,
    expiresAt,
    maxAttempts: otpConfig.maxAttempts,
    requestIp: params.requestIp ?? null,
  });

  audit('otp_requested', {
    userId: params.userId,
    otpId,
    purpose,
    channel: params.channel,
    // Destination is recorded masked.
    destination: maskForAudit(params.destination),
  });

  // Delivery is asynchronous so the endpoint never blocks on the provider.
  enqueueSendOtp({
    otpId,
    userId: params.userId,
    channel: params.channel,
    destination: params.destination,
    code,
    recipientName: params.recipientName,
  });

  const { maskDestination } = await import('./otp.crypto.js');

  return {
    otpId,
    destinationMasked: maskDestination(params.destination),
    channel: params.channel,
    expiresInSeconds: otpConfig.ttlSeconds,
    resendAvailableInSeconds: otpConfig.resendCooldownSeconds,
  };
}

function maskForAudit(destination: string): string {
  if (destination.includes('@')) {
    const [local, domain] = destination.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
  const digits = destination.replace(/[^\d+]/g, '');
  if (digits.length <= 6) return '***';
  return `${digits.slice(0, 6)}****${digits.slice(-3)}`;
}

/* ──────────────────────────────────────────────────────────
   Verify — otpplan.md §4.5
   ────────────────────────────────────────────────────────── */
export async function verifyOtp(params: {
  userId: string;
  code: string;
  purpose?: OtpPurposeType;
}): Promise<{ userId: string; verifiedAt: Date }> {
  const purpose = params.purpose ?? OtpPurpose.REGISTER;

  // 1. Account must exist and still be pending.
  const profile = await repo.getProfile(params.userId);
  if (!profile) {
    throw new OtpError(OtpErrorCode.USER_NOT_FOUND);
  }
  if (profile.status === UserStatus.ACTIVE) {
    audit('otp_failed', { userId: params.userId, reason: OtpErrorCode.USER_ALREADY_VERIFIED });
    throw new OtpError(OtpErrorCode.USER_ALREADY_VERIFIED);
  }

  // 2. There must be a live OTP.
  const otp = await repo.findLatestActive(params.userId, purpose);
  if (!otp) {
    audit('otp_failed', { userId: params.userId, reason: OtpErrorCode.OTP_EXPIRED });
    throw new OtpError(OtpErrorCode.OTP_EXPIRED);
  }

  // 3. Expiry check.
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    audit('otp_failed', { userId: params.userId, otpId: otp.id, reason: OtpErrorCode.OTP_EXPIRED });
    throw new OtpError(OtpErrorCode.OTP_EXPIRED);
  }

  // 4. Attempt ceiling — checked before consuming an attempt.
  if (otp.attempts >= otp.max_attempts) {
    audit('otp_locked', { userId: params.userId, otpId: otp.id, attempts: otp.attempts });
    throw new OtpError(OtpErrorCode.OTP_MAX_ATTEMPTS, {
      remainingAttempts: 0,
    });
  }

  // 5. Increment BEFORE comparing (otpplan.md §4.5).
  const attempts = await repo.incrementAttempts(otp.id);

  // 6. Constant-time hash comparison.
  const matches = verifyOtpCode(otp.id, params.code, otp.code_hash);

  if (!matches) {
    const remaining = Math.max(0, otp.max_attempts - attempts);
    audit('otp_failed', {
      userId: params.userId,
      otpId: otp.id,
      reason: OtpErrorCode.OTP_INVALID,
      remainingAttempts: remaining,
    });

    if (remaining === 0) {
      audit('otp_locked', { userId: params.userId, otpId: otp.id, attempts });
      throw new OtpError(OtpErrorCode.OTP_MAX_ATTEMPTS, { remainingAttempts: 0 });
    }

    throw new OtpError(OtpErrorCode.OTP_INVALID, { remainingAttempts: remaining });
  }

  // 7. Single-use: claim the OTP atomically. If another request already
  //    consumed it (parallel verify with the same correct code), only one
  //    caller gets past this point.
  const claimed = await repo.consumeOtp(otp.id);
  if (!claimed) {
    audit('otp_failed', { userId: params.userId, otpId: otp.id, reason: 'ALREADY_CONSUMED' });
    throw new OtpError(OtpErrorCode.OTP_EXPIRED);
  }

  // 8. Activate the account. Guarded so a parallel request cannot
  //    double-activate.
  const activated = await repo.activateProfile(params.userId);
  if (!activated) {
    const fresh = await repo.getProfile(params.userId);
    if (fresh?.status === UserStatus.ACTIVE) {
      // Another request won the race — the account is active either way.
      throw new OtpError(OtpErrorCode.USER_ALREADY_VERIFIED);
    }
    throw new OtpError(OtpErrorCode.INTERNAL_ERROR);
  }

  const verifiedAt = new Date();
  audit('otp_verified', {
    userId: params.userId,
    otpId: otp.id,
    attempts,
    channel: otp.channel,
  });

  return { userId: params.userId, verifiedAt };
}

/* ──────────────────────────────────────────────────────────
   Resend — otpplan.md §4.6
   ────────────────────────────────────────────────────────── */
export async function resendOtp(params: {
  userId: string;
  destination: string;
  channel: OtpChannelType;
  recipientName?: string | null;
  requestIp?: string | null;
  purpose?: OtpPurposeType;
}): Promise<IssuedOtp> {
  const purpose = params.purpose ?? OtpPurpose.REGISTER;

  const profile = await repo.getProfile(params.userId);
  if (!profile) {
    throw new OtpError(OtpErrorCode.USER_NOT_FOUND);
  }
  if (profile.status === UserStatus.ACTIVE) {
    throw new OtpError(OtpErrorCode.USER_ALREADY_VERIFIED);
  }

  // 1. Per-user cooldown.
  const cooldown = await limiter.checkCooldown(params.userId);
  if (!cooldown.allowed) {
    throw new OtpError(OtpErrorCode.OTP_RESEND_COOLDOWN, {
      retryAfter: cooldown.retryAfterSeconds,
    });
  }

  // 2. Per-destination hourly cap.
  const destLimit = await limiter.checkDestinationLimit(params.destination);
  if (!destLimit.allowed) {
    throw new OtpError(OtpErrorCode.OTP_RATE_LIMITED, {
      retryAfter: destLimit.retryAfterSeconds,
      scope: 'destination',
    });
  }

  // 3. Per-IP hourly cap.
  if (params.requestIp) {
    const ipLimit = await limiter.checkIpLimit(params.requestIp);
    if (!ipLimit.allowed) {
      throw new OtpError(OtpErrorCode.OTP_RATE_LIMITED, {
        retryAfter: ipLimit.retryAfterSeconds,
        scope: 'ip',
      });
    }
  }

  // 4. Invalidate the previous OTP so exactly one stays live.
  await repo.invalidateActive(params.userId, purpose);

  // 5. Issue the replacement and start the cooldown.
  const issued = await issueOtp({
    userId: params.userId,
    purpose,
    channel: params.channel,
    destination: params.destination,
    recipientName: params.recipientName,
    requestIp: params.requestIp,
  });

  await limiter.startCooldown(params.userId);

  return issued;
}

/** Start the cooldown after an initial registration too. */
export async function startRegistrationCooldown(userId: string): Promise<void> {
  await limiter.startCooldown(userId);
}

/** Diagnostics for the health endpoint. */
export function otpRuntimeInfo(): Record<string, unknown> {
  return {
    length: otpConfig.length,
    ttlSeconds: otpConfig.ttlSeconds,
    maxAttempts: otpConfig.maxAttempts,
    resendCooldownSeconds: otpConfig.resendCooldownSeconds,
    channel: otpConfig.channel,
    rateLimiterBackend: limiter.rateLimiterBackend(),
    storageBackend: repo.storageMode(),
  };
}
