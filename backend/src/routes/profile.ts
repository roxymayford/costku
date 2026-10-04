import { Router, Response, NextFunction, Request } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const profileRouter = Router();

// ─── Onboarding Default Template ─────────────────────────────────────────────

/**
 * Default fixed expense template items shown when user first opens onboarding.
 * Centralising this on the backend means the frontend never has hardcoded data.
 */
const ONBOARDING_DEFAULT_ITEMS = [
  { id: 'tpl-1', name: 'Cicilan / Utang',                   amount: 500000 },
  { id: 'tpl-2', name: 'Iuran BPJS / Asuransi',             amount: 150000 },
  { id: 'tpl-3', name: 'Bantuan Keluarga / Kiriman Ortu',   amount: 500000 },
  { id: 'tpl-4', name: 'Tagihan Listrik & WiFi',            amount: 350000 },
];

/**
 * GET /api/v1/onboarding/defaults
 * Returns the default salary, payday date, and fixed-expense template items.
 * Does NOT require authentication — used to pre-fill the form before the user
 * has saved anything.
 */
profileRouter.get('/onboarding/defaults', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    data: {
      defaultSalary: 5500000,
      defaultPaydayDate: 25,
      templateItems: ONBOARDING_DEFAULT_ITEMS,
    },
  });
});

/**
 * POST /api/v1/onboarding
 * Save the initial profile during the onboarding wizard in one request.
 * Accepts monthly_salary, payday_date, and an array of fixed expense items.
 * The backend sums the items into fixed_expenses before persisting.
 */
profileRouter.post('/onboarding', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const userName = req.user!.name || 'Pengguna costKu';
    const userEmail = req.user!.email;

    const { monthly_salary, payday_date, expense_items } = req.body;

    const errors: string[] = [];

    const cleanSalary = Math.round(Number(monthly_salary));
    if (isNaN(cleanSalary) || cleanSalary <= 0) {
      errors.push('monthly_salary harus berupa bilangan bulat positif.');
    }

    const cleanPayday = Math.round(Number(payday_date));
    if (isNaN(cleanPayday) || cleanPayday < 1 || cleanPayday > 31) {
      errors.push('payday_date harus bernilai antara 1 hingga 31.');
    }

    // expense_items is optional; if provided it must be an array of { name, amount }
    let fixedExpenses = 0;
    if (expense_items !== undefined) {
      if (!Array.isArray(expense_items)) {
        errors.push('expense_items harus berupa array.');
      } else {
        for (const item of expense_items) {
          const amt = Math.round(Number(item?.amount));
          if (isNaN(amt) || amt < 0) {
            errors.push(`Item "${item?.name || '?'}" memiliki amount tidak valid.`);
          } else {
            fixedExpenses += amt;
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ status: 'fail', message: 'Validasi onboarding gagal.', errors });
    }

    const now = new Date().toISOString();
    const profilePayload = {
      id: userId,
      name: userName,
      email: userEmail,
      monthly_salary: cleanSalary,
      payday_date: cleanPayday,
      fixed_expenses: fixedExpenses,
      updated_at: now,
    };

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .upsert(profilePayload)
        .select()
        .single();

      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data: {
            id: data.id,
            name: data.name,
            email: data.email,
            monthly_salary: Math.round(data.monthly_salary),
            payday_date: data.payday_date,
            fixed_expenses: Math.round(data.fixed_expenses),
            updated_at: data.updated_at,
          },
        });
      }
      if (error) console.warn('[Onboarding] Supabase upsert warning:', error.message);
    }

    // In-memory fallback
    inMemoryProfiles.set(userId, {
      ...profilePayload,
      created_at: now,
    });

    return res.status(200).json({ status: 'success', data: profilePayload });
  } catch (err) {
    return next(err);
  }
});

export interface ProfileRecord {
  id: string;
  name: string;
  email?: string;
  monthly_salary: number;
  payday_date: number;
  fixed_expenses: number;
  created_at?: string;
  updated_at?: string;
}

// In-memory fallback store for offline dev or demo mode
const inMemoryProfiles: Map<string, ProfileRecord> = new Map();

// Default values for new profiles
const DEFAULT_PROFILE_SALARY = 5500000;
const DEFAULT_PAYDAY_DATE = 25;
const DEFAULT_FIXED_EXPENSES = 1200000;

