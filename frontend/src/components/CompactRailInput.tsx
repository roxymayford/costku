import React, { useState } from 'react';
import { Icon } from './Icon';

interface CompactRailInputProps {
  onSubmitText: (text: string) => void;
  onOpenManual: () => void;
}

const RAIL_PRESETS = [
  { icon: 'coffee' as const, label: 'Kopi 20rb', text: 'kopi 20rb' },
  { icon: 'utensils' as const, label: 'Padang 25rb', text: 'makan siang nasi padang 25rb' },
  { icon: 'fuel' as const, label: 'Bensin 50rb', text: 'bensin 50rb' },
];

export const CompactRailInput: React.FC<CompactRailInputProps> = ({
  onSubmitText,
  onOpenManual,
}) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmitText(text.trim());
    setText('');
  };

  return (
    <div className="compact-rail-card">
      <div className="compact-rail-header">
        <span className="compact-rail-eyebrow">
          <Icon name="sparkle" size={12} /> CATAT CEPAT DENGAN AI
        </span>
        <button
          type="button"
          className="compact-rail-manual-link"
          onClick={onOpenManual}
          title="Buka formulir input manual"
        >
          Form Manual
        </button>
      </div>

      <form className="compact-rail-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="compact-rail-text-input"
          placeholder="Ketik pengeluaranmu (misal: kopi 25rb)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="compact-rail-submit-btn"
          disabled={!text.trim()}
          aria-label="Proses catatan pengeluaran"
        >
          <Icon name="arrowRight" size={14} />
        </button>
      </form>

      <div className="compact-rail-presets">
        {RAIL_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="compact-rail-preset-chip"
            onClick={() => onSubmitText(p.text)}
          >
            <Icon name={p.icon} size={11} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
