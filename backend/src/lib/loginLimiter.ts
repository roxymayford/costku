/**
 * Login rate limiter — locks an account after too many failed password attempts.
 *
 * Stores attempts in-memory with automatic cleanup. When Redis is available
 * this could be upgraded, but the in-memory approach already handles the
 * single-process deployment well.
 *
 * Configurable via:
 *   LOGIN_MAX_ATTEMPTS       — default 5
 *   LOGIN_LOCKOUT_MINUTES    — default 15
 */

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const loginLimiterConfig = {
  get maxAttempts(): number {
    return readInt('LOGIN_MAX_ATTEMPTS', 5);
  },
  get lockoutMinutes(): number {
    return readInt('LOGIN_LOCKOUT_MINUTES', 15);
  },
} as const;

interface AttemptRecord {
  /** Number of consecutive failed attempts. */
  count: number;
  /** Timestamp (ms) of the first failure in the current streak. */
  firstFailedAt: number;
  /** Timestamp (ms) when the lockout expires, or 0 if not locked. */
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

/** Sweep stale entries every 5 minutes. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    // Remove entries whose lockout has expired and have no recent failures.
    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
      attempts.delete(key);
    }
  }
}, 300_000);
if (typeof sweeper.unref === 'function') sweeper.unref();

export interface LoginLimitResult {
  allowed: boolean;
  /** Remaining attempts before lockout (only meaningful when allowed). */
  remainingAttempts: number;
  /** Seconds until the lockout expires (only when blocked). */
  retryAfterSeconds: number;
}

/**
 * Normalise the key — email address, lowercased.
 */
function key(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Check whether a login attempt is allowed for the given email.
 */
export function checkLoginAllowed(email: string): LoginLimitResult {
  const k = key(email);
  const record = attempts.get(k);
  const max = loginLimiterConfig.maxAttempts;

  if (!record) {
    return { allowed: true, remainingAttempts: max, retryAfterSeconds: 0 };
  }

  // Currently locked out?
  if (record.lockedUntil > 0) {
    const remaining = record.lockedUntil - Date.now();
    if (remaining > 0) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil(remaining / 1000),
      };
    }
    // Lockout expired — clear and allow.
    attempts.delete(k);
    return { allowed: true, remainingAttempts: max, retryAfterSeconds: 0 };
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(0, max - record.count),
    retryAfterSeconds: 0,
  };
}

/**
 * Record a failed login attempt. Returns the updated limit state.
 */
export function recordFailedLogin(email: string): LoginLimitResult {
  const k = key(email);
  const max = loginLimiterConfig.maxAttempts;
  const lockoutMs = loginLimiterConfig.lockoutMinutes * 60 * 1000;

  let record = attempts.get(k);
  if (!record) {
    record = { count: 0, firstFailedAt: Date.now(), lockedUntil: 0 };
  }

  record.count += 1;

  if (record.count >= max) {
    record.lockedUntil = Date.now() + lockoutMs;
    attempts.set(k, record);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(lockoutMs / 1000),
    };
  }

  attempts.set(k, record);
  return {
    allowed: true,
    remainingAttempts: max - record.count,
    retryAfterSeconds: 0,
  };
}

/**
 * Clear all failed attempts after a successful login.
 */
export function clearFailedLogins(email: string): void {
  attempts.delete(key(email));
}

/**
 * Reset all state — for tests.
 */
export function resetLoginLimiter(): void {
  attempts.clear();
}
