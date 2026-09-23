/**
 * Preprocessing & normalisation (§4.1).
 *
 * Pipeline:
 *   truncate → lowercase/NFKC → strip noise → join `rp`/unit → tokenise →
 *   slang expansion → fuzzy (Levenshtein) typo correction → rebuild text
 *
 * Two deliberate properties:
 *  1. **Conservative fuzzy matching.** A token is only rewritten when it
 *     snaps to a word that is *already in the vocabulary* and that match is
 *     unambiguous. Unknown words are left alone, so the normaliser can never
 *     invent a word the dictionary has never seen.
 *  2. **No cross-token rewrites.** Every alias expands to a single word, so
 *     token count is preserved and downstream index arithmetic stays valid.
 */

import {
  AMOUNT_CONTEXT_MARKERS,
  ITEM_CONNECTORS,
  ITEM_CONTEXT_ADVERBS,
  ITEM_PARTICLES,
  ITEM_PREPOSITIONS,
  MAX_INPUT_LENGTH,
  NUMBER_WORDS,
  PURCHASE_VERBS,
} from './nlp.constants.js';
import { nlpConfig } from './nlp.config.js';
import { SLANG_DICTIONARY } from './data/slang.dictionary.js';
import { CATEGORY_KEYWORDS } from './data/category-keywords.js';
import { PRODUCT_DICTIONARY } from './data/product.dictionary.js';
import type {
  CategoryKeyword,
  NormalizedText,
  NormalizedToken,
  NormalizerCorrection,
  NormalizerDictionary,
  ProductEntry,
} from './nlp.types.js';

/* ────────────────────────── helpers ────────────────────────── */

/** Split any string into lowercase alphanumeric tokens (`tiba-tiba` → 2). */
export function tokenizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Banded Levenshtein distance (Ukkonen cutoff).
 *
 * Only the diagonal band `|i - j| <= maxDistance` is evaluated, which is
 * exactly the region that can still produce a distance within budget. Cells
 * outside the band are `INF`, and the row-minimum shortcut is only sound
 * *because* of that band — without it the cutoff could discard a path that
 * later comes back down.
 *
 * Returns `maxDistance + 1` to mean "further than the budget", so callers
 * can use a single `<= maxDistance` test.
 */
export function levenshtein(a: string, b: string, maxDistance: number): number {
  const n = a.length;
  const m = b.length;
  const limit = maxDistance + 1;
  if (Math.abs(n - m) > maxDistance) return limit;

  let prev = new Array<number>(m + 1).fill(limit);
  for (let j = 0; j <= Math.min(m, maxDistance); j += 1) prev[j] = j;

  for (let i = 1; i <= n; i += 1) {
    const curr = new Array<number>(m + 1).fill(limit);
    const from = Math.max(1, i - maxDistance);
    const to = Math.min(m, i + maxDistance);
    if (from === 1) curr[0] = i;

    let rowMin = limit;
    for (let j = from; j <= to; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return limit;
    prev = curr;
  }

  return prev[m];
}

function maxDistanceFor(token: string): number {
  if (token.length < nlpConfig.fuzzyMinTokenLength) return 0;
  return token.length <= 5
    ? nlpConfig.fuzzyMaxDistanceShort
    : nlpConfig.fuzzyMaxDistanceLong;
}

/**
 * Snap `token` to the closest vocabulary entry, or return null.
 *
 * Rejects the match when two candidates tie, when the distance budget is
 * exceeded, or when the first letter differs — that last rule removes most
 * of the nonsense a pure edit-distance match would otherwise produce.
 */
function fuzzyCorrect(
  token: string,
  vocabulary: string[],
  maxDistance: number
): string | null {
  if (maxDistance < 1) return null;

  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  let tied = false;

  for (const candidate of vocabulary) {
    if (candidate === token) return null; // already a known word
    if (candidate[0] !== token[0]) continue;
    if (Math.abs(candidate.length - token.length) > maxDistance) continue;

    const distance = levenshtein(token, candidate, bestDistance);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
      tied = false;
    } else if (best !== null && distance === bestDistance && candidate !== best) {
      // Two equally good candidates → ambiguous, refuse to guess.
      tied = true;
    }
  }

  if (tied || best === null || bestDistance > maxDistance) return null;
  return best;
}

/* ────────────────────────── dictionary ────────────────────────── */

export interface NormalizerSources {
  /** Extra/overriding slang aliases, merged over the seed. */
  slang?: Record<string, string>;
  /** Category keywords — their words are protected from fuzzy correction. */
  keywords?: CategoryKeyword[];
  /** Products — brand words are protected *and* become correction targets. */
  products?: ProductEntry[];
}

/**
 * Build the runtime dictionary: the seed plus whatever the database
 * supplied.
 *
 * Two separate sets come out of this:
 *
 *  - `vocabulary` — everything the pipeline understands. Used to *protect*
 *    tokens: a word in here is never considered a typo.
 *  - `correctionTargets` — the much smaller set fuzzy correction may snap
 *    to: slang canonicals and brand/product tokens. Category keywords are
 *    deliberately excluded, because they are ordinary Indonesian words and
 *    made the corrector mangle real words into shopping words
 *    (`juta` → `juga`, `seratus` → `sepatu`).
 */
