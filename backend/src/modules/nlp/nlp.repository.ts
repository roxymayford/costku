/**
 * NLP repository — dictionary loading and persistence (§6).
 *
 * Two responsibilities, deliberately kept in one place:
 *
 *  1. **Dictionary loading.** The seed lexicons in `./data/*` are the
 *     baseline; `slang_dictionary`, `category_keywords` and
 *     `product_dictionary` override/extend them at runtime so the vocabulary
 *     can grow without a redeploy. Any table that fails to load falls back
 *     to the seed for that table only — a broken dictionary table must never
 *     take the parser down.
 *
 *  2. **Persistence.** `transactions` rows and the `training_feedback` log
 *     that Fase 2 depends on. Writes fall back to an in-memory store when
 *     Supabase is not configured or the service-role key is missing (RLS
 *     would reject the write anyway) — same degradation strategy as
 *     `otp.repository.ts`, so local dev and tests stay runnable.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin, hasServiceRoleKey } from '../../lib/supabase.js';
import { CATEGORY_KEYWORDS } from './data/category-keywords.js';
import { PRODUCT_DICTIONARY } from './data/product.dictionary.js';
import { SLANG_DICTIONARY } from './data/slang.dictionary.js';
import { TRANSACTION_CATEGORIES } from './nlp.constants.js';
import type { TransactionCategoryType } from './nlp.constants.js';
import type { CategoryKeyword, ProductEntry, TransactionRow } from './nlp.types.js';

/* ────────────────────────── dictionary ────────────────────────── */

export interface SlangRow {
  slang_word: string;
  normalized_word: string;
}

export interface NlpDictionaryBundle {
  slang: Record<string, string>;
  keywords: CategoryKeyword[];
  products: ProductEntry[];
  /** Which tables actually answered — surfaced in diagnostics. */
  loadedFrom: {
    slang: 'supabase' | 'seed';
    keywords: 'supabase' | 'seed';
    products: 'supabase' | 'seed';
  };
}

export interface NlpDictionarySource {
  loadSlang(): Promise<SlangRow[]>;
  loadKeywords(): Promise<CategoryKeyword[]>;
  loadProducts(): Promise<ProductEntry[]>;
}

