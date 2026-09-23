import React, { useState } from 'react';
import { CurrencyInput } from './CurrencyInput';
import { Income, IncomeType, INCOME_TYPE_LABELS } from '../lib/incomeApi';
import { Icon } from './Icon';

interface IncomeFormProps {
  onAddIncome: (data: {
    type: IncomeType;
    label: string | null;
    amount: number;
    date: string;
    is_recurring: boolean;
    frequency: 'monthly' | 'weekly' | null;
  }) => Promise<void> | void;
  initialData?: Income | null;
  onCancel?: () => void;
}

export const IncomeForm: React.FC<IncomeFormProps> = ({
  onAddIncome,
  initialData,
  onCancel,
}) => {
  const [type, setType] = useState<IncomeType>(initialData?.type || 'gaji');
  const [label, setLabel] = useState(initialData?.label || '');
  const [amount, setAmount] = useState(initialData?.amount || 0);
  const [date, setDate] = useState(
    initialData?.date || new Date().toISOString().slice(0, 10)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    setIsSubmitting(true);
    try {
      await onAddIncome({
        type,
        label: label.trim() || null,
        amount,
        date,
        is_recurring: false,
        frequency: null,
      });

      if (!initialData) {
        setLabel('');
        setAmount(0);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="transaction-quick-form income-form-card" onSubmit={handleSubmit}>
      <div className="form-head">
        <small className="accent">SUMBER PEMASUKAN</small>
        <h4>{initialData ? 'EDIT PEMASUKAN' : 'CATAT PEMASUKAN BARU'}</h4>
      </div>

      <label className="field-group">
        <span className="field-label">JENIS PEMASUKAN</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as IncomeType)}
          className="category-select"
        >
          <option value="gaji">{INCOME_TYPE_LABELS.gaji}</option>
          <option value="freelance">{INCOME_TYPE_LABELS.freelance}</option>
          <option value="bonus">{INCOME_TYPE_LABELS.bonus}</option>
          <option value="lainnya">{INCOME_TYPE_LABELS.lainnya}</option>
        </select>
      </label>

      <label className="field-group">
        <span className="field-label">KETERANGAN / SUMBER DANA</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Contoh: Gaji PT Sejahtera / Proyek Redesign Logo"
          autoComplete="off"
        />
      </label>

      <label className="field-group">
        <span className="field-label">NOMINAL MASUK</span>
        <CurrencyInput
          value={amount}
          onChange={setAmount}
          placeholder="0"
          required
        />
      </label>

      <label className="field-group">
        <span className="field-label">TANGGAL PENERIMAAN</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="transaction-date-input"
          required
        />
      </label>

      <div className="form-actions-row" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        {onCancel && (
          <button
            type="button"
            className="pill"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Batal
          </button>
        )}
        <button
          type="submit"
          className="pill dark submit-btn"
          disabled={isSubmitting || amount <= 0}
          style={{ flex: 1 }}
        >
          {isSubmitting ? (
            'Menyimpan…'
          ) : (
            <span className="inline-flex items-center gap-1.5 justify-center">
              <Icon name="plus" size={14} />
              {initialData ? 'Simpan Perubahan' : 'Tambah Pemasukan'}
            </span>
          )}
        </button>
      </div>
    </form>
  );
};
