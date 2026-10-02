/**
 * Strong password validation — shared rules for frontend live feedback.
 *
 * Must stay in sync with backend/src/lib/passwordStrength.ts.
 */

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
  required?: boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'min_length',
    label: 'Minimal 12 karakter',
    test: (pw) => pw.length >= 12,
    required: true,
  },
  {
    id: 'max_length',
    label: 'Maksimal 128 karakter',
    test: (pw) => pw.length <= 128,
    required: true,
  },
  {
    id: 'variety',
    label: 'Variasi huruf & angka/simbol (disarankan)',
    test: (pw) => /[a-zA-Z]/.test(pw) && /[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>?/`~]/.test(pw),
    required: false,
  },
];

/**
 * Returns true if mandatory password rules pass (min 12 chars, max 128 chars).
 */
export function isStrongPassword(password: string): boolean {
  if (!password) return false;
  return PASSWORD_RULES.filter((r) => r.required !== false).every((rule) => rule.test(password));
}

/**
 * Returns the ratio of passed rules (0–1) for a strength meter.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  if (password.length < 8) return 0.2;
  if (password.length < 12) return 0.5;
  const hasVariety = /[a-zA-Z]/.test(password) && /[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>?/`~]/.test(password);
  if (password.length >= 16 && hasVariety) return 1.0;
  if (password.length >= 12 && hasVariety) return 0.85;
  return 0.7;
}

/**
 * Human-readable strength label.
 */
export function strengthLabel(ratio: number): string {
  if (ratio === 0) return '';
  if (ratio < 0.4) return 'Sangat Pendek';
  if (ratio < 0.7) return 'Kurang (Min. 12 Karakter)';
  if (ratio < 0.9) return 'Kuat';
  return 'Sangat Kuat';
}

export function strengthColor(ratio: number): string {
  if (ratio === 0) return 'transparent';
  if (ratio < 0.4) return '#e53935';
  if (ratio < 0.7) return '#fb8c00';
  if (ratio < 0.9) return '#43a047';
  return '#2e7d32';
}
