/**
 * Hybrid NLP parser tests — verifying ML integration and graceful fallback.
 *
 * Tests:
 * 1. Fallback to rule-based when ML service is unreachable.
 * 2. Successful categorization with ML response.
 * 3. Graceful handling of network timeouts / errors.
 * 4. Preservation of multi-item alerts and amount extractions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  parseTransactionAsync,
  predictCategoryWithML,
  ParseStatus,
  ExtractionMethod,
  TransactionCategory,
} from '../src/modules/nlp/index.js';

test('hybrid NLP parsing — fallback to rule-based when ML service is offline', async () => {
  // Point to a non-existent port
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:59999';
  process.env.ENABLE_ML_CLASSIFIER = 'true';

  const result = await parseTransactionAsync('beli kopi kenangan 20rb', { timeoutMs: 300 });

  assert.equal(result.itemName, 'Kopi Kenangan');
  assert.equal(result.amount, 20_000);
  assert.equal(result.category, TransactionCategory.KEINGINAN);
  // Confirmed fallback: extractionMethod stays rule_based
  assert.equal(result.extractionMethod, ExtractionMethod.RULE_BASED);
  assert.equal(result.parseStatus, ParseStatus.AUTO);
});

test('hybrid NLP parsing — respects ENABLE_ML_CLASSIFIER=false', async () => {
  process.env.ENABLE_ML_CLASSIFIER = 'false';

  const result = await parseTransactionAsync('bayar listrik pln 150rb');

  assert.equal(result.category, TransactionCategory.KEBUTUHAN);
  assert.equal(result.extractionMethod, ExtractionMethod.RULE_BASED);
});

test('hybrid NLP parsing — multi-item gate short-circuits without querying ML', async () => {
  process.env.ENABLE_ML_CLASSIFIER = 'true';
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:59999';

  const result = await parseTransactionAsync('beli kopi 20rb sama snack 15rb');

  assert.equal(result.parseStatus, ParseStatus.REJECTED_MULTI_ITEM);
  assert.equal(result.itemName, null);
  assert.equal(result.amount, null);
  assert.ok(result.alert);
});

test('hybrid NLP parsing — successfully upgrades to ml_model when ML service responds', async () => {
  // Spin up an ephemeral HTTP server mocking the Flask ML microservice
  const mockServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/predict') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            category: 'keinginan',
            confidence: 0.98,
            probabilities: {
              kebutuhan: 0.01,
              keinginan: 0.98,
              darurat: 0.01,
            },
            extraction_method: 'ml_model',
            model_version: '1.0.0',
            text: JSON.parse(body).text,
          })
        );
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const address = mockServer.address() as { port: number };
  const mockUrl = `http://127.0.0.1:${address.port}`;

  try {
    process.env.ML_SERVICE_URL = mockUrl;
    process.env.ENABLE_ML_CLASSIFIER = 'true';

    // 1. Direct client test
    const prediction = await predictCategoryWithML('beli boba kekinian 25rb');
    assert.ok(prediction);
    assert.equal(prediction.category, 'keinginan');
    assert.equal(prediction.confidence, 0.98);
    assert.equal(prediction.extraction_method, 'ml_model');

    // 2. Full hybrid parse test
    const parsed = await parseTransactionAsync('beli boba kekinian 25rb');
    assert.equal(parsed.category, TransactionCategory.KEINGINAN);
    assert.equal(parsed.categoryConfidence, 0.98);
    assert.equal(parsed.extractionMethod, ExtractionMethod.ML_MODEL);
    assert.equal(parsed.parseStatus, ParseStatus.AUTO);
  } finally {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});
