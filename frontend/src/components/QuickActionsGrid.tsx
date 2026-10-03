import React from 'react';
import { Icon } from './Icon';

export interface QuickActionsGridProps {
  activeLiabilitiesCount?: number;
  onOpenQuickCapture?: () => void;
  onOpenManualCapture?: () => void;
  onNavigate: (path: string) => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  badge?: number | string;
  onClick: () => void;
}

export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({
  activeLiabilitiesCount = 0,
  onOpenQuickCapture,
  onOpenManualCapture,
  onNavigate,
}) => {
  const actions: ActionItem[] = [
    {
      id: 'catat',
      label: 'CATAT',
      icon: 'sparkle',
      onClick: () => {
        if (onOpenQuickCapture) {
          onOpenQuickCapture();
        } else {
          // Fallback: smooth scroll to NLP input if available, or navigate
          const nlpInput = document.querySelector<HTMLInputElement>('.nlp-text-input');
          if (nlpInput) {
            nlpInput.focus();
            nlpInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            onNavigate('/transaksi');
          }
        }
      },
    },
    {
      id: 'manual',
      label: 'MANUAL',
      icon: 'plus',
      onClick: () => {
        if (onOpenManualCapture) {
          onOpenManualCapture();
        } else {
          onNavigate('/transaksi');
        }
      },
    },
    {
      id: 'masuk',
      label: 'MASUK',
      icon: 'wallet',
      onClick: () => onNavigate('/pemasukan'),
    },
    {
      id: 'cicilan',
      label: 'CICILAN',
      icon: 'clock',
      badge: activeLiabilitiesCount > 0 ? activeLiabilitiesCount : undefined,
      onClick: () => onNavigate('/cicilan'),
    },
    {
      id: 'anggaran',
      label: 'ANGGARAN',
      icon: 'swap',
      onClick: () => onNavigate('/alokasi'),
    },
    {
      id: 'tabungan',
      label: 'TABUNGAN',
      icon: 'target',
      onClick: () => onNavigate('/alokasi'),
    },
    {
      id: 'saran',
      label: 'SARAN',
      icon: 'lightbulb',
      onClick: () => onNavigate('/rekomendasi'),
    },
    {
      id: 'lainnya',
      label: 'LAINNYA',
      icon: 'menu',
      onClick: () => {
        window.dispatchEvent(new CustomEvent('costku:open-drawer'));
      },
    },
  ];

  return (
    <nav className="quick-actions-grid" aria-label="Aksi Cepat Keuangan">
      {actions.map((item) => (
        <button
          key={item.id}
          type="button"
          className="quick-action-tile"
          onClick={item.onClick}
          aria-label={item.label}
        >
          {item.badge !== undefined && (
            <span className="quick-action-badge" aria-label={`${item.badge} aktif`}>
              {item.badge}
            </span>
          )}
          <span className="quick-action-icon">
            <Icon name={item.icon} size={20} />
          </span>
          <span className="quick-action-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};
