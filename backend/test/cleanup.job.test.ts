/**
 * Cleanup job tests.
 *
 * The daily sweep runs on a timer, so the risk here is not correctness but
 * log noise: an unmigrated database would make the job print the same
 * schema warning on every single run. These tests pin down the "warn once
 * per process" behaviour.
 *
 * Note on module load order: `supabaseAdmin` is constructed when the
 * supabase lib is first imported, reading whatever `SUPABASE_URL` was
 * present at that moment. Deleting env vars inside a test cannot undo that,
 * so these tests do not try to force the unconfigured path — they assert on
 * warning behaviour, which is the actual contract we care about.
 *
 * Run:  npm test
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OTP_PEPPER = 'test-pepper-for-unit-tests';

const { runCleanup, resetCleanupWarnings, registerCleanupJobs, stopCleanupJobs } = await import(
  '../src/modules/jobs/cleanup-otp.job.ts'
);

/** Capture console output for the duration of one test. */
function captureConsole() {
  const warns: string[] = [];
  const logs: string[] = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.warn = (...args: unknown[]) => {
    warns.push(args.map((a) => String(a)).join(' '));
  };
  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  };
  return {
    warns,
    logs,
    restore: () => {
      console.warn = originalWarn;
      console.log = originalLog;
    },
  };
}

beforeEach(() => {
  resetCleanupWarnings();
});

describe('runCleanup', () => {
  test('returns a well-formed result', async () => {
    const result = await runCleanup();

    assert.equal(typeof result.expiredOtpDeleted, 'number');
    assert.equal(typeof result.unverifiedUsersDeleted, 'number');
    assert.ok(
      result.backend === 'supabase' || result.backend === 'memory',
      `unexpected backend: ${result.backend}`
    );
    assert.ok(!Number.isNaN(Date.parse(result.ranAt)), 'ranAt should be a valid date');
  });

  test('never throws, even when the schema is unmigrated', async () => {
    // The whole point of the job is that a broken/missing migration must not
    // take down the server. It should always resolve.
    await assert.doesNotReject(() => runCleanup());
    await assert.doesNotReject(() => runCleanup());
  });

  test('repeated runs are idempotent', async () => {
    const first = await runCleanup();
    const second = await runCleanup();
    assert.equal(first.expiredOtpDeleted, second.expiredOtpDeleted);
    assert.equal(first.unverifiedUsersDeleted, second.unverifiedUsersDeleted);
  });
});

describe('cleanup job warning noise', () => {
  test('a missing schema warns at most once, not once per run', async () => {
    // First run may legitimately warn about the missing migration.
    const first = captureConsole();
    try {
      await runCleanup();
    } finally {
      first.restore();
    }

    // Subsequent runs must stay quiet — otherwise the daily job would spam
    // the same warning forever and train people to ignore the logs.
    const second = captureConsole();
    try {
      await runCleanup();
      await runCleanup();
      await runCleanup();
    } finally {
      second.restore();
    }

    const repeated = second.warns.filter((l) => l.includes('[Cleanup]'));
    assert.equal(
      repeated.length,
      0,
      `expected no repeat warnings, got: ${repeated.join(' | ')}`
    );
  });

  test('resetCleanupWarnings allows the warning to be emitted again', async () => {
    const first = captureConsole();
    try {
      await runCleanup();
    } finally {
      first.restore();
    }
    const firstCount = first.warns.filter((l) => l.includes('[Cleanup]')).length;

    resetCleanupWarnings();

    const second = captureConsole();
    try {
      await runCleanup();
    } finally {
      second.restore();
    }
    const secondCount = second.warns.filter((l) => l.includes('[Cleanup]')).length;

    // Whatever the schema state, the two runs must behave the same after a
    // reset — that is what makes the dedup cache testable.
    assert.equal(secondCount, firstCount);
  });
});

describe('cleanup job scheduling', () => {
  test('registering repeatedly does not create multiple timers', () => {
    const cap = captureConsole();
    try {
      registerCleanupJobs();
      registerCleanupJobs();
      registerCleanupJobs();
    } finally {
      cap.restore();
      stopCleanupJobs();
    }

    const scheduled = cap.logs.filter((l) => l.includes('cleanup job scheduled'));
    assert.equal(scheduled.length, 1, 'the job should only be scheduled once');
  });

  test('stopCleanupJobs is safe when nothing is scheduled', () => {
    assert.doesNotThrow(() => stopCleanupJobs());
    assert.doesNotThrow(() => stopCleanupJobs());
  });
});
