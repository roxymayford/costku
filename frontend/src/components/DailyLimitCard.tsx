import React from 'react';
import { formatRupiah } from '../lib/calculator';

interface DailyLimitCardProps {
  dailyLimit: number; // Available today with rollover
  spentToday: number; // Effective spent today (spread-adjusted)
  spentTodayReal?: number; // Actual cash spent today
  daysRemaining: number;
  paydayDate: number;
  disposableMonthly: number;
  baseDailyLimit?: number;
  yesterdaySurplus?: number;
  carryOverEnabled?: boolean;
}

export const DailyLimitCard: React.FC<DailyLimitCardProps> = ({
  dailyLimit,
  spentToday,
  spentTodayReal,
  daysRemaining,
  paydayDate,
  disposableMonthly,
  baseDailyLimit,
  yesterdaySurplus = 0,
  carryOverEnabled = true,
}) => {
  const remainingToday = Math.max(0, dailyLimit - spentToday);
  const percentSpentToday = dailyLimit > 0 ? Math.min(100, (spentToday / dailyLimit) * 100) : 0;
  const isOverLimit = spentToday > dailyLimit;

  let statusClass = 'green';
  let statusText = 'Aman';

  if (isOverLimit) {
    statusClass = 'red';
    statusText = 'Sudah lewat batas';
  } else if (percentSpentToday > 75) {
    statusClass = 'orange';
    statusText = 'Mendekati batas';
  }

  return (
    <div className="daily-limit-widget terminal-card">
      <div className="widget-top">
        <div>
          <small className="accent">UNTUK HARI INI</small>
          <h4>BATAS JAJAN HARIAN</h4>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {carryOverEnabled && (
            <span
              style={{
                fontSize: '0.68rem',
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-muted)',
              }}
            >
              🔄 Rollover Aktif
            </span>
          )}
          <span className={`status-pill ${statusClass}`}>{statusText}</span>
        </div>
      </div>

      <div className="daily-amount-display">
        <span className="unit-label">BOLEH JAJAN HARI INI</span>
        <strong className="limit-amount">{formatRupiah(dailyLimit)}</strong>

        {/* Rollover notice badge */}
        {carryOverEnabled && yesterdaySurplus !== 0 && (
          <div
            style={{
              fontSize: '0.8rem',
              marginTop: '0.35rem',
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              background: yesterdaySurplus > 0 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: yesterdaySurplus > 0 ? '#4ade80' : '#f87171',
              border: `1px solid ${yesterdaySurplus > 0 ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
            }}
          >
            {yesterdaySurplus > 0
              ? `✨ Sisa ${formatRupiah(yesterdaySurplus)} dari hari sebelumnya otomatis terbawa ke hari ini!`
              : `⚠️ Overbudget ${formatRupiah(Math.abs(yesterdaySurplus))} dari hari sebelumnya dipotong ke hari ini.`}
          </div>
        )}

        <span className="formula-hint" style={{ marginTop: '0.4rem' }}>
          {baseDailyLimit
            ? `Jatah dasar ${formatRupiah(baseDailyLimit)}/hari · Disesuaikan dengan pemakaian riil & sisa kemarin`
            : 'Dihitung dari pemasukan bersih − biaya tetap − target tabungan, dibagi hari siklus gajian'}
        </span>
      </div>

      <div className="daily-progress-section">
        <div className="progress-labels">
          <span>
            Beban hari ini: <b>{formatRupiah(spentToday)}</b>
            {spentTodayReal !== undefined && spentTodayReal !== spentToday && (
              <small style={{ marginLeft: '0.3rem', color: 'var(--text-muted)' }}>
                (Kas riil: {formatRupiah(spentTodayReal)})
              </small>
            )}
          </span>
          <span>Sisa: <b className={isOverLimit ? 'red-text' : 'green-text'}>{formatRupiah(remainingToday)}</b></span>
        </div>
        <div className="swiss-progress-bar">
          <div
            className={`progress-fill ${statusClass}-fill`}
            style={{ width: `${percentSpentToday}%` }}
          />
        </div>
      </div>

      <div className="cycle-metadata-grid">
        <div>
          <small>TANGGAL GAJIAN</small>
          <b>Setiap tanggal {paydayDate}</b>
        </div>
        <div>
          <small>SISA HARI</small>
          <b className="accent">{daysRemaining} hari lagi</b>
        </div>
        <div>
          <small>UANG BEBAS BULAN INI</small>
          <b>{formatRupiah(disposableMonthly)}</b>
        </div>
      </div>
    </div>
  );
};
