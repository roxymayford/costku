/**
 * Multi-item gate tests (planning-nlp-transaction-parser.md §4.2)
 *
 * The gate is the highest-stakes part of the pipeline: a false negative
 * silently merges two purchases into one row. These tests pin the signals
 * *and* the deliberate non-triggers, so a future tweak cannot quietly make
 * the gate trigger-happy.
 *
 * Run:  npm run test:nlp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { normalizeText, buildNormalizerDictionary } = await import(
  '../src/modules/nlp/text-normalizer.ts'
);
const { extractAmounts } = await import('../src/modules/nlp/amount.extractor.ts');
const { detectMultiItem } = await import('../src/modules/nlp/multi-item.guard.ts');

const dictionary = buildNormalizerDictionary();

function verdictOf(text: string) {
  const normalized = normalizeText(text, dictionary);
  return detectMultiItem(normalized.tokens, extractAmounts(normalized.tokens));
}

describe('single-item sentences pass the gate', () => {
  test('the documented example', () => {
    assert.equal(verdictOf('gua abis beli kopi kenagan 20rb').detected, false);
  });

  test('a plain recurring expense', () => {
    assert.equal(verdictOf('bayar listrik 150rb').detected, false);
  });

  test('a connector *after* the amount is not a second item', () => {
    // "sama teman" is company, not a second purchase.
    assert.equal(verdictOf('beli kopi 20rb sama teman').detected, false);
  });

  test('a discount or summary line is not a second item', () => {
    for (const input of [
      'beli kopi 20rb diskon 5rb',
      'beli kopi 20rb total 20rb',
      'beli kopi 20rb cashback 2rb',
      'beli kopi 20rb potongan 3rb',
    ]) {
      assert.equal(verdictOf(input).detected, false, `should not fire on "${input}"`);
    }
  });

  test('`terus` used as a sequence marker is not a connector', () => {
    // §4.2 names the "terus beli" pattern — plain "terus" means "then".
    assert.equal(verdictOf('beli kopi terus pulang').detected, false);
  });

  test('a sentence with no purchase signal at all is left to the parser', () => {
    assert.equal(verdictOf('halo apa kabar').detected, false);
  });
});

describe('multi-item sentences are rejected', () => {
  test('two nominals joined by a connector', () => {
    const verdict = verdictOf('beli kopi 20rb sama snack 15rb');
    assert.equal(verdict.detected, true);
    assert.ok(verdict.signals.includes('multiple_amounts'), verdict.signals.join(','));
  });

  test('the `dan` variant', () => {
    assert.equal(verdictOf('beli kopi 20rb dan snack 15rb').detected, true);
  });

  test('two items but a single combined nominal', () => {
    // Only one amount, so the nominal count alone would miss this one.
    const verdict = verdictOf('beli kopi dan snack 35rb');
    assert.equal(verdict.detected, true);
    assert.ok(verdict.signals.includes('connector_splitting_items'), verdict.signals.join(','));
  });

  test('a second cost that is not a discount', () => {
    assert.equal(verdictOf('beli kopi 20rb ongkir 5rb').detected, true);
  });

  test('two purchase verbs', () => {
    const verdict = verdictOf('beli kopi terus beli snack 35rb');
    assert.equal(verdict.detected, true);
    assert.ok(verdict.signals.includes('multiple_purchase_verbs'), verdict.signals.join(','));
  });

  test('the "terus beli" pattern named in the plan', () => {
    assert.equal(verdictOf('beli kopi 20rb terus beli parkir 5rb').detected, true);
  });

  test('two items with no price at all are still caught', () => {
    // Nothing to extract, but the user clearly meant two purchases —
    // "input satu per kalimat" is the more useful answer than "no amount".
    const verdict = verdictOf('beli kopi dan snack');
    assert.equal(verdict.detected, true);
    assert.ok(verdict.signals.includes('connector_splitting_items'), verdict.signals.join(','));
  });
});

describe('signals', () => {
  test('reports the connector position signal explicitly', () => {
    const verdict = verdictOf('beli kopi 20rb sama snack 15rb');
    assert.ok(verdict.signals.includes('connector_between_amounts'), verdict.signals.join(','));
  });

  test('returns an empty signal list when nothing fires', () => {
    assert.deepEqual(verdictOf('bayar listrik 150rb').signals, []);
  });
});
