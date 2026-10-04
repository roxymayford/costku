import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  calculateBudgetStatus,
  calculateAllocation,
  calculateFinancialHealthScore,
  BudgetEngineResult,
  AllocationResult,
  FinancialHealthResult,
  TransactionItem,
} from '../modules/budget/budget.service.js';

export const budgetRouter = Router();

export interface BudgetSettingsRecord {
  needs_percentage: number;
  wants_percentage: number;
  savings_percentage: number;
  carry_over_daily: boolean;
  month_end_mode: 'carry_over' | 'savings' | 'reset';
  updated_at?: string;
}

const DEFAULT_BUDGET_SETTINGS: BudgetSettingsRecord = {
  needs_percentage: 50,
  wants_percentage: 30,
  savings_percentage: 20,
  carry_over_daily: true,
  month_end_mode: 'carry_over',
};

// In-memory fallback store
const inMemoryBudgetSettings: Map<string, BudgetSettingsRecord> = new Map();

/**
 * Fetch all financial context needed to compute budget and health metrics for a user.
 */
async function getUserFinancialContext(userId: string) {
  let monthlySalary = 5500000;
  let fixedExpenses = 1200000;
  let paydayDate = 25;
  let budgetSettings = inMemoryBudgetSettings.get(userId) || DEFAULT_BUDGET_SETTINGS;
  let totalIncome = 0;
  let totalLiabilities = 0;
  let transactions: TransactionItem[] = [];

  if (supabaseAdmin && userId !== 'demo-user') {
    // 1. Profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('monthly_salary, fixed_expenses, payday_date')
      .eq('id', userId)
      .single();
    if (profile) {
      if (typeof profile.monthly_salary === 'number' && profile.monthly_salary > 0) {
        monthlySalary = profile.monthly_salary;
      }
      if (typeof profile.fixed_expenses === 'number') {
        fixedExpenses = profile.fixed_expenses;
      }
      if (typeof profile.payday_date === 'number') {
        paydayDate = profile.payday_date;
      }
    }

    // 2. Budget Settings
    const { data: bData } = await supabaseAdmin
      .from('budget_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (bData) {
      budgetSettings = {
        needs_percentage: bData.needs_percentage ?? DEFAULT_BUDGET_SETTINGS.needs_percentage,
        wants_percentage: bData.wants_percentage ?? DEFAULT_BUDGET_SETTINGS.wants_percentage,
        savings_percentage: bData.savings_percentage ?? DEFAULT_BUDGET_SETTINGS.savings_percentage,
        carry_over_daily: bData.carry_over_daily ?? DEFAULT_BUDGET_SETTINGS.carry_over_daily,
        month_end_mode: bData.month_end_mode ?? DEFAULT_BUDGET_SETTINGS.month_end_mode,
      };
    }

    // 3. Incomes total
    const currentMonth = new Date().toISOString().slice(0, 7);
    const start = `${currentMonth}-01`;
    const [y, m] = currentMonth.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const { data: incData } = await supabaseAdmin
      .from('incomes')
      .select('amount')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', nextMonth);

    if (incData && incData.length > 0) {
      totalIncome = incData.reduce((sum, i) => sum + Number(i.amount), 0);
    }

    // 4. Liabilities total
    const { data: liabData } = await supabaseAdmin
      .from('liabilities')
      .select('monthly_amount')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (liabData && liabData.length > 0) {
      totalLiabilities = liabData.reduce((sum, l) => sum + Number(l.monthly_amount), 0);
    }

    // 5. Transactions
    const { data: txData } = await supabaseAdmin
      .from('transactions')
      .select('amount, category, transaction_date, spread_days, spread_start')
      .eq('user_id', userId);

    if (txData && txData.length > 0) {
      transactions = txData.map((t) => ({
        amount: Number(t.amount) || 0,
        category: t.category,
        transaction_date: t.transaction_date,
        spread_days: t.spread_days,
        spread_start: t.spread_start,
      }));
    }
  }

  // Effective income: use recorded incomes if any, otherwise fallback to salary
  const effectiveIncome = totalIncome > 0 ? totalIncome : monthlySalary;

  return {
    monthlySalary,
    fixedExpenses,
    paydayDate,
    budgetSettings,
    totalIncome: effectiveIncome,
    totalLiabilities,
    transactions,
  };
}

/**
 * GET /api/v1/budget/settings
 * Fetch 50/30/20 & rollover settings for authenticated user.
 */
