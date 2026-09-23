/**
 * End-to-end parser tests (planning-nlp-transaction-parser.md §1, §11, §12)
 *
 * Covers the documented example verbatim, every `parse_status` branch, and
 * the mapping onto the existing `transactions` table.
 *
 * Run:  npm run test:nlp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const {
  parseTransaction,
  toTransactionRow,
  toParsedTransactionResponse,
  toBudgetCategory,
} = await import('../src/modules/nlp/transaction.parser.ts');
const { ParseStatus, ParseReason, TransactionCategory, MULTI_ITEM_ALERT } = await import(
  '../src/modules/nlp/nlp.constants.ts'
);

describe('the documented example', () => {
  const parsed = parseTransaction('gua abis beli kopi kenagan 20rb');

  test('produces the expected structure (§1)', () => {
    assert.equal(parsed.normalizedText, 'saya habis beli kopi kenangan 20rb');
    assert.equal(parsed.itemName, 'Kopi Kenangan');
    assert.equal(parsed.amount, 20000);
    assert.equal(parsed.category, TransactionCategory.KEINGINAN);
    assert.equal(parsed.categoryConfidence, 0.84);
    assert.equal(parsed.parseStatus, ParseStatus.AUTO);
    assert.equal(parsed.brand, 'Kopi Kenangan');
    assert.equal(parsed.anchor, 'beli');
    assert.deepEqual(parsed.reasons, []);
  });

  test('records the corrections it made', () => {
    assert.deepEqual(parsed.corrections, [
      { from: 'gua', to: 'saya', method: 'slang' },
      { from: 'abis', to: 'habis', method: 'slang' },
      { from: 'kenagan', to: 'kenangan', method: 'fuzzy' },
    ]);
  });

  test('is deterministic', () => {
    assert.deepEqual(parseTransaction('gua abis beli kopi kenagan 20rb'), parsed);
  });
});

describe('multi-item gate', () => {
  test('rejects and returns no partial parse', () => {
    const parsed = parseTransaction('beli kopi 20rb sama snack 15rb');
    assert.equal(parsed.parseStatus, ParseStatus.REJECTED_MULTI_ITEM);
    assert.equal(parsed.itemName, null);
    assert.equal(parsed.amount, null);
    assert.equal(parsed.category, null);
    assert.deepEqual(parsed.reasons, [ParseReason.MULTI_ITEM_DETECTED]);
    assert.ok(parsed.multiItemSignals.length > 0);
  });

  test('carries the alert copy for the UI', () => {
    const parsed = parseTransaction('beli kopi dan snack 35rb');
    assert.equal(parsed.parseStatus, ParseStatus.REJECTED_MULTI_ITEM);
    assert.deepEqual(parsed.alert, { ...MULTI_ITEM_ALERT });
  });

  test('the rejected row satisfies the schema CHECKs', () => {
    const row = toTransactionRow(parseTransaction('beli kopi 20rb sama snack 15rb'), 'user-1');
    assert.equal(row.title, null);
    assert.equal(row.amount, null);
    assert.equal(row.nlp_category, null);
    assert.equal(row.parse_status, 'rejected_multi_item');
  });
});

describe('needs_review branches', () => {
  test('a cancelled purchase', () => {
    const parsed = parseTransaction('gajadi beli kopi 20rb');
    assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
    assert.ok(parsed.reasons.includes(ParseReason.POSSIBLE_CANCELLATION));
    assert.equal(parsed.itemName, 'Kopi');
    assert.equal(parsed.amount, 20000);
  });

  test('a missing amount still yields the item and category', () => {
    const parsed = parseTransaction('abis beli kopi kenangan');
    assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
    assert.deepEqual(parsed.reasons, [ParseReason.MISSING_AMOUNT]);
    assert.equal(parsed.itemName, 'Kopi Kenangan');
    assert.equal(parsed.amount, null);
    assert.equal(parsed.category, TransactionCategory.KEINGINAN);
  });

  test('an ambiguous item goes to review instead of being guessed', () => {
    const parsed = parseTransaction('beli obat 30rb');
    assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
    assert.ok(parsed.reasons.includes(ParseReason.AMBIGUOUS_KEYWORD));
    assert.ok(parsed.reasons.includes(ParseReason.LOW_CONFIDENCE));
    assert.equal(parsed.category, TransactionCategory.KEBUTUHAN);
    assert.equal(parsed.categoryConfidence, 0.45);
  });

  test('a bare number is flagged as an uncertain amount', () => {
    const parsed = parseTransaction('beli kopi 20');
    assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
    assert.ok(parsed.reasons.includes(ParseReason.AMOUNT_UNCERTAIN));
    assert.equal(parsed.amount, 20);
  });

  test('an item outside the dictionary', () => {
    const parsed = parseTransaction('beli xyzzy 10rb');
    assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
    assert.ok(parsed.reasons.includes(ParseReason.UNKNOWN_ITEM));
    assert.equal(parsed.itemName, 'Xyzzy');
  });
});

describe('emergency disambiguation (§7)', () => {
  test('the same item flips class with a signal word', () => {
    const routine = parseTransaction('beli obat 30rb');
    const emergency = parseTransaction('beli obat di ugd 50rb');

    assert.equal(routine.category, TransactionCategory.KEBUTUHAN);
    assert.equal(emergency.category, TransactionCategory.DARURAT);
    assert.equal(emergency.parseStatus, ParseStatus.AUTO);
    // The display name stays clean; only the classification sees "ugd".
    assert.equal(emergency.itemName, 'Obat');
  });
});

describe('not a transaction', () => {
  test('an empty or contentless sentence', () => {
    for (const input of ['', '   ', '!!!']) {
      const parsed = parseTransaction(input);
      assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
      assert.deepEqual(parsed.reasons, [ParseReason.NO_TRANSACTION_SIGNAL]);
      assert.equal(parsed.category, null);
      assert.equal(parsed.itemName, null);
    }
  });

  test('a sentence with no purchase signal', () => {
    const parsed = parseTransaction('halo apa kabar');
    assert.deepEqual(parsed.reasons, [ParseReason.NO_TRANSACTION_SIGNAL]);
    assert.equal(parsed.itemName, null);
    assert.equal(parsed.category, null);
  });
});

describe('injected configuration', () => {
  test('a stricter threshold downgrades a confident parse', () => {
    const parsed = parseTransaction('beli kopi 20rb', { confidenceThreshold: 0.95 });
    assert.equal(parsed.parseStatus, ParseStatus.NEEDS_REVIEW);
    assert.ok(parsed.reasons.includes(ParseReason.LOW_CONFIDENCE));
  });
});

describe('item name quality', () => {
  test('a noun that looks like a verb is not a second purchase', () => {
    // Regression: `sewa` counted as a second purchase verb, so
    // "bayar sewa kost 1,5jt" was rejected as multi-item.
    const parsed = parseTransaction('bayar sewa kost 1,5jt');
    assert.equal(parsed.parseStatus, ParseStatus.AUTO);
    assert.equal(parsed.itemName, 'Sewa Kost');
    assert.equal(parsed.amount, 1500000);
    assert.equal(parsed.category, TransactionCategory.KEBUTUHAN);
  });

  test('receipt markers never leak into the item name', () => {
    // Regression: "total" was stored as part of the item name.
    const parsed = parseTransaction('beli kopi 20rb total 20rb');
    assert.equal(parsed.itemName, 'Kopi');
    assert.equal(parsed.parseStatus, ParseStatus.AUTO);
  });

  test('timing adverbs never leak into the item name', () => {
    const parsed = parseTransaction('servis motor mendadak 500rb');
    assert.equal(parsed.itemName, 'Servis Motor');
    assert.equal(parsed.category, TransactionCategory.DARURAT);
  });

  test('a nominal-free purchase still gets a usable name', () => {
    assert.equal(parseTransaction('sewa kost 1,5jt').itemName, 'Sewa Kost');
    assert.equal(parseTransaction('isi pulsa 50rb').itemName, 'Isi Pulsa');
    assert.equal(parseTransaction('langganan netflix 50rb').itemName, 'Netflix');
  });
});

describe('row mapping', () => {
  test('maps item_name → title and category → nlp_category', () => {
    const row = toTransactionRow(parseTransaction('bayar listrik 150rb'), 'user-42');
    assert.deepEqual(row, {
      user_id: 'user-42',
      title: 'Listrik',
      amount: 150000,
      nlp_category: 'kebutuhan',
      category_confidence: 0.87,
      extraction_method: 'rule_based',
      parse_status: 'auto',
      parse_reasons: [],
      raw_text: 'bayar listrik 150rb',
      normalized_text: 'bayar listrik 150rb',
    });
  });

  test('toBudgetCategory bridges to the 50/30/20 ledger', () => {
    assert.equal(toBudgetCategory(TransactionCategory.KEBUTUHAN), 'Needs');
    assert.equal(toBudgetCategory(TransactionCategory.DARURAT), 'Needs');
    assert.equal(toBudgetCategory(TransactionCategory.KEINGINAN), 'Wants');
    assert.equal(toBudgetCategory(null), null);
  });
});

describe('wire response (§1)', () => {
  test('uses the documented snake_case shape', () => {
    const response = toParsedTransactionResponse(parseTransaction('beli kopi 20rb'));
    assert.deepEqual(response, {
      raw_text: 'beli kopi 20rb',
      normalized_text: 'beli kopi 20rb',
      item_name: 'Kopi',
      amount: 20000,
      category: 'keinginan',
      confidence: 0.84,
      extraction_method: 'rule_based',
      parse_status: 'auto',
      reasons: [],
    });
  });

  test('includes the alert only when the gate fired', () => {
    const rejected = toParsedTransactionResponse(parseTransaction('beli kopi 20rb sama snack 15rb'));
    assert.equal(rejected.alert?.code, 'MULTI_ITEM_DETECTED');
    assert.equal(toParsedTransactionResponse(parseTransaction('beli kopi 20rb')).alert, undefined);
  });
});
