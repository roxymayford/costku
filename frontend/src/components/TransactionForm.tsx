import React, { useState } from 'react';
import { CurrencyInput } from './CurrencyInput';
import { formatRupiah } from '../lib/calculator';
import { checkTransactionOutlier, OutlierCheckResult } from '../lib/outlierEngine';
import { OutlierWarning } from './OutlierWarning';
import { Icon } from './Icon';

interface TransactionFormProps {
  onAddTransaction: (tx: {
    title: string;
    amount: number;
    category: 'Needs' | 'Wants' | 'Savings';
    transaction_date: string;
    spread_days?: number | null;
    spread_start?: string | null;
    is_outlier?: boolean;
    outlier_level?: 'hard' | 'soft' | null;
    outlier_reason?: string | null;
    confirmed_by_user?: boolean;
  }) => Promise<void> | void;
  monthlyIncome?: number;
  dailyLimit?: number;
  recentAmounts?: number[];
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  onAddTransaction,
  monthlyIncome = 5000000,
  dailyLimit = 150000,
  recentAmounts = [],
}) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<'Needs' | 'Wants' | 'Savings'>('Needs');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Split budget state
  const [isSplit, setIsSplit] = useState(false);
  const [spreadDays, setSpreadDays] = useState<number>(14);

  // Outlier pending confirmation state
  const [pendingOutlier, setPendingOutlier] = useState<OutlierCheckResult | null>(null);

  const executeAdd = async (outlierMeta?: {
    is_outlier: boolean;
    outlier_level: 'hard' | 'soft' | null;
    outlier_reason: string | null;
    confirmed_by_user: boolean;
  }) => {
    setIsSubmitting(true);
    try {
      await onAddTransaction({
        title: title.trim(),
        amount,
        category,
        transaction_date: date,
        spread_days: isSplit && spreadDays > 1 ? spreadDays : null,
        spread_start: isSplit && spreadDays > 1 ? date : null,
        is_outlier: outlierMeta?.is_outlier || false,
        outlier_level: outlierMeta?.outlier_level || null,
        outlier_reason: outlierMeta?.outlier_reason || null,
        confirmed_by_user: outlierMeta?.confirmed_by_user || false,
      });

      // Reset form
      setTitle('');
      setAmount(0);
      setIsSplit(false);
      setSpreadDays(14);
      setPendingOutlier(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) return;

    // Check for outlier
    const outlierCheck = checkTransactionOutlier({
      amount,
      monthlyIncome,
      dailyLimit,
      recentAmounts,
    });

    if (outlierCheck.isOutlier) {
      setPendingOutlier(outlierCheck);
      return;
    }

    await executeAdd();
  };

  const handleConfirmOutlier = async () => {
    if (!pendingOutlier) return;
    await executeAdd({
      is_outlier: true,
      outlier_level: pendingOutlier.level,
      outlier_reason: pendingOutlier.reason,
      confirmed_by_user: true,
    });
  };

  const dailySplitAmount =
    isSplit && spreadDays > 1 && amount > 0
      ? Math.round(amount / spreadDays)
      : null;

  return (
    <>
      <form className="transaction-quick-form" onSubmit={handleSubmit}>
        <div className="form-head">
          <small className="accent">CATAT PENGELUARAN</small>
          <h4>TAMBAH TRANSAKSI</h4>
        </div>

        <label className="field-group">
          <span className="field-label">UNTUK APA?</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Beras 5 kg / Belanja Mingguan / Token Listrik"
            required
            autoComplete="off"
          />
        </label>

        <label className="field-group">
          <span className="field-label">BERAPA?</span>
          <CurrencyInput
            value={amount}
            onChange={setAmount}
            placeholder="0"
            required
          />
        </label>

        {/* SPLIT BUDGET ACCORDION / TOGGLE */}
        <div className="split-budget-box" style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.75rem 0.85rem',
          margin: '0.25rem 0 0.5rem 0',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={isSplit}
              onChange={(e) => setIsSplit(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              Bagi pemakaian ke beberapa hari? (Split Budget)
            </span>
          </label>

          {isSplit && (
            <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Masa pemakaian:</span>
                <input
                  type="number"
                  min="2"
                  max="90"
                  value={spreadDays}
                  onChange={(e) => setSpreadDays(Math.max(2, Math.min(90, Number(e.target.value) || 2)))}
                  style={{ width: '80px', padding: '0.35rem 0.5rem', textAlign: 'center' }}
                />
                <span style={{ fontSize: '0.82rem' }}>hari</span>
              </div>

              {dailySplitAmount && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--accent)' }}>
                  💡 Efektif memotong batas harian <b>{formatRupiah(dailySplitAmount)}/hari</b> selama {spreadDays} hari (tidak membebani 1 hari sekaligus).
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-two-cols">
          <label className="field-group">
            <span className="field-label">MASUK KATEGORI MANA?</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'Needs' | 'Wants' | 'Savings')}
              className="category-select"
            >
              <option value="Needs">Kebutuhan pokok</option>
              <option value="Wants">Keinginan &amp; gaya hidup</option>
              <option value="Savings">Tabungan &amp; investasi</option>
            </select>
          </label>

          <label className="field-group">
            <span className="field-label">TANGGAL</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="transaction-date-input"
              required
            />
          </label>
        </div>

        <button
          type="submit"
          className="pill dark submit-btn"
          disabled={isSubmitting || !title.trim() || amount <= 0}
        >
          {isSubmitting ? 'Menyimpan…' : '+ Catat Transaksi'}
        </button>
      </form>

      {/* OUTLIER CONFIRMATION MODAL */}
      {pendingOutlier && (
        <OutlierWarning
          title={title}
          amount={amount}
          reason={pendingOutlier.reason || 'Nominal pengeluaran ini sangat besar dibanding batas harian.'}
          level={pendingOutlier.level || 'soft'}
          onConfirm={handleConfirmOutlier}
          onCancel={() => setPendingOutlier(null)}
        />
      )}
    </>
  );
};
