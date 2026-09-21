/**
 * cleanup-otp.job — daily housekeeping (otpplan.md §8)
 *
 *   - delete otp_codes rows whose expires_at is more than 24h in the past
 *   - delete users still in PENDING_VERIFICATION past UNVERIFIED_USER_TTL_DAYS
 *
 * Both operations are exposed as SQL functions (otp_schema.sql §4) and
 * invoked here via RPC with a local fallback for demo mode.
 */

import { supabaseAdmin, isSupabaseConfigured } from '../../lib/supabase.js';
import { otpConfig } from '../otp/otp.config.js';
import { audit } from '../otp/otp.service.js';
import { isSchemaMissingError, isOtpTableMissing } from '../otp/otp.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  expiredOtpDeleted: number;
  unverifiedUsersDeleted: number;
  ranAt: string;
  backend: 'supabase' | 'memory';
}

/**
 * Warn about a missing migration only once per process. Without this the
 * daily job would print the same schema warning on every run forever, which
 * trains people to ignore the logs.
 */
const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test seam — lets unit tests assert on the warning behaviour. */
export function resetCleanupWarnings(): void {
  warned.clear();
}

/** Purge OTP rows past expiry + 24h. */
async function cleanupExpiredOtpCodes(): Promise<number> {
  if (!isSupabaseConfigured || !supabaseAdmin) {
    // Demo mode: there is no persistent table to sweep.
    return 0;
  }

  // Already known to be unmigrated — skip the round trip entirely.
  if (isOtpTableMissing()) return 0;

  const { data, error } = await supabaseAdmin.rpc('cleanup_expired_otp_codes');
  if (error) {
    // Fall back to a direct delete if the SQL function has not been created yet.
    const cutoff = new Date(Date.now() - DAY_MS).toISOString();
    const { error: deleteError, count } = await supabaseAdmin
      .from('otp_codes')
      .delete({ count: 'exact' })
      .lt('expires_at', cutoff);

    if (deleteError) {
      if (isSchemaMissingError(deleteError)) {
        warnOnce(
          'otp_codes',
          '[Cleanup] otp_codes sweep skipped — run backend/supabase/otp_schema.sql ' +
            'to enable expiry cleanup.'
        );
      } else {
        console.warn('[Cleanup] otp_codes sweep failed:', deleteError.message);
      }
      return 0;
    }
    return count ?? 0;
  }

  return typeof data === 'number' ? data : 0;
}

/** Remove accounts that never completed verification. */
async function cleanupUnverifiedUsers(): Promise<number> {
  if (!isSupabaseConfigured || !supabaseAdmin) return 0;

  const ttlDays = otpConfig.unverifiedUserTtlDays;

  const { data, error } = await supabaseAdmin.rpc('cleanup_unverified_users', {
    unverified_days: ttlDays,
  });

  if (error) {
    if (isSchemaMissingError(error)) {
      warnOnce(
        'cleanup_unverified_users',
        '[Cleanup] unverified user sweep skipped — create the function from ' +
          'otp_schema.sql to enable it.'
      );
    } else {
      console.warn('[Cleanup] unverified user sweep failed:', error.message);
    }
    return 0;
  }

  return typeof data === 'number' ? data : 0;
}

/** Run both sweeps once. */
export async function runCleanup(): Promise<CleanupResult> {
  const ranAt = new Date().toISOString();
  const backend: CleanupResult['backend'] =
    isSupabaseConfigured && supabaseAdmin ? 'supabase' : 'memory';

  try {
    const expiredOtpDeleted = await cleanupExpiredOtpCodes();
    const unverifiedUsersDeleted = await cleanupUnverifiedUsers();

    if (expiredOtpDeleted > 0 || unverifiedUsersDeleted > 0) {
      audit('otp_requested', {
        marker: 'cleanup_run',
        expiredOtpDeleted,
        unverifiedUsersDeleted,
      });
      console.log(
        `[Cleanup] Removed ${expiredOtpDeleted} expired OTP row(s) and ` +
          `${unverifiedUsersDeleted} unverified user(s).`
      );
    }

    return { expiredOtpDeleted, unverifiedUsersDeleted, ranAt, backend };
  } catch (err) {
    console.error('[Cleanup] Unexpected failure:', (err as Error).message);
    return { expiredOtpDeleted: 0, unverifiedUsersDeleted: 0, ranAt, backend };
  }
}

let timer: NodeJS.Timeout | null = null;

/**
 * Schedule the daily sweep. Runs once shortly after boot so the job is
 * observable in development, then every 24 hours.
 */
export function registerCleanupJobs(): void {
  if (timer) return;

  const bootDelayMs = 60_000;
  setTimeout(() => {
    void runCleanup();
  }, bootDelayMs).unref?.();

  timer = setInterval(() => {
    void runCleanup();
  }, DAY_MS);

  if (typeof timer.unref === 'function') timer.unref();

  console.log('[Cleanup] Daily OTP cleanup job scheduled.');
}

export function stopCleanupJobs(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
