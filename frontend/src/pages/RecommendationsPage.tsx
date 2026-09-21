import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, getProfile, getBudgetSettings } from '../lib/storage';
import { kostTiers, getKostTierForSalary } from '../data/recommendations';
import { formatRupiah, calculateAllocation } from '../lib/calculator';
import { KostCard } from '../components/KostCard';
import { MealPlanCard } from '../components/MealPlanCard';
import { SubscriptionGate } from '../components/SubscriptionGate';

export const RecommendationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'kost' | 'meals'>('kost');
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (loading) return;
    const ctx = gsap.context(() => {
      gsap.from('.kost-card, .meal-plan-card, .basket-detail-card', {
        y: 35,
        opacity: 0,
        duration: 0.7,
        stagger: 0.12,
        ease: 'power3.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, [loading, activeTab]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    getProfile(user.id).then((p) => {
      if (p) setProfile(p);
      setLoading(false);
    });
  }, [user, navigate]);

  const salary = profile?.monthly_salary || 5500000;
  const fixedExpenses = profile?.fixed_expenses || 1200000;
  const maxRentBudget = salary * 0.25;
  const recommendedTier = getKostTierForSalary(salary);

  const defaultAllocation = calculateAllocation(salary, fixedExpenses, {
    needs: 50,
    wants: 30,
    savings: 20,
  });

  if (loading) {
    return (
      <div className="dashboard-loading-state">
        <div className="status-modal__spinner" />
        <small>MEMUAT ENGINE REKOMENDASI...</small>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="recommendations-page-container">
      <SubscriptionGate
        title="Rekomendasi Kost &amp; Belanja Makan"
        description="Lihat tipe kost yang masuk anggaran gajimu (maksimal 25%), plus perkiraan belanja minimarket untuk kebutuhan makan harian."
        featureName="costKu Pro"
      >
        <div className="page-head-strip">
          <div>
            <small className="accent">Gaya hidup sesuai gaji</small>
            <h2>Rekomendasi yang masuk anggaranmu</h2>
            <p>
              Ubah persentase anggaran jadi pilihan nyata: tipe kost yang aman untuk gajimu,
              dan pilihan belanja makan dari minimarket terdekat.
            </p>
          </div>

          <div className="lifestyle-user-summary">
            <div>
              <small>GAJI BERSIHMU</small>
              <b>{formatRupiah(salary)}/bln</b>
            </div>
            <div>
              <small>BATAS SEWA KOST (25%)</small>
              <b className="accent">{formatRupiah(maxRentBudget)}/bln</b>
            </div>
          </div>
        </div>

        {/* TABS SELECTOR */}
        <div className="recommendations-tabs-bar">
          <button
            type="button"
            className={`rec-tab-btn ${activeTab === 'kost' ? 'active' : ''}`}
            onClick={() => setActiveTab('kost')}
          >
            Kost &amp; Tempat Tinggal
          </button>
          <button
            type="button"
            className={`rec-tab-btn ${activeTab === 'meals' ? 'active' : ''}`}
            onClick={() => setActiveTab('meals')}
          >
            Makan &amp; Belanja Minimarket
          </button>
        </div>

        {/* CONTENT */}
        {activeTab === 'kost' ? (
          <section className="kost-recommendations-section">
            <div className="recommendation-criteria-banner">
              <div>
                <small className="accent">PATOKAN SEWA</small>
                <h4>MAKSIMAL 20%–25% DARI GAJI</h4>
              </div>
              <p>
                Sewa kost di atas 25% gaji berisiko bikin uangmu habis sebelum akhir bulan
                dan mengorbankan tabungan darurat.
              </p>
            </div>

            <div className="kost-cards-grid">
              {kostTiers.map((tier) => (
                <KostCard
                  key={tier.id}
                  tier={tier}
                  isRecommended={tier.id === recommendedTier.id}
                  userSalary={salary}
                />
              ))}
            </div>
          </section>
        ) : (
          <section className="meal-recommendations-section">
            <MealPlanCard userNeedsAmount={defaultAllocation.needsAmount} />
          </section>
        )}
      </SubscriptionGate>
    </div>
  );
};
