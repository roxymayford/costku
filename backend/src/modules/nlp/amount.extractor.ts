/**
 * Amount extraction (§4.3).
 *
 * Rule-based on purpose — the nominal patterns are predictable, so a regex
 * plus a small word-number parser beats any learned model here.
 *
 * Handles: `20rb`, `20 rb`, `20k`, `20ribu`, `Rp20.000`, `1.5jt`,
 * `1,5 juta`, `20000`, and spelled-out `dua puluh ribu`.
 *
 * The one judgement call is `strong` vs weak. "beli 2 kopi 20rb" contains
 * two numbers and only one of them is a price; a bare number under four
 * digits with no unit, no currency prefix and no separator is treated as a
 * quantity, so the parser never mistakes it for the amount.
 */

import {
  AMOUNT_CONTEXT_MARKERS,
  AMOUNT_UNIT_MULTIPLIER,
  NUMBER_WORD_SCALE_PREFIXED,
  NUMBER_WORD_SCALES,
  NUMBER_WORD_UNITS,
} from './nlp.constants.js';
import type { AmountMatch, NormalizedToken } from './nlp.types.js';

/** `rp20.000` | `1,5jt` | `20000` | `20rb` */
const NUMERIC_TOKEN_PATTERN = /^(?:rp)?(\d(?:[\d.,]*\d)?)(rb|jt|k)?$/u;

/** A bare number needs this many digits to read as a price, not a count. */
const BARE_AMOUNT_MIN_DIGITS = 4;

/**
 * Turn a numeric literal into a number, resolving the `,`/`.` ambiguity the
 * way Indonesian writing actually works:
 *   - `20.000`   → 20000  (separator followed by exactly 3 digits)
 *   - `1.500.000`→ 1500000 (repeated separator)
 *   - `1,5`      → 1.5    (separator followed by 1–2 digits)
 *   - `1.234,56` → 1234.56 (both present: the right-most one is the decimal)
 */
export function parseNumericAmount(raw: string): number | null {
  if (!/^\d/u.test(raw)) return null;

  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');
  let integerPart = raw;
  let decimalPart = '';

  if (hasDot && hasComma) {
    const decimalSeparator = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? '.' : ',';
    const cut = raw.lastIndexOf(decimalSeparator);
    integerPart = raw.slice(0, cut);
    decimalPart = raw.slice(cut + 1);
  } else if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ',';
    const parts = raw.split(separator);
    const last = parts[parts.length - 1];
    if (parts.length > 2 || last.length === 3) {
      integerPart = parts.join('');
    } else {
      integerPart = parts.slice(0, -1).join('');
      decimalPart = last;
    }
  }

  const digits = integerPart.replace(/[.,]/gu, '');
  const literal = decimalPart ? `${digits || '0'}.${decimalPart}` : digits || '0';
  const value = Number.parseFloat(literal);
  return Number.isFinite(value) ? value : null;
}

function toMatch(
  raw: string,
  digits: string,
  unit: string | undefined,
  tokenIndex: number,
  endTokenIndex: number,
  source: AmountMatch['source'],
  hasCurrencyPrefix: boolean
): AmountMatch | null {
  const base = parseNumericAmount(digits);
  if (base === null) return null;

  const multiplier = unit ? (AMOUNT_UNIT_MULTIPLIER[unit] ?? 1) : 1;
  const digitCount = digits.replace(/\D/gu, '').length;
  const strong =
    Boolean(unit) || hasCurrencyPrefix || /[.,]/u.test(digits) || digitCount >= BARE_AMOUNT_MIN_DIGITS;

  return {
    raw,
    value: Math.round(base * multiplier),
    tokenIndex,
    endTokenIndex,
    strong,
    source,
  };
}

/**
 * Nominal matches from numeric tokens (`20rb`, `Rp20.000`).
 */
function extractNumericAmounts(tokens: NormalizedToken[]): AmountMatch[] {
  const matches: AmountMatch[] = [];
  tokens.forEach((token, index) => {
    const hit = NUMERIC_TOKEN_PATTERN.exec(token.text);
    if (!hit) return;
    const match = toMatch(
      token.text,
      hit[1],
      hit[2],
      index,
      index,
      'numeric',
      token.text.startsWith('rp')
    );
    if (match) matches.push(match);
  });
  return matches;
}

/**
 * Spelled-out nominals (`dua puluh ribu`).
 *
 * Indonesian number words are positional, so the accumulator keeps
 * hundreds/tens/units in separate slots and only folds them into a total
 * when a scale word closes the group. A naive running total gets
 * `seratus lima puluh ribu` wrong (1.050.000 instead of 150.000).
 *
 * A run is only accepted when it contains a scale word (`ribu`/`juta`) —
 * otherwise bare number words like "dua" would be read as amounts. That
 * makes "beli 2 kopi" and "beli dua kopi" behave identically.
 */