function isCategory(value: unknown): value is TransactionCategoryType {
  return typeof value === 'string' && (TRANSACTION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Merge database rows over a seed. Rows whose key already exists in the seed
 * replace it (so a weight can be tuned from SQL), new keys are appended.
 */
export function mergeSlangRows(seed: Record<string, string>, rows: SlangRow[]): Record<string, string> {
  const merged: Record<string, string> = { ...seed };
  for (const row of rows) {
    const alias = String(row.slang_word ?? '').trim().toLowerCase();
    const canonical = String(row.normalized_word ?? '').trim().toLowerCase();
    // Single-word values only — see the note in slang.dictionary.ts.
    if (!alias || !canonical || /\s/u.test(canonical)) continue;
    merged[alias] = canonical;
  }
  return merged;
}

export function mergeKeywordRows(seed: CategoryKeyword[], rows: CategoryKeyword[]): CategoryKeyword[] {
  const byKeyword = new Map<string, CategoryKeyword>();
  for (const entry of seed) byKeyword.set(entry.keyword.toLowerCase(), entry);

  for (const row of rows) {
    const keyword = String(row.keyword ?? '').trim().toLowerCase();
    if (!keyword || !isCategory(row.category)) continue;
    const weight = Number(row.weight);
    byKeyword.set(keyword, {
      keyword,
      category: row.category,
      weight: Number.isFinite(weight) ? weight : 1,
      ambiguous: row.ambiguous === true,
    });
  }

  return [...byKeyword.values()];
}

export function mergeProductRows(seed: ProductEntry[], rows: ProductEntry[]): ProductEntry[] {
  const byName = new Map<string, ProductEntry>();
  for (const entry of seed) byName.set(entry.name.toLowerCase(), entry);

  for (const row of rows) {
    const name = String(row.name ?? '').trim();
    const aliases = (row.aliases ?? []).map((alias) => String(alias).trim().toLowerCase()).filter(Boolean);
    if (!name || aliases.length === 0) continue;
    byName.set(name.toLowerCase(), {
      name,
      aliases,
      categoryHint: isCategory(row.categoryHint) ? row.categoryHint : undefined,
    });
  }

  return [...byName.values()];
}

/** Seed-only bundle — what Fase 1 ships with, and the fallback target. */
export function seedDictionaryBundle(): NlpDictionaryBundle {
  return {
    slang: { ...SLANG_DICTIONARY },
    keywords: [...CATEGORY_KEYWORDS],
    products: [...PRODUCT_DICTIONARY],
    loadedFrom: { slang: 'seed', keywords: 'seed', products: 'seed' },
  };
}

/** Load every dictionary, degrading per-table on failure. */
export async function loadNlpDictionaries(
  source: NlpDictionarySource | null
): Promise<NlpDictionaryBundle> {
  const bundle = seedDictionaryBundle();
  if (!source) return bundle;

  try {
    bundle.slang = mergeSlangRows(bundle.slang, await source.loadSlang());
    bundle.loadedFrom.slang = 'supabase';
  } catch (error) {
    console.warn('[NLP] slang_dictionary unavailable, using seed:', (error as Error).message);
  }

  try {
    bundle.keywords = mergeKeywordRows(bundle.keywords, await source.loadKeywords());
    bundle.loadedFrom.keywords = 'supabase';
  } catch (error) {
    console.warn('[NLP] category_keywords unavailable, using seed:', (error as Error).message);
  }

  try {
    bundle.products = mergeProductRows(bundle.products, await source.loadProducts());
    bundle.loadedFrom.products = 'supabase';
  } catch (error) {
    console.warn('[NLP] product_dictionary unavailable, using seed:', (error as Error).message);
  }

  return bundle;
}

/** Supabase-backed dictionary source. */
export function createSupabaseNlpDictionarySource(client: SupabaseClient): NlpDictionarySource {
  return {
    async loadSlang(): Promise<SlangRow[]> {
      const { data, error } = await client.from('slang_dictionary').select('slang_word, normalized_word');
      if (error) throw new Error(error.message);
      return (data ?? []) as SlangRow[];
    },
    async loadKeywords(): Promise<CategoryKeyword[]> {
      const { data, error } = await client
        .from('category_keywords')
        .select('keyword, category, weight, ambiguous');
      if (error) throw new Error(error.message);
      return (data ?? []) as CategoryKeyword[];
    },
    async loadProducts(): Promise<ProductEntry[]> {
      const { data, error } = await client
        .from('product_dictionary')
        .select('name:canonical_name, aliases, category_hint');
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => {
        const record = row as unknown as { name: string; aliases: string[] | null; category_hint: string | null };
        return {
          name: record.name,
          aliases: record.aliases ?? [],
          categoryHint: isCategory(record.category_hint) ? record.category_hint : undefined,
        };
      });
    },
  };
}

/* ────────────────────────── persistence ────────────────────────── */

export type CorrectionSource = 'nlp_review' | 'nlp_edit';

export interface CorrectionInput {
  userId: string;
  transactionId: string | null;
  rawText: string;
  normalizedText: string;
  predictedCategory: TransactionCategoryType | null;
  correctedCategory: TransactionCategoryType;
  predictedItem: string | null;
  correctedItem: string | null;
  predictedAmount: number | null;
  correctedAmount: number | null;
  source: CorrectionSource;
}

export interface StoredTransaction extends TransactionRow {
  id: string;
  created_at: string;
}

export interface NlpRepository {
  readonly backend: 'supabase' | 'memory';
  saveTransaction(row: TransactionRow): Promise<{ id: string }>;
  updateTransaction(id: string, patch: Partial<TransactionRow>): Promise<void>;
  listReviewQueue(userId: string, limit?: number): Promise<StoredTransaction[]>;
  recordCorrection(input: CorrectionInput): Promise<{ id: string }>;
}

function correctionToRow(input: CorrectionInput) {
  return {
    user_id: input.userId,
    transaction_id: input.transactionId,
    raw_text: input.rawText,
    normalized_text: input.normalizedText,
    predicted_category: input.predictedCategory,
    corrected_category: input.correctedCategory,
    predicted_item: input.predictedItem,
    corrected_item: input.correctedItem,
    predicted_amount: input.predictedAmount,
    corrected_amount: input.correctedAmount,
    source: input.source,
  };
}

/**
 * In-memory repository. Used when Supabase is unconfigured, when only an
 * anon key is present (RLS would block every write), and in unit tests.
 */
export function createMemoryNlpRepository(): NlpRepository {
  const transactions: StoredTransaction[] = [];
  const corrections: Array<{ id: string }> = [];

  return {
    backend: 'memory',

    async saveTransaction(row: TransactionRow) {
      const id = randomUUID();
      transactions.push({ ...row, id, created_at: new Date().toISOString() });
      return { id };
    },

    async updateTransaction(id: string, patch: Partial<TransactionRow>) {
      const existing = transactions.find((row) => row.id === id);
      if (existing) Object.assign(existing, patch);
    },

    async listReviewQueue(userId: string, limit = 50) {
      return transactions
        .filter((row) => row.user_id === userId && row.parse_status === 'needs_review')
        .slice(0, limit);
    },

    async recordCorrection(input: CorrectionInput) {
      const id = randomUUID();
      corrections.push({ id });
      return { id };
    },
  };
}

/** Supabase-backed repository (service role — bypasses RLS). */
export function createSupabaseNlpRepository(client: SupabaseClient): NlpRepository {
  return {
    backend: 'supabase',

    async saveTransaction(row: TransactionRow) {
      const { data, error } = await client.from('transactions').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },

    async updateTransaction(id: string, patch: Partial<TransactionRow>) {
      const { error } = await client
        .from('transactions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },

    async listReviewQueue(userId: string, limit = 50) {
      const { data, error } = await client
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('parse_status', 'needs_review')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as StoredTransaction[];
    },

    async recordCorrection(input: CorrectionInput) {
      const { data, error } = await client
        .from('training_feedback')
        .insert(correctionToRow(input))
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },
  };
}

/**
 * Default repository. Falls back to memory whenever a service-role key is
 * absent, because RLS would reject the write and surfacing a database error
 * to the user would be worse than degrading.
 */
export const nlpRepository: NlpRepository =
  supabaseAdmin && hasServiceRoleKey
    ? createSupabaseNlpRepository(supabaseAdmin)
    : createMemoryNlpRepository();
