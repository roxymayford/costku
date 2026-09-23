/**
 * Category classification (§4.5.A) — dictionary + weighted-keyword scoring.
 *
 * This is the Fase 1 classifier: no training data, fully deterministic, and
 * every verdict can be traced back to the exact keywords that produced it.
 * When Fase 3 trains a Naive Bayes / SVM model, this stays as the fallback
 * for low-confidence predictions (§9 Fase 4) and as the baseline to compare
 * against.
 *
 * Input is the **whole normalised sentence**, not just the item name. The
 * doc allows this ("TF-IDF dari `item_name` (+ konteks kalimat)"), and it is
 * what makes "beli obat" vs "beli obat di ugd" separable: same item, but the
 * context carries the emergency signal.
 *
 * Confidence blends two things:
 *   evidence   = how much signal there is   (1 - 1/(1 + topScore))
 *   separation = how far ahead the winner is ((top - second)/(top + second))
 * so a single weak keyword scores ~0.68 while two strong keywords score
 * ~0.89, and a tie between two classes collapses to ~0.54 → review.
 */

import { TRANSACTION_CATEGORIES, DEFAULT_CATEGORY } from './nlp.constants.js';
import type { TransactionCategoryType } from './nlp.constants.js';
import { nlpConfig } from './nlp.config.js';
import { CATEGORY_KEYWORDS } from './data/category-keywords.js';
import { tokenizeWords } from './text-normalizer.js';
import type { CategoryKeyword, CategoryPrediction } from './nlp.types.js';

export interface ClassifierOptions {
  /** Ceiling for ambiguous-only evidence; must stay below the threshold. */
  ambiguousConfidenceCap: number;
  /** Confidence when nothing matched at all. */
  unknownItemConfidence: number;
  defaultCategory: TransactionCategoryType;
}

export function defaultClassifierOptions(): ClassifierOptions {
  return {
    ambiguousConfidenceCap: nlpConfig.ambiguousConfidenceCap,
    unknownItemConfidence: nlpConfig.unknownItemConfidence,
    defaultCategory: nlpConfig.defaultCategory,
  };
}

interface KeywordHit {
  keyword: string;
  category: TransactionCategoryType;
  weight: number;
  ambiguous: boolean;
  start: number;
  length: number;
}

/**
 * Find every keyword occurrence, then drop the ones overlapped by a longer
 * match. Without this, "grab food" would score both keinginan (4) *and*
 * kebutuhan (3) via the nested `grab`, dragging a confident verdict down to
 * a tie.
 */
function findKeywordHits(tokens: string[], keywords: CategoryKeyword[]): KeywordHit[] {
  const hits: KeywordHit[] = [];

  for (const entry of keywords) {
    const needle = tokenizeWords(entry.keyword);
    if (needle.length === 0) continue;

    for (let i = 0; i + needle.length <= tokens.length; i += 1) {
      let matched = true;
      for (let j = 0; j < needle.length; j += 1) {
        if (tokens[i + j] !== needle[j]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      hits.push({
        keyword: entry.keyword,
        category: entry.category,
        weight: entry.weight,
        ambiguous: entry.ambiguous === true,
        start: i,
        length: needle.length,
      });
    }
  }

  hits.sort((a, b) => b.length - a.length || a.start - b.start);

  const claimed = new Array<boolean>(tokens.length).fill(false);
  const accepted: KeywordHit[] = [];
  for (const hit of hits) {
    let free = true;
    for (let i = hit.start; i < hit.start + hit.length; i += 1) {
      if (claimed[i]) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    for (let i = hit.start; i < hit.start + hit.length; i += 1) claimed[i] = true;
    accepted.push(hit);
  }

  return accepted;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function classifyCategory(
  text: string,
  keywords: CategoryKeyword[] = CATEGORY_KEYWORDS,
  options: ClassifierOptions = defaultClassifierOptions()
): CategoryPrediction {
  const tokens = tokenizeWords(text);

  const scores = {} as Record<TransactionCategoryType, number>;
  for (const category of TRANSACTION_CATEGORIES) scores[category] = 0;

  const hits = findKeywordHits(tokens, keywords);
  let strongScore = 0;

  for (const hit of hits) {
    scores[hit.category] += hit.weight;
    if (!hit.ambiguous) strongScore += hit.weight;
  }

  const matchedKeywords = [...new Set(hits.map((hit) => hit.keyword))];

  /* ── winner & runner-up ── */
  let top: TransactionCategoryType | null = null;
  let topScore = 0;
  let secondScore = 0;

  for (const category of TRANSACTION_CATEGORIES) {
    const score = scores[category];
    if (score > topScore) {
      secondScore = topScore;
      topScore = score;
      top = category;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (top === null || topScore <= 0) {
    return {
      category: options.defaultCategory,
      confidence: round2(options.unknownItemConfidence),
      scores,
      matchedKeywords: [],
      ambiguous: false,
      noKeywordMatch: true,
    };
  }

  const evidence = 1 - 1 / (1 + topScore);
  const separation = (topScore - secondScore) / (topScore + secondScore);
  let confidence = 0.65 * evidence + 0.35 * separation;

  const tied = secondScore === topScore;
  const ambiguousOnly = strongScore === 0;
  if (ambiguousOnly) confidence = Math.min(confidence, options.ambiguousConfidenceCap);

  return {
    category: top,
    confidence: round2(confidence),
    scores,
    matchedKeywords,
    ambiguous: tied || ambiguousOnly,
    noKeywordMatch: false,
  };
}