function extractWordAmounts(tokens: NormalizedToken[]): AmountMatch[] {
  const matches: AmountMatch[] = [];
  let i = 0;

  while (i < tokens.length) {
    let total = 0;
    let hundreds = 0;
    let tens = 0;
    let units = 0;
    let numberTokens = 0;
    let sawScale = false;
    let j = i;

    const group = (): number => hundreds + tens + units;
    const resetGroup = (): void => {
      hundreds = 0;
      tens = 0;
      units = 0;
    };

    while (j < tokens.length) {
      const word = tokens[j].text;

      if (NUMBER_WORD_SCALE_PREFIXED[word] !== undefined) {
        total += NUMBER_WORD_SCALE_PREFIXED[word];
        sawScale = true;
        // `seribu` carries its own value, so it counts as a number token —
        // otherwise "seribu" alone would be rejected as a bare scale word.
        numberTokens += 1;
        resetGroup();
        j += 1;
        continue;
      }
      if (NUMBER_WORD_SCALES[word] !== undefined) {
        total += (group() || 1) * NUMBER_WORD_SCALES[word];
        sawScale = true;
        resetGroup();
        j += 1;
        continue;
      }
      if (NUMBER_WORD_UNITS[word] !== undefined) {
        units = NUMBER_WORD_UNITS[word];
        numberTokens += 1;
        j += 1;
        continue;
      }
      if (word === 'sepuluh' || word === 'sebelas') {
        tens = word === 'sepuluh' ? 10 : 11;
        units = 0;
        numberTokens += 1;
        j += 1;
        continue;
      }
      if (word === 'belas') {
        tens = 10 + units;
        units = 0;
        numberTokens += 1;
        j += 1;
        continue;
      }
      if (word === 'puluh') {
        tens = (units || 1) * 10;
        units = 0;
        numberTokens += 1;
        j += 1;
        continue;
      }
      if (word === 'ratus' || word === 'seratus') {
        hundreds = word === 'seratus' ? 100 : (units || 1) * 100;
        units = 0;
        numberTokens += 1;
        j += 1;
        continue;
      }
      break;
    }

    total += group();

    if (sawScale && numberTokens >= 1 && total > 0) {
      matches.push({
        raw: tokens
          .slice(i, j)
          .map((t) => t.text)
          .join(' '),
        value: total,
        tokenIndex: i,
        endTokenIndex: j - 1,
        strong: true,
        source: 'word',
      });
      i = j;
      continue;
    }

    i += 1;
  }

  return matches;
}

/** All nominal candidates in the sentence, ordered by position. */
export function extractAmounts(tokens: NormalizedToken[]): AmountMatch[] {
  return [...extractNumericAmounts(tokens), ...extractWordAmounts(tokens)].sort(
    (a, b) => a.tokenIndex - b.tokenIndex
  );
}

/**
 * True when a context marker ("diskon", "total", …) sits immediately before
 * the nominal — i.e. it is a discount or a summary line, not the price.
 *
 * Shared with the multi-item gate so both agree on which nominals are real:
 * "beli kopi 20rb diskon 5rb" has one price (20rb) and one discount (5rb),
 * and picking the wrong one silently records a wrong amount.
 */
export function isContextMarkedAmount(tokens: NormalizedToken[], tokenIndex: number): boolean {
  for (let i = Math.max(0, tokenIndex - 2); i < tokenIndex; i += 1) {
    if (AMOUNT_CONTEXT_MARKERS.includes(tokens[i].text)) return true;
  }
  return false;
}

/**
 * Choose the nominal that represents the price.
 *
 * Strong candidates win outright, and among them the *last* one is taken:
 * in "beli kopi 20rb" the price follows the item. Discount/summary nominals
 * are skipped first, and only when nothing is strong do we fall back to the
 * largest bare number — callers must surface that as `amount_uncertain`
 * rather than trusting it.
 */
export function pickAmount(
  matches: AmountMatch[],
  tokens: NormalizedToken[] = []
): AmountMatch | null {
  if (matches.length === 0) return null;

  const usable =
    tokens.length > 0
      ? matches.filter((match) => !isContextMarkedAmount(tokens, match.tokenIndex))
      : matches;
  // If *every* nominal is marked, fall back to the raw list rather than
  // returning nothing — a doubtful amount beats no amount at all.
  const pool = usable.length > 0 ? usable : matches;

  const strong = pool.filter((match) => match.strong);
  if (strong.length > 0) return strong[strong.length - 1];

  return pool.reduce((best, match) => (match.value > best.value ? match : best), pool[0]);
}
