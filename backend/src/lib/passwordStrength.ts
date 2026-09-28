/**
 * Strong password validation.
 *
 * Enforces:
 *   - minimum 8 characters
 *   - at least one uppercase letter
 *   - at least one lowercase letter
 *   - at least one digit
 *   - at least one special character (!@#$%^&*()_+-=[]{}|;:'",.<>?/`~)
 *
 * Returns an array of human-readable (Indonesian) failure messages.
 * An empty array means the password passed all checks.
 */

export interface PasswordRule {
  test: (pw: string) => boolean;
  message: string;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    test: (pw) => pw.length >= 8,
    message: 'Minimal 8 karakter.',
  },
  {
    test: (pw) => /[A-Z]/.test(pw),
    message: 'Harus mengandung huruf besar (A-Z).',
  },
  {
    test: (pw) => /[a-z]/.test(pw),
    message: 'Harus mengandung huruf kecil (a-z).',
  },
  {
    test: (pw) => /[0-9]/.test(pw),
    message: 'Harus mengandung angka (0-9).',
  },
  {
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
    message: 'Harus mengandung karakter khusus (!@#$%...).',
  },
];

/**
 * Validate a password against all rules.
 * Returns an array of failure messages (empty = valid).
 */
export function validatePasswordStrength(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((r) => r.message);
}

/**
 * Check if a password passes all strength rules.
 */
export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
