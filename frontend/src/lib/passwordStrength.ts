/**
 * Strong password validation — shared rules for frontend live feedback.
 *
 * Must stay in sync with backend/src/lib/passwordStrength.ts.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: 'Minimal 8 karakter',
    test: (pw) => pw.length >= 8,
  },
  {
    id: 'upper',
    label: 'Huruf besar (A-Z)',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'lower',
    label: 'Huruf kecil (a-z)',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'digit',
    label: 'Angka (0-9)',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'special',
    label: 'Karakter khusus (!@#$%...)',
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

/**
 * Returns true if all rules pass.
 */
export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/**
 * Returns the ratio of passed rules (0–1) for a strength meter.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  return passed / PASSWORD_RULES.length;
}

/**
 * Human-readable strength label.
 */
export function strengthLabel(ratio: number): string {
  if (ratio === 0) return '';
  if (ratio < 0.4) return 'Lemah';
  if (ratio < 0.8) return 'Sedang';
  if (ratio < 1) return 'Kuat';
  return 'Sangat Kuat';
}

export function strengthColor(ratio: number): string {
  if (ratio === 0) return 'transparent';
  if (ratio < 0.4) return '#e53935';
  if (ratio < 0.8) return '#fb8c00';
  if (ratio < 1) return '#43a047';
  return '#2e7d32';
}
