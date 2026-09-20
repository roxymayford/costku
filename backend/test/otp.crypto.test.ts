/**
 * OTP crypto tests (otpplan.md §9 — Unit test)
 *
 *   - generate: correct length, digits only, leading zeros preserved
 *   - hash/verify: right code passes, wrong code fails
 *   - maskDestination: email and phone masking
 *
 * Run:  npm run test:otp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OTP_PEPPER = process.env.OTP_PEPPER || 'test-pepper-for-unit-tests';

const {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  maskDestination,
  redactCodes,
  getDevFixedCode,
  isOtpPepperConfigured,
} = await import('../src/modules/otp/otp.crypto.ts');

describe('generateOtpCode', () => {
  test('produces a code of the requested length', () => {
    for (const len of [4, 6, 8]) {
      assert.equal(generateOtpCode(len).length, len);
    }
  });

  test('contains digits only', () => {
    for (let i = 0; i < 200; i += 1) {
      assert.match(generateOtpCode(6), /^\d{6}$/);
    }
  });

  test('preserves leading zeros (pads to full length)', () => {
    // Sample enough draws that a low value is essentially certain.
    let sawLeadingZero = false;
    for (let i = 0; i < 5000; i += 1) {
      const code = generateOtpCode(6);
      assert.equal(code.length, 6);
      if (code.startsWith('0')) sawLeadingZero = true;
    }
    assert.ok(sawLeadingZero, 'expected at least one code with a leading zero');
  });

  test('is not constant across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) seen.add(generateOtpCode(6));
    // 300 draws from 1e6 possibilities must be effectively all distinct.
    assert.ok(seen.size > 290, `expected high entropy, got ${seen.size} unique codes`);
  });

  test('produces full range coverage (not biased to one end)', () => {
    let min = Number.MAX_SAFE_INTEGER;
    let max = -1;
    for (let i = 0; i < 3000; i += 1) {
      const n = Number.parseInt(generateOtpCode(6), 10);
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    assert.ok(min < 50000, `expected values near the low end, min was ${min}`);
    assert.ok(max > 950000, `expected values near the high end, max was ${max}`);
  });
});

describe('hashOtpCode / verifyOtpCode', () => {
  const otpId = '11111111-2222-3333-4444-555555555555';

  test('hash is a 64-char HMAC-SHA256 hex digest', () => {
    const hash = hashOtpCode(otpId, '123456');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('hash is deterministic for the same (id, code)', () => {
    assert.equal(hashOtpCode(otpId, '123456'), hashOtpCode(otpId, '123456'));
  });

  test('the correct code verifies', () => {
    const code = '004821';
    assert.equal(verifyOtpCode(otpId, code, hashOtpCode(otpId, code)), true);
  });

  test('a wrong code fails', () => {
    const hash = hashOtpCode(otpId, '123456');
    assert.equal(verifyOtpCode(otpId, '123457', hash), false);
    assert.equal(verifyOtpCode(otpId, '000000', hash), false);
    assert.equal(verifyOtpCode(otpId, '', hash), false);
  });

  test('leading zeros are significant', () => {
    const hash = hashOtpCode(otpId, '004821');
    assert.equal(verifyOtpCode(otpId, '4821', hash), false);
    assert.equal(verifyOtpCode(otpId, '048210', hash), false);
  });

  test('a hash is bound to its OTP id', () => {
    // A leaked hash must not validate against a different OTP row.
    const otherId = '99999999-8888-7777-6666-555555555555';
    const hash = hashOtpCode(otpId, '123456');
    assert.equal(verifyOtpCode(otherId, '123456', hash), false);
  });

  test('a malformed stored hash is rejected without throwing', () => {
    assert.equal(verifyOtpCode(otpId, '123456', 'short'), false);
    assert.equal(verifyOtpCode(otpId, '123456', ''), false);
    assert.equal(verifyOtpCode(otpId, '123456', 'z'.repeat(64)), false);
  });
});

describe('getDevFixedCode', () => {
  test('is ignored in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.OTP_DEV_FIXED_CODE = '123456';
    assert.equal(getDevFixedCode(), null);
    process.env.NODE_ENV = original;
  });

  test('returns the configured code outside production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.OTP_DEV_FIXED_CODE = '424242';
    assert.equal(getDevFixedCode(), '424242');
    delete process.env.OTP_DEV_FIXED_CODE;
    process.env.NODE_ENV = original;
  });
});

describe('maskDestination', () => {
  test('masks an email local part', () => {
    assert.equal(maskDestination('budi@example.com'), 'b***@example.com');
    assert.equal(maskDestination('a@b.co'), 'a***@b.co');
  });

  test('masks a phone number', () => {
    const masked = maskDestination('+6281234567890');
    assert.equal(masked, '+62812****890');
    assert.ok(!masked.includes('345678'));
  });

  test('handles degenerate input', () => {
    assert.equal(maskDestination(''), '');
    assert.equal(maskDestination('@nohost'), '***');
    assert.equal(maskDestination('nohost@'), '***');
    // A non-empty destination must never mask down to an empty string —
    // that would be indistinguishable from "no destination at all".
    for (const input of ['x', 'abc', 'ab12']) {
      assert.notEqual(maskDestination(input), '', `mask(${input}) must not be empty`);
    }
  });
});

describe('redactCodes', () => {
  test('scrubs digit runs that could be an OTP', () => {
    const out = redactCodes('Kode verifikasi Anda: 123456. Berlaku 5 menit.');
    assert.ok(!out.includes('123456'), `code leaked in: ${out}`);
    assert.ok(out.includes('******'));
  });

  test('leaves short numbers and text untouched', () => {
    assert.equal(redactCodes('Berlaku 5 menit'), 'Berlaku 5 menit');
    assert.equal(redactCodes('ID 42 selesai'), 'ID 42 selesai');
  });
});

describe('pepper configuration', () => {
  test('reports the pepper as configured when set', () => {
    assert.equal(isOtpPepperConfigured(), true);
  });
});
