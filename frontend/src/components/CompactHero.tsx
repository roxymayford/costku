import React, { useState } from 'react';
import { Icon } from './Icon';
import { formatRupiah } from '../lib/calculator';

export interface CompactHeroProps {
  userName?: string;
  dailyLimit: number; // Available today with rollover
  spentToday: number; // Effective spent today (spread-adjusted)
  spentTodayReal?: number; // Actual cash spent today
  baseDailyLimit?: number;
  yesterdaySurplus?: number;
  carryOverEnabled?: boolean;
  paydayDate: number;
  daysRemaining: number;
  isPremium?: boolean;
  effectiveIncome?: number;
  fixedExpenses?: number;
  totalLiabilities?: number;
  disposableMonthly?: number;
  healthScore?: number;
  onNavigate?: (path: string) => void;
}

export const CompactHero: React.FC<CompactHeroProps> = ({
  userName,
  dailyLimit,
  spentToday,
  spentTodayReal,
  baseDailyLimit,
  yesterdaySurplus = 0,
  carryOverEnabled = true,
  paydayDate,
  daysRemaining,
  isPremium = true,
  effectiveIncome = 0,
  fixedExpenses = 0,
  totalLiabilities = 0,
  disposableMonthly = 0,
  healthScore = 0,
  onNavigate,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const remainingToday = Math.max(0, dailyLimit - spentToday);
  const percentSpent = dailyLimit > 0 ? Math.min(100, (spentToday / dailyLimit) * 100) : 0;
  const isOverLimit = spentToday > dailyLimit;

  let statusClass = 'green';
  let statusText = 'Aman';
  if (isOverLimit) {
    statusClass = 'red';
    statusText = 'Lewat batas';
  } else if (percentSpent > 75) {
    statusClass = 'orange';
    statusText = 'Mendekati batas';
  }

  const firstName = userName ? userName.split(' ')[0] : '';

  return (
    <section className="compact-hero-card" aria-label="Ringkasan Batas Jajan Harian">
      {/* TOP ROW: Label & Detail Toggle */}
      <div className="compact-hero-top">
        <div className="compact-hero-label-wrap">
          <span className="compact-hero-eyebrow">
            SISA JAJAN HARI INI
            {!isPremium && (
              <span className="compact-hero-pro-chip">
                <Icon name="lock" size={10} /> PRO
              </span>
            )}
          </span>
          {firstName && (
            <span className="compact-hero-greeting">
              Hai, <b>{firstName}</b>
            </span>
          )}
        </div>

        <div className="compact-hero-actions">
          <span className={`status-pill ${statusClass}`}>{statusText}</span>
          <button
            type="button"
            className="compact-hero-toggle-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Tutup detail keuangan' : 'Lihat detail keuangan'}
          >
            <span>{isExpanded ? 'Tutup' : 'Detail'}</span>
            <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
        </div>
      </div>

      {/* HERO NUMBER */}
      <div className="compact-hero-amount-row">
        <strong className={`compact-hero-amount ${isOverLimit ? 'red-text' : ''}`}>
          {isPremium ? formatRupiah(remainingToday) : '—'}
        </strong>
      </div>

      {/* SUBTITLE: Jatah vs Terpakai */}
      <div className="compact-hero-subtitle">
        {isPremium ? (
          <>
            dari jatah <b>{formatRupiah(dailyLimit)}</b> · terpakai{' '}
            <b className={isOverLimit ? 'red-text' : ''}>{formatRupiah(spentToday)}</b>
            {spentTodayReal !== undefined && spentTodayReal !== spentToday && (
              <span className="compact-hero-real-spent"> (kas riil: {formatRupiah(spentTodayReal)})</span>
            )}
          </>
        ) : (
          <span>Batas jajan adaptif tersedia di paket Pro</span>
        )}
      </div>

      {/* PROGRESS BAR (4px hairline Swiss) */}
      <div className="compact-hero-progress-track" role="progressbar" aria-valuenow={Math.round(percentSpent)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`compact-hero-progress-fill ${statusClass}-fill`}
          style={{ width: `${isPremium ? percentSpent : 0}%` }}
        />
      </div>

      {/* METADATA LINE */}
      <div className="compact-hero-meta-line">
        <span>Gajian tgl <b>{paydayDate}</b> · <b>{daysRemaining} hari lagi</b></span>
        {carryOverEnabled && yesterdaySurplus !== 0 && (
          <span className="compact-hero-rollover-tag">
            · Carry-over {yesterdaySurplus > 0 ? `+${formatRupiah(yesterdaySurplus)}` : formatRupiah(yesterdaySurplus)}
          </span>
        )}
      </div>

      {/* EXPANDABLE DETAIL DRAWER */}
      {isExpanded && (
        <div className="compact-hero-expanded-panel">
          <div className="compact-hero-expanded-grid">
            <div className="compact-hero-stat-cell">
              <small>TOTAL PEMASUKAN</small>
              <b>{formatRupiah(effectiveIncome)}</b>
            </div>
            <div className="compact-hero-stat-cell">
              <small>BIAYA TETAP</small>
              <b>{formatRupiah(fixedExpenses)}</b>
            </div>
            {totalLiabilities > 0 && (
              <div className="compact-hero-stat-cell">
                <small>CICILAN / PAYLATER</small>
                <b className="red-text">{formatRupiah(totalLiabilities)}</b>
              </div>
            )}
            <div className="compact-hero-stat-cell">
              <small>UANG BEBAS BULAN INI</small>
              <b>{formatRupiah(disposableMonthly)}</b>
            </div>
            <div className="compact-hero-stat-cell">
              <small>SKOR KESEHATAN</small>
              <b className={healthScore >= 70 ? 'green-text' : healthScore >= 50 ? 'accent' : 'red-text'}>
                {isPremium ? `${healthScore} / 100` : '— (Pro)'}
              </b>
            </div>
            {baseDailyLimit !== undefined && (
              <div className="compact-hero-stat-cell">
                <small>JATAH DASAR</small>
                <b>{formatRupiah(baseDailyLimit)}/hari</b>
              </div>
            )}
          </div>

          {onNavigate && (
            <div className="compact-hero-expanded-links">
              <button
                type="button"
                className="compact-hero-link-btn"
                onClick={() => onNavigate('/alokasi')}
              >
                Atur Alokasi 50/30/20 <Icon name="arrowRight" size={12} />
              </button>
              <button
                type="button"
                className="compact-hero-link-btn"
                onClick={() => onNavigate('/onboarding')}
              >
                Edit Profil &amp; Biaya <Icon name="arrowRight" size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
