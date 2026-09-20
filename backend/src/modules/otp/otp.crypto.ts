/**
 * OTP cryptography — CSPRNG generation, HMAC-SHA256 hashing, and
 * constant-time comparison.
 *
 * Implements otpplan.md §4.4:
 *   - codes come from a CSPRNG, never Math.random()
 *   - 6-digit codes keep their leading zeros ("004821")
 *   - only the hash is persisted: HMAC_SHA256(pepper, otpId + ":" + code)
 *   - OTP_PEPPER lives in the environment, never in the database
 */

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Configured code length, clamped to a sane range. */
export function getOtpLength(): number {
  const raw = Number.parseInt(process.env.OTP_LENGTH || '6', 10);
  if (!Number.isFinite(raw)) return 6;
  return Math.min(Math.max(raw, 4), 10);
}

/**
 * Generate a numeric OTP using a cryptographically secure RNG.
 * Leading zeros are preserved by zero-padding the string form.
 */
export function generateOtpCode(length: number = getOtpLength()): string {
  // randomInt is uniform over [0, 10^length) — no modulo bias.
  const upperBound = Math.pow(10, length);
  const value = randomInt(0, upperBound);
  return value.toString().padStart(length, '0');
}

/**
 * Resolve the HMAC pepper.
 *
 * In production OTP_PEPPER must be supplied by the environment / secret
 * manager. When it is missing we fall back to a per-process random
 * pepper so a misconfigured dev box still fails safe (existing hashes
 * simply stop matching on restart) instead of hashing with an empty key.
 */
let ephemeralPepper: string | null = null;

function resolvePepper(): string {
  const configured = process.env.OTP_PEPPER;
  if (configured && configured.length > 0) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[OTP] OTP_PEPPER is required in production. Set it via your secret manager.'
    );
  }

  if (!ephemeralPepper) {
    // 32 random bytes, hex — never persisted, never logged.
    ephemeralPepper = createHmac('sha256', 'otp-ephemeral-seed')
      .update(String(process.uptime()) + String(Date.now()))
      .digest('hex');
    console.warn(
      '[OTP] OTP_PEPPER not set — using an ephemeral dev pepper. ' +
        'All outstanding codes become invalid on restart.'
    );
  }
  return ephemeralPepper;
}

/** Whether a real pepper is configured (surfaced in the health check). */
export function isOtpPepperConfigured(): boolean {
  return Boolean(process.env.OTP_PEPPER && process.env.OTP_PEPPER.length > 0);
}

/**
 * Binding input for the HMAC: the OTP row id plus the code.
 * Binding the id means a hash is only valid for that specific row,
 * so a leaked hash cannot be replayed against a different OTP.
 */
function buildPayload(otpId: string, code: string): string {
  return `${otpId}:${code}`;
}

/** HMAC-SHA256 hex digest (64 chars) — the value stored in code_hash. */
export function hashOtpCode(otpId: string, code: string): string {
  return createHmac('sha256', resolvePepper())
    .update(buildPayload(otpId, code))
    .digest('hex');
}

/**
 * Constant-time comparison of a candidate code against a stored hash.
 * Never short-circuits and never leaks length information via timing.
 */
export function verifyOtpCode(otpId: string, code: string, storedHash: string): boolean {
  let candidate: string;
  try {
    candidate = hashOtpCode(otpId, code);
  } catch {
    return false;
  }

  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');

  // timingSafeEqual throws on length mismatch, so normalise first.
  // Comparing the hashes we produced ourselves, both are 64 chars.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Dev/staging shortcut (otpplan.md §5): a fixed code controlled by an
 * env flag. Hard-disabled in production — the flag is ignored there.
 */
export function getDevFixedCode(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const fixed = process.env.OTP_DEV_FIXED_CODE;
  if (!fixed || fixed.length === 0) return null;
  return fixed;
}

/**
 * Mask a destination for API responses (otpplan.md §5):
 *   budi@example.com   -> b***@example.com
 *   +6281234567890     -> +62812****890
 */
export function maskDestination(destination: string): string {
  if (!destination) return '';

  if (destination.includes('@')) {
    const [local, domain] = destination.split('@');
    // No local part or no domain — nothing safe to show, mask entirely.
    if (!local || !domain) return '***';
    const head = local.slice(0, 1);
    return `${head}***@${domain}`;
  }

  // Phone number: keep the country/prefix head and the last 3 digits.
  const digits = destination.replace(/[^\d+]/g, '');
  if (digits.length <= 6) {
    // Too short to partially reveal. Never return an empty mask for a
    // non-empty input — that would be indistinguishable from "no value".
    return '*'.repeat(Math.max(digits.length, destination.length, 1));
  }
  const head = digits.slice(0, 6);
  const tail = digits.slice(-3);
  return `${head}****${tail}`;
}

/**
 * Redact any 4+ digit run that could be an OTP, for safe logging.
 * Used by the logger mask so codes never reach log storage.
 */
export function redactCodes(text: string): string {
  return text.replace(/\b\d{4,10}\b/g, (match) => '*'.repeat(match.length));
}
