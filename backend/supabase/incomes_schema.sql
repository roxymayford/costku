-- ==============================================================================
-- costKu: Incomes Schema
-- Supports multiple income sources: gaji, freelance, bonus, and lainnya
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'gaji',        -- 'gaji' | 'freelance' | 'bonus' | 'lainnya'
  label TEXT,                                -- Deskripsi / nama sumber (e.g. "Proyek Web Landing Page")
  amount BIGINT NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  frequency TEXT,                            -- 'monthly' | 'weekly' | null
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user and date queries
CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON public.incomes(user_id, date DESC);

-- Enable Row Level Security
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own incomes" ON public.incomes;
CREATE POLICY "Users can view own incomes"
  ON public.incomes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own incomes" ON public.incomes;
CREATE POLICY "Users can insert own incomes"
  ON public.incomes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own incomes" ON public.incomes;
CREATE POLICY "Users can update own incomes"
  ON public.incomes FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own incomes" ON public.incomes;
CREATE POLICY "Users can delete own incomes"
  ON public.incomes FOR DELETE
  USING (auth.uid() = user_id);
