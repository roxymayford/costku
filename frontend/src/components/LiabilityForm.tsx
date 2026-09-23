import React, { useState } from 'react';
import { CurrencyInput } from './CurrencyInput';
import { Liability, LiabilityType, LIABILITY_TYPE_LABELS } from '../lib/liabilityApi';
import { Icon } from './Icon';

interface LiabilityFormProps {
  onAddLiability: (data: {
    name: string;
    type: LiabilityType;
    monthly_amount: number;
    due_day: number;
    remaining_tenor: number | null;
    total_amount: number | null;
  }) => Promise<void> | void;
  initialData?: Liability | null;
  onCancel?: () => void;
}

export const LiabilityForm: React.FC<LiabilityFormProps> = ({
  onAddLiability,
  initialData,
  onCancel,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [type, setType] = useState<LiabilityType>(initialData?.type || 'cicilan');
  const [monthlyAmount, setMonthlyAmount] = useState(initialData?.monthly_amount || 0);
  const [dueDay, setDueDay] = useState(initialData?.due_day || 10);
  const [remainingTenor, setRemainingTenor] = useState<number | ''>(
    initialData?.remaining_tenor !== null && initialData?.remaining_tenor !== undefined
      ? initialData.remaining_tenor
      : ''
  );
  const [totalAmount, setTotalAmount] = useState<number>(initialData?.total_amount || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || monthlyAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await onAddLiability({
        name: name.trim(),
        type,
        monthly_amount: monthlyAmount,
        due_day: Math.min(31, Math.max(1, Number(dueDay) || 1)),
        remaining_tenor: remainingTenor !== '' ? Math.max(1, Number(remainingTenor)) : null,
        total_amount: totalAmount > 0 ? totalAmount : null,
      });

      if (!initialData) {
        setName('');
        setMonthlyAmount(0);
        setRemainingTenor('');
        setTotalAmount(0);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="transaction-quick-form liability-form-card" onSubmit={handleSubmit}>
      <div className="form-head">
        <small className="accent">KOMITMEN BULANAN</small>
        <h4>{initialData ? 'EDIT CICILAN / PAYLATER' : 'TAMBAH CICILAN / PAYLATER'}</h4>
      </div>

      <label className="field-group">
        <span className="field-label">NAMA CICILAN / LAYANAN</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: KPR BTN / Shopee PayLater / Cicilan Laptop"
          required
          autoComplete="off"
        />
      </label>

      <div className="form-two-cols">
        <label className="field-group">
          <span className="field-label">JENIS KEWAJIBAN</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LiabilityType)}
            className="category-select"
          >
            <option value="cicilan">{LIABILITY_TYPE_LABELS.cicilan}</option>
            <option value="paylater">{LIABILITY_TYPE_LABELS.paylater}</option>
          </select>
        </label>

        <label className="field-group">
          <span className="field-label">JATUH TEMPO (TGL)</span>
          <input
            type="number"
            min="1"
            max="31"
            value={dueDay}
            onChange={(e) => setDueDay(Number(e.target.value))}
            className="transaction-date-input"
            required
          />
        </label>
      </div>

      <label className="field-group">
        <span className="field-label">TAGIHAN / ANGSURAN PER BULAN</span>
        <CurrencyInput
          value={monthlyAmount}
          onChange={setMonthlyAmount}
          placeholder="0"
          required
        />
      </label>

      <div className="form-two-cols">
        <label className="field-group">
          <span className="field-label">SISA TENOR (BULAN)</span>
          <input
            type="number"
            min="1"
            max="360"
            value={remainingTenor}
            onChange={(e) => setRemainingTenor(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="Opsional (kosong = kontinu)"
          />
        </label>

        <label className="field-group">
          <span className="field-label">TOTAL POKOK (OPSIONAL)</span>
          <CurrencyInput
            value={totalAmount}
            onChange={setTotalAmount}
            placeholder="0"
          />
        </label>
      </div>

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
          disabled={isSubmitting || !name.trim() || monthlyAmount <= 0}
          style={{ flex: 1 }}
        >
          {isSubmitting ? (
            'Menyimpan…'
          ) : (
            <span className="inline-flex items-center gap-1.5 justify-center">
              <Icon name="clock" size={14} />
              {initialData ? 'Simpan Perubahan' : 'Daftarkan Cicilan'}
            </span>
          )}
        </button>
      </div>
    </form>
  );
};
