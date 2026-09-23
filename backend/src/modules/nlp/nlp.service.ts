/**
 * NLP service — the seam a route (or a job) talks to.
 *
 * Wraps the pure parser with the two things it deliberately does not do
 * itself: dictionary bootstrap (load once, cache) and persistence.
 *
 * `parseTransaction()` in `transaction.parser.ts` stays pure and synchronous
 * on purpose — it is the part that must be portable (offline / on-device,
 * §5) and trivially testable. Everything with I/O lives here.
 */

import { supabaseAdmin, hasServiceRoleKey } from '../../lib/supabase.js';
import { ExtractionMethod, ParseReason, ParseStatus, REVIEW_FORCING_REASONS } from './nlp.constants.js';
import type { ParseReasonType, TransactionCategoryType } from './nlp.constants.js';
import { nlpConfig, nlpRuntimeInfo } from './nlp.config.js';
import { CATEGORY_KEYWORDS } from './data/category-keywords.js';
import { PRODUCT_DICTIONARY } from './data/product.dictionary.js';
import { buildNormalizerDictionary } from './text-normalizer.js';
import {
  createSupabaseNlpDictionarySource,
  loadNlpDictionaries,
  nlpRepository,
  seedDictionaryBundle,
} from './nlp.repository.js';
import type {
  CorrectionSource,
  NlpDictionaryBundle,
  NlpDictionarySource,
  NlpRepository,
} from './nlp.repository.js';
import {
  parseTransaction,
  toParsedTransactionResponse,
  toTransactionRow,
} from './transaction.parser.js';
import type { ParsedTransactionResponse } from './transaction.parser.js';
import type { NormalizerDictionary, ParsedTransaction, TransactionRow } from './nlp.types.js';
import {
  predictCategoryWithML,
  getMlServiceUrl,
  isMlClassifierEnabled,
} from './ml.client.js';

/* ────────────────────────── dictionary bootstrap ────────────────────────── */

let bundle: NlpDictionaryBundle = seedDictionaryBundle();
let dictionary: NormalizerDictionary = buildNormalizerDictionary({
  slang: bundle.slang,
  keywords: bundle.keywords,
  products: bundle.products,
});
let initialized = false;

export interface InitializeOptions {
  /** Reload even if the dictionaries were already loaded. */
  force?: boolean;
  /**
   * Override the dictionary source. Defaults to Supabase when a service-role
   * key is available, otherwise null (seed only). Passing `null` explicitly
   * pins the seed lexicons — used by tests.
   */
  source?: NlpDictionarySource | null;
}

/**
 * Load the dictionaries once at boot.
 *
 * Safe to call repeatedly and safe to never call at all — until it runs, the
 * parser works off the seed lexicons, which is exactly Fase 1's "tanpa
 * training data" starting point.
 */
export async function initializeNlpParser(
  options: InitializeOptions = {}
): Promise<NlpDictionaryBundle> {
  if (initialized && !options.force) return bundle;

  const source =
    options.source !== undefined
      ? options.source
      : supabaseAdmin && hasServiceRoleKey
        ? createSupabaseNlpDictionarySource(supabaseAdmin)
        : null;

  bundle = await loadNlpDictionaries(source);
  dictionary = buildNormalizerDictionary({
    slang: bundle.slang,
    keywords: bundle.keywords,
    products: bundle.products,
  });
  initialized = true;
  return bundle;
}

export function getNlpDictionary(): NlpDictionaryBundle {
  return bundle;
}

/** Parse using the cached dictionary — the hot path. */
export function parseTransactionWithDictionary(rawText: string): ParsedTransaction {
  return parseTransaction(rawText, {
    dictionary,
    keywords: bundle.keywords,
    products: bundle.products,
  });
}

export interface ParseAsyncOptions {
  /** Explicitly enable/disable ML classification. Defaults to process.env.ENABLE_ML_CLASSIFIER !== 'false'. */
  useMl?: boolean;
  confidenceThreshold?: number;
  timeoutMs?: number;
}

/**
 * Hybrid parse — first runs full syntactic extraction (normalization, amount, item, multi-item gate),
 * then queries the Flask ML microservice for classical ML category prediction.
 * If ML is unavailable or encounters an error, it seamlessly falls back to the deterministic rule-based
 * category classifier.
 */
