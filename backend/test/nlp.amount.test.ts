/**
 * Amount extraction tests (planning-nlp-transaction-parser.md §4.3)
 *
 *   - every documented spelling maps to the same rupiah value
 *   - the `,`/`.` separator resolves as thousands vs decimal
 *   - spelled-out nominals are parsed positionally
 *   - a bare small integer is a quantity, not a price
 *
 * Run:  npm run test:nlp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { normalizeText, buildNormalizerDictionary } = await import(
  '../src/modules/nlp/text-normalizer.ts'
);
const { extractAmounts, pickAmount, parseNumericAmount } = await import(
  '../src/modules/nlp/amount.extractor.ts'
);

const dictionary = buildNormalizerDictionary();

function amountsOf(text: string) {
  return extractAmounts(normalizeText(text, dictionary).tokens);
}

function singleValue(text: string): number | null {
  const picked = pickAmount(amountsOf(text));
  return picked ? picked.value : null;
}

describe('parseNumericAmount', () => {
  test('plain integers', () => {
    assert.equal(parseNumericAmount('20000'), 20000);
    assert.equal(parseNumericAmount('0'), 0);
  });

  test('a separator followed by exactly three digits is a thousands group', () => {
    assert.equal(parseNumericAmount('20.000'), 20000);
    assert.equal(parseNumericAmount('20,000'), 20000);
    assert.equal(parseNumericAmount('1.500.000'), 1500000);
  });

  test('a separator followed by one or two digits is a decimal fraction', () => {
    assert.equal(parseNumericAmount('1,5'), 1.5);
    assert.equal(parseNumericAmount('1.5'), 1.5);
    assert.equal(parseNumericAmount('2,5'), 2.5);
  });

  test('both separators present: the right-most one is the decimal', () => {
    assert.equal(parseNumericAmount('1.234,56'), 1234.56);
    assert.equal(parseNumericAmount('1,234.56'), 1234.56);
  });

  test('rejects non-numeric input', () => {
    for (const input of ['', 'abc', 'rb', '.', ',']) {
      assert.equal(parseNumericAmount(input), null, `expected null for "${input}"`);
    }
  });
});

describe('numeric extraction', () => {
  test('accepts every documented spelling of 20 ribu', () => {
    for (const input of [
      'beli kopi 20rb',
      'beli kopi 20 rb',
      'beli kopi 20ribu',
      'beli kopi 20 ribu',
      'beli kopi 20k',
      'beli kopi Rp 20.000',
      'beli kopi rp20.000',
      'beli kopi 20000',
      'beli kopi 20,000',
    ]) {
      assert.equal(singleValue(input), 20000, `failed on "${input}"`);
    }
  });

  test('handles millions with decimals', () => {
    assert.equal(singleValue('bayar sewa 1,5 juta'), 1500000);
    assert.equal(singleValue('bayar sewa 1.5jt'), 1500000);
    assert.equal(singleValue('bayar sewa 2jt'), 2000000);
  });

  test('records the source text and position of each match', () => {
    const [match] = amountsOf('beli kopi 20rb');
    assert.equal(match.raw, '20rb');
    assert.equal(match.value, 20000);
    assert.equal(match.strong, true);
    assert.equal(match.source, 'numeric');
    assert.equal(match.tokenIndex, 2);
    assert.equal(match.endTokenIndex, 2);
  });

  test('finds every nominal in a multi-item sentence', () => {
    const matches = amountsOf('beli kopi 20rb sama snack 15rb');
    assert.deepEqual(
      matches.map((match) => match.value),
      [20000, 15000]
    );
  });
});

describe('strength — price vs quantity', () => {
  test('a bare small integer is weak', () => {
    const [match] = amountsOf('beli kopi 20');
    assert.equal(match.value, 20);
    assert.equal(match.strong, false);
  });

  test('a bare four-digit number is strong (reads as a price)', () => {
    const [match] = amountsOf('beli kopi 20000');
    assert.equal(match.strong, true);
  });

  test('a unit, a currency prefix or a separator is strong', () => {
    assert.equal(amountsOf('beli kopi 2rb')[0].strong, true);
    assert.equal(amountsOf('beli kopi Rp 200')[0].strong, true);
    assert.equal(amountsOf('beli kopi 2,5')[0].strong, true);
  });

  test('the price wins over the quantity', () => {
    const matches = amountsOf('beli 2 kopi 20rb');
    assert.deepEqual(
      matches.map((match) => [match.value, match.strong]),
      [
        [2, false],
        [20000, true],
      ]
    );
    assert.equal(pickAmount(matches)?.value, 20000);
  });
});

describe('spelled-out nominals', () => {
  test('parses simple and compound number words', () => {
    assert.equal(singleValue('beli kopi dua puluh ribu'), 20000);
    assert.equal(singleValue('beli kopi lima ribu'), 5000);
    assert.equal(singleValue('beli kopi sebelas ribu'), 11000);
    assert.equal(singleValue('beli kopi seribu'), 1000);
    assert.equal(singleValue('beli kopi dua juta'), 2000000);
  });

  test('parses positional hundreds correctly', () => {
    // A naive running total would give 1.050.000 here.
    assert.equal(singleValue('beli kopi seratus lima puluh ribu'), 150000);
    assert.equal(singleValue('beli kopi dua ratus ribu'), 200000);
    assert.equal(singleValue('beli kopi seratus ribu'), 100000);
  });

  test('marks word amounts as strong', () => {
    const [match] = amountsOf('beli kopi dua puluh ribu');
    assert.equal(match.source, 'word');
    assert.equal(match.strong, true);
    assert.equal(match.raw, 'dua puluh ribu');
  });

  test('needs a scale word — a bare number word is not an amount', () => {
    assert.equal(singleValue('beli kopi dua'), null);
    assert.equal(singleValue('beli dua kopi'), null);
  });

  test('a scale word with no number is not an amount', () => {
    assert.equal(singleValue('beli kopi ribu'), null);
  });

  test('keeps the quantity/price distinction for word numbers too', () => {
    // "dua kopi" is a count, "dua puluh ribu" is the price.
    assert.equal(singleValue('beli dua kopi dua puluh ribu'), 20000);
  });
});

describe('price vs discount', () => {
  test('a discount nominal is never mistaken for the price', () => {
    // Regression: `pickAmount` took the last strong nominal, which was the
    // discount, so the row recorded 5.000 instead of 20.000.
    for (const input of [
      'beli kopi 20rb diskon 5rb',
      'beli kopi 20rb potongan 5rb',
      'beli kopi 20rb cashback 5rb',
      'beli kopi 20rb total 20rb',
    ]) {
      const normalized = normalizeText(input, dictionary);
      const picked = pickAmount(extractAmounts(normalized.tokens), normalized.tokens);
      assert.equal(picked?.value, 20000, `wrong amount for "${input}"`);
    }
  });

  test('falls back to the raw list when every nominal is marked', () => {
    const normalized = normalizeText('beli kopi diskon 5rb', dictionary);
    const picked = pickAmount(extractAmounts(normalized.tokens), normalized.tokens);
    assert.equal(picked?.value, 5000);
  });
});

describe('no nominal at all', () => {
  test('returns nothing when the sentence has no amount', () => {
    for (const input of ['abis beli kopi kenangan', 'beli kopi', 'halo apa kabar']) {
      assert.deepEqual(amountsOf(input), [], `expected no match for "${input}"`);
      assert.equal(pickAmount([]), null);
    }
  });
});
