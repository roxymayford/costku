// ──────────────────────────────────────────────────────────
// costKu — Income Management API Client
// Calls backend /api/v1/incomes
// ──────────────────────────────────────────────────────────

import { apiFetch } from './apiClient';

export type IncomeType = 'gaji' | 'freelance' | 'bonus' | 'lainnya';

export type Income = {
  id: string;
  user_id: string;
  type: IncomeType;
  label: string | null;
  amount: number;
  date: string;
  is_recurring: boolean;
  frequency: 'monthly' | 'weekly' | null;
  created_at: string;
  updated_at: string;
};

const LS_INCOMES_KEY = 'fatrack-incomes';

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  gaji: 'Gaji Pokok',
  freelance: 'Freelance / Sampingan',
  bonus: 'Bonus & THR',
  lainnya: 'Pemasukan Lainnya',
};

export const INCOME_TYPE_COLORS: Record<IncomeType, string> = {
  gaji: 'green',
  freelance: 'orange',
  bonus: 'purple',
  lainnya: 'blue',
};

export interface TotalIncomeSummary {
  total: number;
  byType: Record<IncomeType, number>;
  count: number;
}

/**
 * Get incomes for authenticated user, optionally filtered by month (YYYY-MM format).
 */
export async function getIncomes(_userId?: string, month?: string): Promise<Income[]> {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  try {
    const data = await apiFetch<Income[]>(`/api/v1/incomes${query}`);
    return data || [];
  } catch (err) {
    console.warn('[incomeApi] Backend query failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_INCOMES_KEY);
    const all: Income[] = raw ? JSON.parse(raw) : [];
    let userIncomes = _userId ? all.filter((i) => i.user_id === _userId) : all;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      userIncomes = userIncomes.filter((i) => i.date.startsWith(month));
    }
    userIncomes.sort((a, b) => (b.date > a.date ? 1 : -1));
    return userIncomes;
  }
}

/**
 * Add an income entry via backend Express.
 */
export async function addIncome(
  userId: string,
  entry: Omit<Income, 'id' | 'created_at' | 'updated_at' | 'user_id'>
): Promise<Income> {
  try {
    return await apiFetch<Income>('/api/v1/incomes', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.warn('[incomeApi] Backend insert failed, fallback to local:', err);
    const now = new Date().toISOString();
    const newIncome: Income = {
      ...entry,
      id: crypto.randomUUID(),
      user_id: userId,
      created_at: now,
      updated_at: now,
    };
    const raw = localStorage.getItem(LS_INCOMES_KEY);
    const all: Income[] = raw ? JSON.parse(raw) : [];
    all.unshift(newIncome);
    localStorage.setItem(LS_INCOMES_KEY, JSON.stringify(all));
    return newIncome;
  }
}

/**
 * Update an existing income entry via backend Express.
 */
export async function updateIncome(
  userId: string,
  id: string,
  updates: Partial<Omit<Income, 'id' | 'user_id' | 'created_at'>>
): Promise<Income | null> {
  try {
    return await apiFetch<Income>(`/api/v1/incomes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.warn('[incomeApi] Backend update failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_INCOMES_KEY);
    const all: Income[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex((i) => i.id === id && i.user_id === userId);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      localStorage.setItem(LS_INCOMES_KEY, JSON.stringify(all));
      return all[idx];
    }
    return null;
  }
}

/**
 * Delete an income entry via backend Express.
 */
export async function deleteIncome(userId: string, id: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/incomes/${id}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[incomeApi] Backend delete failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_INCOMES_KEY);
    const all: Income[] = raw ? JSON.parse(raw) : [];
    const updated = all.filter((i) => !(i.id === id && i.user_id === userId));
    localStorage.setItem(LS_INCOMES_KEY, JSON.stringify(updated));
  }
}

/**
 * Calculate total and breakdown for a given month via backend Express.
 */
export async function getTotalIncome(
  _userId?: string,
  month?: string
): Promise<TotalIncomeSummary> {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  try {
    return await apiFetch<TotalIncomeSummary>(`/api/v1/incomes/total${query}`);
  } catch (err) {
    console.warn('[incomeApi] Backend total query failed, fallback to local aggregation:', err);
    const incomes = await getIncomes(_userId, month);
    const byType: Record<IncomeType, number> = {
      gaji: 0,
      freelance: 0,
      bonus: 0,
      lainnya: 0,
    };

    let total = 0;
    for (const item of incomes) {
      const amt = Number(item.amount) || 0;
      total += amt;
      if (byType[item.type] !== undefined) {
        byType[item.type] += amt;
      } else {
        byType.lainnya += amt;
      }
    }

    return { total, byType, count: incomes.length };
  }
}
