import React, { useState, useMemo } from 'react';
import { Transaction } from '../lib/storage';
import { formatRupiah } from '../lib/calculator';
import { Icon } from './Icon';

interface TransactionListProps {
  transactions: Transaction[];
  onDeleteTransaction: (id: string) => Promise<void> | void;
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

const CATEGORY_LABEL: Record<string, string> = {
  All: 'Semua',
  Needs: 'Kebutuhan',
  Wants: 'Keinginan',
  Savings: 'Tabungan',
};

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onDeleteTransaction,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Needs' | 'Wants' | 'Savings'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter((item) => {
      const matchCat = categoryFilter === 'All' || item.category === categoryFilter;
      const matchQuery = item.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [transactions, categoryFilter, searchQuery]);

  const totalVisible = useMemo(() => {
    return filtered.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filtered]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteTransaction(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="transaction-ledger-section">
      <div className="ledger-controls-bar">
        <div className="controls-left">
          <small className="accent">RIWAYAT</small>
          <h4>TRANSAKSI TERAKHIR</h4>
        </div>

        <div className="controls-right">
          <div className="search-input-wrap">
            <Icon name="search" size={14} className="search-input-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Cari transaksi…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari transaksi"
            />
          </div>

          <div className="category-filter-pills" role="group" aria-label="Filter kategori">
            {(['All', 'Needs', 'Wants', 'Savings'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                className={`filter-pill ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
                aria-pressed={categoryFilter === cat}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ledger-summary-strip">
        <span>Menampilkan <b>{filtered.length}</b> transaksi</span>
        <span>Total <b>{formatRupiah(totalVisible)}</b></span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-ledger-box">
          <p>Belum ada transaksi yang cocok dengan filter ini.</p>
          <small>Coba ganti filter, atau catat pengeluaran baru lewat formulir di atas.</small>
        </div>
      ) : (
        <div className="ledger-table-container">
          <table className="swiss-ledger-table">
            <thead>
              <tr>
                <th>TANGGAL</th>
                <th>KETERANGAN</th>
                <th>KATEGORI</th>
                <th style={{ textAlign: 'right' }}>NOMINAL</th>
                <th style={{ textAlign: 'center' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx.id} className="ledger-table-row">
                  <td className="tx-date-cell">{formatDisplayDate(tx.transaction_date)}</td>
                  <td className="tx-title-cell">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <b>{tx.title}</b>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {tx.spread_days && tx.spread_days > 1 && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Icon name="calendar" size={11} /> Dibagi {tx.spread_days} hari ({formatRupiah(Math.round(tx.amount / tx.spread_days))}/hari)
                          </span>
                        )}
                        {tx.is_outlier && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                            title={tx.outlier_reason || 'Pengeluaran signifikan'}
                          >
                            <Icon name="alert" size={11} /> Pengeluaran Besar
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="tx-cat-cell">
                    <span className={`cat-tag cat-${tx.category.toLowerCase()}`}>
                      {CATEGORY_LABEL[tx.category] || tx.category}
                    </span>
                  </td>
                  <td className="tx-amount-cell" style={{ textAlign: 'right' }}>
                    <strong>{formatRupiah(tx.amount)}</strong>
                  </td>
                  <td className="tx-action-cell" style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="tx-delete-btn"
                      onClick={() => setPendingDelete(tx)}
                      title="Hapus transaksi"
                      aria-label={`Hapus transaksi ${tx.title}`}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* MOBILE CARD LAYOUT (replaces horizontal scroll on small screens) */}
          <ul className="ledger-mobile-list">
            {filtered.map((tx) => (
              <li key={tx.id} className="ledger-mobile-item">
                <div className="ledger-mobile-main">
                  <b className="ledger-mobile-title">{tx.title}</b>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', margin: '0.15rem 0' }}>
                    {tx.spread_days && tx.spread_days > 1 && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                        }}
                      >
                        <Icon name="calendar" size={10} /> {tx.spread_days} hari ({formatRupiah(Math.round(tx.amount / tx.spread_days))}/hr)
                      </span>
                    )}
                    {tx.is_outlier && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                        }}
                      >
                        <Icon name="alert" size={10} /> Outlier
                      </span>
                    )}
                  </div>
                  <span className="ledger-mobile-meta">
                    {formatDisplayDate(tx.transaction_date)} · {CATEGORY_LABEL[tx.category] || tx.category}
                  </span>
                </div>
                <strong className="ledger-mobile-amount">{formatRupiah(tx.amount)}</strong>
                <button
                  type="button"
                  className="tx-delete-btn"
                  onClick={() => setPendingDelete(tx)}
                  aria-label={`Hapus transaksi ${tx.title}`}
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {pendingDelete && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          onClick={() => !isDeleting && setPendingDelete(null)}
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__icon">
              <Icon name="alert" size={22} />
            </div>
            <h4 id="confirm-delete-title">Hapus transaksi ini?</h4>
            <p>
              <b>{pendingDelete.title}</b> sebesar <b>{formatRupiah(pendingDelete.amount)}</b> akan
              dihapus permanen. Tindakan ini tidak bisa dibatalkan.
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
