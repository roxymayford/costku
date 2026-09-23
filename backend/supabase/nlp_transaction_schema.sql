-- ──────────────────────────────────────────────────────────
-- costKu — NLP Transaction Parser schema
-- Implements §6 of planning-nlp-transaction-parser.md
-- Run this in the Supabase SQL Editor.
--
-- IMPORTANT — this migration is ADDITIVE and IDEMPOTENT.
--
-- The app already has a `public.transactions` table (used by
-- frontend/src/lib/storage.ts) with `title / amount / category /
-- transaction_date`, where `category` is the 50/30/20 split
-- ('Needs' | 'Wants' | 'Savings').
--
-- So the plan document's columns land as follows:
--   doc `item_name` → `title`         (reused — item names show up in the
--                                      existing transaction list for free)
--   doc `category`  → `nlp_category`  (3-class NLP taxonomy, kept separate
--                                      from the 50/30/20 ledger value)
-- Everything else is new, nullable, and never rewrites existing data.
-- ──────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────
-- 0. Shared updated_at trigger
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────
-- 1. transactions — create if absent, otherwise extend in place
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- app ledger columns (already relied on by the frontend)
  title TEXT,
  amount BIGINT,
  category TEXT,                                        -- 'Needs' | 'Wants' | 'Savings'
  transaction_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NLP provenance (§6)
  raw_text TEXT,                                        -- kept even for rejected_multi_item
  normalized_text TEXT,
  nlp_category TEXT,                                    -- 'kebutuhan' | 'keinginan' | 'darurat'
  category_confidence REAL,
  extraction_method TEXT NOT NULL DEFAULT 'rule_based',
  parse_status TEXT NOT NULL DEFAULT 'auto',
  parse_reasons TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extend a pre-existing table without touching anything that is already there.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS normalized_text TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS nlp_category TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category_confidence REAL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'rule_based';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS parse_status TEXT DEFAULT 'auto';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS parse_reasons TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── Integrity constraints (Postgres has no ADD CONSTRAINT IF NOT EXISTS,
--    so each one is guarded explicitly). ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_nlp_category_valid'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_nlp_category_valid
      CHECK (nlp_category IS NULL OR nlp_category IN ('kebutuhan', 'keinginan', 'darurat'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_extraction_method_valid'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_extraction_method_valid
      CHECK (extraction_method IN ('rule_based', 'ml_model', 'manual_override'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_parse_status_valid'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_parse_status_valid
      CHECK (parse_status IN ('auto', 'needs_review', 'rejected_multi_item'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_confidence_range'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_confidence_range
      CHECK (category_confidence IS NULL OR (category_confidence >= 0 AND category_confidence <= 1));
  END IF;

  -- A row is only "auto" when the parser was sure: it must carry both a
  -- category and an amount. Everything uncertain lives in the review queue.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_auto_requires_category'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_auto_requires_category
      CHECK (parse_status <> 'auto' OR nlp_category IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_auto_requires_amount'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_auto_requires_amount
      CHECK (parse_status <> 'auto' OR amount IS NOT NULL);
  END IF;

  -- The multi-item gate must never leave a half-parsed row behind (§4.2).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_rejected_is_empty'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_rejected_is_empty
      CHECK (parse_status <> 'rejected_multi_item' OR (title IS NULL AND amount IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_review_queue
  ON public.transactions (user_id, created_at DESC)
  WHERE parse_status = 'needs_review';
CREATE INDEX IF NOT EXISTS idx_transactions_nlp_category
  ON public.transactions (nlp_category);

DROP TRIGGER IF EXISTS set_transactions_updated_at ON public.transactions;
CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────
-- 2. slang_dictionary — normalisation vocabulary (§4.1)
--    The TS seed in src/modules/nlp/data/slang.dictionary.ts is the
--    baseline; rows here override or extend it at runtime.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slang_dictionary (
  slang_word TEXT PRIMARY KEY,
  normalized_word TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Single-word values only: the normaliser preserves token positions.
  CONSTRAINT slang_single_word CHECK (normalized_word !~ '\s')
);

-- ──────────────────────────────────────────────────────────
-- 3. category_keywords — weighted classifier lexicon (§4.5.A)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.category_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  -- Context-dependent keyword ("obat"): can never auto-approve on its own.
  ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT category_keywords_category_valid
    CHECK (category IN ('kebutuhan', 'keinginan', 'darurat')),
  CONSTRAINT category_keywords_weight_range CHECK (weight BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_category_keywords_category
  ON public.category_keywords (category);

-- ──────────────────────────────────────────────────────────
-- 4. product_dictionary — brand canonicalisation (§4.4 option 2)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  category_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_dictionary_category_hint_valid
    CHECK (category_hint IS NULL OR category_hint IN ('kebutuhan', 'keinginan', 'darurat'))
);

-- ──────────────────────────────────────────────────────────
-- 5. training_feedback — the Fase 2 dataset (§8)
--    Corrections from the NLP flow only (§12.5). Both the prediction and
--    the fix are stored: Fase 3 needs the disagreement, not just the label.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.training_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  raw_text TEXT NOT NULL,
  normalized_text TEXT,
  predicted_category TEXT,
  corrected_category TEXT NOT NULL,
  predicted_item TEXT,
  corrected_item TEXT,
  predicted_amount BIGINT,
  corrected_amount BIGINT,
  source TEXT NOT NULL DEFAULT 'nlp_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT training_feedback_source_valid CHECK (source IN ('nlp_review', 'nlp_edit')),
  CONSTRAINT training_feedback_corrected_category_valid
    CHECK (corrected_category IN ('kebutuhan', 'keinginan', 'darurat')),
  CONSTRAINT training_feedback_predicted_category_valid
    CHECK (predicted_category IS NULL OR predicted_category IN ('kebutuhan', 'keinginan', 'darurat'))
);

CREATE INDEX IF NOT EXISTS idx_training_feedback_user
  ON public.training_feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_feedback_retrain
  ON public.training_feedback (corrected_category, created_at DESC);

-- ──────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slang_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_dictionary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_feedback ENABLE ROW LEVEL SECURITY;

-- transactions: owner-only access. The backend uses the service role and
-- bypasses these, but the frontend talks to Supabase directly.
DROP POLICY IF EXISTS "Users manage own transactions" ON public.transactions;
CREATE POLICY "Users manage own transactions"
  ON public.transactions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- dictionaries: world-readable config, writable only by the service role
-- (no INSERT/UPDATE policy = denied for anon/authenticated).
DROP POLICY IF EXISTS "Authenticated can read slang dictionary" ON public.slang_dictionary;
CREATE POLICY "Authenticated can read slang dictionary"
  ON public.slang_dictionary FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated can read category keywords" ON public.category_keywords;
CREATE POLICY "Authenticated can read category keywords"
  ON public.category_keywords FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated can read product dictionary" ON public.product_dictionary;
CREATE POLICY "Authenticated can read product dictionary"
  ON public.product_dictionary FOR SELECT TO authenticated USING (TRUE);

-- training_feedback: a user may append and read their own corrections.
DROP POLICY IF EXISTS "Users manage own training feedback" ON public.training_feedback;
CREATE POLICY "Users manage own training feedback"
  ON public.training_feedback
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────
-- 7. Optional seed overrides
--
-- The TS seeds ship with the code and are the baseline. Insert here only
-- what you want to add or override without a redeploy — e.g. a new slang
-- word spotted in production, or a weight you want to retune.
-- ──────────────────────────────────────────────────────────
INSERT INTO public.slang_dictionary (slang_word, normalized_word) VALUES
  ('bsk', 'besok'),
  ('gajian', 'gaji')
ON CONFLICT (slang_word) DO NOTHING;

INSERT INTO public.category_keywords (keyword, category, weight, ambiguous) VALUES
  ('mie instan', 'kebutuhan', 3, FALSE),
  ('top up dana', 'keinginan', 4, FALSE)
ON CONFLICT (keyword) DO NOTHING;

INSERT INTO public.product_dictionary (canonical_name, aliases, category_hint) VALUES
  ('Kopi Kenangan', ARRAY['kopi kenangan', 'kenangan', 'kopken'], 'keinginan')
ON CONFLICT (canonical_name) DO NOTHING;
