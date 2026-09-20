/**
 * OTP service tests (otpplan.md §9 — Unit + logic tests)
 *
 *   - verify: correct code activates, wrong code decrements attempts
 *   - expiry: a lapsed OTP is rejected
 *   - attempts: the ceiling produces OTP_MAX_ATTEMPTS
 *   - single-use: a consumed OTP cannot be reused
 *   - resend: the previous OTP is invalidated and a new one is live
 *   - cooldown: an immediate resend is rejected
 *
 * These run against the in-memory store, so no database is required.
 *
 * Run:  npm run test:otp
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OTP_PEPPER = 'test-pepper-for-unit-tests';
process.env.OTP_LENGTH = '6';
process.env.OTP_TTL_SECONDS = '300';
process.env.OTP_MAX_ATTEMPTS = '5';
process.env.OTP_RESEND_COOLDOWN_SECONDS = '60';
// Generous limits so the hourly caps do not interfere with these assertions.
process.env.OTP_MAX_REQUESTS_PER_HOUR_DEST = '999';
process.env.OTP_MAX_REQUESTS_PER_HOUR_IP = '999';
// Deterministic code for the happy path.
process.env.OTP_DEV_FIXED_CODE = '123456';
// Keep retry delays out of the test run.
process.env.OTP_SEND_RETRY_ATTEMPTS = '1';
process.env.OTP_SEND_RETRY_BASE_DELAY_MS = '1';

const repo = await import('../src/modules/otp/otp.repository.ts');
const { OtpError, issueOtp, verifyOtp, resendOtp, startRegistrationCooldown } = await import(
  '../src/modules/otp/otp.service.ts'
);
const limiter = await import('../src/modules/otp/otp.rate-limiter.ts');
const { OtpChannel, OtpErrorCode, UserStatus } = await import(
  '../src/modules/otp/otp.constants.ts'
);

/** Fresh user id per test so cases cannot bleed into each other. */
let counter = 0;
function nextUserId(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

/** Create a PENDING_VERIFICATION user and issue an OTP. */
async function setupPendingUser(email = 'user@example.com') {
  const userId = nextUserId();
  await repo.upsertProfile({
    userId,
    email,
    name: 'Test User',
    status: UserStatus.PENDING_VERIFICATION,
  });
  await issueOtp({
    userId,
    channel: OtpChannel.EMAIL,
    destination: email,
  });
  return { userId, email };
}

/** Assert a thrown OtpError carries the expected code. */
async function expectOtpError(fn: () => Promise<unknown>, expectedCode: string): Promise<OtpError> {
  try {
    await fn();
  } catch (err) {
    assert.ok(err instanceof OtpError, `expected OtpError, got ${String(err)}`);
    assert.equal((err as OtpError).code, expectedCode);
    return err as OtpError;
  }
  throw new assert.AssertionError({ message: `expected ${expectedCode} to be thrown` });
}

beforeEach(() => {
  limiter.resetRateLimiterState();
});

/* ══════════════════════════════════════════════════════════ */
describe('verifyOtp — happy path', () => {
  test('a correct code activates the account', async () => {
    const { userId } = await setupPendingUser('happy@example.com');

    const result = await verifyOtp({ userId, code: '123456' });
    assert.equal(result.userId, userId);
    assert.ok(result.verifiedAt instanceof Date);

    const profile = await repo.getProfile(userId);
    assert.equal(profile?.status, UserStatus.ACTIVE);
    assert.ok(profile?.verified_at, 'verified_at should be populated');
  });

  test('an unknown user is reported as not found', async () => {
    await expectOtpError(
      () => verifyOtp({ userId: nextUserId(), code: '123456' }),
      OtpErrorCode.USER_NOT_FOUND
    );
  });
});

describe('verifyOtp — wrong code', () => {
  test('a wrong code fails and decrements remaining attempts', async () => {
    const { userId } = await setupPendingUser('wrong@example.com');

    const first = await expectOtpError(
      () => verifyOtp({ userId, code: '000000' }),
      OtpErrorCode.OTP_INVALID
    );
    assert.equal(first.extra.remainingAttempts, 4);

    const second = await expectOtpError(
      () => verifyOtp({ userId, code: '000001' }),
      OtpErrorCode.OTP_INVALID
    );
    assert.equal(second.extra.remainingAttempts, 3);

    // Still pending — a wrong code must never activate the account.
    const profile = await repo.getProfile(userId);
    assert.equal(profile?.status, UserStatus.PENDING_VERIFICATION);
  });

  test('the correct code still works partway through the attempt budget', async () => {
    const { userId } = await setupPendingUser('budget@example.com');

    await expectOtpError(() => verifyOtp({ userId, code: '111111' }), OtpErrorCode.OTP_INVALID);
    await expectOtpError(() => verifyOtp({ userId, code: '222222' }), OtpErrorCode.OTP_INVALID);

    const ok = await verifyOtp({ userId, code: '123456' });
    assert.equal(ok.userId, userId);
  });
});

describe('verifyOtp — attempt ceiling', () => {
  test('the 6th attempt reports OTP_MAX_ATTEMPTS', async () => {
    const { userId } = await setupPendingUser('maxed@example.com');

    // 5 wrong attempts exhaust max_attempts.
    for (let i = 1; i <= 4; i += 1) {
      const err = await expectOtpError(
        () => verifyOtp({ userId, code: '000000' }),
        OtpErrorCode.OTP_INVALID
      );
      assert.equal(err.extra.remainingAttempts, 5 - i);
    }

    // The 5th consumes the last attempt and reports the ceiling.
    await expectOtpError(() => verifyOtp({ userId, code: '000000' }), OtpErrorCode.OTP_MAX_ATTEMPTS);

    // A 6th attempt stays locked out.
    await expectOtpError(() => verifyOtp({ userId, code: '000000' }), OtpErrorCode.OTP_MAX_ATTEMPTS);

    // Even the CORRECT code is refused once the OTP is burned.
    await expectOtpError(() => verifyOtp({ userId, code: '123456' }), OtpErrorCode.OTP_MAX_ATTEMPTS);
  });
});

describe('verifyOtp — single use', () => {
  test('a consumed OTP cannot be replayed', async () => {
    const { userId } = await setupPendingUser('replay@example.com');

    await verifyOtp({ userId, code: '123456' });

    // The account is ACTIVE, so the replay is refused on that ground first.
    await expectOtpError(
      () => verifyOtp({ userId, code: '123456' }),
      OtpErrorCode.USER_ALREADY_VERIFIED
    );

    // And the OTP row itself is marked consumed.
    const active = await repo.findLatestActive(userId, 'REGISTER');
    assert.equal(active, null, 'no active OTP should remain after consumption');
  });
});

describe('verifyOtp — expiry', () => {
  test('an expired OTP is rejected even with the correct code', async () => {
    const userId = nextUserId();
    const email = 'expired@example.com';
    await repo.upsertProfile({ userId, email, status: UserStatus.PENDING_VERIFICATION });

    // Insert an OTP that lapsed a minute ago.
    const { getOtpLength, generateOtpCode, hashOtpCode } = await import(
      '../src/modules/otp/otp.crypto.ts'
    );
    const otpId = repo.newOtpId();
    const code = generateOtpCode(getOtpLength());

    await repo.insertOtp({
      id: otpId,
      userId,
      purpose: 'REGISTER',
      channel: OtpChannel.EMAIL,
      destination: email,
      codeHash: hashOtpCode(otpId, code),
      expiresAt: new Date(Date.now() - 60_000),
      maxAttempts: 5,
    });

    await expectOtpError(() => verifyOtp({ userId, code }), OtpErrorCode.OTP_EXPIRED);
  });

  test('no active OTP at all reports OTP_EXPIRED', async () => {
    const userId = nextUserId();
    await repo.upsertProfile({
      userId,
      email: 'none@example.com',
      status: UserStatus.PENDING_VERIFICATION,
    });

    await expectOtpError(() => verifyOtp({ userId, code: '123456' }), OtpErrorCode.OTP_EXPIRED);
  });
});

describe('verifyOtp — concurrency', () => {
  test('two parallel verifies with the correct code: exactly one wins', async () => {
    const { userId } = await setupPendingUser('race@example.com');

    const results = await Promise.allSettled([
      verifyOtp({ userId, code: '123456' }),
      verifyOtp({ userId, code: '123456' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'exactly one request should succeed');
    assert.equal(rejected.length, 1, 'the other should be refused');

    // The loser must fail with a meaningful OTP code, not a raw crash.
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(reason instanceof OtpError, `expected OtpError, got ${String(reason)}`);
    assert.ok(
      [OtpErrorCode.USER_ALREADY_VERIFIED, OtpErrorCode.OTP_EXPIRED].includes(reason.code),
      `unexpected loser code: ${reason.code}`
    );
  });
});

/* ══════════════════════════════════════════════════════════ */
describe('resendOtp', () => {
  test('invalidates the previous OTP — only one stays live', async () => {
    const { userId, email } = await setupPendingUser('resend@example.com');

    const before = await repo.findLatestActive(userId, 'REGISTER');
    assert.ok(before, 'the initial OTP should be active');

    const issued = await resendOtp({
      userId,
      destination: email,
      channel: OtpChannel.EMAIL,
    });
    assert.equal(issued.expiresInSeconds, 300);

    // The new OTP is the only active row.
    const after = await repo.findLatestActive(userId, 'REGISTER');
    assert.ok(after, 'a new active OTP should exist');
    assert.notEqual(after!.id, before!.id, 'the active OTP should be a different row');

    // The old row is invalidated, not consumed.
    const oldRow = await repo.findOtpById(before!.id);
    assert.ok(oldRow?.invalidated_at, 'the previous OTP should carry invalidated_at');
    assert.equal(oldRow?.consumed_at, null);
  });

  test('an immediate resend is blocked by the cooldown', async () => {
    const { userId, email } = await setupPendingUser('cooldown@example.com');
    await startRegistrationCooldown(userId);

    const err = await expectOtpError(
      () => resendOtp({ userId, destination: email, channel: OtpChannel.EMAIL }),
      OtpErrorCode.OTP_RESEND_COOLDOWN
    );
    assert.ok(typeof err.extra.retryAfter === 'number');
    assert.ok((err.extra.retryAfter as number) > 0);
  });

  test('resend works once the cooldown is cleared', async () => {
    const { userId, email } = await setupPendingUser('aftercooldown@example.com');
    await startRegistrationCooldown(userId);

    await expectOtpError(
      () => resendOtp({ userId, destination: email, channel: OtpChannel.EMAIL }),
      OtpErrorCode.OTP_RESEND_COOLDOWN
    );

    // Simulate the cooldown elapsing.
    limiter.resetRateLimiterState();

    const issued = await resendOtp({ userId, destination: email, channel: OtpChannel.EMAIL });
    assert.equal(issued.expiresInSeconds, 300);
    assert.equal(issued.resendAvailableInSeconds, 60);
  });

  test('refuses to resend for an already-active account', async () => {
    const { userId, email } = await setupPendingUser('activeresend@example.com');
    await verifyOtp({ userId, code: '123456' });

    await expectOtpError(
      () => resendOtp({ userId, destination: email, channel: OtpChannel.EMAIL }),
      OtpErrorCode.USER_ALREADY_VERIFIED
    );
  });

  test('the destination hourly cap produces OTP_RATE_LIMITED', async () => {
    const { userId, email } = await setupPendingUser('ratelimited@example.com');

    // Tighten the destination cap for this case.
    const previous = process.env.OTP_MAX_REQUESTS_PER_HOUR_DEST;
    process.env.OTP_MAX_REQUESTS_PER_HOUR_DEST = '2';
    limiter.resetRateLimiterState();

    try {
      await resendOtp({ userId, destination: email, channel: OtpChannel.EMAIL });
      limiter.resetRateLimiterState();
      // Re-consume the budget deliberately: two allowed, third blocked.
      await limiter.checkDestinationLimit(email);
      await limiter.checkDestinationLimit(email);

      const err = await expectOtpError(
        () => resendOtp({ userId, destination: email, channel: OtpChannel.EMAIL }),
        OtpErrorCode.OTP_RATE_LIMITED
      );
      assert.equal(err.extra.scope, 'destination');
    } finally {
      process.env.OTP_MAX_REQUESTS_PER_HOUR_DEST = previous;
      limiter.resetRateLimiterState();
    }
  });
});

/* ══════════════════════════════════════════════════════════ */
describe('issueOtp', () => {
  test('reports the masked destination, never the raw one', async () => {
    const userId = nextUserId();
    await repo.upsertProfile({
      userId,
      email: 'secret@example.com',
      status: UserStatus.PENDING_VERIFICATION,
    });

    const issued = await issueOtp({
      userId,
      channel: OtpChannel.EMAIL,
      destination: 'secret@example.com',
    });

    assert.equal(issued.destinationMasked, 's***@example.com');
    assert.ok(!issued.destinationMasked.includes('ecret'));
    assert.equal(issued.expiresInSeconds, 300);
  });

  test('the stored row never contains the plaintext code', async () => {
    const { userId } = await setupPendingUser('noplaintext@example.com');

    const active = await repo.findLatestActive(userId, 'REGISTER');
    assert.ok(active);
    // The plaintext dev code must not appear anywhere in the persisted row.
    assert.ok(
      !JSON.stringify(active).includes('123456'),
      'the plaintext OTP leaked into the stored record'
    );
    assert.equal(active!.code_hash.length, 64);
  });
});
