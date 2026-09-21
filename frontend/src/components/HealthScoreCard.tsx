import React from 'react';
import { Icon } from './Icon';

interface HealthScoreCardProps {
  score: number;
  savingsRatio: number;
  wantsRatio: number;
  isOverWants: boolean;
}

export const HealthScoreCard: React.FC<HealthScoreCardProps> = ({
  score,
  savingsRatio,
  wantsRatio,
  isOverWants,
}) => {
  let grade = 'A';
  let status = 'Sangat sehat';
  let colorClass = 'green';
  let advice = 'Keuanganmu dalam kondisi ideal. Pertahankan kebiasaan menabung seperti sekarang.';

  if (score < 40) {
    grade = 'D';
    status = 'Perlu perhatian';
    colorClass = 'red';
    advice = 'Pengeluaran untuk keinginan (jajan, hobi, jalan) sudah melewati batas aman. Coba tahan dulu belanja yang tidak mendesak bulan ini.';
  } else if (score < 65) {
    grade = 'C';
    status = 'Perlu diperbaiki';
    colorClass = 'orange';
    advice = 'Tabunganmu belum mencapai target minimal 20% dari pengeluaran. Kurangi jajan harian yang tidak direncanakan.';
  } else if (score < 85) {
    grade = 'B';
    status = 'Cukup sehat';
    colorClass = 'green';
    advice = 'Arus kasmu sudah terkendali. Coba naikkan sedikit porsi tabungan supaya dana darurat lebih cepat terkumpul.';
  }

  const riskLevel = score >= 70 ? 'Rendah' : score >= 50 ? 'Sedang' : 'Tinggi';
  const riskColor = score >= 70 ? 'green-text' : score >= 50 ? 'orange-text' : 'red-text';
  const riskDesc = score >= 70 ? 'Arus kas stabil' : score >= 50 ? 'Perlu waspada' : 'Beresiko tinggi';

  return (
    <div className="health-score-widget terminal-card">
      <div className="health-top">
        <div>
          <small className="accent">PENILAIAN BULAN INI</small>
          <h4>Kesehatan Finansial</h4>
        </div>
        <span className={`status-pill ${colorClass}`}>{status}</span>
      </div>

      <div className="health-hero-box">
        <div className="health-hero-top">
          <div className="score-grade-group">
            <span className={`grade-badge grade-${grade.toLowerCase()}`}>{grade}</span>
            <div className="score-text-group">
              <div className="score-val-wrap">
                <strong className="score-number">{score}</strong>
                <span className="score-max">/100</span>
              </div>
              <span className="score-caption">Indeks Skor Finansial</span>
            </div>
          </div>
          <div className="score-status-summary">
            <span className="summary-label">Status Keuangan</span>
            <span className={`summary-value ${colorClass}-text`}>{status}</span>
          </div>
        </div>

        <div className="swiss-score-track">
          <div
            className={`swiss-score-fill ${colorClass}-fill`}
            style={{ width: `${Math.min(100, Math.max(6, score))}%` }}
          />
        </div>
        <div className="score-track-labels">
          <span>0 (Kritis)</span>
          <span>50 (Waspada)</span>
          <span>100 (Optimal)</span>
        </div>
      </div>

      <div className="health-breakdown-grid">
        <div className="breakdown-card">
          <span className="metric-tag">Porsi Tabungan</span>
          <b className={`metric-num ${savingsRatio >= 20 ? 'green-text' : 'orange-text'}`}>
            {savingsRatio.toFixed(1)}%
          </b>
          <span className="metric-sub">Target: min. 20%</span>
        </div>

        <div className="breakdown-card">
          <span className="metric-tag">Jajan &amp; Hobi</span>
          <b className={`metric-num ${isOverWants ? 'red-text' : 'green-text'}`}>
            {wantsRatio.toFixed(1)}%
          </b>
          <span className="metric-sub">Batas: 30–40%</span>
        </div>

        <div className="breakdown-card">
          <span className="metric-tag">Tingkat Risiko</span>
          <b className={`metric-num ${riskColor}`}>
            {riskLevel}
          </b>
          <span className="metric-sub">{riskDesc}</span>
        </div>
      </div>

      <div className={`health-advice-callout ${colorClass}-advice`}>
        <div className="advice-header">
          <Icon name="sparkle" size={13} className="advice-icon" />
          <span>SARAN UNTUKMU</span>
        </div>
        <p className="advice-text">{advice}</p>
      </div>
    </div>
  );
};