budgetRouter.get('/settings', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('budget_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data: {
            needs_percentage: data.needs_percentage ?? DEFAULT_BUDGET_SETTINGS.needs_percentage,
            wants_percentage: data.wants_percentage ?? DEFAULT_BUDGET_SETTINGS.wants_percentage,
            savings_percentage: data.savings_percentage ?? DEFAULT_BUDGET_SETTINGS.savings_percentage,
            carry_over_daily: data.carry_over_daily ?? DEFAULT_BUDGET_SETTINGS.carry_over_daily,
            month_end_mode: data.month_end_mode ?? DEFAULT_BUDGET_SETTINGS.month_end_mode,
          },
        });
      }
    }

    const settings = inMemoryBudgetSettings.get(userId) || DEFAULT_BUDGET_SETTINGS;
    return res.status(200).json({
      status: 'success',
      data: settings,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/v1/budget/settings
 * Save 50/30/20 & rollover settings for authenticated user.
 */
budgetRouter.put('/settings', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const {
      needs_percentage,
      wants_percentage,
      savings_percentage,
      carry_over_daily = true,
      month_end_mode = 'carry_over',
    } = req.body;

    const needs = Math.round(Number(needs_percentage));
    const wants = Math.round(Number(wants_percentage));
    const savings = Math.round(Number(savings_percentage));

    const errors: string[] = [];
    if (isNaN(needs) || needs < 0 || needs > 100) {
      errors.push('needs_percentage harus bernilai antara 0 hingga 100.');
    }
    if (isNaN(wants) || wants < 0 || wants > 100) {
      errors.push('wants_percentage harus bernilai antara 0 hingga 100.');
    }
    if (isNaN(savings) || savings < 0 || savings > 100) {
      errors.push('savings_percentage harus bernilai antara 0 hingga 100.');
    }
    if (needs + wants + savings !== 100) {
      errors.push(`Total persentase harus 100% (saat ini ${needs + wants + savings}%).`);
    }

    const validModes = ['carry_over', 'savings', 'reset'];
    if (!validModes.includes(month_end_mode)) {
      errors.push("month_end_mode harus salah satu dari: 'carry_over', 'savings', atau 'reset'.");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Validasi pengaturan budget gagal.',
        errors,
      });
    }

    const now = new Date().toISOString();
    const payload: BudgetSettingsRecord = {
      needs_percentage: needs,
      wants_percentage: wants,
      savings_percentage: savings,
      carry_over_daily: Boolean(carry_over_daily),
      month_end_mode,
      updated_at: now,
    };

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data: existing } = await supabaseAdmin
        .from('budget_settings')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        await supabaseAdmin
          .from('budget_settings')
          .update(payload)
          .eq('user_id', userId);
      } else {
        await supabaseAdmin
          .from('budget_settings')
          .insert({ user_id: userId, ...payload });
      }

      return res.status(200).json({
        status: 'success',
        data: payload,
      });
    }

    inMemoryBudgetSettings.set(userId, payload);
    return res.status(200).json({
      status: 'success',
      data: payload,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/budget/status
 * Server-side calculation of daily rollover, cycle days, and spending metrics.
 */
budgetRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const targetDate = typeof req.query.targetDate === 'string' ? req.query.targetDate : undefined;

    const ctx = await getUserFinancialContext(userId);

    const result: BudgetEngineResult = calculateBudgetStatus({
      totalIncome: ctx.totalIncome,
      totalLiabilities: ctx.totalLiabilities,
      fixedExpenses: ctx.fixedExpenses,
      savingsPercentage: ctx.budgetSettings.savings_percentage,
      paydayDate: ctx.paydayDate,
      transactions: ctx.transactions,
      carryOverDaily: ctx.budgetSettings.carry_over_daily,
      monthEndMode: ctx.budgetSettings.month_end_mode,
      targetDate,
    });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/budget/allocation
 * Server-side 50/30/20 allocation breakdown.
 */
budgetRouter.get('/allocation', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const ctx = await getUserFinancialContext(userId);
    const totalFixed = ctx.fixedExpenses + ctx.totalLiabilities;

    const result: AllocationResult = calculateAllocation(
      ctx.totalIncome,
      totalFixed,
      {
        needs: ctx.budgetSettings.needs_percentage,
        wants: ctx.budgetSettings.wants_percentage,
        savings: ctx.budgetSettings.savings_percentage,
      },
      ctx.paydayDate
    );

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/budget/health-score & /api/v1/analytics/health-score
 * Server-side financial health scoring.
 */
budgetRouter.get('/health-score', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const ctx = await getUserFinancialContext(userId);
    const totalFixed = ctx.fixedExpenses + ctx.totalLiabilities;

    const allocation = calculateAllocation(
      ctx.totalIncome,
      totalFixed,
      {
        needs: ctx.budgetSettings.needs_percentage,
        wants: ctx.budgetSettings.wants_percentage,
        savings: ctx.budgetSettings.savings_percentage,
      },
      ctx.paydayDate
    );

    let needsSpent = 0;
    let wantsSpent = 0;
    let savingsActual = 0;

    for (const t of ctx.transactions) {
      if (t.category === 'Needs') needsSpent += t.amount;
      else if (t.category === 'Wants') wantsSpent += t.amount;
      else if (t.category === 'Savings') savingsActual += t.amount;
    }

    const totalSpent = needsSpent + wantsSpent + savingsActual;

    const result: FinancialHealthResult = calculateFinancialHealthScore({
      totalSpent,
      needsSpent,
      wantsSpent,
      savingsActual,
      targetNeeds: allocation.needsAmount,
      targetWants: allocation.wantsAmount,
      targetSavings: allocation.savingsAmount,
    });

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    return next(err);
  }
});
