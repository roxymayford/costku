import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const incomesRouter = Router();

export interface IncomeRecord {
  id: string;
  user_id: string;
  type: 'gaji' | 'freelance' | 'bonus' | 'lainnya';
  label: string | null;
  amount: number;
  date: string;
  is_recurring: boolean;
  frequency: 'monthly' | 'weekly' | null;
  created_at: string;
  updated_at: string;
}

// In-memory fallback store for development or demo users when supabaseAdmin is not ready
const inMemoryIncomes: Map<string, IncomeRecord[]> = new Map();

/**
 * GET /api/v1/incomes
 * Query list of incomes for authenticated user, with optional month filter (YYYY-MM).
 */
incomesRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;

    if (supabaseAdmin && userId !== 'demo-user') {
      let query = supabaseAdmin
        .from('incomes')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const start = `${month}-01`;
        // rough next month boundary
        const [y, m] = month.split('-').map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        query = query.gte('date', start).lt('date', nextMonth);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[Incomes API] Supabase query failed, falling back to in-memory:', error.message);
      } else {
        return res.status(200).json({
          status: 'success',
          data: data || [],
        });
      }
    }

    // In-memory fallback
    const userIncomes = inMemoryIncomes.get(userId) || [];
    let filtered = [...userIncomes];
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      filtered = filtered.filter((inc) => inc.date.startsWith(month));
    }
    filtered.sort((a, b) => (b.date > a.date ? 1 : -1));

    return res.status(200).json({
      status: 'success',
      data: filtered,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/incomes/total
 * Aggregate total income for authenticated user, optional month filter (YYYY-MM).
 */
incomesRouter.get('/total', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;

    let items: IncomeRecord[] = [];

    if (supabaseAdmin && userId !== 'demo-user') {
      let query = supabaseAdmin
        .from('incomes')
        .select('amount, type, date')
        .eq('user_id', userId);

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        const start = `${month}-01`;
        const [y, m] = month.split('-').map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        query = query.gte('date', start).lt('date', nextMonth);
      }

      const { data, error } = await query;
      if (!error && data) {
        items = data as IncomeRecord[];
      }
    }

    if (items.length === 0) {
      const userIncomes = inMemoryIncomes.get(userId) || [];
      items = month ? userIncomes.filter((inc) => inc.date.startsWith(month)) : userIncomes;
    }

    const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
    const byType = items.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + Number(item.amount);
      return acc;
    }, {} as Record<string, number>);

    return res.status(200).json({
      status: 'success',
      data: {
        total,
        byType,
        count: items.length,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/incomes
 * Add a new income entry.
 */
incomesRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { type = 'gaji', label = null, amount, date, is_recurring = false, frequency = null } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Nominal pemasukan harus lebih besar dari 0.',
      });
    }

    const incomeDate = date || new Date().toISOString().slice(0, 10);
    const validTypes = ['gaji', 'freelance', 'bonus', 'lainnya'];
    const chosenType = validTypes.includes(type) ? type : 'lainnya';

    const newRecord: IncomeRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      type: chosenType as IncomeRecord['type'],
      label: label ? String(label).trim() : null,
      amount: Math.round(numAmount),
      date: incomeDate,
      is_recurring: Boolean(is_recurring),
      frequency: frequency ? String(frequency) as any : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('incomes')
        .insert({
          id: newRecord.id,
          user_id: newRecord.user_id,
          type: newRecord.type,
          label: newRecord.label,
          amount: newRecord.amount,
          date: newRecord.date,
          is_recurring: newRecord.is_recurring,
          frequency: newRecord.frequency,
        })
        .select()
        .single();

      if (!error && data) {
        return res.status(201).json({
          status: 'success',
          data,
        });
      }
      console.warn('[Incomes API] Supabase insert failed, saving to in-memory:', error?.message);
    }

    // In-memory fallback
    const list = inMemoryIncomes.get(userId) || [];
    list.unshift(newRecord);
    inMemoryIncomes.set(userId, list);

    return res.status(201).json({
      status: 'success',
      data: newRecord,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/v1/incomes/:id
 * Update an existing income entry.
 */
incomesRouter.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { type, label, amount, date, is_recurring, frequency } = req.body;

    const updates: Partial<IncomeRecord> = {
      updated_at: new Date().toISOString(),
    };

    if (type !== undefined) updates.type = type;
    if (label !== undefined) updates.label = label;
    if (amount !== undefined) updates.amount = Math.round(Number(amount));
    if (date !== undefined) updates.date = date;
    if (is_recurring !== undefined) updates.is_recurring = Boolean(is_recurring);
    if (frequency !== undefined) updates.frequency = frequency;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('incomes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data,
        });
      }
    }

    const list = inMemoryIncomes.get(userId) || [];
    const index = list.findIndex((item) => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      inMemoryIncomes.set(userId, list);
      return res.status(200).json({
        status: 'success',
        data: list[index],
      });
    }

    return res.status(404).json({
      status: 'error',
      message: 'Data pemasukan tidak ditemukan.',
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/v1/incomes/:id
 * Delete an income entry.
 */
incomesRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { error } = await supabaseAdmin
        .from('incomes')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) {
        return res.status(200).json({
          status: 'success',
          message: 'Pemasukan berhasil dihapus.',
        });
      }
    }

    const list = inMemoryIncomes.get(userId) || [];
    const filtered = list.filter((item) => item.id !== id);
    inMemoryIncomes.set(userId, filtered);

    return res.status(200).json({
      status: 'success',
      message: 'Pemasukan berhasil dihapus.',
    });
  } catch (err) {
    return next(err);
  }
});