export function buildNormalizerDictionary(
  sources: NormalizerSources = {}
): NormalizerDictionary {
  const slang: Record<string, string> = { ...SLANG_DICTIONARY, ...(sources.slang ?? {}) };
  const keywords = sources.keywords ?? CATEGORY_KEYWORDS;
  const products = sources.products ?? PRODUCT_DICTIONARY;

  const vocabulary = new Set<string>();
  const correctionTargets = new Set<string>();

  const addVocabulary = (value: string): void => {
    for (const word of tokenizeWords(value)) vocabulary.add(word);
  };
  const addTarget = (value: string): void => {
    for (const word of tokenizeWords(value)) correctionTargets.add(word);
  };

  for (const canonical of Object.values(slang)) {
    addVocabulary(canonical);
    addTarget(canonical);
  }
  for (const entry of keywords) addVocabulary(entry.keyword);
  for (const product of products) {
    addVocabulary(product.name);
    for (const alias of product.aliases) addVocabulary(alias);
    addTarget(product.name);
    for (const alias of product.aliases) addTarget(alias);
  }
  for (const word of PURCHASE_VERBS) addVocabulary(word);
  for (const word of ITEM_CONNECTORS) addVocabulary(word);
  for (const word of ITEM_PREPOSITIONS) addVocabulary(word);
  for (const word of ITEM_PARTICLES) addVocabulary(word);
  for (const word of AMOUNT_CONTEXT_MARKERS) addVocabulary(word);
  for (const word of ITEM_CONTEXT_ADVERBS) addVocabulary(word);
  // Number words are protected twice over: by the set below and by an
  // explicit guard in `normalizeText`.
  for (const word of NUMBER_WORDS) addVocabulary(word);

  return {
    slang,
    vocabulary: [...vocabulary].sort(),
    correctionTargets: [...correctionTargets].sort(),
  };
}

/* ────────────────────────── normalisation ────────────────────────── */

const NOISE_PATTERN = /[^\p{L}\p{N}\s.,]/gu;
/** `ribu`/`k`/`juta` collapse to `rb`/`jt`; longest alternative first. */
const UNIT_PATTERN = /(\d[\d.,]*)\s*(ribuan|ribu|jutaan|juta|rb|jt|k)\b/giu;
const UNIT_SYNONYM: Record<string, string> = {
  ribuan: 'rb',
  ribu: 'rb',
  rb: 'rb',
  k: 'rb',
  jutaan: 'jt',
  juta: 'jt',
  jt: 'jt',
};

function stripNoise(input: string): string {
  return input
    .replace(NOISE_PATTERN, ' ')
    .replace(/([,.])\1+/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * `Rp 20.000` → `rp20.000`, `20 ribu` → `20rb`, `1,5 juta` → `1,5jt`.
 * Done on the string so the tokeniser sees one self-contained amount token.
 */
function normaliseAmountUnits(input: string): string {
  return input
    .replace(/\brp\.?\s+(?=\d)/giu, 'rp')
    .replace(UNIT_PATTERN, (_match, digits: string, unit: string) => {
      return `${digits}${UNIT_SYNONYM[unit.toLowerCase()] ?? unit.toLowerCase()}`;
    });
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  for (const raw of input.split(/\s+/u)) {
    const trimmed = raw.replace(/^[,.\s]+|[,.\s]+$/gu, '');
    if (trimmed) tokens.push(trimmed);
  }
  return tokens;
}

function withSpans(tokens: string[]): NormalizedToken[] {
  let cursor = 0;
  return tokens.map((text) => {
    const start = cursor;
    cursor += text.length + 1;
    return { text, start, end: start + text.length };
  });
}

/**
 * Normalise one raw transaction sentence.
 *
 * `NormalizedToken.start`/`.end` index into the returned `text`, so callers
 * can slice the sentence back out from token positions.
 */
export function normalizeText(
  raw: string,
  dictionary: NormalizerDictionary = buildNormalizerDictionary()
): NormalizedText {
  if (typeof raw !== 'string') {
    return { text: '', tokens: [], corrections: [] };
  }

  const truncated = raw.slice(0, MAX_INPUT_LENGTH);
  const cleaned = normaliseAmountUnits(stripNoise(truncated.normalize('NFKC').toLowerCase()));
  if (!cleaned) return { text: '', tokens: [], corrections: [] };

  const corrections: NormalizerCorrection[] = [];
  const corrected: string[] = [];

  for (const token of tokenize(cleaned)) {
    // Amounts and any token carrying a digit are never rewritten.
    if (/\d/u.test(token)) {
      corrected.push(token);
      continue;
    }

    const slangHit = dictionary.slang[token];
    if (slangHit !== undefined) {
      corrections.push({ from: token, to: slangHit, method: 'slang' });
      corrected.push(slangHit);
      continue;
    }

    if (nlpConfig.fuzzyEnabled && !NUMBER_WORDS.has(token)) {
      const fuzzyHit = fuzzyCorrect(
        token,
        dictionary.correctionTargets,
        maxDistanceFor(token)
      );
      if (fuzzyHit) {
        corrections.push({ from: token, to: fuzzyHit, method: 'fuzzy' });
        corrected.push(fuzzyHit);
        continue;
      }
    }

    corrected.push(token);
  }

  return {
    text: corrected.join(' '),
    tokens: withSpans(corrected),
    corrections,
  };
}
