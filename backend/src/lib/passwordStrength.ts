import crypto from 'node:crypto';

/**
 * Strong password validation (NIST SP 800-63B compliant).
 *
 * Enforces:
 *   - Minimum 12 characters (length beats artificial complexity)
 *   - Maximum 128 characters (prevents DoS via hashing long inputs)
 *   - Checks Have I Been Pwned (HIBP) k-Anonymity API for breached passwords
 *
 * Returns an array of human-readable (Indonesian) failure messages.
 * An empty array means the password passed all checks.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordRule {
  test: (pw: string) => boolean;
  message: string;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    test: (pw) => pw.length >= MIN_PASSWORD_LENGTH,
    message: `Minimal ${MIN_PASSWORD_LENGTH} karakter.`,
  },
  {
    test: (pw) => pw.length <= MAX_PASSWORD_LENGTH,
    message: `Maksimal ${MAX_PASSWORD_LENGTH} karakter.`,
  },
];

/**
 * Validate basic synchronous rules (length).
 */
export function validatePasswordRules(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((r) => r.message);
}

/**
 * Check Have I Been Pwned k-Anonymity API.
 * Uses SHA-1 hash prefix (5 characters) so the actual password is never exposed.
 * Fails open (returns false) if the service is unreachable or times out (2s).
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'User-Agent': 'CostKu-Password-Validator/1.0',
        'Add-Padding': 'true',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return false;
    }

    const body = await response.text();
    const lines = body.split('\r\n');
    for (const line of lines) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix && hashSuffix.trim().toUpperCase() === suffix) {
        return true;
      }
    }

    return false;
  } catch {
    // Fail-open on timeout or network errors
    return false;
  }
}

/**
 * Validate password strength against length rules and HIBP breach registry.
 */
export async function validatePasswordStrength(password: string): Promise<string[]> {
  const issues = validatePasswordRules(password);
  if (issues.length > 0) {
    return issues;
  }

  const pwned = await isPwnedPassword(password);
  if (pwned) {
    issues.push(
      'Kata sandi ini pernah ditemukan dalam kebocoran data publik (pwned). Demi keamanan akunmu, gunakan kata sandi yang berbeda.'
    );
  }

  return issues;
}

/**
 * Synchronous check for basic rules.
 */
export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
