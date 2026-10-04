import React from 'react';
import { CountUp } from '../../../components/motion/CountUp';

export const Numbers: React.FC = () => {
  return (
    <section className="lp-numbers">
      <div className="swiss-section-meta">
        <span>ANGKA BICARA</span>
        <span>FAKTA BUKAN KALIMAT</span>
      </div>
      <div className="lp-numbers-grid">
        {/* 1. Kost limit */}
        <div className="lp-number-item">
          <CountUp to={25} suffix="%" duration={1.6} className="lp-number-val" />
          <span className="lp-number-label">Maks sewa kost</span>
        </div>

        {/* 2. 50/30/20 division — three CountUps with slash */}
        <div className="lp-number-item">
          <span className="lp-number-val" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <CountUp to={50} duration={1.6} />/
            <CountUp to={30} duration={1.6} />/
            <CountUp to={20} duration={1.6} />
          </span>
          <span className="lp-number-label">Pembagian gaji</span>
        </div>

        {/* 3. Health score */}
        <div className="lp-number-item">
          <CountUp to={85} suffix=" / 100" duration={1.6} className="lp-number-val" />
          <span className="lp-number-label">Skor keuangan</span>
        </div>

        {/* 4. Daily allowance */}
        <div className="lp-number-item">
          <CountUp to={84893} prefix="Rp " duration={1.6} className="lp-number-val" />
          <span className="lp-number-label">Jajan / hari</span>
        </div>
      </div>
    </section>
  );
};
