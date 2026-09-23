-- ==============================================================================
-- costKu: Split Budget & Outlier Schema Alterations
-- ==============================================================================

-- Fitur 2: Spread / Split transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS spread_days INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS spread_start DATE DEFAULT NULL;

-- Fitur 5: Outlier detection flags
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_outlier BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS outlier_level TEXT DEFAULT NULL,       -- 'hard' | 'soft'
  ADD COLUMN IF NOT EXISTS outlier_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by_user BOOLEAN DEFAULT FALSE;
