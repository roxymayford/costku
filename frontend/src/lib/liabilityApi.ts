// ──────────────────────────────────────────────────────────
// costKu — Liabilities (Cicilan & Paylater) API Client
// Calls backend /api/v1/liabilities
// ──────────────────────────────────────────────────────────

import { apiFetch } from './apiClient';

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

export interface TotalLiabilitySummary {
  totalMonthly: number;
  byType: Record<LiabilityType, number>;
  activeCount: number;
}

/**
 * Fetch list of liabilities for authenticated user via backend Express.
 */
export async function getLiabilities(
  _userId?: string,
  statusFilter: 'active' | 'all' = 'all'
): Promise<Liability[]> {
  const query = statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : '';
  try {
    const data = await apiFetch<Liability[]>(`/api/v1/liabilities${query}`);
    return data || [];
  } catch (err) {
    console.warn('[liabilityApi] Backend query failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_LIABILITIES_KEY);
    const all: Liability[] = raw ? JSON.parse(raw) : [];
    let userItems = _userId ? all.filter((l) => l.user_id === _userId) : all;
    if (statusFilter !== 'all') {
      userItems = userItems.filter((l) => l.status === statusFilter);
    }
    userItems.sort((a, b) => a.due_day - b.due_day);
    return userItems;
  }
}

/**
 * Add a new liability entry via backend Express.
 */
export async function addLiability(
  userId: string,
  entry: Omit<Liability, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'status'>
): Promise<Liability> {
  try {
    return await apiFetch<Liability>('/api/v1/liabilities', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.warn('[liabilityApi] Backend insert failed, fallback to local:', err);
    const now = new Date().toISOString();
    const newLiability: Liability = {
      ...entry,
      id: crypto.randomUUID(),
      user_id: userId,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    const raw = localStorage.getItem(LS_LIABILITIES_KEY);
    const all: Liability[] = raw ? JSON.parse(raw) : [];
    all.push(newLiability);
    localStorage.setItem(LS_LIABILITIES_KEY, JSON.stringify(all));
    return newLiability;
  }
}

/**
 * Update an existing liability entry via backend Express.
 */
export async function updateLiability(
  userId: string,
  id: string,
  updates: Partial<Omit<Liability, 'id' | 'user_id' | 'created_at'>>
): Promise<Liability | null> {
  try {
    return await apiFetch<Liability>(`/api/v1/liabilities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  } catch (err) {
    console.warn('[liabilityApi] Backend update failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_LIABILITIES_KEY);
    const all: Liability[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex((l) => l.id === id && l.user_id === userId);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates, updated_at: new Date().toISOString() };
      localStorage.setItem(LS_LIABILITIES_KEY, JSON.stringify(all));
      return all[idx];
    }
    return null;
  }
}

/**
 * Mark a payment as paid for this month: decrements tenor if > 0.
 * If tenor reaches 0, updates status to 'paid_off'.
 */
export async function payLiabilityMonth(
  userId: string,
  id: string
): Promise<Liability | null> {
  try {
    return await apiFetch<Liability>(`/api/v1/liabilities/${id}/pay`, {
      method: 'POST',
    });
  } catch (err) {
    console.warn('[liabilityApi] Backend pay failed, fallback to local calculation:', err);
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
}

/**
 * Delete a liability entry via backend Express.
 */
export async function deleteLiability(userId: string, id: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/liabilities/${id}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[liabilityApi] Backend delete failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_LIABILITIES_KEY);
    const all: Liability[] = raw ? JSON.parse(raw) : [];
    const updated = all.filter((l) => !(l.id === id && l.user_id === userId));
    localStorage.setItem(LS_LIABILITIES_KEY, JSON.stringify(updated));
  }
}

/**
 * Total active monthly commitment of liabilities calculated by backend Express.
 */
export async function getTotalMonthlyLiabilities(
  _userId?: string
): Promise<TotalLiabilitySummary> {
  try {
    return await apiFetch<TotalLiabilitySummary>('/api/v1/liabilities/total');
  } catch (err) {
    console.warn('[liabilityApi] Backend total query failed, fallback to local aggregation:', err);
    const active = await getLiabilities(_userId, 'active');

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
}
