/**
 * Multi-item gate (§4.2).
 *
 * Runs *after* preprocessing and *before* entity extraction. When it fires
 * the pipeline stops: no partial parse, no `transactions` row beyond the
 * raw-text log, just an alert modal asking for one transaction per sentence.
 *
 * The gate is intentionally biased toward alerting. A false negative (two
 * items silently merged into one row) corrupts the user's spending history
 * *and* poisons the Fase 2 training set, whereas a false positive costs the
 * user one retype.
 */

import {
  ITEM_CONNECTORS,
  ITEM_PARTICLES,
  ITEM_PREPOSITIONS,
  PURCHASE_VERBS,
} from './nlp.constants.js';
import { isContextMarkedAmount } from './amount.extractor.js';
import type {
  AmountMatch,
  MultiItemSignal,
  MultiItemVerdict,
  NormalizedToken,
} from './nlp.types.js';

/**
 * Connectives that join two item phrases outright.
 * `terus` is handled separately — it doubles as a plain sequence marker
 * ("beli kopi terus pulang"), so it only counts when a purchase verb
 * follows, i.e. the "terus beli" pattern named in §4.2.
 */
const HARD_CONNECTORS: readonly string[] = ITEM_CONNECTORS.filter((w) => w !== 'terus');
const SOFT_CONNECTORS: readonly string[] = ['terus'];

function isContentWord(word: string): boolean {
  if (!word) return false;
  if (/\d/u.test(word)) return false;
  if (ITEM_PARTICLES.includes(word)) return false;
  if (ITEM_PREPOSITIONS.includes(word)) return false;
  if (PURCHASE_VERBS.includes(word)) return false;
  return true;
}

export function detectMultiItem(
  tokens: NormalizedToken[],
  amounts: AmountMatch[]
): MultiItemVerdict {
  const words = tokens.map((token) => token.text);
  const signals = new Set<MultiItemSignal>();

  // Nominal candidates that survive the discount/summary filter. Uses the
  // same predicate as `pickAmount`, so the gate and the extraction can never
  // disagree about which nominals are real prices.
  const usable = amounts.filter((amount) => !isContextMarkedAmount(tokens, amount.tokenIndex));
  const strong = usable.filter((amount) => amount.strong);

  if (strong.length >= 2) signals.add('multiple_amounts');

  const verbIndices: number[] = [];
  words.forEach((word, index) => {
    if (PURCHASE_VERBS.includes(word)) verbIndices.push(index);
  });
  if (verbIndices.length >= 2) signals.add('multiple_purchase_verbs');

  const spanStart = verbIndices.length > 0 ? verbIndices[0] : 0;
  const spanEnd = usable.length > 0 ? usable[0].tokenIndex : words.length;

  for (let i = spanStart; i < spanEnd; i += 1) {
    const word = words[i];
    const isHard = HARD_CONNECTORS.includes(word);
    const isSoft = SOFT_CONNECTORS.includes(word) && PURCHASE_VERBS.includes(words[i + 1] ?? '');
    if (!isHard && !isSoft) continue;

    const hasLeft = words.slice(spanStart, i).some(isContentWord);
    const hasRight = words.slice(i + 1, spanEnd).some(isContentWord);
    if (hasLeft && hasRight) {
      signals.add('connector_splitting_items');
      break;
    }
  }

  if (usable.length >= 2) {
    const first = usable[0].tokenIndex;
    const last = usable[usable.length - 1].tokenIndex;
    for (let i = first; i <= last; i += 1) {
      if (ITEM_CONNECTORS.includes(words[i])) {
        signals.add('connector_between_amounts');
        break;
      }
    }
  }

  return { detected: signals.size > 0, signals: [...signals] };
}
