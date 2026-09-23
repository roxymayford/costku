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
  formatRupiah,
} from '../lib/calculator';
import { getTotalIncome } from '../lib/incomeApi';
import { getTotalMonthlyLiabilities } from '../lib/liabilityApi';
import { calculateBudgetStatus } from '../lib/budgetEngine';
import { DailyLimitCard } from '../components/DailyLimitCard';
import { AllocationChart } from '../components/AllocationChart';
import { BudgetGauge } from '../components/BudgetGauge';
import { HealthScoreCard } from '../components/HealthScoreCard';
import { AlertBanner } from '../components/AlertBanner';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionList } from '../components/TransactionList';
import { NlpTransactionBox } from '../components/NlpTransactionBox';
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
    carry_over_daily: true,
    month_end_mode: 'carry_over',
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [incomeSummary, setIncomeSummary] = useState<{ total: number; count: number }>({
    total: 0,
    count: 0,
  });
  const [liabilitySummary, setLiabilitySummary] = useState<{
    totalMonthly: number;
    activeCount: number;
  }>({
    totalMonthly: 0,
    activeCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // Load data
  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [p, b, txs, inc, liab] = await Promise.all([
        getProfile(user.id),
        getBudgetSettings(user.id),
        getTransactions(user.id),
        getTotalIncome(user.id, currentMonth),
        getTotalMonthlyLiabilities(user.id),
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
      setIncomeSummary({ total: inc.total, count: inc.count });
      setLiabilitySummary({ totalMonthly: liab.totalMonthly, activeCount: liab.activeCount });
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
      gsap.from('.dashboard-nlp-strip', {
        y: 20,
        opacity: 0,
        duration: 0.6,
        delay: 0.18,
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
  const effectiveIncome = incomeSummary.total > 0 ? incomeSummary.total : salary;
  const fixedExpenses = profile?.fixed_expenses || 0;
  const totalLiabilities = liabilitySummary.totalMonthly || 0;
  const totalFixed = fixedExpenses + totalLiabilities;
  const paydayDate = profile?.payday_date || 25;

  // Run core budget calculation with carry-over, split budget, and liability deductions
  const budgetStatus = useMemo(() => {
    return calculateBudgetStatus({
      totalIncome: effectiveIncome,
      totalLiabilities,
      fixedExpenses,
      savingsPercentage: budget.savings_percentage,
      paydayDate,
      transactions,
      carryOverDaily: budget.carry_over_daily ?? true,
      monthEndMode: budget.month_end_mode ?? 'carry_over',
    });
  }, [effectiveIncome, totalLiabilities, fixedExpenses, budget, paydayDate, transactions]);

  // Allocation 50/30/20 with payday
  const allocation = useMemo(() => {
    return calculateAllocationWithPayday(
      effectiveIncome,
      totalFixed,
      {
        needs: budget.needs_percentage,
        wants: budget.wants_percentage,
        savings: budget.savings_percentage,
      },
      paydayDate
    );
  }, [effectiveIncome, totalFixed, budget, paydayDate]);

  const daysRemaining = budgetStatus.daysRemaining;
  const spentTodayEffective = budgetStatus.spentTodayEffective;
  const spentTodayReal = budgetStatus.spentTodayReal;
  const availableDailyLimit = budgetStatus.availableTodayInitial;

  // Category spending aggregations
  const categorySpending = useMemo(() => {
    return aggregateByCategory(transactions);
  }, [transactions]);

  const actualNeeds = categorySpending['Needs'] || 0;
  const actualWants = categorySpending['Wants'] || 0;
  const actualSavings = categorySpending['Savings'] || 0;
  const totalSpent = actualNeeds + actualWants + actualSavings;

  // Alerts & Checks
  const isOverWants = allocation.wantsAmount > 0 && actualWants > allocation.wantsAmount;
  const isOverDaily = budgetStatus.isOverToday;

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
    spread_days?: number | null;
    spread_start?: string | null;
    is_outlier?: boolean;
    outlier_level?: 'hard' | 'soft' | null;
    outlier_reason?: string | null;
    confirmed_by_user?: boolean;
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
            Total pemasukan <b>{formatRupiah(effectiveIncome)}</b>
            {incomeSummary.count > 0 && ` (${incomeSummary.count} sumber)`} · Biaya tetap{' '}
            <b>{formatRupiah(fixedExpenses)}</b>
            {totalLiabilities > 0 && (
              <span>
                {' '}
                · Cicilan/PayLater <b className="red-text">{formatRupiah(totalLiabilities)}</b>
              </span>
            )}{' '}
            · Gajian tiap tanggal <b>{paydayDate}</b>
          </p>
        </div>

        <div className="strip-actions">
          <button type="button" className="tag-btn" onClick={() => navigate('/pemasukan')}>
            <Icon name="wallet" size={14} /> + PEMASUKAN
          </button>
          <button type="button" className="tag-btn" onClick={() => navigate('/cicilan')}>
            <Icon name="clock" size={14} /> CICILAN ({liabilitySummary.activeCount})
          </button>
          <button type="button" className="tag-btn" onClick={() => navigate('/transaksi')}>
            <Icon name="plus" size={14} /> CATAT TRANSAKSI
          </button>
          <button type="button" className="tag-btn" onClick={() => navigate('/onboarding')}>
            <Icon name="settings" size={14} /> PROFIL &amp; BIAYA
          </button>
          {isPremium ? (
            <button type="button" className="tag-btn" onClick={() => navigate('/alokasi')}>
              <Icon name="swap" size={14} /> ALOKASI 50/30/20
            </button>
          ) : (
            <button type="button" className="tag-btn tag-btn--upgrade" onClick={() => navigate('/subscription')}>
              <Icon name="star" size={14} /> BUKA FITUR PRO
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
        dailySpent={spentTodayEffective}
        dailyLimit={availableDailyLimit}
      />

      {/* TOP KPI METRICS STRIP */}
      <section className="dashboard-kpi-grid">
        <div className="kpi-cell">
          <small>
            BATAS JAJAN HARI INI
            {!isPremium && <span className="kpi-pro-hint"><Icon name="lock" size={10} /> PRO</span>}
          </small>
          <strong>{isPremium ? formatRupiah(availableDailyLimit) : '—'}</strong>
          <span>
            {isPremium
              ? budgetStatus.yesterdaySurplus !== 0
                ? `Termasuk carry-over ${budgetStatus.yesterdaySurplus > 0 ? '+' : ''}${formatRupiah(budgetStatus.yesterdaySurplus)}`
                : 'Batas aman pengeluaran hari ini'
              : 'Tersedia di paket Pro'}
          </span>
        </div>
        <div className="kpi-cell">
          <small>BEBAN PENGELUARAN HARI INI</small>
          <strong className={isOverDaily ? 'red-text' : 'green-text'}>
            {formatRupiah(spentTodayEffective)}
          </strong>
          <span>
            Sisa {formatRupiah(Math.max(0, availableDailyLimit - spentTodayEffective))}
            {spentTodayReal !== spentTodayEffective && ` (Kas riil: ${formatRupiah(spentTodayReal)})`}
          </span>
        </div>
        <div className="kpi-cell">
          <small>UANG BEBAS BULAN INI</small>
          <strong>{formatRupiah(budgetStatus.disposableMonthly)}</strong>
          <span>Setelah cicilan, biaya tetap &amp; tabungan</span>
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
                : 'Ada pos yang perlu diperbaiki'}
          </span>
        </div>
      </section>

      {/* UPGRADE NOTICE */}
      {!isPremium && (
        <div className="free-tier-notice">
          <div className="free-tier-notice__content">
            <span className="free-tier-notice__dot"></span>
            <div>
              <span className="free-tier-notice__label">KAMU SEDANG DI PAKET GRATIS</span>
              <span className="free-tier-notice__desc">
                Kamu dapat mencatat transaksi, cicilan, dan aneka pemasukan. Buka batas jajan harian adaptif,
                carry-over otomatis, dan alokasi 50/30/20 dengan paket Pro.
              </span>
            </div>
          </div>
          <button type="button" onClick={() => navigate('/subscription')} className="pill dark">
            <span className="inline-flex items-center gap-1.5">Coba Pro — Rp 29.900 <Icon name="arrowRight" size={13} /></span>
          </button>
        </div>
      )}

      {/* SMART NLP TRANSACTION INPUT STRIP (AREA CORETAN ORANYE) */}
      <NlpTransactionBox
        onAddTransaction={handleAddTransaction}
        monthlyIncome={effectiveIncome}
        dailyLimit={budgetStatus.baseDailyLimit}
        recentAmounts={transactions.map((t) => t.amount)}
      />

      {/* MAIN TWO-COLUMN DASHBOARD GRID */}
      <section className="dashboard-columns-grid">
        {/* LEFT COLUMN: DAILY LIMIT + GAUGES + HEALTH SCORE */}
        <div className="dashboard-left-col">
          <DailyLimitCard
            dailyLimit={availableDailyLimit}
            spentToday={spentTodayEffective}
            spentTodayReal={spentTodayReal}
            daysRemaining={daysRemaining}
            paydayDate={paydayDate}
            disposableMonthly={budgetStatus.disposableMonthly}
            baseDailyLimit={budgetStatus.baseDailyLimit}
            yesterdaySurplus={budgetStatus.yesterdaySurplus}
            carryOverEnabled={budget.carry_over_daily ?? true}
          />

          <BudgetGauge
            monthlyBudget={budgetStatus.disposableMonthly}
            monthlySpent={budgetStatus.cumulativeSpent}
            dailyLimit={availableDailyLimit}
            dailySpent={spentTodayEffective}
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
            <TransactionForm
              onAddTransaction={handleAddTransaction}
              monthlyIncome={effectiveIncome}
              dailyLimit={budgetStatus.baseDailyLimit}
              recentAmounts={transactions.map((t) => t.amount)}
            />
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
