// ──────────────────────────────────────────────────────────
// costKu — Budget & Financial Analytics API Client
// Calls backend /api/v1/budget and /api/v1/analytics
// ──────────────────────────────────────────────────────────

import { apiFetch } from './apiClient';

export interface BudgetSettings {
  needs_percentage: number;
  wants_percentage: number;
  savings_percentage: number;
  carry_over_daily?: boolean;
  month_end_mode?: 'carry_over' | 'savings' | 'reset';
  updated_at?: string;
}

export interface BudgetStatusResult {
  totalIncome: number;
  totalFixed: number;
  savingsTarget: number;
  disposableMonthly: number;
  daysInCycle: number;
  currentDayIndex: number;
  daysRemaining: number;
  baseDailyLimit: number;
  availableTodayInitial: number;
  spentTodayEffective: number;
  spentTodayReal: number;
  remainingToday: number;
  cumulativeSpent: number;
  cumulativeBudget: number;
  yesterdaySurplus: number;
  hasSurplus: boolean;
  hasDeficit: boolean;
  isOverToday: boolean;
}

export interface AllocationResult {
  effectiveIncome: number;
  totalFixed: number;
  netDisposable: number;
  needsAmount: number;
  wantsAmount: number;
  savingsAmount: number;
  percentages: {
    needs: number;
    wants: number;
    savings: number;
  };
  dailyLimit: number;
  daysInCycle: number;
}

export interface FinancialHealthResult {
  healthScore: number;
  savingsRatio: number;
  wantsRatio: number;
  needsRatio: number;
  isOverWants: boolean;
  actualNeeds: number;
  actualWants: number;
  actualSavings: number;
  totalSpent: number;
}

/**
 * Fetch 50/30/20 & rollover settings from backend Express.
 */
export async function getBudgetSettings(): Promise<BudgetSettings> {
  return apiFetch<BudgetSettings>('/api/v1/budget/settings');
}

/**
 * Save 50/30/20 & rollover settings to backend Express.
 */
export async function saveBudgetSettings(settings: {
  needs_percentage: number;
  wants_percentage: number;
  savings_percentage: number;
  carry_over_daily?: boolean;
  month_end_mode?: 'carry_over' | 'savings' | 'reset';
}): Promise<BudgetSettings> {
  return apiFetch<BudgetSettings>('/api/v1/budget/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

/**
 * Get server-calculated daily budget status, rollover, and progress metrics.
 */
export async function getBudgetStatus(targetDate?: string): Promise<BudgetStatusResult> {
  const query = targetDate ? `?targetDate=${encodeURIComponent(targetDate)}` : '';
  return apiFetch<BudgetStatusResult>(`/api/v1/budget/status${query}`);
}

/**
 * Get server-calculated 50/30/20 allocation breakdown.
 */
export async function getAllocation(): Promise<AllocationResult> {
  return apiFetch<AllocationResult>('/api/v1/budget/allocation');
}

/**
 * Get server-calculated financial health score and spending ratios.
 */
export async function getFinancialHealthScore(): Promise<FinancialHealthResult> {
  return apiFetch<FinancialHealthResult>('/api/v1/analytics/health-score');
}
