import React from 'react';
import { Icon } from './Icon';
import { formatRupiah } from '../lib/calculator';

interface AlertBannerProps {
  isOverWants: boolean;
  wantsSpent: number;
  targetWants: number;
  isOverDaily: boolean;
  dailySpent: number;
  dailyLimit: number;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  isOverWants,
  wantsSpent,
  targetWants,
  isOverDaily,
  dailySpent,
  dailyLimit,
}) => {
  if (!isOverWants && !isOverDaily) {
    return null;
  }

  const wantsExcess = wantsSpent - targetWants;
  const dailyExcess = dailySpent - dailyLimit;

  return (
    <div className="alert-banner-stack">
      {isOverDaily && (
        <div className="swiss-alert alert-daily-exceeded">
          <div className="alert-icon"><Icon name="bolt" size={20} /></div>
          <div className="alert-content">
            <b>Jajan hari ini sudah lewat batas</b>
            <p>
              Kamu sudah belanja {formatRupiah(dailySpent)} hari ini, sedangkan batasnya{' '}
              {formatRupiah(dailyLimit)} — lebih <span className="bold-excess">{formatRupiah(dailyExcess)}</span>.
              Santai saja, tapi coba tahan jajan besok supaya saldo akhir bulan tetap aman.
            </p>
          </div>
          <span className="alert-tag">Lewat batas harian</span>
        </div>
      )}

      {isOverWants && (
        <div className="swiss-alert alert-wants-exceeded">
          <div className="alert-icon"><Icon name="alert" size={20} /></div>
          <div className="alert-content">
            <b>Jatah jajan &amp; hobi bulan ini sudah habis</b>
            <p>
              Pengeluaran untuk keinginan (ngopi, hobi, jalan) sudah {formatRupiah(wantsSpent)}, melebihi
              anggaran {formatRupiah(targetWants)} sebanyak{' '}
              <span className="bold-excess">{formatRupiah(wantsExcess)}</span>. Coba tunda dulu
              belanja yang belum mendesak sampai gajian berikutnya.
            </p>
          </div>
          <span className="alert-tag">Jajan lewat anggaran</span>
        </div>
      )}
    </div>
  );
};
