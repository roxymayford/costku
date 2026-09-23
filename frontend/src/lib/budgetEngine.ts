// ──────────────────────────────────────────────────────────
// costKu — Core Budget Engine
// Handles: Split Budget, Cumulative Daily Rollover, & Month-end Rollover
// ──────────────────────────────────────────────────────────

import { Transaction } from './storage';
import { getDaysInCurrentCycle, getDayInCycle } from './calculator';

/**
 * Calculates date difference in days: (d2 - d1).
 * Expects 'YYYY-MM-DD' format.
 */
function diffInDays(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((utcB - utcA) / (1000 * 60 * 60 * 24));
}

/**
 * Format Date to YYYY-MM-DD using local calendar.
 */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get effective daily amount of a transaction for a specific date.
 * If spread_days is set (> 1), expense is amortized across spread_days.
 * Remainder is absorbed on the last day to maintain exact total equality.
 */
export function getEffectiveDailyAmount(tx: Transaction, targetDateStr: string): number {
  const spreadDays = tx.spread_days;

  // Single-day standard transaction
  if (!spreadDays || spreadDays <= 1) {
    return tx.transaction_date === targetDateStr ? tx.amount : 0;
  }

  // Multi-day split transaction
  const startDate = tx.spread_start || tx.transaction_date;
  const dayOffset = diffInDays(startDate, targetDateStr);

  if (dayOffset < 0 || dayOffset >= spreadDays) {
    return 0;
  }

  const basePerDay = Math.floor(tx.amount / spreadDays);
  const remainder = tx.amount - basePerDay * spreadDays;

  // Last day absorbs the rounding remainder
  if (dayOffset === spreadDays - 1) {
    return basePerDay + remainder;
  }

  return basePerDay;
}

/**
 * Total effective spending across transactions for a given date.
 */
export function getEffectiveSpendingOnDate(
  transactions: Transaction[],
  targetDateStr: string
): number {
  return transactions.reduce(
    (sum, tx) => sum + getEffectiveDailyAmount(tx, targetDateStr),
    0
  );
}

/**
 * Total actual cash spent on transaction_date (without spread adjustment).
 */
export function getActualCashOutOnDate(
  transactions: Transaction[],
  targetDateStr: string
): number {
  return transactions
    .filter((tx) => tx.transaction_date === targetDateStr)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Get cycle date boundaries (start date and end date) based on payday date.
 */
export function getCycleBoundaries(paydayDate: number, refDate: Date = new Date()): {
  cycleStartDate: string;
  cycleEndDate: string;
  daysInCycle: number;
} {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  let cycleStart = new Date(year, month, paydayDate);
  let cycleEnd: Date;

  if (refDate < cycleStart) {
    // Current date is before this month's payday: cycle started on previous month's payday
    cycleStart = new Date(year, month - 1, paydayDate);
    cycleEnd = new Date(year, month, paydayDate);
  } else {
    // Current date is on or after this month's payday: cycle ends on next month's payday
    cycleEnd = new Date(year, month + 1, paydayDate);
  }

  const diffTime = cycleEnd.getTime() - cycleStart.getTime();
  const daysInCycle = Math.round(diffTime / (1000 * 60 * 60 * 24));

  return {
    cycleStartDate: toDateString(cycleStart),
    cycleEndDate: toDateString(cycleEnd),
    daysInCycle,
  };
}

export interface BudgetEngineParams {
  totalIncome: number;
  totalLiabilities?: number;
  fixedExpenses?: number;
  savingsPercentage: number;
  paydayDate: number;
  transactions: Transaction[];
  carryOverDaily?: boolean;
  monthEndMode?: 'carry_over' | 'savings' | 'reset';
  targetDate?: string; // defaults to today (YYYY-MM-DD)
}

export interface BudgetEngineResult {
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

/**
 * Main budget calculation engine with daily carry-over and split awareness.
 */
export function calculateBudgetStatus(params: BudgetEngineParams): BudgetEngineResult {
  const todayStr = params.targetDate || toDateString(new Date());
  const paydayDate = params.paydayDate || 25;
  const carryOver = params.carryOverDaily !== false;

  const totalFixed = (params.fixedExpenses || 0) + (params.totalLiabilities || 0);
  const afterFixed = Math.max(0, params.totalIncome - totalFixed);
  const savingsTarget = Math.round((afterFixed * (params.savingsPercentage || 20)) / 100);
  const disposableMonthly = Math.max(0, afterFixed - savingsTarget);

  const { cycleStartDate, daysInCycle } = getCycleBoundaries(paydayDate);
  const currentDayIndex = Math.min(daysInCycle, Math.max(1, getDayInCycle(paydayDate)));
  const daysRemaining = Math.max(1, daysInCycle - currentDayIndex + 1);

  const baseDailyLimit = daysInCycle > 0 ? Math.round(disposableMonthly / daysInCycle) : 0;

  // Calculate cumulative effective spending from cycleStartDate up to day before today
  let spentBeforeToday = 0;
  const [startYear, startMonth, startDay] = cycleStartDate.split('-').map(Number);

  for (let offset = 0; offset < currentDayIndex - 1; offset++) {
    const d = new Date(startYear, startMonth - 1, startDay + offset);
    const dStr = toDateString(d);
    spentBeforeToday += getEffectiveSpendingOnDate(params.transactions, dStr);
  }

  // Today's effective spending
  const spentTodayEffective = getEffectiveSpendingOnDate(params.transactions, todayStr);
  const spentTodayReal = getActualCashOutOnDate(params.transactions, todayStr);

  const cumulativeSpent = spentBeforeToday + spentTodayEffective;
  const cumulativeBudget = baseDailyLimit * currentDayIndex;

  // Yesterday's rollover surplus/deficit
  const budgetBeforeToday = baseDailyLimit * (currentDayIndex - 1);
  const yesterdaySurplus = budgetBeforeToday - spentBeforeToday;

  let availableTodayInitial: number;
  let remainingToday: number;

  if (carryOver) {
    // If carry over is enabled: budget today incorporates all unspent budget from previous days
    availableTodayInitial = Math.max(0, cumulativeBudget - spentBeforeToday);
    remainingToday = availableTodayInitial - spentTodayEffective;
  } else {
    // If reset daily: each day starts with exactly baseDailyLimit
    availableTodayInitial = baseDailyLimit;
    remainingToday = baseDailyLimit - spentTodayEffective;
  }

  return {
    totalIncome: params.totalIncome,
    totalFixed,
    savingsTarget,
    disposableMonthly,
    daysInCycle,
    currentDayIndex,
    daysRemaining,
    baseDailyLimit,
    availableTodayInitial,
    spentTodayEffective,
    spentTodayReal,
    remainingToday,
    cumulativeSpent,
    cumulativeBudget,
    yesterdaySurplus,
    hasSurplus: yesterdaySurplus > 0,
    hasDeficit: yesterdaySurplus < 0,
    isOverToday: remainingToday < 0,
  };
}
