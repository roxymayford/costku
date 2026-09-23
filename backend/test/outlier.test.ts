import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTransactionOutlier } from '../src/modules/outlier/outlier.service.js';

describe('Fitur 5: Outlier Detection Service', () => {
  test('flags HARD outlier when transaction exceeds 80% of monthly income', () => {
    const res = evaluateTransactionOutlier({
      amount: 4500000,
      monthlyIncome: 5000000,
      dailyLimit: 120000,
      recentAmounts: [50000, 75000, 100000, 60000, 80000],
    });

    assert.equal(res.isOutlier, true);
    assert.equal(res.level, 'hard');
    assert.match(res.reason || '', /90%/);
  });

  test('flags statistical IQR outlier when amount is significantly above recent history', () => {
    // Normal spending is around 30k - 80k
    const recent = [30000, 40000, 45000, 50000, 55000, 60000, 75000];
    const res = evaluateTransactionOutlier({
      amount: 2500000,
      monthlyIncome: 10000000,
      dailyLimit: 250000,
      recentAmounts: recent,
    });

    assert.equal(res.isOutlier, true);
    assert.equal(res.level, 'soft');
    assert.match(res.reason || '', /kebiasaan transaksi/);
  });

  test('does not flag normal everyday transactions', () => {
    const res = evaluateTransactionOutlier({
      amount: 45000,
      monthlyIncome: 6000000,
      dailyLimit: 150000,
      recentAmounts: [30000, 50000, 45000, 60000, 55000],
    });

    assert.equal(res.isOutlier, false);
    assert.equal(res.level, null);
  });
});
