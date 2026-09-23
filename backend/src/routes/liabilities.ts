import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const liabilitiesRouter = Router();

export interface LiabilityRecord {
  id: string;
  user_id: string;
  name: string;
  type: 'cicilan' | 'paylater';
  monthly_amount: number;
  due_day: number;
  remaining_tenor: number | null;
  total_amount: number | null;
  status: 'active' | 'paid_off';
  created_at: string;
  updated_at: string;
}

// In-memory fallback
const inMemoryLiabilities: Map<string, LiabilityRecord[]> = new Map();

/**
 * GET /api/v1/liabilities
 * List liabilities for authenticated user.
 */
liabilitiesRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const statusFilter = req.query.status as string | undefined;

    if (supabaseAdmin && userId !== 'demo-user') {
      let query = supabaseAdmin
        .from('liabilities')
        .select('*')
        .eq('user_id', userId)
        .order('due_day', { ascending: true });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data,
        });
      }
    }

    const userLiabilities = inMemoryLiabilities.get(userId) || [];
    let filtered = [...userLiabilities];
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((l) => l.status === statusFilter);
    }
    filtered.sort((a, b) => a.due_day - b.due_day);

    return res.status(200).json({
      status: 'success',
      data: filtered,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/v1/liabilities/total
 * Aggregate total monthly commitment of active liabilities.
 */
liabilitiesRouter.get('/total', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    let items: LiabilityRecord[] = [];

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('liabilities')
        .select('monthly_amount, type, status')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (!error && data) {
        items = data as LiabilityRecord[];
      }
    }

    if (items.length === 0) {
      const userLiabilities = inMemoryLiabilities.get(userId) || [];
      items = userLiabilities.filter((l) => l.status === 'active');
    }

    const totalMonthly = items.reduce((sum, item) => sum + Number(item.monthly_amount), 0);
    const byType = items.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + Number(item.monthly_amount);
      return acc;
    }, {} as Record<string, number>);

    return res.status(200).json({
      status: 'success',
      data: {
        totalMonthly,
        byType,
        count: items.length,
      },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/liabilities
 * Create new liability.
 */
liabilitiesRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const {
      name,
      type = 'cicilan',
      monthly_amount,
      due_day,
      remaining_tenor = null,
      total_amount = null,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Nama cicilan/paylater wajib diisi.',
      });
    }

    const numMonthly = Number(monthly_amount);
    if (!numMonthly || numMonthly <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Nominal angsuran per bulan harus lebih besar dari 0.',
      });
    }

    const numDueDay = Math.min(31, Math.max(1, Number(due_day) || 1));
    const tenor = remaining_tenor ? Math.max(1, Number(remaining_tenor)) : null;

    const newRecord: LiabilityRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: String(name).trim(),
      type: type === 'paylater' ? 'paylater' : 'cicilan',
      monthly_amount: Math.round(numMonthly),
      due_day: numDueDay,
      remaining_tenor: tenor,
      total_amount: total_amount ? Math.round(Number(total_amount)) : null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('liabilities')
        .insert(newRecord)
        .select()
        .single();

      if (!error && data) {
        return res.status(201).json({
          status: 'success',
          data,
        });
      }
    }

    const list = inMemoryLiabilities.get(userId) || [];
    list.push(newRecord);
    inMemoryLiabilities.set(userId, list);

    return res.status(201).json({
      status: 'success',
      data: newRecord,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/v1/liabilities/:id
 * Update liability details.
 */
liabilitiesRouter.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name, type, monthly_amount, due_day, remaining_tenor, total_amount, status } = req.body;

    const updates: Partial<LiabilityRecord> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = String(name).trim();
    if (type !== undefined) updates.type = type === 'paylater' ? 'paylater' : 'cicilan';
    if (monthly_amount !== undefined) updates.monthly_amount = Math.round(Number(monthly_amount));
    if (due_day !== undefined) updates.due_day = Math.min(31, Math.max(1, Number(due_day)));
    if (remaining_tenor !== undefined) {
      updates.remaining_tenor = remaining_tenor !== null ? Math.max(0, Number(remaining_tenor)) : null;
    }
    if (total_amount !== undefined) {
      updates.total_amount = total_amount !== null ? Math.round(Number(total_amount)) : null;
    }
    if (status !== undefined) updates.status = status;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('liabilities')
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

    const list = inMemoryLiabilities.get(userId) || [];
    const index = list.findIndex((l) => l.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      inMemoryLiabilities.set(userId, list);
      return res.status(200).json({
        status: 'success',
        data: list[index],
      });
    }

    return res.status(404).json({
      status: 'error',
      message: 'Data cicilan tidak ditemukan.',
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/liabilities/:id/pay
 * Mark a payment as paid for this month, decrement tenor, mark paid_off if tenor reaches 0.
 */
liabilitiesRouter.post('/:id/pay', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const currentPeriod = new Date().toISOString().slice(0, 7);

    let liability: LiabilityRecord | null = null;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data } = await supabaseAdmin
        .from('liabilities')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      liability = data as LiabilityRecord | null;
    } else {
      const list = inMemoryLiabilities.get(userId) || [];
      liability = list.find((l) => l.id === id) || null;
    }

    if (!liability) {
      return res.status(404).json({
        status: 'error',
        message: 'Data cicilan tidak ditemukan.',
      });
    }

    let newTenor = liability.remaining_tenor;
    let newStatus = liability.status;

    if (typeof newTenor === 'number') {
      newTenor = Math.max(0, newTenor - 1);
      if (newTenor === 0) {
        newStatus = 'paid_off';
      }
    }

    // Update liability
    if (supabaseAdmin && userId !== 'demo-user') {
      await supabaseAdmin
        .from('liability_payments')
        .insert({
          liability_id: id,
          user_id: userId,
          period: currentPeriod,
          amount: liability.monthly_amount,
          auto_generated: false,
        })
        .select();

      const { data: updated } = await supabaseAdmin
        .from('liabilities')
        .update({
          remaining_tenor: newTenor,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      return res.status(200).json({
        status: 'success',
        message: newStatus === 'paid_off' ? 'Cicilan lunas!' : 'Pembayaran bulan ini dicatat.',
        data: updated,
      });
    }

    // In-memory fallback
    const list = inMemoryLiabilities.get(userId) || [];
    const idx = list.findIndex((l) => l.id === id);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        remaining_tenor: newTenor,
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      inMemoryLiabilities.set(userId, list);
      return res.status(200).json({
        status: 'success',
        message: newStatus === 'paid_off' ? 'Cicilan lunas!' : 'Pembayaran bulan ini dicatat.',
        data: list[idx],
      });
    }

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/v1/liabilities/:id
 * Delete a liability entry.
 */
liabilitiesRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { error } = await supabaseAdmin
        .from('liabilities')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (!error) {
        return res.status(200).json({
          status: 'success',
          message: 'Cicilan berhasil dihapus.',
        });
      }
    }

    const list = inMemoryLiabilities.get(userId) || [];
    const filtered = list.filter((l) => l.id !== id);
    inMemoryLiabilities.set(userId, filtered);

    return res.status(200).json({
      status: 'success',
      message: 'Cicilan berhasil dihapus.',
    });
  } catch (err) {
    return next(err);
  }
});
