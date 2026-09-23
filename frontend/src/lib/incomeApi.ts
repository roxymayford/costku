// ──────────────────────────────────────────────────────────
// costKu — Income Management API & Persistence Layer
// Dual mode: Supabase with localStorage fallback
// ──────────────────────────────────────────────────────────

import { supabase, isSupabaseConfigured } from './supabase';

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

/**
 * Get incomes for a user, optionally filtered by month (YYYY-MM format).
 */
export async function getIncomes(userId: string, month?: string): Promise<Income[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('incomes')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const start = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        query = query.gte('date', start).lt('date', nextMonth);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data as Income[];
      }
    } catch (err) {
      console.warn('[incomeApi] Supabase query error, fallback to localStorage:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_INCOMES_KEY);
  const all: Income[] = raw ? JSON.parse(raw) : [];
  let userIncomes = all.filter((i) => i.user_id === userId);

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    userIncomes = userIncomes.filter((i) => i.date.startsWith(month));
  }

  userIncomes.sort((a, b) => (b.date > a.date ? 1 : -1));
  return userIncomes;
}

/**
 * Add an income entry.
 */
export async function addIncome(
  userId: string,
  entry: Omit<Income, 'id' | 'created_at' | 'updated_at' | 'user_id'>
): Promise<Income> {
  const now = new Date().toISOString();
  const newIncome: Income = {
    ...entry,
    id: crypto.randomUUID(),
    user_id: userId,
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('incomes')
        .insert(newIncome)
        .select()
        .single();

      if (!error && data) {
        return data as Income;
      }
    } catch (err) {
      console.warn('[incomeApi] Supabase insert error, fallback to localStorage:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_INCOMES_KEY);
  const all: Income[] = raw ? JSON.parse(raw) : [];
  all.unshift(newIncome);
  localStorage.setItem(LS_INCOMES_KEY, JSON.stringify(all));
  return newIncome;
}

/**
 * Update an existing income entry.
 */
export async function updateIncome(
  userId: string,
  id: string,
  updates: Partial<Omit<Income, 'id' | 'user_id' | 'created_at'>>
): Promise<Income | null> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('incomes')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (!error && data) {
        return data as Income;
      }
    } catch (err) {
      console.warn('[incomeApi] Supabase update error, fallback to localStorage:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_INCOMES_KEY);
  const all: Income[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex((i) => i.id === id && i.user_id === userId);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates, updated_at: now };
    localStorage.setItem(LS_INCOMES_KEY, JSON.stringify(all));
    return all[idx];
  }
  return null;
}

/**
 * Delete an income entry.
 */
export async function deleteIncome(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('incomes')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) return;
    } catch (err) {
      console.warn('[incomeApi] Supabase delete error, fallback to localStorage:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_INCOMES_KEY);
  const all: Income[] = raw ? JSON.parse(raw) : [];
  const updated = all.filter((i) => !(i.id === id && i.user_id === userId));
  localStorage.setItem(LS_INCOMES_KEY, JSON.stringify(updated));
}

/**
 * Calculate total and breakdown for a given month.
 */
export async function getTotalIncome(
  userId: string,
  month?: string
): Promise<{ total: number; byType: Record<IncomeType, number>; count: number }> {
  const incomes = await getIncomes(userId, month);
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