/**
 * GET /api/v1/profile
 * Get financial profile of authenticated user.
 */
profileRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const userName = req.user!.name || 'Pengguna costKu';

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data: {
            id: data.id,
            name: data.name || userName,
            email: data.email || userEmail,
            monthly_salary: typeof data.monthly_salary === 'number' ? Math.round(data.monthly_salary) : DEFAULT_PROFILE_SALARY,
            payday_date: typeof data.payday_date === 'number' ? data.payday_date : DEFAULT_PAYDAY_DATE,
            fixed_expenses: typeof data.fixed_expenses === 'number' ? Math.round(data.fixed_expenses) : DEFAULT_FIXED_EXPENSES,
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
        });
      }
    }

    // In-memory fallback
    let current = inMemoryProfiles.get(userId);
    if (!current) {
      current = {
        id: userId,
        name: userName,
        email: userEmail,
        monthly_salary: DEFAULT_PROFILE_SALARY,
        payday_date: DEFAULT_PAYDAY_DATE,
        fixed_expenses: DEFAULT_FIXED_EXPENSES,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      inMemoryProfiles.set(userId, current);
    }

    return res.status(200).json({
      status: 'success',
      data: current,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PUT /api/v1/profile
 * Update user's financial profile.
 */
profileRouter.put('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { name, monthly_salary, payday_date, fixed_expenses } = req.body;

    const errors: string[] = [];

    // Validation
    const cleanSalary = monthly_salary !== undefined ? Math.round(Number(monthly_salary)) : undefined;
    if (cleanSalary !== undefined && (isNaN(cleanSalary) || cleanSalary < 0)) {
      errors.push('monthly_salary harus berupa bilangan bulat positif atau nol.');
    }

    const cleanPayday = payday_date !== undefined ? Math.round(Number(payday_date)) : undefined;
    if (cleanPayday !== undefined && (isNaN(cleanPayday) || cleanPayday < 1 || cleanPayday > 31)) {
      errors.push('payday_date harus bernilai antara 1 hingga 31.');
    }

    const cleanFixed = fixed_expenses !== undefined ? Math.round(Number(fixed_expenses)) : undefined;
    if (cleanFixed !== undefined && (isNaN(cleanFixed) || cleanFixed < 0)) {
      errors.push('fixed_expenses harus berupa bilangan bulat positif atau nol.');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Validasi profil gagal.',
        errors,
      });
    }

    const now = new Date().toISOString();
    const updatePayload: Partial<ProfileRecord> = {
      updated_at: now,
    };
    if (name && typeof name === 'string') updatePayload.name = name.trim();
    if (cleanSalary !== undefined) updatePayload.monthly_salary = cleanSalary;
    if (cleanPayday !== undefined) updatePayload.payday_date = cleanPayday;
    if (cleanFixed !== undefined) updatePayload.fixed_expenses = cleanFixed;

    if (supabaseAdmin && userId !== 'demo-user') {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          ...updatePayload,
        })
        .select()
        .single();

      if (!error && data) {
        return res.status(200).json({
          status: 'success',
          data: {
            id: data.id,
            name: data.name || req.user!.name,
            email: data.email || req.user!.email,
            monthly_salary: typeof data.monthly_salary === 'number' ? Math.round(data.monthly_salary) : (cleanSalary ?? DEFAULT_PROFILE_SALARY),
            payday_date: typeof data.payday_date === 'number' ? data.payday_date : (cleanPayday ?? DEFAULT_PAYDAY_DATE),
            fixed_expenses: typeof data.fixed_expenses === 'number' ? Math.round(data.fixed_expenses) : (cleanFixed ?? DEFAULT_FIXED_EXPENSES),
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
        });
      }
    }

    // In-memory fallback
    const current = inMemoryProfiles.get(userId) || {
      id: userId,
      name: req.user!.name || 'Pengguna costKu',
      email: req.user!.email,
      monthly_salary: DEFAULT_PROFILE_SALARY,
      payday_date: DEFAULT_PAYDAY_DATE,
      fixed_expenses: DEFAULT_FIXED_EXPENSES,
      created_at: now,
      updated_at: now,
    };

    const updated: ProfileRecord = {
      ...current,
      ...updatePayload,
      updated_at: now,
    };
    inMemoryProfiles.set(userId, updated);

    return res.status(200).json({
      status: 'success',
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
});
