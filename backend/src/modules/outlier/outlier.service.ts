// ──────────────────────────────────────────────────────────
// costKu — Outlier Detection Service
// Identifies anomalous transactions using statistical & threshold rules
// ──────────────────────────────────────────────────────────

export interface OutlierCheckInput {
  amount: number;
  category?: 'Needs' | 'Wants' | 'Savings';
  monthlyIncome?: number;
  dailyLimit?: number;
  recentAmounts?: number[]; // past transaction amounts
}

export interface OutlierCheckResult {
  isOutlier: boolean;
  level: 'hard' | 'soft' | null;
  reason: string | null;
  threshold?: number;
  suggestions: ('add_income' | 'add_liability' | 'confirm')[];
}

/**
 * Calculate Interquartile Range (IQR) for an array of numbers.
 */
function calculateIqrBounds(values: number[]): { q1: number; q3: number; upperLimit: number } | null {
  if (values.length < 5) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);

  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // 1.5 * IQR is standard for mild outlier, 2.5 for significant
  const upperLimit = q3 + 2.5 * iqr;
  return { q1, q3, upperLimit };
}

/**
 * Check if a transaction amount is an outlier.
 */
export function evaluateTransactionOutlier(input: OutlierCheckInput): OutlierCheckResult {
  const { amount, monthlyIncome = 5000000, dailyLimit = 150000, recentAmounts = [] } = input;

  if (amount <= 0) {
    return {
      isOutlier: false,
      level: null,
      reason: null,
      suggestions: ['confirm'],
    };
  }

  // 1. HARD OUTLIER: Amount exceeds 80% of entire monthly income
  if (monthlyIncome > 0 && amount >= monthlyIncome * 0.8) {
    return {
      isOutlier: true,
      level: 'hard',
      reason: `Nominal Rp ${amount.toLocaleString('id-ID')} mencapai ${(
        (amount / monthlyIncome) *
        100
      ).toFixed(0)}% dari total penghasilan bulananmu. Pengeluaran besar ini dapat mengganggu cashflow harian.`,
      threshold: Math.round(monthlyIncome * 0.8),
      suggestions: ['add_income', 'add_liability', 'confirm'],
    };
  }

  // 2. STATISTICAL OUTLIER: using IQR if at least 5 past transactions exist
  if (recentAmounts.length >= 5) {
    const bounds = calculateIqrBounds(recentAmounts);
    if (bounds && amount > bounds.upperLimit) {
      return {
        isOutlier: true,
        level: 'soft',
        reason: `Nominal ini jauh lebih tinggi dari kebiasaan transaksi sebelumnya (batas wajar biasanya di bawah Rp ${Math.round(
          bounds.upperLimit
        ).toLocaleString('id-ID')}).`,
        threshold: Math.round(bounds.upperLimit),
        suggestions: ['add_income', 'add_liability', 'confirm'],
      };
    }
  }

  // 3. STATIC / DAILY LIMIT THRESHOLD (for newer users or when past data is sparse):
  // If amount > 5x base daily limit (or > Rp 1.500.000)
  const dailyMultipleThreshold = Math.max(1500000, dailyLimit * 5);
  if (amount >= dailyMultipleThreshold) {
    return {
      isOutlier: true,
      level: 'soft',
      reason: `Pengeluaran ini setara dengan lebih dari 5 hari batas jajan harianmu (Rp ${amount.toLocaleString(
        'id-ID'
      )}).`,
      threshold: dailyMultipleThreshold,
      suggestions: ['add_income', 'add_liability', 'confirm'],
    };
  }

  return {
    isOutlier: false,
    level: null,
    reason: null,
    suggestions: ['confirm'],
  };
}
