import React from 'react';
import { Icon } from '../../../components/Icon';

export const Trust: React.FC = () => {
  return (
    <section className="lp-trust">
      <div className="swiss-section-meta">
        <span>KEAMANAN</span>
        <span>DATA TETAP MILIKMU</span>
      </div>
      <div className="lp-trust-chips">
        <span className="trust-chip">
          <Icon name="lock" size={14} /> Terkunci per akun
        </span>
        <span className="trust-chip">
          <Icon name="sparkle" size={14} /> Tanpa iklan
        </span>
        <span className="trust-chip">
          <Icon name="check" size={14} /> Data tak dijual
        </span>
      </div>
    </section>
  );
};
