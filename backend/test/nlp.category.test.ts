/**
 * Category classifier tests (planning-nlp-transaction-parser.md §4.5.A, §7)
 *
 * Pins the confidence behaviour, which is the whole point of the Fase 1
 * classifier: a strong single keyword must clear the 0.70 threshold, while
 * an ambiguous-only or tied verdict must fall below it and route to review.
 *
 * Run:  npm run test:nlp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { classifyCategory } = await import('../src/modules/nlp/category.classifier.ts');
const { TransactionCategory } = await import('../src/modules/nlp/nlp.constants.ts');

describe('clear verdicts', () => {
  test('kopi → keinginan', () => {
    const result = classifyCategory('saya habis beli kopi kenangan 20rb');
    assert.equal(result.category, TransactionCategory.KEINGINAN);
    assert.equal(result.confidence, 0.84);
    assert.equal(result.ambiguous, false);
    assert.equal(result.noKeywordMatch, false);
    assert.deepEqual(result.matchedKeywords, ['kopi']);
  });

  test('listrik → kebutuhan', () => {
    const result = classifyCategory('bayar listrik 150rb');
    assert.equal(result.category, TransactionCategory.KEBUTUHAN);
    assert.equal(result.confidence, 0.87);
  });

  test('mendadak → darurat', () => {
    const result = classifyCategory('servis motor mendadak 500rb');
    assert.equal(result.category, TransactionCategory.DARURAT);
    assert.equal(result.confidence, 0.78);
  });

  test('a decisive signal word beats the item keyword', () => {
    const result = classifyCategory('beli obat di ugd 50rb');
    assert.equal(result.category, TransactionCategory.DARURAT);
    assert.equal(result.confidence, 0.81);
    assert.equal(result.ambiguous, false);
  });
});

describe('ambiguity is never auto-approved', () => {
  test('an ambiguous-only keyword is capped below the threshold', () => {
    const result = classifyCategory('beli obat');
    assert.equal(result.category, TransactionCategory.KEBUTUHAN);
    assert.equal(result.confidence, 0.45);
    assert.equal(result.ambiguous, true);
  });

  test('other context-dependent keywords behave the same way', () => {
    for (const input of ['bayar servis', 'beli makan', 'beli vitamin']) {
      const result = classifyCategory(input);
      assert.equal(result.ambiguous, true, `expected ambiguity for "${input}"`);
      assert.ok(result.confidence < 0.7, `expected low confidence for "${input}"`);
    }
  });

  test('a tie between two classes collapses confidence', () => {
    // Same weight on both sides → no basis to choose.
    const result = classifyCategory('beli kopi beras');
    assert.equal(result.ambiguous, true);
    assert.equal(result.confidence, 0.49);
    assert.deepEqual(result.scores, {
      kebutuhan: 3,
      keinginan: 3,
      darurat: 0,
    });
  });
});

describe('no match at all', () => {
  test('falls back to the default class with minimal confidence', () => {
    const result = classifyCategory('beli xyzzy 10rb');
    assert.equal(result.noKeywordMatch, true);
    assert.equal(result.category, TransactionCategory.KEBUTUHAN);
    assert.equal(result.confidence, 0.25);
    assert.deepEqual(result.matchedKeywords, []);
  });
});

describe('overlap resolution', () => {
  test('the longest keyword wins inside a span', () => {
    // Without this, `grab food` would also score via the nested `grab`,
    // turning a confident verdict into a near-tie.
    const result = classifyCategory('beli grab food 30rb');
    assert.equal(result.category, TransactionCategory.KEINGINAN);
    assert.equal(result.scores.kebutuhan, 0);
    assert.equal(result.confidence, 0.87);
    assert.deepEqual(result.matchedKeywords, ['grab food']);
  });

  test('multi-word keywords win over their parts', () => {
    const result = classifyCategory('top up game 50rb');
    assert.equal(result.category, TransactionCategory.KEINGINAN);
    assert.deepEqual(result.matchedKeywords, ['top up game']);
  });
});

describe('keyword matching', () => {
  test('matches hyphenated keywords after normalisation', () => {
    const result = classifyCategory('beli sesuatu tiba tiba 100rb');
    assert.equal(result.category, TransactionCategory.DARURAT);
  });

  test('does not match a keyword inside a longer word', () => {
    const result = classifyCategory('beli kopinya 20rb');
    assert.equal(result.noKeywordMatch, true);
  });

  test('empty input matches nothing', () => {
    const result = classifyCategory('');
    assert.equal(result.noKeywordMatch, true);
    assert.equal(result.confidence, 0.25);
  });
});
