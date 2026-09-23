/**
 * NLP normaliser tests (planning-nlp-transaction-parser.md §4.1)
 *
 *   - noise stripping keeps digits and the `,`/`.` inside numbers
 *   - amount units collapse (`20 ribu` / `20k` → `20rb`, `1,5 juta` → `1,5jt`)
 *   - slang expansion rewrites whole tokens
 *   - fuzzy correction fixes typos but never invents words
 *   - token positions stay aligned with the normalised text
 *
 * Run:  npm run test:nlp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { normalizeText, buildNormalizerDictionary, levenshtein, tokenizeWords } = await import(
  '../src/modules/nlp/text-normalizer.ts'
);

const dictionary = buildNormalizerDictionary();

describe('stripNoise', () => {
  test('drops punctuation but keeps the sentence readable', () => {
    assert.equal(normalizeText('kopi!!! 20rb??', dictionary).text, 'kopi 20rb');
  });

  test('collapses repeated separators', () => {
    assert.equal(normalizeText('kopi... 20rb', dictionary).text, 'kopi 20rb');
  });

  test('lowercases and NFKC-normalises', () => {
    assert.equal(normalizeText('BELI KOPI 20RB', dictionary).text, 'beli kopi 20rb');
  });

  test('strips emoji and symbols', () => {
    assert.equal(normalizeText('beli kopi ☕ 20rb 😭', dictionary).text, 'beli kopi 20rb');
  });

  test('turns hyphens into separate tokens', () => {
    assert.equal(normalizeText('beli obat tiba-tiba', dictionary).text, 'beli obat tiba tiba');
  });

  test('returns an empty result for input with no content', () => {
    for (const input of ['', '   ', '!!!', '😭😭']) {
      const result = normalizeText(input, dictionary);
      assert.equal(result.text, '');
      assert.deepEqual(result.tokens, []);
    }
  });
});

describe('amount unit normalisation', () => {
  test('joins and collapses every thousand spelling to rb', () => {
    for (const input of ['20rb', '20 rb', '20ribu', '20 ribu', '20k', '20 K', '20ribuan']) {
      assert.equal(normalizeText(input, dictionary).text, '20rb', `failed on "${input}"`);
    }
  });

  test('collapses million spellings to jt', () => {
    for (const input of ['1jt', '1 jt', '1juta', '1 juta', '1jutaan']) {
      assert.equal(normalizeText(input, dictionary).text, '1jt', `failed on "${input}"`);
    }
  });

  test('keeps a decimal comma intact', () => {
    assert.equal(normalizeText('bayar 1,5 juta', dictionary).text, 'bayar 1,5jt');
  });

  test('attaches an Rp prefix to its number', () => {
    assert.equal(normalizeText('Rp 20.000', dictionary).text, 'rp20.000');
    assert.equal(normalizeText('Rp20.000', dictionary).text, 'rp20.000');
  });

  test('does not eat a word that merely starts with k', () => {
    // `2 kopi` must not become `2rb opi`.
    assert.equal(normalizeText('beli 2 kopi', dictionary).text, 'beli 2 kopi');
  });
});

describe('slang expansion', () => {
  test('rewrites known slang tokens', () => {
    assert.equal(normalizeText('gua abis beli', dictionary).text, 'saya habis beli');
    assert.equal(normalizeText('gw gak jadi beli', dictionary).text, 'saya tidak jadi beli');
    assert.equal(normalizeText('sewa kos 1jt', dictionary).text, 'sewa kost 1jt');
  });

  test('reports what it changed', () => {
    const { corrections } = normalizeText('gua abis beli kopi', dictionary);
    assert.deepEqual(
      corrections.map((c) => `${c.from}->${c.to}:${c.method}`),
      ['gua->saya:slang', 'abis->habis:slang']
    );
  });

  test('leaves tokens with digits untouched', () => {
    const { corrections } = normalizeText('beli 20rb', dictionary);
    assert.deepEqual(corrections, []);
  });
});

describe('fuzzy correction', () => {
  test('fixes a single-character typo', () => {
    assert.equal(normalizeText('beli kopi kenagan 20rb', dictionary).text, 'beli kopi kenangan 20rb');
    assert.equal(normalizeText('beli indome 5rb', dictionary).text, 'beli indomie 5rb');
  });

  test('labels the correction as fuzzy', () => {
    const { corrections } = normalizeText('beli kenagan', dictionary);
    assert.equal(corrections.length, 1);
    assert.deepEqual(corrections[0], { from: 'kenagan', to: 'kenangan', method: 'fuzzy' });
  });

  test('never invents a word that is not a correction target', () => {
    // No target starts with `z` or `x`, so nothing may be substituted.
    assert.equal(normalizeText('beli zebra 10rb', dictionary).text, 'beli zebra 10rb');
    assert.equal(normalizeText('beli xyzzy 10rb', dictionary).text, 'beli xyzzy 10rb');
  });

  test('refuses to correct when two candidates tie', () => {
    // `kost` and `kosa` are both one edit away from `kosi`; an ambiguous
    // match must be left alone rather than guessed.
    const ambiguous = buildNormalizerDictionary({ slang: {}, keywords: [], products: [] });
    ambiguous.correctionTargets = ['kost', 'kosa'];
    assert.equal(normalizeText('kosi', ambiguous).text, 'kosi');
  });

  test('leaves short tokens alone', () => {
    // Below the minimum length the edit distance is not meaningful.
    assert.equal(normalizeText('beli zz 10rb', dictionary).text, 'beli zz 10rb');
  });

  test('never rewrites a number word', () => {
    // Regression: with the full keyword list as the target set, `juta`
    // snapped to `juga` and `seratus` to `sepatu`, silently destroying the
    // nominal. Spelled-out amounts must survive normalisation intact.
    for (const input of [
      'beli kopi dua juta',
      'beli kopi seratus lima puluh ribu',
      'beli kopi dua puluh ribu',
      'beli kopi seribu',
      'beli kopi sebelas ribu',
      'beli kopi sembilan ratus ribu',
    ]) {
      assert.equal(normalizeText(input, dictionary).text, input, `mangled "${input}"`);
      assert.deepEqual(normalizeText(input, dictionary).corrections, [], `corrected "${input}"`);
    }
  });

  test('category keywords are not correction targets', () => {
    // They are ordinary words; treating them as targets is what caused the
    // regression above. Brands and slang remain targets.
    assert.ok(!dictionary.correctionTargets.includes('juga'));
    assert.ok(!dictionary.correctionTargets.includes('sepatu'));
    assert.ok(dictionary.correctionTargets.includes('kenangan'));
    assert.ok(dictionary.correctionTargets.includes('saya'));
  });
});

describe('levenshtein', () => {
  test('is exact inside the budget', () => {
    assert.equal(levenshtein('kenagan', 'kenangan', 2), 1);
    assert.equal(levenshtein('abc', 'abc', 1), 0);
    assert.equal(levenshtein('baju', 'batu', 1), 1);
    assert.equal(levenshtein('kopi', 'kost', 2), 2);
    assert.equal(levenshtein('kitten', 'sitting', 3), 3);
  });

  test('reports out-of-budget distances as maxDistance + 1', () => {
    assert.equal(levenshtein('a', 'abc', 1), 2);
    assert.equal(levenshtein('abc', 'xyz', 1), 2);
    assert.equal(levenshtein('', 'abc', 2), 3);
  });
});

describe('token spans', () => {
  test('point back into the normalised text', () => {
    const { text, tokens } = normalizeText('gua abis beli kopi 20rb', dictionary);
    for (const token of tokens) {
      assert.equal(text.slice(token.start, token.end), token.text, `span for "${token.text}"`);
    }
  });

  test('tokenizeWords splits on any non-alphanumeric', () => {
    assert.deepEqual(tokenizeWords('Tiba-Tiba'), ['tiba', 'tiba']);
    assert.deepEqual(tokenizeWords('grab food'), ['grab', 'food']);
    assert.deepEqual(tokenizeWords('  '), []);
  });
});

describe('robustness', () => {
  test('truncates absurdly long input instead of choking', () => {
    const result = normalizeText('beli kopi '.repeat(200), dictionary);
    assert.ok(result.text.length <= 500, `expected truncation, got ${result.text.length}`);
  });

  test('tolerates a non-string argument', () => {
    assert.deepEqual(normalizeText(undefined as unknown as string, dictionary).tokens, []);
  });
});
