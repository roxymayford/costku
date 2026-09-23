// ──────────────────────────────────────────────────────────
// costKu — Frontend Outlier Detection Engine
// ──────────────────────────────────────────────────────────

export interface OutlierCheckInput {
  amount: number;
  monthlyIncome?: number;
  dailyLimit?: number;
  recentAmounts?: number[];
}

export interface OutlierCheckResult {
  isOutlier: boolean;
  level: 'hard' | 'soft' | null;
  reason: string | null;
  threshold?: number;
}

export function checkTransactionOutlier(input: OutlierCheckInput): OutlierCheckResult {
  const { amount, monthlyIncome = 5000000, dailyLimit = 150000, recentAmounts = [] } = input;

  if (amount <= 0) {
    return { isOutlier: false, level: null, reason: null };
  }

  // 1. HARD Outlier: > 70% of monthly income
  if (monthlyIncome > 0 && amount >= monthlyIncome * 0.7) {
    return {
      isOutlier: true,
      level: 'hard',
      reason: `Nominal Rp ${amount.toLocaleString('id-ID')} mencapai ${(
        (amount / monthlyIncome) *
        100
      ).toFixed(0)}% dari seluruh penghasilan bulananmu.`,
      threshold: Math.round(monthlyIncome * 0.7),
    };
  }

  // 2. Statistical IQR Outlier: if user has >= 5 transactions
  if (recentAmounts.length >= 5) {
    const sorted = [...recentAmounts].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const upperLimit = q3 + 2.5 * iqr;

    if (amount > upperLimit && amount > 500000) {
      return {
        isOutlier: true,
        level: 'soft',
        reason: `Nominal ini tidak lazim dibanding kebiasaan transaksi kamu sebelumnya (batas wajar biasanya di bawah Rp ${Math.round(
          upperLimit
        ).toLocaleString('id-ID')}).`,
        threshold: Math.round(upperLimit),
      };
    }
  }

  // 3. Static Outlier for users with few transactions: > 4x daily limit & > Rp 1.000.000
  const dailyThreshold = Math.max(1000000, dailyLimit * 4);
  if (amount >= dailyThreshold) {
    return {
      isOutlier: true,
      level: 'soft',
      reason: `Pengeluaran ini setara dengan lebih dari 4 hari jatah jajan harianmu (Rp ${amount.toLocaleString(
        'id-ID'
      )}).`,
      threshold: dailyThreshold,
    };
  }

  return { isOutlier: false, level: null, reason: null };
}
