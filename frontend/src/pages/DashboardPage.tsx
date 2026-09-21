import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  UserProfile,
  BudgetSettings,
  Transaction,
  getProfile,
  getBudgetSettings,
  getTransactions,
  addTransaction,
  deleteTransaction,
  aggregateByCategory,
} from '../lib/storage';
import {
  calculateAllocationWithPayday,
  calculateFinancialHealthScore,
  getDaysInCurrentCycle,
  getDayInCycle,
  formatRupiah,
} from '../lib/calculator';
import { DailyLimitCard } from '../components/DailyLimitCard';
import { AllocationChart } from '../components/AllocationChart';
import { BudgetGauge } from '../components/BudgetGauge';
import { HealthScoreCard } from '../components/HealthScoreCard';
import { AlertBanner } from '../components/AlertBanner';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionList } from '../components/TransactionList';
import { Icon } from '../components/Icon';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [budget, setBudget] = useState<BudgetSettings>({
    needs_percentage: 50,
    wants_percentage: 30,
    savings_percentage: 20,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Load data
  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [p, b, txs] = await Promise.all([
        getProfile(user.id),
        getBudgetSettings(user.id),
        getTransactions(user.id),
      ]);

      if (p) {
        setProfile(p);
      } else {
        // Fallback default demo profile
        setProfile({
          id: user.id,
          name: user.name || 'Pengguna costKu',
          monthly_salary: 5500000,
          payday_date: 25,
          fixed_expenses: 1200000,
        });
      }

      setBudget(b);
      setTransactions(txs);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
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

  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (loading || !profile) return;
    const ctx = gsap.context(() => {
      // Header and KPI stagger
      gsap.from('.dashboard-hero-strip > *', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
      });
      gsap.from('.kpi-cell', {
        y: 24,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        delay: 0.1,
        ease: 'power2.out',
      });

      // Left column cards stagger
      gsap.from('.dashboard-left-col > *', {
        y: 30,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        delay: 0.2,
        ease: 'power3.out',
      });

      // Right column cards stagger
      gsap.from('.dashboard-right-col > *', {
        y: 30,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        delay: 0.25,
        ease: 'power3.out',
      });

      // Progress bar fill growth
      gsap.fromTo(
        '.progress-fill',
        { scaleX: 0, transformOrigin: 'left' },
        { scaleX: 1, duration: 1, delay: 0.4, ease: 'power2.out' }
      );
      gsap.fromTo(
        '.gauge-fill',
        { scaleX: 0, transformOrigin: 'left' },
        { scaleX: 1, duration: 1, delay: 0.4, ease: 'power2.out' }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [loading, profile]);

  // Derived financial metrics
  const salary = profile?.monthly_salary || 0;
  const fixedExpenses = profile?.fixed_expenses || 0;
  const paydayDate = profile?.payday_date || 25;

  const allocation = useMemo(() => {
    return calculateAllocationWithPayday(
      salary,
      fixedExpenses,
      {
        needs: budget.needs_percentage,
        wants: budget.wants_percentage,
        savings: budget.savings_percentage,
      },
      paydayDate
    );
  }, [salary, fixedExpenses, budget, paydayDate]);

  const daysInCycle = allocation.daysInCycle;
  const currentDayIndex = getDayInCycle(paydayDate);
  const daysRemaining = Math.max(1, daysInCycle - currentDayIndex + 1);

  // Spending aggregations
  const todayStr = new Date().toISOString().slice(0, 10);

  const spentToday = useMemo(() => {
    return transactions
      .filter((t) => t.transaction_date === todayStr)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, todayStr]);

  const categorySpending = useMemo(() => {
    return aggregateByCategory(transactions);
  }, [transactions]);

  const actualNeeds = categorySpending['Needs'] || 0;
  const actualWants = categorySpending['Wants'] || 0;
  const actualSavings = categorySpending['Savings'] || 0;
  const totalSpent = actualNeeds + actualWants + actualSavings;

  // Alerts & Checks
  const isOverWants = allocation.wantsAmount > 0 && actualWants > allocation.wantsAmount;
  const isOverDaily = allocation.dailyLimit > 0 && spentToday > allocation.dailyLimit;

  // Financial Health Score
  const healthScore = useMemo(() => {
    return calculateFinancialHealthScore({
      totalSpent,
      needsSpent: actualNeeds,
      wantsSpent: actualWants,
      savingsActual: actualSavings,
      targetNeeds: allocation.needsAmount,
      targetWants: allocation.wantsAmount,
      targetSavings: allocation.savingsAmount,
    });
  }, [totalSpent, actualNeeds, actualWants, actualSavings, allocation]);

  const savingsRatio = totalSpent > 0 ? (actualSavings / totalSpent) * 100 : 0;
  const wantsRatio = totalSpent > 0 ? (actualWants / totalSpent) * 100 : 0;

  // Transaction handlers
  const handleAddTransaction = async (txData: {
    title: string;
    amount: number;
    category: 'Needs' | 'Wants' | 'Savings';
    transaction_date: string;
  }) => {
    if (!user) return;
    const newTx = await addTransaction(user.id, txData);
    setTransactions((prev) => [newTx, ...prev]);
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!user) return;
    await deleteTransaction(user.id, id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  if (loading && !profile) {
    return (
      <div className="dashboard-loading-state">
        <div className="status-modal__spinner" />
        <small>Memuat data keuangan…</small>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="dashboard-page-container">
      {/* DASHBOARD HERO HEADER */}
      <section className="dashboard-hero-strip">
        <div className="strip-title-box">
          <small className="accent">RINGKASAN BULAN INI</small>
          <h2>
            Hai{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}
            <Icon name="hand" size={20} className="heading-inline-icon" />
          </h2>
          <p>
            Gaji bersih <b>{formatRupiah(salary)}</b> · Biaya tetap <b>{formatRupiah(fixedExpenses)}</b> · Gajian tiap tanggal <b>{paydayDate}</b>
          </p>
        </div>

        <div className="strip-actions">
          <button type="button" className="tag-btn" onClick={() => navigate('/transaksi')}>
            <Icon name="plus" size={14} /> CATAT TRANSAKSI
          </button>
          <button type="button" className="tag-btn" onClick={() => navigate('/onboarding')}>
            <Icon name="settings" size={14} /> ATUR GAJI &amp; BIAYA
          </button>
          {isPremium ? (
            <button type="button" className="tag-btn" onClick={() => navigate('/alokasi')}>
              <Icon name="swap" size={14} /> ATUR ALOKASI 50/30/20
            </button>
          ) : (
            <button type="button" className="tag-btn tag-btn--upgrade" onClick={() => navigate('/subscription')}>
              <Icon name="star" size={14} /> BUKA SEMUA FITUR PRO
            </button>
          )}
        </div>
      </section>

      {/* SYSTEM ALERTS */}
      <AlertBanner
        isOverWants={isOverWants}
        wantsSpent={actualWants}
        targetWants={allocation.wantsAmount}
        isOverDaily={isOverDaily}
        dailySpent={spentToday}
        dailyLimit={allocation.dailyLimit}
      />

      {/* TOP KPI METRICS STRIP */}
      <section className="dashboard-kpi-grid">
        <div className="kpi-cell">
          <small>
            BATAS JAJAN HARI INI
            {!isPremium && <span className="kpi-pro-hint"><Icon name="lock" size={10} /> PRO</span>}
          </small>
          <strong>{isPremium ? formatRupiah(allocation.dailyLimit) : '—'}</strong>
          <span>{isPremium ? 'Angka aman buat jajan hari ini' : 'Tersedia di paket Pro'}</span>
        </div>
        <div className="kpi-cell">
          <small>SUDAH KELUAR HARI INI</small>
          <strong className={isOverDaily ? 'red-text' : 'green-text'}>
            {formatRupiah(spentToday)}
          </strong>
          <span>Sisa {formatRupiah(Math.max(0, allocation.dailyLimit - spentToday))} untuk hari ini</span>
        </div>
        <div className="kpi-cell">
          <small>UANG BEBAS BULAN INI</small>
          <strong>{formatRupiah(allocation.disposableIncome)}</strong>
          <span>Setelah biaya tetap &amp; tabungan</span>
        </div>
        <div className="kpi-cell">
          <small>
            SKOR KESEHATAN KEUANGAN
            {!isPremium && <span className="kpi-pro-hint"><Icon name="lock" size={10} /> PRO</span>}
          </small>
          <strong className={healthScore >= 70 ? 'green-text' : healthScore >= 50 ? 'accent' : 'red-text'}>
            {isPremium ? `${healthScore} / 100` : '—'}
          </strong>
          <span>
            {!isPremium
              ? 'Tersedia di paket Pro'
              : healthScore >= 70
                ? 'Kondisi sehat, pertahankan'
                : 'Ada yang perlu diperbaiki'}
          </span>
        </div>
      </section>

      {/* UPGRADE NOTICE — sits below the KPI strip so the headline numbers are
          the first thing visible on load. */}
      {!isPremium && (
        <div className="free-tier-notice">
          <div className="free-tier-notice__content">
            <span className="free-tier-notice__dot"></span>
            <div>
              <span className="free-tier-notice__label">KAMU SEDANG DI PAKET GRATIS</span>
              <span className="free-tier-notice__desc">
                Saat ini kamu bisa mencatat transaksi dan melihat ringkasan. Buka batas jajan harian,
                alokasi 50/30/20, dan rekomendasi kost dengan paket Pro.
              </span>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/subscription')} className="pill dark">
            <span className="inline-flex items-center gap-1.5">Coba Pro — Rp 29.900 <Icon name="arrowRight" size={13} /></span>
          </button>
        </div>
      )}

      {/* MAIN TWO-COLUMN DASHBOARD GRID */}
      <section className="dashboard-columns-grid">
        {/* LEFT COLUMN: DAILY LIMIT + GAUGES + HEALTH SCORE */}
        <div className="dashboard-left-col">
          <DailyLimitCard
            dailyLimit={allocation.dailyLimit}
            spentToday={spentToday}
            daysRemaining={daysRemaining}
            paydayDate={paydayDate}
            disposableMonthly={allocation.disposableIncome}
          />

          <BudgetGauge
            monthlyBudget={allocation.disposableIncome}
            monthlySpent={totalSpent}
            dailyLimit={allocation.dailyLimit}
            dailySpent={spentToday}
          />

          <HealthScoreCard
            score={healthScore}
            savingsRatio={savingsRatio}
            wantsRatio={wantsRatio}
            isOverWants={isOverWants}
          />
        </div>

        {/* RIGHT COLUMN: CHART + QUICK TRANSACTION + RECENT */}
        <div className="dashboard-right-col">
          <AllocationChart
            targetNeeds={allocation.needsAmount}
            targetWants={allocation.wantsAmount}
            targetSavings={allocation.savingsAmount}
            actualNeeds={actualNeeds}
            actualWants={actualWants}
            actualSavings={actualSavings}
          />

          <div className="quick-add-transaction-box">
            <TransactionForm onAddTransaction={handleAddTransaction} />
          </div>

          <div className="recent-transactions-box">
            <TransactionList
              transactions={transactions}
              onDeleteTransaction={handleDeleteTransaction}
            />
          </div>
        </div>
      </section>
    </div>
  );
};
