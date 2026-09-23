/**
 * Parser orchestrator — the single entry point of the NLP module.
 *
 *   raw text → normalise → multi-item gate → amount → item → category → status
 *
 * Design notes:
 *  - The gate short-circuits. Nothing downstream runs for a multi-item
 *    sentence, and the result carries no item/amount/category at all
 *    (`null`), so a caller can never accidentally persist a partial parse.
 *  - Every non-`auto` outcome carries at least one machine-readable reason,
 *    which is what makes the review queue (Fase 4) and the Fase 3 model
 *    comparison possible.
 *  - Fase 1 is rule-based end to end; `extractionMethod` exists so the same
 *    row shape keeps working once the ML model lands.
 */

import {
  CANCELLATION_PATTERNS,
  ExtractionMethod,
  MULTI_ITEM_ALERT,
  ParseReason,
  ParseStatus,
  REVIEW_FORCING_REASONS,
  TransactionCategory,
} from './nlp.constants.js';
import type { ExtractionMethodType, ParseReasonType, ParseStatusType, TransactionCategoryType } from './nlp.constants.js';
import { nlpConfig } from './nlp.config.js';
import { CATEGORY_KEYWORDS } from './data/category-keywords.js';
import { PRODUCT_DICTIONARY } from './data/product.dictionary.js';
import { buildNormalizerDictionary, normalizeText } from './text-normalizer.js';
import { extractAmounts, pickAmount } from './amount.extractor.js';
import { detectMultiItem } from './multi-item.guard.js';
import { extractItemName } from './item.extractor.js';
import { classifyCategory } from './category.classifier.js';
import type {
  CategoryKeyword,
  NormalizerDictionary,
  ParsedTransaction,
  ProductEntry,
  TransactionRow,
} from './nlp.types.js';

export interface ParseOptions {
  /** Prebuilt dictionary (e.g. loaded from Supabase once at boot). */
  dictionary?: NormalizerDictionary;
  keywords?: CategoryKeyword[];
  products?: ProductEntry[];
  confidenceThreshold?: number;
}

/** Empty-result helper — keeps the early returns honest and consistent. */
function emptyResult(
  rawText: string,
  normalizedText: string,
  parseStatus: ParseStatusType,
  reasons: ParseReasonType[],
  category: TransactionCategoryType | null,
  confidence: number
): ParsedTransaction {
  return {
    rawText,
    normalizedText,
    itemName: null,
    amount: null,
    category,
    categoryConfidence: confidence,
    extractionMethod: ExtractionMethod.RULE_BASED,
    parseStatus,
    reasons,
    corrections: [],
    matchedKeywords: [],
    brand: null,
    anchor: null,
    multiItemSignals: [],
  };
}

/**
 * Parse one free-text transaction note.
 *
 * Never throws on bad input — a sentence the parser cannot make sense of
 * comes back as `needs_review` with a reason, because "we don't know" is a
 * valid answer and the user can fix it in the review step.
 */
