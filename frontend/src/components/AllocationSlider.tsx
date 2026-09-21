import React from 'react';
import { AllocationPercentages, formatRupiah } from '../lib/calculator';

interface AllocationSliderProps {
  percentages: AllocationPercentages;
  onChange: (newPercentages: AllocationPercentages) => void;
  monthlySalary: number;
  fixedExpenses: number;
}

export const AllocationSlider: React.FC<AllocationSliderProps> = ({
  percentages,
  onChange,
  monthlySalary,
  fixedExpenses,
}) => {
  const netPool = Math.max(0, monthlySalary - fixedExpenses);

  const needsNominal = (netPool * percentages.needs) / 100;
  const wantsNominal = (netPool * percentages.wants) / 100;
  const savingsNominal = (netPool * percentages.savings) / 100;

  const total = percentages.needs + percentages.wants + percentages.savings;

  // Handle changing Needs (between 40 and 70)
  const handleNeedsChange = (newNeeds: number) => {
    newNeeds = Math.min(70, Math.max(40, newNeeds));
    const remaining = 100 - newNeeds;
    // Distribute remaining proportionally between Wants and Savings
    const wantsRatio = percentages.wants / (percentages.wants + percentages.savings || 1);
    let newWants = Math.round(remaining * wantsRatio);
    newWants = Math.min(40, Math.max(10, newWants));
    const newSavings = 100 - newNeeds - newWants;
    onChange({ needs: newNeeds, wants: newWants, savings: newSavings });
  };

  // Handle changing Wants (between 10 and 40)
  const handleWantsChange = (newWants: number) => {
    newWants = Math.min(40, Math.max(10, newWants));
    const remaining = 100 - newWants;
    // Distribute remaining to Needs and Savings
    let newNeeds = percentages.needs;
    if (newNeeds + percentages.savings !== remaining) {
      newNeeds = Math.min(70, Math.max(40, remaining - percentages.savings));
    }
    const newSavings = 100 - newNeeds - newWants;
    onChange({ needs: newNeeds, wants: newWants, savings: newSavings });
  };

  // Handle changing Savings (between 10 and 40)
  const handleSavingsChange = (newSavings: number) => {
    newSavings = Math.min(40, Math.max(10, newSavings));
    const remaining = 100 - newSavings;
    let newNeeds = percentages.needs;
    if (newNeeds + percentages.wants !== remaining) {
      newNeeds = Math.min(70, Math.max(40, remaining - percentages.wants));
    }
    const newWants = 100 - newNeeds - newSavings;
    onChange({ needs: newNeeds, wants: newWants, savings: newSavings });
  };

  const applyPreset = (needs: number, wants: number, savings: number) => {
    onChange({ needs, wants, savings });
  };

  return (
    <div className="allocation-engine-box">
      <div className="engine-header">
        <div>
          <small className="accent">PEMBAGIAN GAJI</small>
          <h3>ATUR PEMBAGIAN GAJI BULANANMU</h3>
          <p className="engine-hint">
            Total harus 100%. Saat kamu menggeser satu bagian, bagian lain menyesuaikan otomatis.
          </p>
        </div>
        <div className="preset-buttons">
          <button
            type="button"
            className={`tag-btn ${percentages.needs === 50 && percentages.wants === 30 ? 'active' : ''}`}
            onClick={() => applyPreset(50, 30, 20)}
          >
            50/30/20 Seimbang
          </button>
          <button
            type="button"
            className={`tag-btn ${percentages.needs === 60 && percentages.wants === 20 ? 'active' : ''}`}
            onClick={() => applyPreset(60, 20, 20)}
          >
            60/20/20 Hemat
          </button>
          <button
            type="button"
            className={`tag-btn ${percentages.needs === 45 && percentages.savings === 30 ? 'active' : ''}`}
            onClick={() => applyPreset(45, 25, 30)}
          >
            45/25/30 Fokus Tabungan
          </button>
        </div>
      </div>

      <div className="allocation-sliders-grid">
        {/* NEEDS */}
        <div className="slider-card needs-border">
          <div className="slider-card-top">
            <div>
              <span className="bullet bullet-needs" />
              <b>KEBUTUHAN POKOK</b>
            </div>
            <span className="percentage-badge">{percentages.needs}%</span>
          </div>
          <p className="slider-desc">Makan, kost, transport, dan tagihan wajib tiap bulan.</p>
          <input
            type="range"
            min="40"
            max="70"
            step="1"
            value={percentages.needs}
            onChange={(e) => handleNeedsChange(Number(e.target.value))}
            className="swiss-slider slider-needs"
            aria-label="Porsi kebutuhan pokok"
            aria-valuetext={`${percentages.needs} persen`}
          />
          <div className="slider-footer">
            <small>Rentang 40%–70%</small>
            <strong className="nominal-val">{formatRupiah(needsNominal)}</strong>
          </div>
        </div>

        {/* WANTS */}
        <div className="slider-card wants-border">
          <div className="slider-card-top">
            <div>
              <span className="bullet bullet-wants" />
              <b>KEINGINAN &amp; GAYA HIDUP</b>
            </div>
            <span className="percentage-badge">{percentages.wants}%</span>
          </div>
          <p className="slider-desc">Ngopi, hangout, langganan digital, dan hiburan.</p>
          <input
            type="range"
            min="10"
            max="40"
            step="1"
            value={percentages.wants}
            onChange={(e) => handleWantsChange(Number(e.target.value))}
            className="swiss-slider slider-wants"
            aria-label="Porsi keinginan dan gaya hidup"
            aria-valuetext={`${percentages.wants} persen`}
          />
          <div className="slider-footer">
            <small>Rentang 10%–40%</small>
            <strong className="nominal-val">{formatRupiah(wantsNominal)}</strong>
          </div>
        </div>

        {/* SAVINGS */}
        <div className="slider-card savings-border">
          <div className="slider-card-top">
            <div>
              <span className="bullet bullet-savings" />
              <b>TABUNGAN &amp; INVESTASI</b>
            </div>
            <span className="percentage-badge">{percentages.savings}%</span>
          </div>
          <p className="slider-desc">Dana darurat, tabungan masa depan, reksadana, dan SBN.</p>
          <input
            type="range"
            min="10"
            max="40"
            step="1"
            value={percentages.savings}
            onChange={(e) => handleSavingsChange(Number(e.target.value))}
            className="swiss-slider slider-savings"
            aria-label="Porsi tabungan dan investasi"
            aria-valuetext={`${percentages.savings} persen`}
          />
          <div className="slider-footer">
            <small>Rentang 10%–40%</small>
            <strong className="nominal-val green-text">{formatRupiah(savingsNominal)}</strong>
          </div>
        </div>
      </div>

      {total !== 100 && (
        <div className="allocation-warning" role="alert">
          Total alokasi saat ini {total}%. Sesuaikan slider supaya totalnya tepat 100%.
        </div>
      )}
    </div>
  );
};
