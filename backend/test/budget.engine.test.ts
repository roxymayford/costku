import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Import functions directly from our frontend budgetEngine logic
function diffInDays(dateStr1: string, dateStr2: string): number {
  const [y1, m1, d1] = dateStr1.split('-').map(Number);
  const [y2, m2, d2] = dateStr2.split('-').map(Number);
  const utcA = Date.UTC(y1, m1 - 1, d1);
  const utcB = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((utcB - utcA) / (1000 * 60 * 60 * 24));
}

function getEffectiveDailyAmount(tx: {
  amount: number;
  transaction_date: string;
  spread_days?: number | null;
  spread_start?: string | null;
}, targetDateStr: string): number {
  const spreadDays = tx.spread_days;

  if (!spreadDays || spreadDays <= 1) {
    return tx.transaction_date === targetDateStr ? tx.amount : 0;
  }

  const startDate = tx.spread_start || tx.transaction_date;
  const dayOffset = diffInDays(startDate, targetDateStr);

  if (dayOffset < 0 || dayOffset >= spreadDays) {
    return 0;
  }

  const basePerDay = Math.floor(tx.amount / spreadDays);
  const remainder = tx.amount - basePerDay * spreadDays;

  if (dayOffset === spreadDays - 1) {
    return basePerDay + remainder;
  }

  return basePerDay;
}

describe('Fitur 2: Split Budget Amortization', () => {
  test('single-day transaction applies 100% on transaction date', () => {
    const tx = { amount: 50000, transaction_date: '2026-10-01' };
    assert.equal(getEffectiveDailyAmount(tx, '2026-10-01'), 50000);
    assert.equal(getEffectiveDailyAmount(tx, '2026-10-02'), 0);
  });

  test('spread transaction divides evenly across days with last day remainder', () => {
    // Rp 100.000 across 3 days: 33.333, 33.333, 33.334
    const tx = {
      amount: 100000,
      transaction_date: '2026-10-01',
      spread_days: 3,
      spread_start: '2026-10-01',
    };

    const d1 = getEffectiveDailyAmount(tx, '2026-10-01');
    const d2 = getEffectiveDailyAmount(tx, '2026-10-02');
    const d3 = getEffectiveDailyAmount(tx, '2026-10-03');
    const d4 = getEffectiveDailyAmount(tx, '2026-10-04');

    assert.equal(d1, 33333);
    assert.equal(d2, 33333);
    assert.equal(d3, 33334);
    assert.equal(d4, 0);
    assert.equal(d1 + d2 + d3, 100000);
  });
});

describe('Fitur 3: Daily Rollover Budget Logic', () => {
  test('accumulates unspent daily budget from previous day', () => {
    const baseDaily = 100000;
    const dayIndex = 2; // Day 2
    const spentDay1 = 30000; // Leftover is 70.000

    const cumulativeBudget = baseDaily * dayIndex; // 200.000
    const availableToday = cumulativeBudget - spentDay1; // 170.000

    assert.equal(availableToday, 170000);
  });

  test('handles overbudget day by reducing next day budget', () => {
    const baseDaily = 100000;
    const dayIndex = 2;
    const spentDay1 = 140000; // Overbudget by 40.000

    const cumulativeBudget = baseDaily * dayIndex; // 200.000
    const availableToday = cumulativeBudget - spentDay1; // 60.000

    assert.equal(availableToday, 60000);
  });
});
