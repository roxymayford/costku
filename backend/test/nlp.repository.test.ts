/**
 * Dictionary loading, persistence and the service seam.
 *
 * Covers §6 (schema) and §8 (data collection): the seed lexicons must work
 * standalone, database rows must override them, and a broken dictionary
 * table must never take the parser down.
 *
 * Run:  npm run test:nlp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const {
  loadNlpDictionaries,
  seedDictionaryBundle,
  mergeSlangRows,
  mergeKeywordRows,
  mergeProductRows,
  createMemoryNlpRepository,
} = await import('../src/modules/nlp/nlp.repository.ts');
const { initializeNlpParser, parseTransactionWithDictionary, parseAndPersist, submitCorrection, nlpModuleInfo } =
  await import('../src/modules/nlp/nlp.service.ts');
const { SLANG_DICTIONARY } = await import('../src/modules/nlp/data/slang.dictionary.ts');
const { CATEGORY_KEYWORDS } = await import('../src/modules/nlp/data/category-keywords.ts');
const { PRODUCT_DICTIONARY } = await import('../src/modules/nlp/data/product.dictionary.ts');

describe('seed bundle', () => {
  test('ships a non-empty lexicon for every table', () => {
    const bundle = seedDictionaryBundle();
    assert.equal(Object.keys(bundle.slang).length, Object.keys(SLANG_DICTIONARY).length);
    assert.equal(bundle.keywords.length, CATEGORY_KEYWORDS.length);
    assert.equal(bundle.products.length, PRODUCT_DICTIONARY.length);
    assert.deepEqual(bundle.loadedFrom, {
      slang: 'seed',
      keywords: 'seed',
      products: 'seed',
    });
  });

  test('no source means seed only', async () => {
    const bundle = await loadNlpDictionaries(null);
    assert.deepEqual(bundle.loadedFrom, {
      slang: 'seed',
      keywords: 'seed',
      products: 'seed',
    });
  });

  test('every seed keyword uses a valid category and weight', () => {
    for (const entry of CATEGORY_KEYWORDS) {
      assert.ok(['kebutuhan', 'keinginan', 'darurat'].includes(entry.category), entry.keyword);
      assert.ok(entry.weight >= 1 && entry.weight <= 10, entry.keyword);
    }
  });

  test('no seed slang value is multi-word', () => {
    // Multi-word values would desynchronise token positions.
    for (const [alias, canonical] of Object.entries(SLANG_DICTIONARY)) {
      assert.ok(!/\s/u.test(canonical), `${alias} → "${canonical}"`);
      assert.ok(!/\s/u.test(alias), `alias "${alias}"`);
    }
  });
});

describe('merging database rows', () => {
  test('slang rows extend the seed and skip multi-word values', () => {
    const merged = mergeSlangRows({ a: 'b' }, [
      { slang_word: 'KOS', normalized_word: 'KOST' },
      { slang_word: 'x', normalized_word: 'dua kata' },
      { slang_word: '', normalized_word: 'y' },
    ]);
    assert.deepEqual(merged, { a: 'b', kos: 'kost' });
  });

  test('keyword rows override the seed by keyword', () => {
    const merged = mergeKeywordRows(
      [{ keyword: 'kopi', category: 'keinginan', weight: 3 }],
      [{ keyword: 'KOPI', category: 'keinginan', weight: 5 }]
    );
    assert.deepEqual(merged, [
      { keyword: 'kopi', category: 'keinginan', weight: 5, ambiguous: false },
    ]);
  });

  test('keyword rows with an invalid category are ignored', () => {
    const merged = mergeKeywordRows([], [
      { keyword: 'nope', category: 'bukan-kategori' as never, weight: 3 },
    ]);
    assert.deepEqual(merged, []);
  });

  test('product rows replace aliases wholesale', () => {
    const merged = mergeProductRows(
      [{ name: 'X', aliases: ['x'] }],
      [{ name: 'X', aliases: ['xx', 'x x'] }]
    );
    assert.deepEqual(merged, [{ name: 'X', aliases: ['xx', 'x x'], categoryHint: undefined }]);
  });
});

describe('degrading per table', () => {
  test('a failing table falls back to the seed for that table only', async () => {
    const bundle = await loadNlpDictionaries({
      async loadSlang() {
        throw new Error('boom');
      },
      async loadKeywords() {
        return [{ keyword: 'mie instan', category: 'kebutuhan', weight: 3 }];
      },
      async loadProducts() {
        throw new Error('boom');
      },
    });

    assert.deepEqual(bundle.loadedFrom, {
      slang: 'seed',
      keywords: 'supabase',
      products: 'seed',
    });
    assert.equal(bundle.slang.gua, 'saya');
    assert.ok(bundle.keywords.some((entry) => entry.keyword === 'mie instan'));
  });
});

describe('in-memory repository', () => {
  test('stores rows and filters the review queue', async () => {
    const repo = createMemoryNlpRepository();
    assert.equal(repo.backend, 'memory');

    const auto = await repo.saveTransaction({
      user_id: 'u1',
      title: 'Kopi',
      amount: 20000,
      nlp_category: 'keinginan',
      category_confidence: 0.84,
      extraction_method: 'rule_based',
      parse_status: 'auto',
      parse_reasons: [],
      raw_text: 'beli kopi 20rb',
      normalized_text: 'beli kopi 20rb',
    });
    await repo.saveTransaction({
      user_id: 'u1',
      title: null,
      amount: null,
      nlp_category: null,
      category_confidence: 0,
      extraction_method: 'rule_based',
      parse_status: 'rejected_multi_item',
      parse_reasons: ['multi_item_detected'],
      raw_text: 'beli kopi 20rb sama snack 15rb',
      normalized_text: 'beli kopi 20rb sama snack 15rb',
    });

    assert.ok(auto.id);
    assert.deepEqual(await repo.listReviewQueue('u1'), []);
    assert.equal((await repo.listReviewQueue('someone-else')).length, 0);
  });

  test('updates a row in place', async () => {
    const repo = createMemoryNlpRepository();
    const { id } = await repo.saveTransaction({
      user_id: 'u1',
      title: 'Obat',
      amount: 30000,
      nlp_category: 'kebutuhan',
      category_confidence: 0.45,
      extraction_method: 'rule_based',
      parse_status: 'needs_review',
      parse_reasons: ['ambiguous_keyword'],
      raw_text: 'beli obat 30rb',
      normalized_text: 'beli obat 30rb',
    });

    await repo.updateTransaction(id, { nlp_category: 'keinginan', parse_status: 'auto' });
    const [row] = await repo.listReviewQueue('u1');
    assert.equal(row, undefined, 'the row should have left the review queue');
  });

  test('logs corrections', async () => {
    const repo = createMemoryNlpRepository();
    const { id } = await repo.recordCorrection({
      userId: 'u1',
      transactionId: null,
      rawText: 'beli obat 30rb',
      normalizedText: 'beli obat 30rb',
      predictedCategory: 'kebutuhan',
      correctedCategory: 'keinginan',
      predictedItem: 'Obat',
      correctedItem: 'Obat',
      predictedAmount: 30000,
      correctedAmount: 30000,
      source: 'nlp_review',
    });
    assert.ok(id);
  });
});

describe('service', () => {
  test('parseAndPersist writes the parsed row', async () => {
    const repo = createMemoryNlpRepository();
    const { parsed, transactionId, response } = await parseAndPersist(
      'u1',
      'bayar listrik 150rb',
      repo
    );

    assert.equal(parsed.parseStatus, 'auto');
    assert.equal(response.category, 'kebutuhan');
    assert.ok(transactionId);
    assert.deepEqual(await repo.listReviewQueue('u1'), []);
  });

  test('a rejected multi-item sentence is still logged', async () => {
    const repo = createMemoryNlpRepository();
    const { response } = await parseAndPersist('u1', 'beli kopi 20rb sama snack 15rb', repo);
    assert.equal(response.parse_status, 'rejected_multi_item');
    assert.equal(response.item_name, null);
    assert.equal(response.amount, null);
    assert.ok(response.alert);
  });

  test('a correction applies manual_override and leaves the review queue', async () => {
    const repo = createMemoryNlpRepository();
    const { parsed, transactionId } = await parseAndPersist('u1', 'beli obat 30rb', repo);
    assert.equal(parsed.parseStatus, 'needs_review');
    assert.equal((await repo.listReviewQueue('u1')).length, 1);

    const result = await submitCorrection(
      {
        userId: 'u1',
        transactionId,
        parsed,
        correctedCategory: 'keinginan',
        correctedItem: 'Obat Batuk',
      },
      repo
    );

    assert.ok(result.feedbackId);
    assert.equal(result.row.extraction_method, 'manual_override');
    assert.equal(result.row.parse_status, 'auto');
    assert.equal(result.row.title, 'Obat Batuk');
    assert.equal(result.row.category_confidence, 1);
    assert.deepEqual(await repo.listReviewQueue('u1'), []);
  });

  test('a correction that clears the amount stays in review', async () => {
    const repo = createMemoryNlpRepository();
    const { parsed, transactionId } = await parseAndPersist('u1', 'beli kopi 20rb', repo);

    const result = await submitCorrection(
      { userId: 'u1', transactionId, parsed, correctedCategory: 'keinginan', correctedAmount: null },
      repo
    );

    // The schema requires an amount for `auto`; the service must not try to
    // write a row the database would reject.
    assert.equal(result.row.parse_status, 'needs_review');
  });
});

describe('dictionary override end to end', () => {
  test('a database keyword row changes the verdict', async () => {
    // Seed says boba → keinginan.
    assert.equal(parseTransactionWithDictionary('beli boba 25rb').category, 'keinginan');

    await initializeNlpParser({
      force: true,
      source: {
        async loadSlang() {
          return [];
        },
        async loadKeywords() {
          return [{ keyword: 'boba', category: 'darurat', weight: 6 }];
        },
        async loadProducts() {
          return [];
        },
      },
    });

    const overridden = parseTransactionWithDictionary('beli boba 25rb');
    assert.equal(overridden.category, 'darurat');
    assert.equal(overridden.parseStatus, 'auto');

    // Restore the seed so nothing else in this file inherits the override.
    await initializeNlpParser({ force: true, source: null });
    assert.equal(parseTransactionWithDictionary('beli boba 25rb').category, 'keinginan');
  });
});

describe('diagnostics', () => {
  test('reports the runtime configuration', () => {
    const info = nlpModuleInfo();
    assert.equal(info.engine, 'classical-rule-based');
    assert.equal(info.confidenceThreshold, 0.7);
    assert.ok(info.dictionary.slang > 0);
    assert.ok(['supabase', 'memory'].includes(info.storage));
  });
});
