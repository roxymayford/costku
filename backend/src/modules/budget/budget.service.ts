// ──────────────────────────────────────────────────────────
// costKu — Server-Side Financial & Budget Calculation Engine
// Handles: 50/30/20 Allocation, Split Amortization, Daily Rollover, and Health Score
// ──────────────────────────────────────────────────────────

export interface TransactionItem {
  amount: number;
  category: string;
  transaction_date: string;
  spread_days?: number | null;
  spread_start?: string | null;
}

export interface BudgetEngineParams {
  totalIncome: number;
  totalLiabilities?: number;
  fixedExpenses?: number;
  savingsPercentage: number;
  paydayDate: number;
  transactions: TransactionItem[];
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

export interface AllocationPercentages {
  needs: number;
  wants: number;
  savings: number;
}

export interface AllocationResult {
  effectiveIncome: number;
  totalFixed: number;
  netDisposable: number;
  needsAmount: number;
  wantsAmount: number;
  savingsAmount: number;
  percentages: AllocationPercentages;
  dailyLimit: number;
  daysInCycle: number;
}

export interface FinancialHealthInput {
  totalSpent: number;
  needsSpent: number;
  wantsSpent: number;
  savingsActual: number;
  targetNeeds: number;
  targetWants: number;
  targetSavings: number;
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

function diffInDays(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((utcB - utcA) / (1000 * 60 * 60 * 24));
}

export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getEffectiveDailyAmount(tx: TransactionItem, targetDateStr: string): number {
  const spreadDays = tx.spread_days;

  if (!spreadDays || spreadDays <= 1) {
    return tx.transaction_date === targetDateStr ? tx.amount : 0;
  }

  const startDate = tx.spread_start || tx.transaction_date;
  const dayOffset = diffInDays(startDate, targetDateStr);

  if (dayOffset < 0 || dayOffset >= spreadDays) {
    return 0;
  }

  const basePerDay = Math.floor(tx.amount / spreadDays);
  const remainder = tx.amount - basePerDay * spreadDays;

  if (dayOffset === spreadDays - 1) {
    return basePerDay + remainder;
  }

  return basePerDay;
}

export function getEffectiveSpendingOnDate(
  transactions: TransactionItem[],
  targetDateStr: string
): number {
  return transactions.reduce(
    (sum, tx) => sum + getEffectiveDailyAmount(tx, targetDateStr),
    0
  );
}

export function getActualCashOutOnDate(
  transactions: TransactionItem[],
  targetDateStr: string
): number {
  return transactions
    .filter((tx) => tx.transaction_date === targetDateStr)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

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
    cycleStart = new Date(year, month - 1, paydayDate);
    cycleEnd = new Date(year, month, paydayDate);
  } else {
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

export function getDaysInCurrentCycle(paydayDate: number, refDate: Date = new Date()): number {
  return getCycleBoundaries(paydayDate, refDate).daysInCycle;
}

export function getDayInCycle(paydayDate: number, refDate: Date = new Date()): number {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  let cycleStart = new Date(year, month, paydayDate);
  if (refDate < cycleStart) {
    cycleStart = new Date(year, month - 1, paydayDate);
  }

  const diff = Math.floor((refDate.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
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

  let spentBeforeToday = 0;
  const [startYear, startMonth, startDay] = cycleStartDate.split('-').map(Number);

  for (let offset = 0; offset < currentDayIndex - 1; offset++) {
    const d = new Date(startYear, startMonth - 1, startDay + offset);
    const dStr = toDateString(d);
    spentBeforeToday += getEffectiveSpendingOnDate(params.transactions, dStr);
  }

  const spentTodayEffective = getEffectiveSpendingOnDate(params.transactions, todayStr);
  const spentTodayReal = getActualCashOutOnDate(params.transactions, todayStr);

  const cumulativeSpent = spentBeforeToday + spentTodayEffective;
  const cumulativeBudget = baseDailyLimit * currentDayIndex;

  const budgetBeforeToday = baseDailyLimit * (currentDayIndex - 1);
  const yesterdaySurplus = budgetBeforeToday - spentBeforeToday;

  let availableTodayInitial: number;
  let remainingToday: number;

  if (carryOver) {
    availableTodayInitial = Math.max(0, cumulativeBudget - spentBeforeToday);
    remainingToday = availableTodayInitial - spentTodayEffective;
  } else {
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

/**
 * 50/30/20 Allocation calculation.
 */
export function calculateAllocation(
  effectiveIncome: number,
  totalFixed: number,
  percentages: AllocationPercentages,
  paydayDate: number = 25
): AllocationResult {
  const afterFixed = Math.max(0, effectiveIncome - totalFixed);
  const needsAmount = Math.round((afterFixed * (percentages.needs || 50)) / 100);
  const wantsAmount = Math.round((afterFixed * (percentages.wants || 30)) / 100);
  const savingsAmount = Math.round((afterFixed * (percentages.savings || 20)) / 100);

  const daysInCycle = getDaysInCurrentCycle(paydayDate);
  const netDisposable = afterFixed - savingsAmount;
  const dailyLimit = daysInCycle > 0 ? Math.round(netDisposable / daysInCycle) : 0;

  return {
    effectiveIncome,
    totalFixed,
    netDisposable,
    needsAmount,
    wantsAmount,
    savingsAmount,
    percentages,
    dailyLimit: Math.max(0, dailyLimit),
    daysInCycle,
  };
}

/**
 * Financial Health Score Calculation (0-100).
 */
export function calculateFinancialHealthScore(input: FinancialHealthInput): FinancialHealthResult {
  let score = 0;

  // Savings discipline (40 pts)
  if (input.targetSavings > 0) {
    const savingsRatio = Math.min(input.savingsActual / input.targetSavings, 1);
    score += savingsRatio * 40;
  } else {
    score += 40;
  }

  // Wants control (35 pts)
  if (input.targetWants > 0) {
    const wantsRatio = input.wantsSpent / input.targetWants;
    if (wantsRatio <= 1) {
      score += 35;
    } else {
      score += Math.max(0, 35 - (wantsRatio - 1) * 35);
    }
  } else {
    score += input.wantsSpent === 0 ? 35 : 0;
  }

  // Needs efficiency (25 pts)
  if (input.targetNeeds > 0) {
    const needsRatio = input.needsSpent / input.targetNeeds;
    if (needsRatio <= 1) {
      score += 25;
    } else {
      score += Math.max(0, 25 - (needsRatio - 1) * 25);
    }
  } else {
    score += input.needsSpent === 0 ? 25 : 0;
  }

  const finalScore = Math.round(Math.min(100, Math.max(0, score)));
  const savingsRatio = input.totalSpent > 0 ? (input.savingsActual / input.totalSpent) * 100 : 0;
  const wantsRatio = input.totalSpent > 0 ? (input.wantsSpent / input.totalSpent) * 100 : 0;
  const needsRatio = input.totalSpent > 0 ? (input.needsSpent / input.totalSpent) * 100 : 0;
  const isOverWants = input.targetWants > 0 && input.wantsSpent > input.targetWants;

  return {
    healthScore: finalScore,
    savingsRatio: Number(savingsRatio.toFixed(1)),
    wantsRatio: Number(wantsRatio.toFixed(1)),
    needsRatio: Number(needsRatio.toFixed(1)),
    isOverWants,
    actualNeeds: input.needsSpent,
    actualWants: input.wantsSpent,
    actualSavings: input.savingsActual,
    totalSpent: input.totalSpent,
  };
}
