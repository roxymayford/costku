// ──────────────────────────────────────────────────────────
// costKu — Data Persistence Layer (deprecated wrapper)
//
// ⚠  DEPRECATION NOTICE: This file is a thin delegation layer
// that forwards calls to the specific *Api.ts clients.
// New code should import directly from:
//   - lib/profileApi.ts     → getProfile, updateProfile, saveOnboarding
//   - lib/budgetApi.ts      → getBudgetSettings, saveBudgetSettings
//   - lib/transactionApi.ts → getTransactions, addTransaction, deleteTransaction
//
// This file will be removed once all components are migrated.
// ──────────────────────────────────────────────────────────


const LS_KEYS = {
  profile: 'fatrack-profile',
  budget: 'fatrack-budget',
  transactions: 'fatrack-transactions',
};


import {
  UserProfile,
  getProfile as apiGetProfile,
  updateProfile as apiUpdateProfile,
} from './profileApi';
import {
  BudgetSettings,
  getBudgetSettings as apiGetBudgetSettings,
  saveBudgetSettings as apiSaveBudgetSettings,
} from './budgetApi';

export type { UserProfile, BudgetSettings };

// ─── Profile ─────────────────────────────────────────────

export async function getProfile(_userId?: string): Promise<UserProfile | null> {
  try {
    return await apiGetProfile();
  } catch (err) {
    console.warn('[storage] apiGetProfile error, fallback to local:', err);
    const raw = localStorage.getItem(LS_KEYS.profile);
    return raw ? JSON.parse(raw) : null;
  }
}

export async function upsertProfile(profile: UserProfile): Promise<void> {
  try {
    await apiUpdateProfile({
      name: profile.name,
      monthly_salary: profile.monthly_salary,
      payday_date: profile.payday_date,
      fixed_expenses: profile.fixed_expenses,
    });
  } catch (err) {
    console.warn('[storage] apiUpdateProfile error, fallback to local:', err);
    localStorage.setItem(LS_KEYS.profile, JSON.stringify(profile));
  }
}

// ─── Budget Settings ─────────────────────────────────────

export async function getBudgetSettings(_userId?: string): Promise<BudgetSettings> {
  const defaults: BudgetSettings = {
    needs_percentage: 50,
    wants_percentage: 30,
    savings_percentage: 20,
    carry_over_daily: true,
    month_end_mode: 'carry_over',
  };

  try {
    return await apiGetBudgetSettings();
  } catch (err) {
    console.warn('[storage] apiGetBudgetSettings error, fallback to local:', err);
    const raw = localStorage.getItem(LS_KEYS.budget);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  }
}

export async function saveBudgetSettings(_userId: string, settings: BudgetSettings): Promise<void> {
  try {
    await apiSaveBudgetSettings(settings);
  } catch (err) {
    console.warn('[storage] apiSaveBudgetSettings error, fallback to local:', err);
    localStorage.setItem(LS_KEYS.budget, JSON.stringify(settings));
  }
}

import {
  Transaction,
  getTransactions as apiGetTransactions,
  addTransaction as apiAddTransaction,
  deleteTransaction as apiDeleteTransaction,
  getTransactionsByMonth as apiGetTransactionsByMonth,
  aggregateByCategory,
} from './transactionApi';

export type { Transaction };
export { aggregateByCategory };

// ─── Transactions ────────────────────────────────────────

export async function getTransactions(userId?: string): Promise<Transaction[]> {
  return apiGetTransactions(userId);
}

export async function addTransaction(
  userId: string,
  tx: Omit<Transaction, 'id' | 'created_at'>
): Promise<Transaction> {
  return apiAddTransaction(userId, tx);
}

export async function deleteTransaction(userId: string, txId: string): Promise<void> {
  return apiDeleteTransaction(userId, txId);
}

export async function getTransactionsByMonth(
  userId: string,
  yearMonth: string
): Promise<Transaction[]> {
  return apiGetTransactionsByMonth(userId, yearMonth);
}
