import React, { useState, useMemo } from 'react';
import { Liability, LiabilityType, LIABILITY_TYPE_LABELS } from '../lib/liabilityApi';
import { formatRupiah } from '../lib/calculator';
import { Icon } from './Icon';

interface LiabilityListProps {
  liabilities: Liability[];
  onDeleteLiability: (id: string) => Promise<void> | void;
  onEditLiability?: (liability: Liability) => void;
  onPayMonth?: (id: string) => Promise<void> | void;
}

export const LiabilityList: React.FC<LiabilityListProps> = ({
  liabilities,
  onDeleteLiability,
  onEditLiability,
  onPayMonth,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paid_off'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Liability | null>(null);
  const [pendingPay, setPendingPay] = useState<Liability | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const filtered = useMemo(() => {
    return liabilities.filter((item) => {
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const text = `${item.name} ${LIABILITY_TYPE_LABELS[item.type] || ''}`.toLowerCase();
      const matchQuery = text.includes(searchQuery.toLowerCase());
      return matchStatus && matchQuery;
    });
  }, [liabilities, statusFilter, searchQuery]);

  const totalMonthlyActive = useMemo(() => {
    return liabilities
      .filter((l) => l.status === 'active')
      .reduce((sum, curr) => sum + Number(curr.monthly_amount), 0);
  }, [liabilities]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsProcessing(true);
    try {
      await onDeleteLiability(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPay = async () => {
    if (!pendingPay || !onPayMonth) return;
    setIsProcessing(true);
    try {
      await onPayMonth(pendingPay.id);
      setPendingPay(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="transaction-ledger-section liability-ledger-section">
      <div className="ledger-controls-bar">
        <div className="controls-left">
          <small className="accent">STATUS CICILAN &amp; PAYLATER</small>
          <h4>DAFTAR KEWAJIBAN</h4>
        </div>

        <div className="controls-right">
          <div className="search-input-wrap">
            <Icon name="search" size={14} className="search-input-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Cari cicilan…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Cari cicilan"
            />
          </div>

          <div className="category-filter-pills" role="group" aria-label="Filter status">
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Aktif
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'paid_off' ? 'active' : ''}`}
              onClick={() => setStatusFilter('paid_off')}
            >
              Lunas
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Semua
            </button>
          </div>
        </div>
      </div>

      <div className="ledger-summary-strip">
        <span>Menampilkan <b>{filtered.length}</b> kewajiban</span>
        <span>Total Komitmen Bulanan Aktif: <b className="red-text">{formatRupiah(totalMonthlyActive)}</b></span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-ledger-box">
          <p>Belum ada catatan cicilan atau paylater yang cocok.</p>
          <small>Daftarkan komitmen bulananmu agar otomatis dipotong dari batas jajan harian.</small>
        </div>
      ) : (
        <div className="ledger-table-container">
          <table className="swiss-ledger-table">
            <thead>
              <tr>
                <th>NAMA KEWAJIBAN</th>
                <th>JENIS</th>
                <th>JATUH TEMPO</th>
                <th>SISA TENOR</th>
                <th style={{ textAlign: 'right' }}>ANGSURAN / BLN</th>
                <th style={{ textAlign: 'center' }}>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="ledger-table-row">
                  <td className="tx-title-cell">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <b>{item.name}</b>
                      {item.total_amount && (
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          Pokok: {formatRupiah(item.total_amount)}
                        </small>
                      )}
                    </div>
                  </td>
                  <td className="tx-cat-cell">
                    <span className={`cat-tag cat-${item.type === 'paylater' ? 'wants' : 'needs'}`}>
                      {LIABILITY_TYPE_LABELS[item.type]}
                    </span>
                  </td>
                  <td className="tx-date-cell">
                    Setiap tgl <b>{item.due_day}</b>
                  </td>
                  <td className="tx-date-cell">
                    {item.status === 'paid_off' ? (
                      <span className="green-text" style={{ fontWeight: 600 }}>✅ Lunas</span>
                    ) : item.remaining_tenor !== null ? (
                      <span><b>{item.remaining_tenor}</b> bln lagi</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Kontinu</span>
                    )}
                  </td>
                  <td className="tx-amount-cell red-text" style={{ textAlign: 'right' }}>
                    <strong>{formatRupiah(item.monthly_amount)}</strong>
                  </td>
                  <td className="tx-action-cell" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                      {item.status === 'active' && onPayMonth && (
                        <button
                          type="button"
                          className="tag-btn"
                          onClick={() => setPendingPay(item)}
                          title="Tandai sudah bayar bulan ini"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                        >
                          <Icon name="check" size={12} /> Bayar
                        </button>
                      )}
                      {onEditLiability && (
                        <button
                          type="button"
                          className="tx-delete-btn"
                          onClick={() => onEditLiability(item)}
                          title="Edit cicilan"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Icon name="settings" size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="tx-delete-btn"
                        onClick={() => setPendingDelete(item)}
                        title="Hapus cicilan"
                        aria-label={`Hapus ${item.name}`}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* MOBILE LIST */}
          <ul className="ledger-mobile-list">
            {filtered.map((item) => (
              <li key={item.id} className="ledger-mobile-item">
                <div className="ledger-mobile-main">
                  <b className="ledger-mobile-title">{item.name}</b>
                  <span className="ledger-mobile-meta">
                    {LIABILITY_TYPE_LABELS[item.type]} · Tgl {item.due_day} ·{' '}
                    {item.status === 'paid_off'
                      ? 'Lunas'
                      : item.remaining_tenor !== null
                      ? `Sisa ${item.remaining_tenor} bln`
                      : 'Kontinu'}
                  </span>
                </div>
                <strong className="ledger-mobile-amount red-text">
                  {formatRupiah(item.monthly_amount)}
                </strong>
                <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                  {item.status === 'active' && onPayMonth && (
                    <button
                      type="button"
                      className="tx-delete-btn"
                      onClick={() => setPendingPay(item)}
                      title="Bayar bulan ini"
                      aria-label="Bayar"
                    >
                      <Icon name="check" size={13} />
                    </button>
                  )}
                  {onEditLiability && (
                    <button
                      type="button"
                      className="tx-delete-btn"
                      onClick={() => onEditLiability(item)}
                      aria-label="Edit"
                    >
                      <Icon name="settings" size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="tx-delete-btn"
                    onClick={() => setPendingDelete(item)}
                    aria-label="Hapus"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PAY CONFIRMATION MODAL */}
      {pendingPay && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => !isProcessing && setPendingPay(null)}
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__icon green-icon">
              <Icon name="check" size={22} />
            </div>
            <h4>Catat Pembayaran Bulan Ini?</h4>
            <p>
              Tandai angsuran <b>{pendingPay.name}</b> sebesar <b>{formatRupiah(pendingPay.monthly_amount)}</b> sebagai lunas untuk bulan ini.
              {typeof pendingPay.remaining_tenor === 'number' && (
                <span> Sisa tenor akan berkurang menjadi <b>{Math.max(0, pendingPay.remaining_tenor - 1)}</b> bulan.</span>
              )}
            </p>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="pill"
                onClick={() => setPendingPay(null)}
                disabled={isProcessing}
              >
                Batal
              </button>
              <button
                type="button"
                className="pill dark"
                onClick={confirmPay}
                disabled={isProcessing}
              >
                {isProcessing ? 'Memproses…' : 'Ya, Sudah Bayar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {pendingDelete && (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => !isProcessing && setPendingDelete(null)}
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog__icon">
              <Icon name="alert" size={22} />
            </div>
            <h4>Hapus catatan cicilan ini?</h4>
            <p>
              <b>{pendingDelete.name}</b> akan dihapus dari daftar komitmen bulananmu.
            </p>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="pill"
                onClick={() => setPendingDelete(null)}
                disabled={isProcessing}
              >
                Batal
              </button>
              <button
                type="button"
                className="pill danger"
                onClick={confirmDelete}
                disabled={isProcessing}
              >
                {isProcessing ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
