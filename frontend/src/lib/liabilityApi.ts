// ──────────────────────────────────────────────────────────
// costKu — Liabilities (Cicilan & Paylater) API Layer
// Dual mode: Supabase with localStorage fallback
// ──────────────────────────────────────────────────────────

import { supabase, isSupabaseConfigured } from './supabase';

export type LiabilityType = 'cicilan' | 'paylater';

export type Liability = {
  id: string;
  user_id: string;
  name: string;
  type: LiabilityType;
  monthly_amount: number;
  due_day: number;
  remaining_tenor: number | null; // Sisa bulan (null jika kontinu)
  total_amount: number | null; // Total pinjaman awal
  status: 'active' | 'paid_off';
  created_at: string;
  updated_at: string;
};

const LS_LIABILITIES_KEY = 'fatrack-liabilities';

export const LIABILITY_TYPE_LABELS: Record<LiabilityType, string> = {
  cicilan: 'Cicilan Kredit',
  paylater: 'PayLater',
};

/**
 * Fetch list of liabilities for a user.
 */
export async function getLiabilities(
  userId: string,
  statusFilter: 'active' | 'all' = 'all'
): Promise<Liability[]> {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('liabilities')
        .select('*')
        .eq('user_id', userId)
        .order('due_day', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data as Liability[];
      }
    } catch (err) {
      console.warn('[liabilityApi] Supabase query failed, falling back to local:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_LIABILITIES_KEY);
  const all: Liability[] = raw ? JSON.parse(raw) : [];
  let userItems = all.filter((l) => l.user_id === userId);

  if (statusFilter !== 'all') {
    userItems = userItems.filter((l) => l.status === statusFilter);
  }

  userItems.sort((a, b) => a.due_day - b.due_day);
  return userItems;
}

/**
 * Add a new liability entry.
 */
export async function addLiability(
  userId: string,
  entry: Omit<Liability, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>
): Promise<Liability> {
  const now = new Date().toISOString();
  const newLiability: Liability = {
    ...entry,
    id: crypto.randomUUID(),
    user_id: userId,
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('liabilities')
        .insert(newLiability)
        .select()
        .single();

      if (!error && data) {
        return data as Liability;
      }
    } catch (err) {
      console.warn('[liabilityApi] Supabase insert failed, falling back to local:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_LIABILITIES_KEY);
  const all: Liability[] = raw ? JSON.parse(raw) : [];
  all.push(newLiability);
  localStorage.setItem(LS_LIABILITIES_KEY, JSON.stringify(all));
  return newLiability;
}

/**
 * Update an existing liability entry.
 */
export async function updateLiability(
  userId: string,
  id: string,
  updates: Partial<Omit<Liability, 'id' | 'user_id' | 'created_at'>>
): Promise<Liability | null> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('liabilities')
        .update({ ...updates, updated_at: now })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (!error && data) {
        return data as Liability;
      }
    } catch (err) {
      console.warn('[liabilityApi] Supabase update failed, falling back to local:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_LIABILITIES_KEY);
  const all: Liability[] = raw ? JSON.parse(raw) : [];
  const idx = all.findIndex((l) => l.id === id && l.user_id === userId);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...updates, updated_at: now };
    localStorage.setItem(LS_LIABILITIES_KEY, JSON.stringify(all));
    return all[idx];
  }
  return null;
}

/**
 * Mark a payment as paid for this month: decrements tenor if > 0.
 * If tenor reaches 0, updates status to 'paid_off'.
 */
export async function payLiabilityMonth(
  userId: string,
  id: string
): Promise<Liability | null> {
  const list = await getLiabilities(userId, 'all');
  const target = list.find((l) => l.id === id);
  if (!target) return null;

  let newTenor = target.remaining_tenor;
  let newStatus = target.status;

  if (typeof newTenor === 'number') {
    newTenor = Math.max(0, newTenor - 1);
    if (newTenor === 0) {
      newStatus = 'paid_off';
    }
  }

  return updateLiability(userId, id, {
    remaining_tenor: newTenor,
    status: newStatus,
  });
}

/**
 * Delete a liability entry.
 */
export async function deleteLiability(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('liabilities')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) return;
    } catch (err) {
      console.warn('[liabilityApi] Supabase delete failed, falling back to local:', err);
    }
  }

  // Local storage fallback
  const raw = localStorage.getItem(LS_LIABILITIES_KEY);
  const all: Liability[] = raw ? JSON.parse(raw) : [];
  const updated = all.filter((l) => !(l.id === id && l.user_id === userId));
  localStorage.setItem(LS_LIABILITIES_KEY, JSON.stringify(updated));
}

/**
 * Total active monthly commitment of liabilities.
 */
export async function getTotalMonthlyLiabilities(userId: string): Promise<{
  totalMonthly: number;
  byType: Record<LiabilityType, number>;
  activeCount: number;
}> {
  const active = await getLiabilities(userId, 'active');

  const byType: Record<LiabilityType, number> = {
    cicilan: 0,
    paylater: 0,
  };

  let totalMonthly = 0;
  for (const item of active) {
    const amt = Number(item.monthly_amount) || 0;
    totalMonthly += amt;
    if (byType[item.type] !== undefined) {
      byType[item.type] += amt;
    }
  }

  return { totalMonthly, byType, activeCount: active.length };
}
