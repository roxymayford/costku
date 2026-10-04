import React, { useState } from 'react';
import { CountUp } from '../../../components/motion/CountUp';

export const Simulator: React.FC = () => {
  // Default to 28.000 so 28.000 * 30 = Rp 840.000 / bulan as specified in the plan
  const [coffeeDaily, setCoffeeDaily] = useState(28000);
  const coffeeMonthly = coffeeDaily * 30;
  const coffeeYearly = coffeeDaily * 365;

  return (
    <section id="simulasi" className="lp-sim">
      <div className="swiss-section-meta">
        <span>SIMULASI</span>
        <span>KOPI HARIAN = ?</span>
      </div>

      <div className="lp-sim-inner">
        <div className="lp-sim-left">
          <label className="lp-sim-label" htmlFor="coffee-slider">
            Kopi / minuman per hari
          </label>
          <div className="lp-sim-amount">
            <CountUp
              to={coffeeDaily}
              prefix="Rp "
              live
              duration={0.35}
              className="lp-sim-daily"
            />
          </div>
          <input
            id="coffee-slider"
            type="range"
            min={0}
            max={50000}
            step={1000}
            value={coffeeDaily}
            onChange={(e) => setCoffeeDaily(Number(e.target.value))}
            className="lp-slider"
            aria-label="Biaya kopi harian"
          />
          <div className="lp-slider-ticks">
            <span>Rp 0</span>
            <span>Rp 25.000</span>
            <span>Rp 50.000</span>
          </div>
        </div>

        <div className="lp-sim-right">
          <div className="lp-sim-result">
            <small>SEBULAN (30 HARI)</small>
            <CountUp
              to={coffeeMonthly}
              prefix="Rp "
              live
              className="lp-sim-monthly"
            />
          </div>
          <div className="lp-sim-result lp-sim-result--accent">
            <small>SETAHUN</small>
            <CountUp
              to={coffeeYearly}
              prefix="Rp "
              live
              className="lp-sim-yearly"
            />
          </div>
          <p className="lp-sim-note">
            Masuk ke porsi 30% keinginan — bukan dari uang kost atau tabungan.
          </p>
        </div>
      </div>
    </section>
  );
};
