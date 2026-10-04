// ──────────────────────────────────────────────────────────
// costKu — Profile API Client
// Calls backend /api/v1/profile and /api/v1/onboarding
// ──────────────────────────────────────────────────────────

import { apiFetch, BACKEND_URL } from './apiClient';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  monthly_salary: number;
  payday_date: number;
  fixed_expenses: number;
  created_at?: string;
  updated_at?: string;
}

export interface OnboardingDefaultItem {
  id: string;
  name: string;
  amount: number;
}

export interface OnboardingDefaults {
  defaultSalary: number;
  defaultPaydayDate: number;
  templateItems: OnboardingDefaultItem[];
}

/**
 * Fetch authenticated user's financial profile from backend Express.
 */
export async function getProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/profile');
}

/**
 * Update authenticated user's financial profile on backend Express.
 */
export async function updateProfile(data: {
  name?: string;
  monthly_salary?: number;
  payday_date?: number;
  fixed_expenses?: number;
}): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Get default onboarding template (salary, payday, expense items) from backend.
 * Does NOT require authentication — safe to call before user has saved a profile.
 */
export async function getOnboardingDefaults(): Promise<OnboardingDefaults> {
  const res = await fetch(`${BACKEND_URL}/api/v1/onboarding/defaults`);
  if (!res.ok) throw new Error('Gagal memuat template onboarding dari server.');
  const json = await res.json();
  return json.data as OnboardingDefaults;
}

/**
 * Save the initial onboarding profile and expense items in a single request.
 * Backend sums the expense_items into fixed_expenses automatically.
 */
export async function saveOnboarding(payload: {
  monthly_salary: number;
  payday_date: number;
  expense_items: Array<{ id: string; name: string; amount: number }>;
}): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/v1/onboarding', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
