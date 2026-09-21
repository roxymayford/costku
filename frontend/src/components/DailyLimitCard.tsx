import React from 'react';
import { formatRupiah } from '../lib/calculator';

interface DailyLimitCardProps {
  dailyLimit: number;
  spentToday: number;
  daysRemaining: number;
  paydayDate: number;
  disposableMonthly: number;
}

export const DailyLimitCard: React.FC<DailyLimitCardProps> = ({
  dailyLimit,
  spentToday,
  daysRemaining,
  paydayDate,
  disposableMonthly,
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
        <span className={`status-pill ${statusClass}`}>{statusText}</span>
      </div>

      <div className="daily-amount-display">
        <span className="unit-label">BOLEH JAJAN MAKSIMAL</span>
        <strong className="limit-amount">{formatRupiah(dailyLimit)}</strong>
        <span className="formula-hint">
          Dihitung dari gaji bersih − biaya tetap − target tabungan, dibagi sisa hari sampai gajian
        </span>
      </div>

      <div className="daily-progress-section">
        <div className="progress-labels">
          <span>Sudah dipakai: <b>{formatRupiah(spentToday)}</b></span>
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