export async function parseTransactionAsync(
  rawText: string,
  options: ParseAsyncOptions = {}
): Promise<ParsedTransaction> {
  const threshold = options.confidenceThreshold ?? nlpConfig.confidenceThreshold;
  const base = parseTransaction(rawText, {
    dictionary,
    keywords: bundle.keywords,
    products: bundle.products,
    confidenceThreshold: threshold,
  });

  // Never query ML for empty inputs, multi-item alerts, or sentences with zero transaction signals
  if (
    base.parseStatus === ParseStatus.REJECTED_MULTI_ITEM ||
    !base.normalizedText ||
    base.reasons.includes(ParseReason.NO_TRANSACTION_SIGNAL)
  ) {
    return base;
  }

  const useMl = options.useMl ?? isMlClassifierEnabled();
  if (!useMl) {
    return base;
  }

  const mlResult = await predictCategoryWithML(base.normalizedText, {
    timeoutMs: options.timeoutMs,
  });

  if (!mlResult) {
    // Graceful fallback to rule-based classification
    return base;
  }

  // ML model prediction successful:
  const category = mlResult.category;
  const confidence = mlResult.confidence;

  // Filter out rule-based ambiguity/unknown reasons since ML model made an informed prediction
  const reasons: ParseReasonType[] = base.reasons.filter(
    (reason) =>
      reason !== ParseReason.AMBIGUOUS_KEYWORD &&
      reason !== ParseReason.UNKNOWN_ITEM &&
      reason !== ParseReason.LOW_CONFIDENCE
  );

  if (confidence < threshold) {
    reasons.push(ParseReason.LOW_CONFIDENCE);
  }

  const forcedReview = reasons.some((reason) => REVIEW_FORCING_REASONS.includes(reason));
  const parseStatus =
    forcedReview || confidence < threshold ? ParseStatus.NEEDS_REVIEW : ParseStatus.AUTO;

  return {
    ...base,
    category,
    categoryConfidence: confidence,
    extractionMethod: ExtractionMethod.ML_MODEL,
    parseStatus,
    reasons,
  };
}

/* ────────────────────────── parse + persist ────────────────────────── */

export interface ParseAndPersistResult {
  parsed: ParsedTransaction;
  transactionId: string;
  response: ParsedTransactionResponse;
}

/**
 * Parse one note and store it.
 *
 * Uses hybrid async parsing (ML model with rule-based fallback).
 * A `rejected_multi_item` row is still written — with null item/amount and
 * the raw text intact (§6) — because the alert the user saw needs to be
 * explainable afterwards.
 */
export async function parseAndPersist(
  userId: string,
  rawText: string,
  repository: NlpRepository = nlpRepository,
  options: ParseAsyncOptions = {}
): Promise<ParseAndPersistResult> {
  const parsed = await parseTransactionAsync(rawText, options);
  const { id } = await repository.saveTransaction(toTransactionRow(parsed, userId));
  return { parsed, transactionId: id, response: toParsedTransactionResponse(parsed) };
}

/* ────────────────────────── manual correction (§4.5 / §12.5) ────────────────────────── */

export interface CorrectionRequest {
  userId: string;
  transactionId: string;
  parsed: ParsedTransaction;
  correctedCategory: TransactionCategoryType;
  /** Omit to keep whatever the parser produced. */
  correctedItem?: string | null;
  correctedAmount?: number | null;
  source?: CorrectionSource;
}

export interface CorrectionResult {
  feedbackId: string;
  row: Partial<TransactionRow>;
}

/**
 * Apply a user correction and log it as training data.
 *
 * Only reachable through the NLP flow (§12.5) — this is not a general
 * transaction editor. Every correction is a labelled example, which is why
 * the predicted *and* corrected values are both recorded: Fase 3 needs the
 * disagreement, not just the answer.
 */
export async function submitCorrection(
  request: CorrectionRequest,
  repository: NlpRepository = nlpRepository
): Promise<CorrectionResult> {
  const correctedItem =
    request.correctedItem !== undefined ? request.correctedItem : request.parsed.itemName;
  const correctedAmount =
    request.correctedAmount !== undefined ? request.correctedAmount : request.parsed.amount;

  // `auto` demands a category *and* an amount (see the schema CHECKs), so a
  // correction that leaves the amount empty stays in the review queue.
  const row: Partial<TransactionRow> = {
    nlp_category: request.correctedCategory,
    title: correctedItem,
    amount: correctedAmount,
    category_confidence: 1,
    extraction_method: ExtractionMethod.MANUAL_OVERRIDE,
    parse_status: correctedAmount === null ? ParseStatus.NEEDS_REVIEW : ParseStatus.AUTO,
    parse_reasons: [],
  };

  await repository.updateTransaction(request.transactionId, row);

  const { id } = await repository.recordCorrection({
    userId: request.userId,
    transactionId: request.transactionId,
    rawText: request.parsed.rawText,
    normalizedText: request.parsed.normalizedText,
    predictedCategory: request.parsed.category,
    correctedCategory: request.correctedCategory,
    predictedItem: request.parsed.itemName,
    correctedItem,
    predictedAmount: request.parsed.amount,
    correctedAmount,
    source: request.source ?? 'nlp_review',
  });

  return { feedbackId: id, row };
}

/* ────────────────────────── diagnostics ────────────────────────── */

/** Payload for `/api/health` — mirrors `otpRuntimeInfo()`. */
export function nlpModuleInfo() {
  return {
    ...nlpRuntimeInfo(),
    defaultCategory: nlpConfig.defaultCategory,
    mlService: {
      enabled: isMlClassifierEnabled(),
      url: getMlServiceUrl(),
    },
    dictionary: {
      initialized,
      slang: Object.keys(bundle.slang).length,
      keywords: bundle.keywords.length,
      products: bundle.products.length,
      seed: {
        slang: Object.keys(seedDictionaryBundle().slang).length,
        keywords: CATEGORY_KEYWORDS.length,
        products: PRODUCT_DICTIONARY.length,
      },
      loadedFrom: bundle.loadedFrom,
    },
    storage: nlpRepository.backend,
  };
}
