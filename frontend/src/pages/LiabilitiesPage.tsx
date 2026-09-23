import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { useAuth } from '../contexts/AuthContext';
import {
  Liability,
  LiabilityType,
  getLiabilities,
  addLiability,
  updateLiability,
  deleteLiability,
  payLiabilityMonth,
} from '../lib/liabilityApi';
import { addTransaction } from '../lib/storage';
import { formatRupiah } from '../lib/calculator';
import { LiabilityForm } from '../components/LiabilityForm';
import { LiabilityList } from '../components/LiabilityList';
import { Icon } from '../components/Icon';

export const LiabilitiesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.from('.liabilities-header-strip', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      });
      gsap.from('.liabilities-kpi-strip > *', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power2.out',
      });
      gsap.from('.liabilities-form-col', {
        y: 24,
        opacity: 0,
        duration: 0.6,
        delay: 0.1,
        ease: 'power2.out',
      });
      gsap.from('.liabilities-list-col', {
        y: 24,
        opacity: 0,
        duration: 0.6,
        delay: 0.15,
        ease: 'power2.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, [loading]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const items = await getLiabilities(user.id, 'all');
      setLiabilities(items);
    } catch (err) {
      console.error('Error loading liabilities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    loadData();
  }, [user]);

  const handleAddOrUpdate = async (data: {
    name: string;
    type: LiabilityType;
    monthly_amount: number;
    due_day: number;
    remaining_tenor: number | null;
    total_amount: number | null;
  }) => {
    if (!user) return;

    if (editingLiability) {
      const updated = await updateLiability(user.id, editingLiability.id, data);
      if (updated) {
        setLiabilities((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      }
      setEditingLiability(null);
    } else {
      const created = await addLiability(user.id, data);
      setLiabilities((prev) => [...prev, created]);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteLiability(user.id, id);
    setLiabilities((prev) => prev.filter((l) => l.id !== id));
  };

  const handlePayMonth = async (id: string) => {
    if (!user) return;
    const target = liabilities.find((l) => l.id === id);
    if (!target) return;

    const updated = await payLiabilityMonth(user.id, id);
    if (updated) {
      setLiabilities((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));

      // Record a transaction as well so it is captured in spending history
      await addTransaction(user.id, {
        title: `Pembayaran: ${target.name}`,
        amount: target.monthly_amount,
        category: 'Needs',
        transaction_date: new Date().toISOString().slice(0, 10),
      });
    }
  };

  const summary = useMemo(() => {
    const active = liabilities.filter((l) => l.status === 'active');
    const totalMonthly = active.reduce((sum, l) => sum + Number(l.monthly_amount), 0);
    const cicilanTotal = active
      .filter((l) => l.type === 'cicilan')
      .reduce((sum, l) => sum + Number(l.monthly_amount), 0);
    const paylaterTotal = active
      .filter((l) => l.type === 'paylater')
      .reduce((sum, l) => sum + Number(l.monthly_amount), 0);

    return {
      totalMonthly,
      cicilanTotal,
      paylaterTotal,
      activeCount: active.length,
      paidOffCount: liabilities.filter((l) => l.status === 'paid_off').length,
    };
  }, [liabilities]);

  if (loading) {
    return (
      <div className="dashboard-loading-state">
        <div className="status-modal__spinner" />
        <small>Memuat data cicilan &amp; paylater…</small>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="transactions-page-container liabilities-page-container">
      {/* HEADER STRIP */}
      <div className="page-head-strip liabilities-header-strip">
        <div>
          <small className="accent">KEWAJIBAN &amp; ANGSURAN</small>
          <h2>Cicilan &amp; PayLater</h2>
          <p>
            Kelola semua komitmen cicilan bank, pinjaman, dan paylater bulanan. Total angsuran
            otomatis menjadi prioritas potongan wajib agar kamu tidak overbudget pada jajan harian.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.8rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
            }}
          >
            🛡️ {summary.activeCount} Fasilitas Aktif · {summary.paidOffCount} Lunas
          </span>
        </div>
      </div>

      {/* KPI BREAKDOWN STRIP */}
      <div className="category-tally-bar liabilities-kpi-strip">
        <div className="tally-item">
          <span>Total Angsuran Bulanan:</span>
          <strong className="red-text" style={{ fontSize: '1.05rem' }}>
            {formatRupiah(summary.totalMonthly)}
          </strong>
        </div>
        <div className="tally-item">
          <span>Cicilan Kredit Bank/HP:</span>
          <b>{formatRupiah(summary.cicilanTotal)}</b>
        </div>
        <div className="tally-item">
          <span>PayLater:</span>
          <b className="accent">{formatRupiah(summary.paylaterTotal)}</b>
        </div>
        <div className="tally-item">
          <span>Status Sistem:</span>
          <span className="green-text" style={{ fontWeight: 600 }}>
            ⚡ Auto-cut Aktif
          </span>
        </div>
      </div>

      {/* TWO COLUMN WORKSPACE */}
      <div className="transactions-content-layout">
        <div className="transactions-form-col liabilities-form-col">
          <LiabilityForm
            onAddLiability={handleAddOrUpdate}
            initialData={editingLiability}
            onCancel={editingLiability ? () => setEditingLiability(null) : undefined}
          />
        </div>

        <div className="transactions-list-col liabilities-list-col">
          <LiabilityList
            liabilities={liabilities}
            onDeleteLiability={handleDelete}
            onEditLiability={(l) => setEditingLiability(l)}
            onPayMonth={handlePayMonth}
          />
        </div>
      </div>
    </div>
  );
};
