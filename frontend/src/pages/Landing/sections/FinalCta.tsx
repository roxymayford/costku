import React from 'react';
import { Icon } from '../../../components/Icon';

type Props = {
  onStart: () => void;
};

export const FinalCta: React.FC<Props> = ({ onStart }) => {
  return (
    <section className="lp-cta-dark">
      <div className="lp-cta-headline">
        <span>GAJIMU</span>
        <span className="accent">/</span>
        <span>BATASMU</span>
        <span className="accent">/</span>
        <span>HIDUPMU</span>
      </div>
      <button className="pill dark lp-cta-btn" type="button" onClick={onStart}>
        Buat Akun Gratis
      </button>
      <p className="lp-cta-note">Gratis. Tanpa kartu kredit.</p>

      {/* Footer inside CTA block */}
      <footer className="lp-footer-strip">
        <div>
          <small>KONTAK</small>
          <span>bantuan@costku.id</span>
        </div>
        <div>
          <small>STATUS</small>
          <span className="green">
            <Icon name="dot" size={9} className="status-dot" /> Berjalan normal
          </span>
        </div>
        <div>
          <small>HAK CIPTA</small>
          <span>© 2025 costKu</span>
        </div>
      </footer>
    </section>
  );
};
