// ──────────────────────────────────────────────────────────
// costKu — Transactions & Outlier API Client
// Calls backend /api/v1/transactions
// ──────────────────────────────────────────────────────────

import { apiFetch } from './apiClient';

export type Transaction = {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  category: 'Needs' | 'Wants' | 'Savings';
  transaction_date: string;
  created_at: string;
  spread_days?: number | null;
  spread_start?: string | null;
  is_outlier?: boolean;
  outlier_level?: 'hard' | 'soft' | null;
  outlier_reason?: string | null;
  confirmed_by_user?: boolean;
};

export interface OutlierCheckResult {
  isOutlier: boolean;
  level: 'hard' | 'soft' | null;
  reason: string | null;
  threshold?: number;
  suggestions: ('add_income' | 'add_liability' | 'confirm')[];
}

export interface TransactionSummary {
  totalSpent: number;
  byCategory: Record<string, number>;
  count: number;
}

const LS_TRANSACTIONS_KEY = 'fatrack-transactions';

/**
 * Fetch transactions for authenticated user, with optional month filter.
 */
export async function getTransactions(
  _userId?: string,
  month?: string
): Promise<Transaction[]> {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  try {
    const data = await apiFetch<Transaction[]>(`/api/v1/transactions${query}`);
    return data || [];
  } catch (err) {
    console.warn('[transactionApi] Backend query failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_TRANSACTIONS_KEY);
    const all: Transaction[] = raw ? JSON.parse(raw) : [];
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      return all.filter((t) => t.transaction_date.startsWith(month));
    }
    return all;
  }
}

/**
 * Filter transactions by month (YYYY-MM).
 */
export async function getTransactionsByMonth(
  userId: string,
  yearMonth: string
): Promise<Transaction[]> {
  return getTransactions(userId, yearMonth);
}

/**
 * Create a new transaction via backend Express with server-side outlier detection.
 */
export async function addTransaction(
  _userId: string,
  tx: Omit<Transaction, 'id' | 'created_at'>
): Promise<Transaction> {
  try {
    return await apiFetch<Transaction>('/api/v1/transactions', {
      method: 'POST',
      body: JSON.stringify(tx),
    });
  } catch (err) {
    console.warn('[transactionApi] Backend add failed, fallback to local:', err);
    const newTx: Transaction = {
      ...tx,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    const raw = localStorage.getItem(LS_TRANSACTIONS_KEY);
    const all: Transaction[] = raw ? JSON.parse(raw) : [];
    const updated = [newTx, ...all];
    localStorage.setItem(LS_TRANSACTIONS_KEY, JSON.stringify(updated));
    return newTx;
  }
}

/**
 * Delete a transaction via backend Express.
 */
export async function deleteTransaction(_userId: string, txId: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/transactions/${txId}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[transactionApi] Backend delete failed, fallback to local:', err);
    const raw = localStorage.getItem(LS_TRANSACTIONS_KEY);
    const all: Transaction[] = raw ? JSON.parse(raw) : [];
    const updated = all.filter((t) => t.id !== txId);
    localStorage.setItem(LS_TRANSACTIONS_KEY, JSON.stringify(updated));
  }
}

/**
 * Check if an intended transaction amount is an outlier using backend statistical engine.
 */
export async function checkTransactionOutlier(
  amount: number,
  category: 'Needs' | 'Wants' | 'Savings' = 'Needs'
): Promise<OutlierCheckResult> {
  try {
    return await apiFetch<OutlierCheckResult>('/api/v1/transactions/check-outlier', {
      method: 'POST',
      body: JSON.stringify({ amount, category }),
    });
  } catch (err) {
    console.warn('[transactionApi] Backend outlier check failed, fallback to simple heuristic:', err);
    const isHard = amount >= 4000000;
    return {
      isOutlier: isHard,
      level: isHard ? 'hard' : null,
      reason: isHard ? 'Nominal transaksi sangat tinggi.' : null,
      suggestions: ['confirm'],
    };
  }
}

/**
 * Get category spending summary via backend Express.
 */
export async function getTransactionSummary(month?: string): Promise<TransactionSummary> {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  try {
    return await apiFetch<TransactionSummary>(`/api/v1/transactions/summary${query}`);
  } catch (err) {
    console.warn('[transactionApi] Backend summary failed, fallback to local aggregation:', err);
    const all = await getTransactions(undefined, month);
    return {
      totalSpent: all.reduce((sum, t) => sum + t.amount, 0),
      byCategory: aggregateByCategory(all),
      count: all.length,
    };
  }
}

/**
 * Aggregate spending by category for a given array of transactions.
 */
export function aggregateByCategory(transactions: Transaction[]): Record<string, number> {
  return transactions.reduce(
    (acc, tx) => {
      acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
      return acc;
    },
    {} as Record<string, number>
  );
}
