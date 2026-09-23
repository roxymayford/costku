import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { useAuth } from '../contexts/AuthContext';
import {
  Income,
  IncomeType,
  getIncomes,
  addIncome,
  updateIncome,
  deleteIncome,
  getTotalIncome,
} from '../lib/incomeApi';
import { getProfile } from '../lib/storage';
import { formatRupiah } from '../lib/calculator';
import { IncomeForm } from '../components/IncomeForm';
import { IncomeList } from '../components/IncomeList';
import { Icon } from '../components/Icon';

export const IncomesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);

  // Month selector YYYY-MM
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.from('.incomes-header-strip', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      });
      gsap.from('.incomes-kpi-strip > *', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power2.out',
      });
      gsap.from('.incomes-form-col', {
        y: 24,
        opacity: 0,
        duration: 0.6,
        delay: 0.1,
        ease: 'power2.out',
      });
      gsap.from('.incomes-list-col', {
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
      let items = await getIncomes(user.id, selectedMonth);

      // If user has zero incomes recorded for this month, check profile monthly_salary and auto-seed baseline
      if (items.length === 0) {
        const prof = await getProfile(user.id);
        if (prof && prof.monthly_salary > 0) {
          const seeded = await addIncome(user.id, {
            type: 'gaji',
            label: 'Gaji Pokok (Otomatis dari Profil)',
            amount: prof.monthly_salary,
            date: `${selectedMonth}-01`,
            is_recurring: true,
            frequency: 'monthly',
          });
          items = [seeded];
        }
      }

      setIncomes(items);
    } catch (err) {
      console.error('Error loading incomes:', err);
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
  }, [user, selectedMonth]);

  const handleAddOrUpdate = async (data: {
    type: IncomeType;
    label: string | null;
    amount: number;
    date: string;
    is_recurring: boolean;
    frequency: 'monthly' | 'weekly' | null;
  }) => {
    if (!user) return;

    if (editingIncome) {
      const updated = await updateIncome(user.id, editingIncome.id, data);
      if (updated) {
        setIncomes((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      }
      setEditingIncome(null);
    } else {
      const created = await addIncome(user.id, data);
      // If matches selected month or no month filter, add to list
      if (!selectedMonth || created.date.startsWith(selectedMonth)) {
        setIncomes((prev) => [created, ...prev]);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await deleteIncome(user.id, id);
    setIncomes((prev) => prev.filter((i) => i.id !== id));
  };

  // Aggregations
  const summary = useMemo(() => {
    let total = 0;
    const byType: Record<IncomeType, number> = {
      gaji: 0,
      freelance: 0,
      bonus: 0,
      lainnya: 0,
    };

    for (const inc of incomes) {
      const amt = Number(inc.amount) || 0;
      total += amt;
      if (byType[inc.type] !== undefined) {
        byType[inc.type] += amt;
      } else {
        byType.lainnya += amt;
      }
    }

    return { total, byType };
  }, [incomes]);

  if (loading) {
    return (
      <div className="dashboard-loading-state">
        <div className="status-modal__spinner" />
        <small>Memuat data pemasukan…</small>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="transactions-page-container incomes-page-container">
      {/* HEADER STRIP */}
      <div className="page-head-strip incomes-header-strip">
        <div>
          <small className="accent">ARUS KAS MASUK</small>
          <h2>Pemasukan &amp; Penghasilan</h2>
          <p>
            Catat semua sumber pemasukanmu bulan ini: gaji tetap, proyek freelance sampingan,
            bonus, atau komisi. Total pemasukan akan langsung terintegrasi ke batas jajan harianmu.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>PILIH BULAN:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="transaction-date-input"
            style={{ width: 'auto' }}
          />
        </div>
      </div>

      {/* KPI BREAKDOWN STRIP */}
      <div className="category-tally-bar incomes-kpi-strip">
        <div className="tally-item">
          <span>Gaji Pokok:</span>
          <b className="green-text">{formatRupiah(summary.byType.gaji)}</b>
        </div>
        <div className="tally-item">
          <span>Freelance &amp; Sampingan:</span>
          <b className="accent">{formatRupiah(summary.byType.freelance)}</b>
        </div>
        <div className="tally-item">
          <span>Bonus &amp; THR:</span>
          <b>{formatRupiah(summary.byType.bonus)}</b>
        </div>
        <div className="tally-item">
          <span>Total Pemasukan:</span>
          <strong className="green-text" style={{ fontSize: '1.05rem' }}>
            {formatRupiah(summary.total)}
          </strong>
        </div>
      </div>

      {/* CONTENT TWO COLUMNS */}
      <div className="transactions-content-layout">
        <div className="transactions-form-col incomes-form-col">
          <IncomeForm
            onAddIncome={handleAddOrUpdate}
            initialData={editingIncome}
            onCancel={editingIncome ? () => setEditingIncome(null) : undefined}
          />
        </div>

        <div className="transactions-list-col incomes-list-col">
          <IncomeList
            incomes={incomes}
            onDeleteIncome={handleDelete}
            onEditIncome={(inc) => setEditingIncome(inc)}
          />
        </div>
      </div>
    </div>
  );
};
