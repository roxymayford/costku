import React, { useState, useMemo } from 'react';
import { Income, IncomeType, INCOME_TYPE_LABELS, INCOME_TYPE_COLORS } from '../lib/incomeApi';
import { formatRupiah } from '../lib/calculator';
import { Icon } from './Icon';

interface IncomeListProps {
  incomes: Income[];
  onDeleteIncome: (id: string) => Promise<void> | void;
  onEditIncome?: (income: Income) => void;
}

const formatDisplayDate = (dateStr: string) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
};

export const IncomeList: React.FC<IncomeListProps> = ({
  incomes,
  onDeleteIncome,
  onEditIncome,
}) => {
  const [filterType, setFilterType] = useState<'all' | IncomeType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Income | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    return incomes.filter((item) => {
      const matchType = filterType === 'all' || item.type === filterType;
      const text = `${item.label || ''} ${INCOME_TYPE_LABELS[item.type] || ''}`.toLowerCase();
      const matchQuery = text.includes(searchQuery.toLowerCase());
      return matchType && matchQuery;
    });
  }, [incomes, filterType, searchQuery]);

  const totalVisible = useMemo(() => {
    return filtered.reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [filtered]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteIncome(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="transaction-ledger-section income-ledger-section">
      <div className="ledger-controls-bar">
        <div className="controls-left">
          <small className="accent">RIWAYAT MASUK</small>
          <h4>DAFTAR PEMASUKAN</h4>
        </div>

        <div className="controls-right">
          <div className="search-input-wrap">
            <Icon name="search" size={14} className="search-input-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Cari pemasukan…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari pemasukan"
            />
          </div>

          <div className="category-filter-pills" role="group" aria-label="Filter jenis pemasukan">
            <button
              type="button"
              className={`filter-pill ${filterType === 'all' ? 'active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              Semua
            </button>
            {(['gaji', 'freelance', 'bonus', 'lainnya'] as IncomeType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`filter-pill ${filterType === t ? 'active' : ''}`}
                onClick={() => setFilterType(t)}
              >
                {INCOME_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ledger-summary-strip">
        <span>Menampilkan <b>{filtered.length}</b> pemasukan</span>
        <span>Total <b>{formatRupiah(totalVisible)}</b></span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-ledger-box">
          <p>Belum ada pemasukan yang tercatat untuk filter ini.</p>
          <small>Tambahkan pemasukan baru seperti freelance, bonus, atau gaji lewat form di samping.</small>
        </div>
      ) : (
        <div className="ledger-table-container">
          <table className="swiss-ledger-table">
            <thead>
              <tr>
                <th>TANGGAL</th>
                <th>SUMBER / KETERANGAN</th>
                <th>JENIS</th>
                <th style={{ textAlign: 'right' }}>NOMINAL</th>
                <th style={{ textAlign: 'center' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="ledger-table-row">
                  <td className="tx-date-cell">{formatDisplayDate(item.date)}</td>
                  <td className="tx-title-cell">
                    <b>{item.label || INCOME_TYPE_LABELS[item.type]}</b>
                  </td>
                  <td className="tx-cat-cell">
                    <span className={`cat-tag cat-${INCOME_TYPE_COLORS[item.type] || 'green'}`}>
                      {INCOME_TYPE_LABELS[item.type]}
                    </span>
                  </td>
                  <td className="tx-amount-cell green-text" style={{ textAlign: 'right' }}>
                    <strong>+{formatRupiah(item.amount)}</strong>
                  </td>
                  <td className="tx-action-cell" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'center' }}>
                      {onEditIncome && (
                        <button
                          type="button"
                          className="tx-delete-btn"
                          onClick={() => onEditIncome(item)}
                          title="Edit pemasukan"
                          aria-label={`Edit ${item.label || 'pemasukan'}`}
                        >
                          <Icon name="settings" size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="tx-delete-btn"
                        onClick={() => setPendingDelete(item)}
                        title="Hapus pemasukan"
                        aria-label={`Hapus ${item.label || 'pemasukan'}`}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* MOBILE CARD VIEW */}
          <ul className="ledger-mobile-list">
            {filtered.map((item) => (
              <li key={item.id} className="ledger-mobile-item">
                <div className="ledger-mobile-main">
                  <b className="ledger-mobile-title">{item.label || INCOME_TYPE_LABELS[item.type]}</b>
                  <span className="ledger-mobile-meta">
                    {formatDisplayDate(item.date)} · {INCOME_TYPE_LABELS[item.type]}
                  </span>
                </div>
                <strong className="ledger-mobile-amount green-text">
                  +{formatRupiah(item.amount)}
                </strong>
                <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                  {onEditIncome && (
                    <button
                      type="button"
                      className="tx-delete-btn"
                      onClick={() => onEditIncome(item)}
                      aria-label={`Edit ${item.label || 'pemasukan'}`}
                    >
                      <Icon name="settings" size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="tx-delete-btn"
                    onClick={() => setPendingDelete(item)}
                    aria-label={`Hapus ${item.label || 'pemasukan'}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {pendingDelete && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => !isDeleting && setPendingDelete(null)}
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__icon">
              <Icon name="alert" size={22} />
            </div>
            <h4>Hapus pemasukan ini?</h4>
            <p>
              <b>{pendingDelete.label || INCOME_TYPE_LABELS[pendingDelete.type]}</b> sebesar{' '}
              <b>{formatRupiah(pendingDelete.amount)}</b> akan dihapus dari catatan.
            </p>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="pill"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
              >
                Batal
              </button>
              <button
                type="button"
                className="pill danger"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
