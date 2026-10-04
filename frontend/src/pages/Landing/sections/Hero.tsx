import React from 'react';
import { Icon } from '../../../components/Icon';
import { CountUp } from '../../../components/motion/CountUp';

type Props = {
  onStart: () => void;
  onDemo: () => void;
};

export const Hero: React.FC<Props> = ({ onStart, onDemo }) => {
  return (
    <section className="hero lp-hero">
      <div className="hero-copy">
        <div className="eyebrow">
          <span /> Catat sekali, tenang sebulan
        </div>

        {/* Headline reveal per line */}
        <h1>
          <span className="hero-line-wrap"><span className="hero-line">Gaji masuk.</span></span>
          <span className="hero-line-wrap"><span className="hero-line">Tahu persis</span></span>
          <span className="hero-line-wrap"><span className="hero-line">batas jajanmu.</span></span>
        </h1>

        <p className="lead hero-sub">
          Satu angka jajan harian. Dari gajimu.
        </p>

        {/* Giant number — count-up */}
        <div className="hero-big-num" aria-label="Contoh: Rp 87.500 per hari">
          <CountUp to={87500} prefix="Rp " suffix=" / hari" duration={1.8} className="hero-counter" />
          <span className="hero-counter-label">CONTOH BATAS JAJAN</span>
        </div>

        <div className="hero-cta-wrap hero-cta-group">
          <button className="pill dark" type="button" onClick={onStart}>
            Coba Gratis
          </button>
          <button className="outline" type="button" onClick={onDemo}>
            Lihat Demo <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </div>

      {/* Dashboard preview panel */}
      <aside className="hero-preview-panel terminal">
        <div className="terminal-head">
          <span className="terminal-pulse" aria-hidden="true" /> PREVIEW DASHBOARD
          <span>CONTOH DATA</span>
        </div>
        <div className="terminal-body">
          <div className="worth terminal-card">
            <span className="terminal-scan" />
            <small>BATAS JAJAN HARI INI</small>
            <strong>
              Rp 87.500 <small style={{ fontSize: '14px', fontWeight: 500 }}>/ hari</small>
            </strong>
            <span>Dihitung dari gaji, biaya tetap, target tabungan</span>
          </div>
          <div className="twins terminal-card">
            <div>
              <small>GAJI BULANAN</small>
              <b>Rp 8.500.000</b>
              <span>Gajian tiap tanggal 25</span>
            </div>
            <div>
              <small>BATAS SEWA KOST</small>
              <b className="accent">Rp 2.125.000</b>
              <span>Maks 25% gaji</span>
            </div>
          </div>
          <div className="allocation terminal-card">
            <small>PEMBAGIAN GAJI 50/30/20</small>
            <span>
              Kebutuhan <b>50% · Rp 4.250.000</b>
              <i><em style={{ width: '50%' }} /></i>
            </span>
            <span>
              Keinginan <b>30% · Rp 2.550.000</b>
              <i><em style={{ width: '30%', backgroundColor: 'var(--orange)' }} /></i>
            </span>
            <span>
              Tabungan <b>20% · Rp 1.700.000</b>
              <i><em style={{ width: '20%', backgroundColor: '#008547' }} /></i>
            </span>
          </div>
        </div>
        <div className="terminal-foot">
          STATUS HARI INI <b className="green">MASIH DALAM BATAS</b>
        </div>
      </aside>
    </section>
  );
};
