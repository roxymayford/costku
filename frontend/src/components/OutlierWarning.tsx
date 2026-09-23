import React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatRupiah } from '../lib/calculator';
import { Icon } from './Icon';

interface OutlierWarningProps {
  title: string;
  amount: number;
  reason: string;
  level: 'hard' | 'soft';
  onConfirm: () => void;
  onCancel: () => void;
}

export const OutlierWarning: React.FC<OutlierWarningProps> = ({
  title,
  amount,
  reason,
  level,
  onConfirm,
  onCancel,
}) => {
  const navigate = useNavigate();

  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="confirm-dialog outlier-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className={`confirm-dialog__icon ${level === 'hard' ? 'danger-icon' : 'warning-icon'}`}>
          <Icon name="alert" size={26} />
        </div>

        <small className={level === 'hard' ? 'red-text' : 'accent'} style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
          {level === 'hard'
            ? <><Icon name="alert" size={13} /> PERINGATAN PENGELUARAN SANGAT BESAR</>
            : <><Icon name="lightbulb" size={13} /> DETEKSI TRANSAKSI ANOMALI</>}
        </small>

        <h3 style={{ margin: '0.4rem 0 0.6rem 0', fontSize: '1.25rem' }}>
          Yakin ingin mencatat {formatRupiah(amount)}?
        </h3>

        <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          {reason}
        </p>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.85rem',
            margin: '1rem 0',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
            OPSI LEBIH BIJAK UNTUK POS KEUANGAN:
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="tag-btn"
              onClick={() => {
                onCancel();
                navigate('/pemasukan');
              }}
              style={{ justifyContent: 'flex-start', padding: '0.5rem 0.75rem', width: '100%' }}
            >
              <Icon name="wallet" size={14} /> Ini didanai pemasukan lain (Catat di Pemasukan)
            </button>
            <button
              type="button"
              className="tag-btn"
              onClick={() => {
                onCancel();
                navigate('/cicilan');
              }}
              style={{ justifyContent: 'flex-start', padding: '0.5rem 0.75rem', width: '100%' }}
            >
              <Icon name="clock" size={14} /> Ini dibayar dengan cicilan / paylater (Catat di Cicilan)
            </button>
          </div>
        </div>

        <div className="confirm-dialog__actions" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="pill" onClick={onCancel}>
            Ubah Nominal
          </button>
          <button type="button" className="pill dark" onClick={onConfirm}>
            Tetap Catat Transaksi
          </button>
        </div>
      </div>
    </div>
  );
};
