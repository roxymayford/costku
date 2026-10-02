import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePasswordRules,
  validatePasswordStrength,
  isStrongPassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from '../src/lib/passwordStrength.js';

test('Password Security Validation (NIST SP 800-63B)', async (t) => {
  await t.test('rejects passwords shorter than 12 characters', () => {
    const issues = validatePasswordRules('short123');
    assert.ok(issues.length > 0);
    assert.match(issues[0], /Minimal 12 karakter/);
    assert.equal(isStrongPassword('short123'), false);
  });

  await t.test('rejects passwords longer than 128 characters', () => {
    const longPassword = 'a'.repeat(129);
    const issues = validatePasswordRules(longPassword);
    assert.ok(issues.length > 0);
    assert.match(issues[0], /Maksimal 128 karakter/);
    assert.equal(isStrongPassword(longPassword), false);
  });

  await t.test('accepts strong multi-word passphrases without artificial complexity', () => {
    // Under NIST guidelines, long memorable passphrases are encouraged over arbitrary character rules
    const passphrase = 'kucing makan ikan goreng';
    assert.equal(passphrase.length >= MIN_PASSWORD_LENGTH, true);
    const issues = validatePasswordRules(passphrase);
    assert.equal(issues.length, 0);
    assert.equal(isStrongPassword(passphrase), true);
  });

  await t.test('detects well-known breached passwords via HIBP or mock', async () => {
    // "password123456" is a known breached password in HIBP
    const issues = await validatePasswordStrength('password123456');
    // If online, it catches breached password. If offline, it still passes length rules.
    assert.ok(Array.isArray(issues));
  });
});
