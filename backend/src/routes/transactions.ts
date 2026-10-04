import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { evaluateTransactionOutlier, OutlierCheckResult } from '../modules/outlier/outlier.service.js';

export const transactionsRouter = Router();

export interface TransactionRecord {
  id: string;
  user_id: string;
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
}

// In-memory fallback store for offline/demo mode
const inMemoryTransactions: Map<string, TransactionRecord[]> = new Map();

/**
 * Helper to fetch recent transaction amounts for a user.
 */
async function getRecentAmounts(userId: string): Promise<number[]> {
  if (supabaseAdmin && userId !== 'demo-user') {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(30);

    if (data && data.length > 0) {
      return data.map((t) => Number(t.amount)).filter((a) => !isNaN(a) && a > 0);
    }
  }

  const list = inMemoryTransactions.get(userId) || [];
  return list.slice(0, 30).map((t) => t.amount);
}

/**
 * Helper to fetch monthly salary and calculate daily limit for outlier detection.
 */
async function getUserIncomeLimits(userId: string): Promise<{ monthlySalary: number; dailyLimit: number }> {
  let monthlySalary = 5000000;
  let fixedExpenses = 1200000;

  if (supabaseAdmin && userId !== 'demo-user') {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('monthly_salary, fixed_expenses')
      .eq('id', userId)
      .single();

    if (data) {
      if (typeof data.monthly_salary === 'number' && data.monthly_salary > 0) {
        monthlySalary = data.monthly_salary;
      }
      if (typeof data.fixed_expenses === 'number') {
        fixedExpenses = data.fixed_expenses;
      }
    }
  }

  const dailyLimit = Math.max(50000, Math.round((monthlySalary - fixedExpenses) / 30));
  return { monthlySalary, dailyLimit };
}

/**
 * GET /api/v1/transactions
 * List transactions for authenticated user.
 * Optional query: month (YYYY-MM), category (Needs|Wants|Savings), limit, offset
 */
transactionsRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = Math.max(1, Math.min(100, req.query.limit ? Number(req.query.limit) : 50));
    const offset = Math.max(0, req.query.offset ? Number(req.query.offset) : 0);

    if (supabaseAdmin && userId !== 'demo-user') {
      let query = supabaseAdmin
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const start = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        query = query.gte('transaction_date', start).lt('transaction_date', nextMonth);
      }

      if (category && ['Needs', 'Wants', 'Savings'].includes(category)) {
        query = query.eq('category', category);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;
      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data: data,
          meta: {
            totalCount: count ?? data.length,
            limit,
            offset,
          },
        });
      }
    }

    // In-memory fallback
    const all = inMemoryTransactions.get(userId) || [];
    let filtered = [...all];

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      filtered = filtered.filter((t) => t.transaction_date.startsWith(month));
    }
    if (category && ['Needs', 'Wants', 'Savings'].includes(category)) {
      filtered = filtered.filter((t) => t.category === category);
    }

    filtered.sort((a, b) => (b.transaction_date > a.transaction_date ? 1 : -1));
    const paginated = filtered.slice(offset, offset + limit);

    return res.status(200).json({
      status: 'success',
      data: paginated,
      meta: {
        totalCount: filtered.length,
        limit,
        offset,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/transactions/summary
 * Spending summary aggregated by category.
 */
transactionsRouter.get('/summary', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;

    let items: { amount: number; category: string }[] = [];

    if (supabaseAdmin && userId !== 'demo-user') {
      let query = supabaseAdmin
        .from('transactions')
        .select('amount, category, transaction_date')
        .eq('user_id', userId);

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const start = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        query = query.gte('transaction_date', start).lt('transaction_date', nextMonth);
      }

      const { data, error } = await query;
      if (!error && data) {
        items = data.map((d) => ({ amount: Number(d.amount), category: d.category }));
      }
    }

    if (items.length === 0) {
      const all = inMemoryTransactions.get(userId) || [];
      const filtered = month ? all.filter((t) => t.transaction_date.startsWith(month)) : all;
      items = filtered.map((d) => ({ amount: d.amount, category: d.category }));
    }

    const byCategory: Record<string, number> = {
      Needs: 0,
      Wants: 0,
      Savings: 0,
    };
    let totalSpent = 0;

    for (const item of items) {
      const amt = Number(item.amount) || 0;
      totalSpent += amt;
      byCategory[item.category] = (byCategory[item.category] || 0) + amt;
    }

    return res.status(200).json({
      status: 'success',
      data: {
        totalSpent,
        byCategory,
        count: items.length,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/transactions/check-outlier
 * Evaluate whether an intended transaction amount is an outlier.
 */
transactionsRouter.post('/check-outlier', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { amount, category = 'Needs' } = req.body;

    const numAmount = Math.round(Number(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'amount harus bernilai positif integer.',
      });
    }

    const { monthlySalary, dailyLimit } = await getUserIncomeLimits(userId);
    const recentAmounts = await getRecentAmounts(userId);

    const result = evaluateTransactionOutlier({
      amount: numAmount,
      category,
      monthlyIncome: monthlySalary,
      dailyLimit,
      recentAmounts,
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
 * POST /api/v1/transactions
 * Create a new transaction with automatic outlier evaluation and split budget support.
 */
transactionsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const {
      title,
      amount,
      category = 'Needs',
      transaction_date,
      spread_days = null,
      spread_start = null,
      confirmed_by_user = false,
    } = req.body;

    // Validation
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!cleanTitle) {
      return res.status(400).json({
        status: 'fail',
        message: 'title transaksi tidak boleh kosong.',
      });
    }

    const cleanAmount = Math.round(Number(amount));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'amount harus berupa bilangan bulat rupiah positif.',
      });
    }

    const validCategories = ['Needs', 'Wants', 'Savings'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        status: 'fail',
        message: "category harus salah satu dari 'Needs', 'Wants', atau 'Savings'.",
      });
    }

    const cleanDate =
      typeof transaction_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(transaction_date)
        ? transaction_date
        : new Date().toISOString().slice(0, 10);

    const cleanSpreadDays =
      spread_days !== null && spread_days !== undefined
        ? Math.max(1, Math.round(Number(spread_days)))
        : null;

    // Server-side outlier evaluation
    const { monthlySalary, dailyLimit } = await getUserIncomeLimits(userId);
    const recentAmounts = await getRecentAmounts(userId);
    const outlierCheck = evaluateTransactionOutlier({
      amount: cleanAmount,
      category,
      monthlyIncome: monthlySalary,
      dailyLimit,
      recentAmounts,
    });

    const now = new Date().toISOString();
    const newTx: TransactionRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      title: cleanTitle,
      amount: cleanAmount,
      category,
      transaction_date: cleanDate,
      created_at: now,
      spread_days: cleanSpreadDays,
      spread_start: cleanSpreadDays && cleanSpreadDays > 1 ? (spread_start || cleanDate) : null,
      is_outlier: outlierCheck.isOutlier,
      outlier_level: outlierCheck.level,
      outlier_reason: outlierCheck.reason,
      confirmed_by_user: Boolean(confirmed_by_user),
    };

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .insert({
          id: newTx.id,
          user_id: userId,
          title: newTx.title,
          amount: newTx.amount,
          category: newTx.category,
          transaction_date: newTx.transaction_date,
          created_at: newTx.created_at,
          spread_days: newTx.spread_days,
          spread_start: newTx.spread_start,
          is_outlier: newTx.is_outlier,
          outlier_level: newTx.outlier_level,
          outlier_reason: newTx.outlier_reason,
          confirmed_by_user: newTx.confirmed_by_user,
        })
        .select()
        .single();

      if (!error && data) {
        return res.status(201).json({
          status: 'success',
          data: data,
        });
      }
    }

    // In-memory fallback
    const all = inMemoryTransactions.get(userId) || [];
    inMemoryTransactions.set(userId, [newTx, ...all]);

    return res.status(201).json({
      status: 'success',
      data: newTx,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/v1/transactions/:id
 * Delete a transaction.
 */
transactionsRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: 'fail',
        message: 'ID transaksi wajib diisi.',
      });
    }

    if (supabaseAdmin && userId !== 'demo-user') {
      const { error } = await supabaseAdmin
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) {
        return res.status(200).json({
          status: 'success',
          message: 'Transaksi berhasil dihapus.',
        });
      }
    }

    // In-memory fallback
    const all = inMemoryTransactions.get(userId) || [];
    const updated = all.filter((t) => !(t.id === id && t.user_id === userId));
    inMemoryTransactions.set(userId, updated);

    return res.status(200).json({
      status: 'success',
      message: 'Transaksi berhasil dihapus.',
    });
  } catch (err) {
    return next(err);
  }
});
