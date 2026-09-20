/**
 * send-otp.job — dispatch the OTP to the user.
 *
 * Implements otpplan.md §4.7:
 *   - delivery happens off the request path (background job)
 *   - retry with exponential backoff, up to OTP_SEND_RETRY_ATTEMPTS
 *   - the plaintext code exists only in this job's memory, never in the DB
 *
 * This is an in-process queue. It keeps the register endpoint responsive
 * without requiring a broker; swap `enqueue` for BullMQ/Redis when the
 * app moves to multiple instances.
 */

import { otpConfig } from '../otp.config.js';
import { getOtpSenderForChannel } from '../senders/index.js';
import { OtpChannelType } from '../otp.constants.js';

export interface SendOtpJobPayload {
  otpId: string;
  userId: string;
  channel: OtpChannelType;
  destination: string;
  /** Plaintext code — memory only, never persisted, never logged. */
  code: string;
  recipientName?: string | null;
}

export interface SendOtpJobResult {
  ok: boolean;
  attempts: number;
  providerMessageId?: string;
  error?: string;
}

/** Audit hook — the caller wires this to the audit log without codes. */
export type SendOtpAuditHook = (event: {
  type: 'otp_delivery_succeeded' | 'otp_delivery_failed';
  otpId: string;
  userId: string;
  channel: OtpChannelType;
  attempts: number;
  error?: string;
}) => void;

let auditHook: SendOtpAuditHook | null = null;

export function setSendOtpAuditHook(hook: SendOtpAuditHook | null): void {
  auditHook = hook;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deliver an OTP with retries. The payload's `code` is dropped from the
 * local reference as soon as delivery stops being attempted.
 */
export async function runSendOtpJob(payload: SendOtpJobPayload): Promise<SendOtpJobResult> {
  const maxAttempts = Math.max(1, otpConfig.sendRetryAttempts);
  const baseDelay = otpConfig.sendRetryBaseDelayMs;
  const sender = getOtpSenderForChannel(payload.channel);
  const ttlMinutes = Math.round(otpConfig.ttlSeconds / 60);

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await sender.send({
      destination: payload.destination,
      code: payload.code,
      ttlMinutes,
      recipientName: payload.recipientName,
    });

    if (result.ok) {
      auditHook?.({
        type: 'otp_delivery_succeeded',
        otpId: payload.otpId,
        userId: payload.userId,
        channel: payload.channel,
        attempts: attempt,
      });
      return { ok: true, attempts: attempt, providerMessageId: result.providerMessageId };
    }

    lastError = result.error;
    // A misconfigured sender will not fix itself on retry.
    const permanentFailure =
      result.error?.includes('belum dikonfigurasi') ||
      result.error?.includes('tidak tersedia') ||
      result.error?.includes('dinonaktifkan');

    if (permanentFailure) break;

    if (attempt < maxAttempts) {
      // Exponential backoff: base, base*2, base*4 …
      await sleep(baseDelay * Math.pow(2, attempt - 1));
    }
  }

  auditHook?.({
    type: 'otp_delivery_failed',
    otpId: payload.otpId,
    userId: payload.userId,
    channel: payload.channel,
    attempts: maxAttempts,
    error: lastError,
  });

  return { ok: false, attempts: maxAttempts, error: lastError };
}

/**
 * Fire-and-forget dispatch. The register/resend endpoints call this and
 * respond immediately — the user-facing contract never waits on the
 * mail provider.
 */
export function enqueueSendOtp(payload: SendOtpJobPayload): void {
  // Detach from the request lifecycle.
  void (async () => {
    try {
      const result = await runSendOtpJob(payload);
      if (!result.ok) {
        console.warn(
          `[OTP Job] Delivery failed for user ${payload.userId} after ${result.attempts} attempt(s): ${result.error}`
        );
      }
    } catch (err) {
      console.error('[OTP Job] Unexpected delivery error:', (err as Error).message);
    } finally {
      // Best-effort scrub of the plaintext code from this closure.
      payload.code = '';
    }
  })();
}
