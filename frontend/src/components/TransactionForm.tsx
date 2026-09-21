import React, { useState } from 'react';
import { CurrencyInput } from './CurrencyInput';

interface TransactionFormProps {
  onAddTransaction: (tx: {
    title: string;
    amount: number;
    category: 'Needs' | 'Wants' | 'Savings';
    transaction_date: string;
  }) => Promise<void> | void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ onAddTransaction }) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<'Needs' | 'Wants' | 'Savings'>('Needs');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) return;

    setIsSubmitting(true);
    try {
      await onAddTransaction({
        title: title.trim(),
        amount,
        category,
        transaction_date: date,
      });
      // Reset form
      setTitle('');
      setAmount(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
          placeholder="Contoh: Kopi Janji Jiwa / Belanja Alfamart"
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
  );
};