export function parseTransaction(
  rawText: string,
  options: ParseOptions = {}
): ParsedTransaction {
  const keywords = options.keywords ?? CATEGORY_KEYWORDS;
  const products = options.products ?? PRODUCT_DICTIONARY;
  const threshold = options.confidenceThreshold ?? nlpConfig.confidenceThreshold;

  const dictionary =
    options.dictionary ??
    buildNormalizerDictionary({ keywords, products });

  const source = typeof rawText === 'string' ? rawText : '';
  const normalized = normalizeText(source, dictionary);

  /* ── nothing left after normalisation ── */
  if (!normalized.text) {
    return emptyResult(source, '', ParseStatus.NEEDS_REVIEW, [ParseReason.NO_TRANSACTION_SIGNAL], null, 0);
  }

  /* ── gate: more than one item → stop, ask the user to split it ── */
  const amounts = extractAmounts(normalized.tokens);
  const verdict = detectMultiItem(normalized.tokens, amounts);
  if (verdict.detected) {
    const rejected = emptyResult(
      source,
      normalized.text,
      ParseStatus.REJECTED_MULTI_ITEM,
      [ParseReason.MULTI_ITEM_DETECTED],
      null,
      0
    );
    rejected.corrections = normalized.corrections;
    rejected.multiItemSignals = verdict.signals;
    rejected.alert = { ...MULTI_ITEM_ALERT };
    return rejected;
  }

  /* ── entity extraction ── */
  const amount = pickAmount(amounts, normalized.tokens);
  const item = extractItemName(normalized.tokens, amount, products);

  /* ── classification (whole sentence, context included) ── */
  const prediction = classifyCategory(normalized.text, keywords, {
    ambiguousConfidenceCap: nlpConfig.ambiguousConfidenceCap,
    unknownItemConfidence: nlpConfig.unknownItemConfidence,
    defaultCategory: nlpConfig.defaultCategory,
  });

  /* ── not a transaction at all ── */
  if (!amount && !item.itemName && prediction.noKeywordMatch) {
    const nothing = emptyResult(
      source,
      normalized.text,
      ParseStatus.NEEDS_REVIEW,
      [ParseReason.NO_TRANSACTION_SIGNAL],
      null,
      prediction.confidence
    );
    nothing.corrections = normalized.corrections;
    return nothing;
  }

  /* ── reasons ── */
  const reasons: ParseReasonType[] = [];
  if (CANCELLATION_PATTERNS.some((pattern) => pattern.test(normalized.text))) {
    reasons.push(ParseReason.POSSIBLE_CANCELLATION);
  }
  if (!amount) reasons.push(ParseReason.MISSING_AMOUNT);
  else if (!amount.strong) reasons.push(ParseReason.AMOUNT_UNCERTAIN);
  if (!item.itemName) reasons.push(ParseReason.MISSING_ITEM);
  if (prediction.noKeywordMatch) reasons.push(ParseReason.UNKNOWN_ITEM);
  if (prediction.ambiguous) reasons.push(ParseReason.AMBIGUOUS_KEYWORD);
  if (prediction.confidence < threshold) reasons.push(ParseReason.LOW_CONFIDENCE);

  const forcedReview = reasons.some((reason) => REVIEW_FORCING_REASONS.includes(reason));
  const parseStatus =
    forcedReview || prediction.confidence < threshold
      ? ParseStatus.NEEDS_REVIEW
      : ParseStatus.AUTO;

  return {
    rawText: source,
    normalizedText: normalized.text,
    itemName: item.itemName,
    amount: amount ? amount.value : null,
    category: prediction.category,
    categoryConfidence: prediction.confidence,
    extractionMethod: ExtractionMethod.RULE_BASED,
    parseStatus,
    reasons,
    corrections: normalized.corrections,
    matchedKeywords: prediction.matchedKeywords,
    brand: item.brand,
    anchor: item.anchor,
    multiItemSignals: verdict.signals,
  };
}

/**
 * Row shape for `public.transactions` — see the naming note on
 * `TransactionRow` in `nlp.types.ts` (`item_name` → `title`,
 * `category` → `nlp_category`).
 */
export function toTransactionRow(parsed: ParsedTransaction, userId: string): TransactionRow {
  return {
    user_id: userId,
    title: parsed.itemName,
    amount: parsed.amount,
    nlp_category: parsed.category,
    category_confidence: parsed.categoryConfidence,
    extraction_method: parsed.extractionMethod,
    parse_status: parsed.parseStatus,
    parse_reasons: parsed.reasons,
    raw_text: parsed.rawText,
    normalized_text: parsed.normalizedText,
  };
}

/**
 * Map the 3-class NLP taxonomy onto the app's existing 50/30/20 ledger
 * categories, so an NLP-parsed row can also land in the normal transaction
 * list.
 *
 * `darurat` → `Needs` because emergency spending *is* essential, it is just
 * unplanned; the distinction is preserved in `nlp_category`. This is a
 * product call, not a parser one — it is exported separately so the caller
 * can override it without touching the parser.
 */
export function toBudgetCategory(
  category: TransactionCategoryType | null
): 'Needs' | 'Wants' | 'Savings' | null {
  switch (category) {
    case TransactionCategory.KEBUTUHAN:
    case TransactionCategory.DARURAT:
      return 'Needs';
    case TransactionCategory.KEINGINAN:
      return 'Wants';
    default:
      return null;
  }
}

/**
 * Wire shape (§1) — the JSON the client expects. `confidence` is the
 * documented name; the database column stays `category_confidence`.
 */
export interface ParsedTransactionResponse {
  raw_text: string;
  normalized_text: string;
  item_name: string | null;
  amount: number | null;
  category: TransactionCategoryType | null;
  confidence: number;
  extraction_method: ExtractionMethodType;
  parse_status: ParseStatusType;
  reasons: ParseReasonType[];
  alert?: { code: string; title: string; message: string; cta: string };
}

export function toParsedTransactionResponse(
  parsed: ParsedTransaction
): ParsedTransactionResponse {
  const response: ParsedTransactionResponse = {
    raw_text: parsed.rawText,
    normalized_text: parsed.normalizedText,
    item_name: parsed.itemName,
    amount: parsed.amount,
    category: parsed.category,
    confidence: parsed.categoryConfidence,
    extraction_method: parsed.extractionMethod,
    parse_status: parsed.parseStatus,
    reasons: parsed.reasons,
  };
  if (parsed.alert) response.alert = parsed.alert;
  return response;
}
