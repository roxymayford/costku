/**
 * Item-name extraction (§4.4).
 *
 * Strategy: anchor on the last purchase verb before the nominal, take the
 * tokens in between, then canonicalise against the product dictionary.
 *
 *   "gua abis beli kopi kenagan 20rb" → `Kopi Kenangan`
 *
 * Two rules worth stating explicitly:
 *
 *  - **Prepositions terminate the phrase.** "beli obat di ugd 50rb" stores
 *    `Obat`, not `Obat Ugd`. Nothing is lost for classification, because the
 *    classifier reads the whole sentence, so the `ugd` signal still lands.
 *  - **The fallback never invents a name.** If no content word survives the
 *    filters, `itemName` is null and the parser routes the row to review —
 *    a wrong item name is worse than an empty one.
 */

import {
  AMOUNT_CONTEXT_MARKERS,
  ITEM_CONNECTORS,
  ITEM_CONTEXT_ADVERBS,
  ITEM_PARTICLES,
  ITEM_PREPOSITIONS,
  PURCHASE_VERBS,
} from './nlp.constants.js';
import { PRODUCT_DICTIONARY } from './data/product.dictionary.js';
import { tokenizeWords } from './text-normalizer.js';
import type { AmountMatch, ItemExtraction, NormalizedToken, ProductEntry } from './nlp.types.js';

function isSkippable(word: string): boolean {
  return (
    /\d/u.test(word) ||
    ITEM_PARTICLES.includes(word) ||
    PURCHASE_VERBS.includes(word) ||
    ITEM_CONNECTORS.includes(word) ||
    // "total"/"diskon" belong to the receipt, not to the item name.
    AMOUNT_CONTEXT_MARKERS.includes(word) ||
    // "mendadak" describes timing, not the purchase.
    ITEM_CONTEXT_ADVERBS.includes(word)
  );
}

/**
 * Collect the item phrase from `[start, limit)`.
 * When `breakAtPreposition` is set the phrase ends at the first preposition
 * (the common case); the fallback pass disables it so "beli di warung"
 * still yields something instead of nothing.
 */
function collectPhrase(
  words: string[],
  start: number,
  limit: number,
  breakAtPreposition: boolean
): string[] {
  const phrase: string[] = [];
  for (let i = start; i < limit; i += 1) {
    const word = words[i];
    if (breakAtPreposition && ITEM_PREPOSITIONS.includes(word)) break;
    if (isSkippable(word)) continue;
    phrase.push(word);
  }
  return phrase;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** Longest-alias-first brand lookup, so `grab food` beats `grab`. */
export function matchProduct(
  phraseTokens: string[],
  products: ProductEntry[] = PRODUCT_DICTIONARY
): string | null {
  let best: ProductEntry | null = null;
  let bestLength = 0;

  for (const product of products) {
    for (const candidate of [product.name, ...product.aliases]) {
      const aliasTokens = tokenizeWords(candidate);
      if (aliasTokens.length < bestLength) continue;
      if (!containsSequence(phraseTokens, aliasTokens)) continue;
      if (aliasTokens.length > bestLength) {
        best = product;
        bestLength = aliasTokens.length;
      }
    }
  }

  return best ? best.name : null;
}

export function titleCase(input: string): string {
  return input
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function extractItemName(
  tokens: NormalizedToken[],
  amount: AmountMatch | null,
  products: ProductEntry[] = PRODUCT_DICTIONARY
): ItemExtraction {
  const words = tokens.map((token) => token.text);
  const limit = amount ? amount.tokenIndex : words.length;

  let anchorIndex: number | null = null;
  for (let i = 0; i < limit; i += 1) {
    if (PURCHASE_VERBS.includes(words[i])) anchorIndex = i;
  }

  // An item phrase needs *some* transaction signal. Without a purchase verb
  // and without a nominal, "halo apa kabar" would otherwise be stored as an
  // item called "Halo Apa Kabar" — a wrong name is worse than an empty one.
  if (anchorIndex === null && !amount) {
    return { itemName: null, brand: null, anchor: null, anchorIndex: null, phraseTokens: [] };
  }

  let phraseTokens: string[] = [];
  if (anchorIndex !== null) {
    phraseTokens = collectPhrase(words, anchorIndex + 1, limit, true);
    if (phraseTokens.length === 0) {
      // "beli di warung" — retry without the preposition break.
      phraseTokens = collectPhrase(words, anchorIndex + 1, limit, false);
    }
  }
  if (phraseTokens.length === 0) {
    phraseTokens = collectPhrase(words, 0, limit, true);
  }

  if (phraseTokens.length === 0) {
    return { itemName: null, brand: null, anchor: anchorIndex === null ? null : words[anchorIndex], anchorIndex, phraseTokens: [] };
  }

  const brand = matchProduct(phraseTokens, products);
  return {
    itemName: brand ?? titleCase(phraseTokens.join(' ')),
    brand,
    anchor: anchorIndex === null ? null : words[anchorIndex],
    anchorIndex,
    phraseTokens,
  };
}
