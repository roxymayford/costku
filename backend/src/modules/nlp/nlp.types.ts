/**
 * NLP transaction parser — shared types.
 * Shapes follow planning-nlp-transaction-parser.md §1 (expected output) and
 * §6 (database columns). Internal fields are camelCase; the snake_case row
 * mapping lives in `toTransactionRow()`.
 */

import type {
  ExtractionMethodType,
  ParseReasonType,
  ParseStatusType,
  TransactionCategoryType,
} from './nlp.constants.js';

/* ────────────────────────── Preprocessing ────────────────────────── */

export type CorrectionMethod = 'slang' | 'fuzzy';

export interface NormalizerCorrection {
  /** Token as the user typed it. */
  from: string;
  /** Token after correction. */
  to: string;
  method: CorrectionMethod;
}

/**
 * A token plus the character range it occupies in the *normalised* string.
 * Spans are kept so a client can highlight the original input later without
 * re-running the pipeline.
 */
export interface NormalizedToken {
  text: string;
  start: number;
  end: number;
}

export interface NormalizedText {
  /** Normalised sentence the rest of the pipeline reads. */
  text: string;
  tokens: NormalizedToken[];
  corrections: NormalizerCorrection[];
}

export interface NormalizerDictionary {
  /** Slang/typo alias → canonical word. Values must be single words. */
  slang: Record<string, string>;
  /**
   * Every word the pipeline already understands. Used as a "do not touch"
   * list — a token found here is never a typo candidate.
   */
  vocabulary: string[];
  /**
   * The *only* words fuzzy correction may snap a token to.
   *
   * Deliberately much smaller than `vocabulary`. Category keywords are
   * ordinary Indonesian words, so allowing them as targets made the
   * corrector rewrite real words into shopping words — `juta` → `juga`,
   * `seratus` → `sepatu`. Typo tolerance is only worth having for slang
   * canonicals and brand names, which is exactly what this holds.
   */
  correctionTargets: string[];
}

/* ────────────────────────── Amount extraction (§4.3) ────────────────────────── */

export interface AmountMatch {
  /** Exact source text of the match, e.g. `20rb` or `dua puluh ribu`. */
  raw: string;
  /** Value in Rupiah. */
  value: number;
  /** Index of the token the match starts at. */
  tokenIndex: number;
  /** Index of the token the match ends at (inclusive). */
  endTokenIndex: number;
  /**
   * Whether the match carries enough evidence to be a price rather than a
   * quantity ("beli 2 kopi 20rb" — `2` is weak, `20rb` is strong).
   */
  strong: boolean;
  source: 'numeric' | 'word';
}

/* ────────────────────────── Multi-item gate (§4.2) ────────────────────────── */

export type MultiItemSignal =
  | 'multiple_amounts'
  | 'multiple_purchase_verbs'
  | 'connector_splitting_items'
  | 'connector_between_amounts';

export interface MultiItemVerdict {
  detected: boolean;
  signals: MultiItemSignal[];
}

/* ────────────────────────── Item extraction (§4.4) ────────────────────────── */

export interface ProductEntry {
  /** Display name, e.g. `Kopi Kenangan`. */
  name: string;
  /** Lowercase aliases matched against the item phrase, e.g. `kenangan`. */
  aliases: string[];
  /** Optional category hint used when no keyword matches (Fase 3 fuel). */
  categoryHint?: TransactionCategoryType;
}

export interface ItemExtraction {
  /** Title-cased / brand-canonical item name, or null when nothing usable. */
  itemName: string | null;
  /** Canonical brand when a dictionary entry matched, else null. */
  brand: string | null;
  /** Purchase verb the phrase was anchored on, else null. */
  anchor: string | null;
  anchorIndex: number | null;
  /** Tokens that formed the item phrase, before title-casing. */
  phraseTokens: string[];
}

/* ────────────────────────── Classification (§4.5) ────────────────────────── */

export interface CategoryKeyword {
  keyword: string;
  category: TransactionCategoryType;
  weight: number;
  /**
   * Context-dependent keyword: "obat" is `kebutuhan` at a pharmacy and
   * `darurat` after an accident. Ambiguous keywords can never produce a
   * high-confidence verdict on their own.
   */
  ambiguous?: boolean;
}

export interface CategoryPrediction {
  category: TransactionCategoryType;
  /** 0–1, rounded to two decimals. */
  confidence: number;
  scores: Record<TransactionCategoryType, number>;
  matchedKeywords: string[];
  /** Evidence is inconclusive (tie between classes, or ambiguous-only). */
  ambiguous: boolean;
  /** No keyword matched at all — the item is outside the dictionary. */
  noKeywordMatch: boolean;
}

/* ────────────────────────── Parser output ────────────────────────── */

export interface ParsedTransaction {
  rawText: string;
  normalizedText: string;
  itemName: string | null;
  amount: number | null;
  /**
   * Null only when no category could honestly be claimed
   * (`rejected_multi_item`, or a sentence with no transaction signal).
   */
  category: TransactionCategoryType | null;
  categoryConfidence: number;
  extractionMethod: ExtractionMethodType;
  parseStatus: ParseStatusType;
  reasons: ParseReasonType[];
  /** Diagnostics — never persisted, useful in logs and tests. */
  corrections: NormalizerCorrection[];
  matchedKeywords: string[];
  brand: string | null;
  anchor: string | null;
  multiItemSignals: MultiItemSignal[];
  /** Present only when the gate fired, ready to hand straight to the UI. */
  alert?: { code: string; title: string; message: string; cta: string };
}

/**
 * Row shape for `public.transactions`.
 *
 * Note on naming — the plan document calls these columns `item_name` and
 * `category`, but the table already exists in this app (see
 * `frontend/src/lib/storage.ts`) with `title` / `category` / `transaction_date`
 * serving the 50/30/20 ledger. This migration is **additive**, so:
 *
 *   doc `item_name`  → column `title`        (reused, shows up in the existing list UI)
 *   doc `category`   → column `nlp_category` (3-class NLP taxonomy, kept apart
 *                                            from the app's Needs/Wants/Savings)
 *
 * `category` and `transaction_date` are deliberately left to the caller:
 * mapping a 3-class NLP verdict onto the 50/30/20 split is a product
 * decision, not the parser's.
 */
export interface TransactionRow {
  user_id: string;
  /** The doc's `item_name`. */
  title: string | null;
  amount: number | null;
  /** The doc's `category`. */
  nlp_category: TransactionCategoryType | null;
  category_confidence: number;
  extraction_method: ExtractionMethodType;
  parse_status: ParseStatusType;
  parse_reasons: ParseReasonType[];
  raw_text: string;
  normalized_text: string;
}
