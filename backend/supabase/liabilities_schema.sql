-- ==============================================================================
-- costKu: Liabilities & Paylater Schema
-- Dedicated tracking for cicilan & paylater commitments
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                                 -- e.g. "Kredit HP Samsung", "Shopee PayLater", "KPR"
  type TEXT NOT NULL DEFAULT 'cicilan',               -- 'cicilan' | 'paylater'
  monthly_amount BIGINT NOT NULL CHECK (monthly_amount > 0),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  remaining_tenor INTEGER DEFAULT NULL,               -- sisa bulan (null jika tanpa batas/kontinu)
  total_amount BIGINT DEFAULT NULL,                   -- total pinjaman awal (opsional)
  status TEXT NOT NULL DEFAULT 'active',              -- 'active' | 'paid_off'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liabilities_user_status ON public.liabilities(user_id, status);

-- Table for tracking monthly auto-cut or manual payments
CREATE TABLE IF NOT EXISTS public.liability_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id UUID NOT NULL REFERENCES public.liabilities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                               -- 'YYYY-MM'
  amount BIGINT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_generated BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT unique_liability_period UNIQUE(liability_id, period)
);

CREATE INDEX IF NOT EXISTS idx_liability_payments_user ON public.liability_payments(user_id, period);

-- Enable Row Level Security
ALTER TABLE public.liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liability_payments ENABLE ROW LEVEL SECURITY;

-- Policies for liabilities
DROP POLICY IF EXISTS "Users can view own liabilities" ON public.liabilities;
CREATE POLICY "Users can view own liabilities"
  ON public.liabilities FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own liabilities" ON public.liabilities;
CREATE POLICY "Users can insert own liabilities"
  ON public.liabilities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own liabilities" ON public.liabilities;
CREATE POLICY "Users can update own liabilities"
  ON public.liabilities FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own liabilities" ON public.liabilities;
CREATE POLICY "Users can delete own liabilities"
  ON public.liabilities FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for liability_payments
DROP POLICY IF EXISTS "Users can view own liability payments" ON public.liability_payments;
CREATE POLICY "Users can view own liability payments"
  ON public.liability_payments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own liability payments" ON public.liability_payments;
CREATE POLICY "Users can insert own liability payments"
  ON public.liability_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
