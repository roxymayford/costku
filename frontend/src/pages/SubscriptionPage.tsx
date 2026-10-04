import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';

export function SubscriptionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    subscription,
    isPremium,
    isSoftLaunch,
    lockSubscription,
  } = useSubscription();

  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  const handleLockedClick = (planName: string) => {
    setModalMessage({
      type: 'info',
      text: `Fitur transaksi langganan ${planName} saat ini dikunci untuk periode Soft Launch. Akun Anda sudah otomatis memiliki akses penuh Pro Advisor secara gratis!`,
    });
  };

  return (
    <div className="subscription-page">
      {/* Header Banner */}
      <div className="subscription-header">
        <div>
          <span className="subscription-header__label">
            PAKET &amp; LANGGANAN — SOFT LAUNCH SPECIAL
          </span>
          <h1>Akses Penuh Pro Advisor</h1>
          <p className="subscription-header__desc">
            Selama fase <strong>Soft Launch</strong>, fitur transaksi pembayaran langganan kami kunci sementara.
            Seluruh pengguna aktif langsung mendapatkan hak akses ke seluruh fitur <strong>costKu Pro Advisor</strong> secara gratis!
          </p>
        </div>
        <div className="subscription-header__status">
          <span className="subscription-header__status-label">Status Akun:</span>
          <span className="badge-plan badge-plan--pro badge-plan--softlaunch">
            <span className="inline-flex items-center gap-1">
              <Icon name="star" size={11} /> PRO ADVISOR (SOFT LAUNCH)
            </span>
          </span>
        </div>
      </div>

      {/* Notification Modal / Alert */}
      {modalMessage && (
        <div className={`sub-alert sub-alert--${modalMessage.type}`}>
          <div className="sub-alert__content">
            <span>
              <Icon name={modalMessage.type === 'success' ? 'check' : modalMessage.type === 'error' ? 'x' : 'info'} size={15} />
            </span>
            <span>{modalMessage.text}</span>
          </div>
          <button
            onClick={() => setModalMessage(null)}
            className="sub-alert__close"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Soft Launch Announcement Showcase Box */}
      <div className="sub-softlaunch-box">
        <div className="sub-softlaunch-box__head">
          <span className="sub-softlaunch-box__tag">
            <Icon name="lock" size={12} /> FITUR PEMBAYARAN DIKUNCI
          </span>
          <span className="sub-softlaunch-box__status">
            <Icon name="check" size={13} /> Akses Bebas 100% Tanpa Biaya
          </span>
        </div>
        <h2 className="sub-softlaunch-box__title">
          Semua Pengguna Otomatis Menggunakan costKu Pro Advisor
        </h2>
        <p className="sub-softlaunch-box__desc">
          Kami menonaktifkan seluruh proses checkout / langganan berbayar agar Anda dapat mengeksplorasi seluruh fitur
          analisis keuangan cerdas kami tanpa batasan pembayaran atau komitmen langganan:
        </p>
        <div className="sub-softlaunch-box__grid">
          <div className="sub-softlaunch-box__item">
            <span className="sub-softlaunch-box__check"><Icon name="check" size={14} /></span>
            <div>
              <strong>Batas Jajan Harian (Safe-to-Spend)</strong>
              <small>Batas aman jajan per hari yang otomatis beradaptasi dengan sisa hari gajian.</small>
            </div>
          </div>
          <div className="sub-softlaunch-box__item">
            <span className="sub-softlaunch-box__check"><Icon name="check" size={14} /></span>
            <div>
              <strong>Formula Alokasi Gaji 50/30/20</strong>
              <small>Pembagian cerdas antara Kebutuhan Pokok, Keinginan, dan Tabungan/Investasi.</small>
            </div>
          </div>
          <div className="sub-softlaunch-box__item">
            <span className="sub-softlaunch-box__check"><Icon name="check" size={14} /></span>
            <div>
              <strong>Rekomendasi Tipe Kost &amp; Meal Plan</strong>
              <small>Panduan sewa kost proporsional gaji serta estimasi menu hemat bulanan.</small>
            </div>
          </div>
          <div className="sub-softlaunch-box__item">
            <span className="sub-softlaunch-box__check"><Icon name="check" size={14} /></span>
            <div>
              <strong>Financial Health Score (0–100)</strong>
              <small>Diagnostik kesehatan arus kas dan ketahanan finansial secara real-time.</small>
            </div>
          </div>
        </div>
      </div>

      {/* Active Subscription Status Banner */}
      <div className="sub-active-banner">
        <div>
          <div className="sub-active-banner__label">
            STATUS LANGGANAN ANDA AKTIF
          </div>
          <div className="sub-active-banner__plan">
            Paket: costKu Pro Advisor (Soft Launch Edition)
          </div>
          <div className="sub-active-banner__expiry">
            Masa aktif: Berlaku gratis tanpa batas selama masa Soft Launch berlangsung
          </div>
        </div>
        <div className="sub-active-banner__actions">
          <button
            onClick={() => navigate('/alokasi')}
            className="sub-active-banner__btn"
          >
            <span className="inline-flex items-center gap-1.5">Buka Alokasi 50/30/20 <Icon name="arrowRight" size={13} /></span>
          </button>
          <button
            onClick={() => navigate('/rekomendasi')}
            className="sub-active-banner__btn"
          >
            <span className="inline-flex items-center gap-1.5">Rekomendasi Gaya Hidup <Icon name="arrowRight" size={13} /></span>
          </button>
        </div>
      </div>

      {/* Plan Cards Grid */}
      <div className="plans-grid">
        {/* Card 1: Free Tier */}
        <div className="plan-card plan-card--dimmed">
          <div>
            <div className="plan-card__head">
              <span className="plan-card__tag">PAKET DASAR</span>
            </div>
            <h3 className="plan-card__title">Money Tracker</h3>
            <div className="plan-card__price">
              <span className="plan-card__price-val">Rp 0</span>
              <span className="plan-card__price-unit"> / selamanya</span>
            </div>
            <p className="plan-card__desc">
              Pencatatan pengeluaran harian dan pemasukan standar.
            </p>

            <ul className="plan-card__features">
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--check"><Icon name="check" size={14} /></span> Catat transaksi pemasukan &amp; pengeluaran
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--check"><Icon name="check" size={14} /></span> Riwayat transaksi dan filter tanggal
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--check"><Icon name="check" size={14} /></span> Dashboard ringkasan arus kas
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Terbuka di Soft Launch
              </li>
            </ul>
          </div>

          <div className="plan-card__footer">
            <button
              disabled
              className="plan-card__btn plan-card__btn--disabled"
            >
              Ter-upgrade ke Pro Advisor
            </button>
          </div>
        </div>

        {/* Card 2: Premium Monthly */}
        <div className="plan-card plan-card--active">
          <div>
            <div className="plan-card__head">
              <span className="plan-card__tag plan-card__tag--softlaunch">AKTIF DI SOFT LAUNCH</span>
              <span className="plan-card__status">AKTIF</span>
            </div>
            <h3 className="plan-card__title">Advisor Bulanan</h3>
            <div className="plan-card__price">
              <span className="plan-card__price-val" style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '18px', marginRight: '8px' }}>
                Rp 29.900
              </span>
              <span className="plan-card__price-val" style={{ color: '#008547' }}>
                Rp 0
              </span>
              <span className="plan-card__price-unit"> / Soft Launch</span>
            </div>
            <p className="plan-card__desc">
              Semua fitur pendamping keuangan, aktif gratis untuk Anda.
            </p>

            <ul className="plan-card__features">
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--check"><Icon name="check" size={14} /></span> Semua fitur Money Tracker
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Batas jajan harian otomatis (Safe-to-Spend)
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Alokasi 50/30/20 yang bisa diatur
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Rekomendasi tipe kost sesuai gaji
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Paket belanja minimarket &amp; rencana makan
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Skor kesehatan keuangan (0–100)
              </li>
            </ul>
          </div>

          <div className="plan-card__footer">
            <button
              onClick={() => handleLockedClick('Bulanan')}
              className="plan-card__btn plan-card__btn--locked"
            >
              🔒 Terkunci (Sedang Aktif Gratis)
            </button>
          </div>
        </div>

        {/* Card 3: Premium Yearly */}
        <div className="plan-card plan-card--featured">
          <div>
            <div className="plan-card__head">
              <span className="plan-card__tag">PAKET TAHUNAN</span>
              <span className="plan-card__status" style={{ background: '#f1f5f9', color: '#64748b', borderColor: '#cbd5e1' }}>TERKUNCI</span>
            </div>
            <h3 className="plan-card__title">Advisor Tahunan</h3>
            <div className="plan-card__price">
              <span className="plan-card__price-val" style={{ textDecoration: 'line-through', color: '#94a3b8', fontSize: '18px', marginRight: '8px' }}>
                Rp 249.000
              </span>
              <span className="plan-card__price-val" style={{ color: '#008547' }}>
                Rp 0
              </span>
              <span className="plan-card__price-unit"> / Soft Launch</span>
            </div>
            <p className="plan-card__desc">
              Pilihan hemat 12 bulan — akan tersedia setelah fase soft launch.
            </p>

            <ul className="plan-card__features">
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--check"><Icon name="check" size={14} /></span> Semua fitur Advisor Bulanan
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Akses prioritas update fitur AI &amp; analitik
              </li>
              <li className="plan-card__feature">
                <span className="plan-card__feature-icon plan-card__feature-icon--star"><Icon name="star" size={14} /></span> Akses fitur Pro saat ini sudah terbuka gratis
              </li>
            </ul>
          </div>

          <div className="plan-card__footer">
            <button
              onClick={() => handleLockedClick('Tahunan')}
              className="plan-card__btn plan-card__btn--locked"
            >
              🔒 Pembayaran Dikunci Sementara
            </button>
          </div>
        </div>
      </div>

      {/* Payment Gateway Information footer */}
      <div className="sub-payment-info">
        <div className="sub-payment-info__title">
          PEMBAYARAN DITANGGUHKAN SEMENTARA (SOFT LAUNCH)
        </div>
        <p>
          Gerbang pembayaran Midtrans saat ini dinonaktifkan secara sengaja untuk masa Soft Launch.
          Seluruh pengguna dapat memanfaatkan seluruh fitur premium costKu Pro Advisor tanpa dipungut biaya
          dan tanpa perlu mendaftarkan metode pembayaran apa pun.
        </p>
      </div>
    </div>
  );
}
