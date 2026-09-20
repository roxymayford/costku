import React, { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';

gsap.registerPlugin(ScrollTrigger);

const metrics = [
  {
    code: '01 / DISIPLIN HARIAN',
    targetValue: 87500,
    prefix: 'Rp ',
    suffix: ' / hari',
    label: 'Safe-to-Spend Riil',
    desc: 'Batas jajan harian otomatis dihitung dari gaji bersih setelah memotong sewa kost, cicilan tetap, & target tabungan.',
  },
  {
    code: '02 / HUNIAN AMAN',
    targetValue: 25,
    prefix: '',
    suffix: '% Maksimal',
    label: 'Plafon Sewa Kost',
    desc: 'Formula pencegah overbudget hunian: membatasi pengeluaran kost maksimal 25% dari take-home pay bulanan.',
  },
  {
    code: '03 / RASIO FLEKSIBEL',
    targetValue: 100,
    prefix: '',
    suffix: '% Terdistribusi',
    label: 'Alokasi 50/30/20 Adaptif',
    desc: 'Slider adaptif Needs, Wants, & Savings yang dapat disesuaikan dengan profil riil mahasiswa, first-jobber, atau eksekutif.',
  },
  {
    code: '04 / DIAGNOSIS KEUANGAN',
    targetValue: 88,
    prefix: '',
    suffix: ' / 100',
    label: 'Skor Kesehatan Finansial',
    desc: 'Indikator audit instan berbasis rasio tabungan darurat, debt ratio, dan kedisiplinan pengeluaran harian.',
  },
];

interface IncomePreset {
  id: string;
  badge: string;
  title: string;
  salary: number;
  salaryFormatted: string;
  kostLimit: string;
  kostPercent: string;
  safeToSpend: string;
  needs: string;
  wants: string;
  savings: string;
  kostProfile: string;
  mealProfile: string;
  strategy: string;
  status: string;
}

const incomePresets: IncomePreset[] = [
  {
    id: 'preset-1',
    badge: 'PRESET 01 // ENTRY LEVEL',
    title: 'UMR Metropolitan',
    salary: 5200000,
    salaryFormatted: 'Rp 5.200.000',
    kostLimit: 'Rp 1.300.000',
    kostPercent: '25.0%',
    safeToSpend: 'Rp 52.000 / hari',
    needs: 'Rp 2.600.000 (50%)',
    wants: 'Rp 1.560.000 (30%)',
    savings: 'Rp 1.040.000 (20%)',
    kostProfile: 'Kamar Non-AC / Kamar Mandi Luar (Dekat Jalur KRL/Mikrotrans)',
    mealProfile: 'Warteg Standard + Masak Nasi & Lauk Sederhana Mandiri',
    strategy: 'Kunci disiplin batas jajan harian Rp 52rb dan amankan dana darurat Rp 2 juta pertama.',
    status: 'SURVIVAL DISIPLIN & DANA DARURAT',
  },
  {
    id: 'preset-2',
    badge: 'PRESET 02 // FIRST JOBBER',
    title: 'Junior Specialist',
    salary: 8500000,
    salaryFormatted: 'Rp 8.500.000',
    kostLimit: 'Rp 2.125.000',
    kostPercent: '25.0%',
    safeToSpend: 'Rp 85.000 / hari',
    needs: 'Rp 4.250.000 (50%)',
    wants: 'Rp 2.550.000 (30%)',
    savings: 'Rp 1.700.000 (20%)',
    kostProfile: 'Kost AC Standard Kamar Mandi Dalam (Dekat MRT / Koridor Utama)',
    mealProfile: 'Kantin Karyawan Siang + Meal Prep Belanja Retail Mingguan',
    strategy: 'Otomasi auto-debit tabungan 20% pada tanggal gajian & kendalikan impuls checkout marketplace.',
    status: 'CASHFLOW STABIL & AKSELERASI ASET',
  },
  {
    id: 'preset-3',
    badge: 'PRESET 03 // PROFESSIONAL',
    title: 'Mid-Career Talent',
    salary: 14000000,
    salaryFormatted: 'Rp 14.000.000',
    kostLimit: 'Rp 3.500.000',
    kostPercent: '25.0%',
    safeToSpend: 'Rp 140.000 / hari',
    needs: 'Rp 7.000.000 (50%)',
    wants: 'Rp 4.200.000 (30%)',
    savings: 'Rp 2.800.000 (20%)',
    kostProfile: 'Co-Living Eksklusif / Apartemen Studio (Akses Walkable ke Hub Bisnis)',
    mealProfile: 'Kombinasi Bahan Segar Supermarket + Budget Kafe Produktif Terukur',
    strategy: 'Proteksi gaya hidup dari lifestyle inflation; alokasikan surplus wants ke portofolio investasi.',
    status: 'EKSPANSI ASET & KONTROL INFLASI GAYA HIDUP',
  },
];

export const LandingPage: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, loginDemo } = useAuth();

  const [scrollPercent, setScrollPercent] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<string>('01 // HERO');
  const [activePresetId, setActivePresetId] = useState<string>('preset-2');

  const activePreset = incomePresets.find((p) => p.id === activePresetId) || incomePresets[1];

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Swiss Scroll Progress Ruler along top screen
      gsap.to('.swiss-scroll-ruler-fill', {
        width: '100%',
        ease: 'none',
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.1,
          onUpdate: (self) => {
            const pct = Math.round(self.progress * 100);
            setScrollPercent(pct);
            if (pct < 18) setActiveSection('01 // OVERVIEW');
            else if (pct < 38) setActiveSection('02 // SPESIFIKASI');
            else if (pct < 58) setActiveSection('03 // LAB ARSITEKTUR');
            else if (pct < 78) setActiveSection('04 // MATRIKS PROTOKOL');
            else if (pct < 92) setActiveSection('05 // TELEMETRI');
            else setActiveSection('06 // ONBOARDING');
          },
        },
      });

      // 2. Hero Headline & Badges Entrance
      gsap.from('.hero-copy > *', {
        y: 28,
        opacity: 0,
        duration: 0.75,
        stagger: 0.08,
        ease: 'power3.out',
      });

      // 3. Hero Preview Panel Entrance (Static in place, no scroll parallax)
      gsap.from('.hero-preview-panel', {
        x: 40,
        opacity: 0,
        duration: 0.9,
        delay: 0.2,
        ease: 'power3.out',
        clearProps: 'transform',
      });

      // 4. Radar scanner bar animation inside terminal
      gsap.to('.terminal-scan', {
        y: 190,
        duration: 2.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      // 5. Kinetic Marquee Scroll-Velocity Coupling
      const marqueeTrack = document.querySelector('.swiss-marquee-track');
      if (marqueeTrack) {
        let currentX = 0;
        const baseSpeed = -1.2;

        const updateMarquee = () => {
          currentX += baseSpeed;
          if (currentX <= -600) currentX = 0;
          gsap.set(marqueeTrack, { x: currentX });
        };

        gsap.ticker.add(updateMarquee);

        ScrollTrigger.create({
          trigger: root.current,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => {
            const velocity = self.getVelocity();
            const boost = Math.min(Math.max(velocity / 120, -10), 10);
            currentX -= boost;
          },
        });
      }

      // 6. Metrics Section - Staggered entrance & Animated Number Counters
      gsap.from('.metric', {
        scrollTrigger: {
          trigger: '.metrics',
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        y: 35,
        opacity: 0,
        stagger: 0.1,
        duration: 0.7,
        ease: 'power2.out',
      });

      // Animate numerical counters when metrics scroll into view
      metrics.forEach((m, idx) => {
        const counterEl = document.getElementById(`metric-counter-${idx}`);
        if (counterEl) {
          const proxy = { val: 0 };
          gsap.to(proxy, {
            val: m.targetValue,
            duration: 1.6,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: '.metrics',
              start: 'top 82%',
              toggleActions: 'play none none none',
            },
            onUpdate: () => {
              if (m.targetValue > 1000) {
                counterEl.textContent = `${m.prefix}${Math.round(proxy.val).toLocaleString('id-ID')}${m.suffix}`;
              } else {
                counterEl.textContent = `${m.prefix}${Math.round(proxy.val)}${m.suffix}`;
              }
            },
          });
        }
      });

      // 7. Swiss Lab Interactive Section Reveal
      gsap.from('.swiss-lab-grid > *', {
        scrollTrigger: {
          trigger: '.swiss-lab-section',
          start: 'top 80%',
        },
        y: 32,
        opacity: 0,
        stagger: 0.12,
        duration: 0.7,
        ease: 'power3.out',
      });

      // 8. Swiss Protocol Editorial Items Reveal
      gsap.from('.swiss-protocol-item', {
        scrollTrigger: {
          trigger: '.swiss-matrix-section',
          start: 'top 80%',
        },
        y: 25,
        opacity: 0,
        stagger: 0.1,
        duration: 0.6,
        ease: 'power2.out',
      });

      // 9. Swiss Telemetry Bento Cards Reveal
      gsap.from('.swiss-telemetry-card', {
        scrollTrigger: {
          trigger: '.swiss-telemetry-section',
          start: 'top 82%',
        },
        y: 28,
        opacity: 0,
        stagger: 0.12,
        duration: 0.65,
        ease: 'power2.out',
      });

      // 9. CTA Section Reveal
      gsap.from('.cta > *', {
        scrollTrigger: {
          trigger: '.cta',
          start: 'top 88%',
        },
        y: 25,
        opacity: 0,
        stagger: 0.08,
        duration: 0.65,
        ease: 'power2.out',
      });

      // Refresh ScrollTrigger calculations after all styles mount
      ScrollTrigger.refresh();
    }, root);

    return () => ctx.revert();
  }, []);

  const handleStart = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth?mode=register');
    }
  };

  const handleDemo = () => {
    loginDemo();
    navigate('/dashboard');
  };

  return (
    <div ref={root} className="fatrack-landing">
      {/* SWISS SCROLL PROGRESS RULER */}
      <div className="swiss-scroll-ruler">
        <div className="swiss-scroll-ruler-fill" />
      </div>

      {/* SWISS HUD SCROLL TRACKER BADGE */}
      <div className="swiss-scroll-tracker-badge">
        <span className="pulse-dot" />
        <span>{activeSection}</span>
        <b style={{ color: 'var(--orange)' }}>{scrollPercent}%</b>
      </div>

      {/* TOPBAR */}
      <header className="topbar">
        <div className="brand">
          <span className="avatar">FA</span>
          <b>FATRACK</b>
          <i>/</i>
          <span>PERSONAL FINANCE ADVISOR</span>
        </div>
        <nav>
          <a href="#metrik">SPESIFIKASI</a>
          <a href="#arsitektur">ARSITEKTUR</a>
          <a href="#matriks">MATRIKS PROTOKOL</a>
          <a href="#telemetri">TELEMETRI</a>
        </nav>
        <div className="actions">
          <button className="nav-link" type="button" onClick={() => navigate('/auth?mode=login')}>
            MASUK
          </button>
          <button className="pill dark" type="button" onClick={handleStart}>
            MULAI SEKARANG
          </button>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> EDISI 2026 / PERSONAL FINANCE INDONESIA
            </div>
            <h1>
              NAVIGASI GAJI
              <br />
              DAN GAYA HIDUP
              <br />
              DENGAN PRESISI.
            </h1>
            <p className="lead">
              Platform penasihat keuangan personal untuk first-jobber & pekerja muda Indonesia.
              Konversi angka gaji bulanan menjadi batas jajan harian dan rekomendasi gaya hidup nyata (tipe kost & paket belanja retail).
            </p>
            <div className="hero-bottom">
              <div>
                <button className="pill dark" type="button" onClick={handleStart}>
                  BUKA AKUN GRATIS
                </button>
                <button className="outline" type="button" onClick={handleDemo}>
                  <span className="inline-flex items-center gap-1.5">COBA DEMO LANGSUNG <Icon name="arrowRight" size={14} /></span>
                </button>
              </div>
              <div className="micro">
                <span>TARGET AUDIENCE<strong>FIRST-JOBBER & PEKERJA</strong></span>
                <span>METODOLOGI<strong>SAFE-TO-SPEND + 50/30/20</strong></span>
                <span>INTEGRASI RETAIL<strong>ALFAMART / INDOMARET</strong></span>
              </div>
            </div>
          </div>

          {/* RIGHT TERMINAL PREVIEW */}
          <aside className="hero-preview-panel terminal">
            <div className="terminal-head">
              <span className="terminal-pulse">■</span> TELEMETRI KEUANGAN PERSONAL
              <span>ALGORITMA LIVE</span>
            </div>

            <div className="terminal-body">
              <div className="worth terminal-card">
                <span className="terminal-scan" />
                <small>
                  01 / SIMULASI SAFE-TO-SPEND <b className="green">LIMIT AKTIF</b>
                </small>
                <strong>Rp 87.500 <small style={{ fontSize: '14px', fontWeight: 500 }}>/ hari</small></strong>
                <span>FORMULA: (GAJI NETTO − BIAYA TETAP − TABUNGAN) ÷ HARI</span>
              </div>

              <div className="twins terminal-card">
                <div>
                  <small>SIMULASI GAJI BULANAN</small>
                  <b>Rp 5.500.000</b>
                  <span>Siklus: Tgl 25</span>
                </div>
                <div>
                  <small>PLAFON KOST MAKSIMAL</small>
                  <b className="accent">Rp 1.375.000</b>
                  <span>Maks 25% Gaji</span>
                </div>
              </div>

              <div className="allocation terminal-card">
                <small>REKOMENDASI ALOKASI 50/30/20</small>
                <span>
                  Needs (Kost + Makan + Transport) <b>50% · Rp 2.750.000</b>
                  <i><em style={{ width: '50%' }} /></i>
                </span>
                <span>
                  Wants (Jajan Kopi & Lifestyle) <b>30% · Rp 1.650.000</b>
                  <i><em style={{ width: '30%', backgroundColor: 'var(--orange)' }} /></i>
                </span>
                <span>
                  Savings (Dana Darurat & Investasi) <b>20% · Rp 1.100.000</b>
                  <i><em style={{ width: '20%', backgroundColor: '#008547' }} /></i>
                </span>
              </div>
            </div>

            <div className="terminal-foot">
              DISIPLIN FINANSIAL <b>STATUS: ZERO ARITHMETIC DRIFT</b>
            </div>
          </aside>
        </section>

        {/* KINETIC MARQUEE STRIP */}
        <section className="swiss-marquee-section">
          <div className="swiss-marquee-track">
            <span>FATRACK <b className="sep">/</b> PERSONAL FINANCE ADVISOR</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> SAFE-TO-SPEND FORMULA</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> ZERO ARITHMETIC DRIFT</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> 50/30/20 ADAPTIVE RATIO</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> KOST & MINIMARKET RECOMMENDATION</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> EDISI INDONESIA 2026</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> SUPABASE ENCRYPTED</span>
            <span>FATRACK <b className="sep">/</b> PERSONAL FINANCE ADVISOR</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> SAFE-TO-SPEND FORMULA</span>
            <span><b className="sep"><Icon name="sparkle" size={12} /></b> ZERO ARITHMETIC DRIFT</span>
          </div>
        </section>

        {/* METRICS SECTION WITH ANIMATED SCROLL COUNTERS */}
        <section id="metrik" className="metrics">
          {metrics.map((m, idx) => (
            <article className="metric" key={m.code}>
              <small>{m.code}</small>
              <strong id={`metric-counter-${idx}`}>
                {m.prefix}0{m.suffix}
              </strong>
              <b style={{ display: 'block', fontSize: '13px', margin: '4px 0', color: '#111' }}>
                {m.label}
              </b>
              <p>{m.desc}</p>
            </article>
          ))}
        </section>

        {/* SWISS LAB SECTION: INTERACTIVE SAFE-TO-SPEND SANDBOX */}
        <section id="arsitektur" className="swiss-lab-section reveal">
          <div className="swiss-section-meta">
            <span>SISTEM 01 // ARSITEKTUR KOMPUTASI DETERMINISTIK</span>
            <span>PRESISI MATEMATIS · ZERO ARITHMETIC DRIFT</span>
          </div>

          <div className="swiss-lab-grid">
            <div className="swiss-lab-manifesto">
              <span className="swiss-index-badge">01.0 // MANIFESTO</span>
              <h2>
                UANG ADALAH ALAT KEBEBASAN,
                <br />
                BUKAN SUMBER KECEMASAN.
              </h2>
              <p className="lead">
                Kecemasan finansial muncul saat Anda menebak-nebak saldo di rekening. 
                FATrack mengubah ketidakpastian menjadi batas numerik absolut: 
                setiap rupiah memiliki tujuan terdefinisi sebelum hari berganti.
              </p>

              <div className="swiss-manifesto-pillars">
                <div className="swiss-pillar">
                  <small className="accent">HUKUM #1 // BATAS HUNIAN</small>
                  <h4>PLAFON SEWA MAKS 25%</h4>
                  <p>Menjaga rasio sewa hunian tidak melumpuhkan kapasitas akumulasi modal jangka panjang.</p>
                </div>
                <div className="swiss-pillar">
                  <small className="accent">HUKUM #2 // LIKUIDITAS</small>
                  <h4>SAFE-TO-SPEND HARIAN</h4>
                  <p>Batas jajan non-esensial dinamis agar Anda bebas ngopi tanpa rasa bersalah.</p>
                </div>
                <div className="swiss-pillar">
                  <small className="accent">HUKUM #3 // INTEGRITAS</small>
                  <h4>PAY YOURSELF FIRST 20%</h4>
                  <p>Alokasi tabungan dikunci saat tanggal gajian sebelum dana operasional didistribusikan.</p>
                </div>
              </div>
            </div>

            <div className="swiss-lab-calculator">
              <div className="swiss-calc-header">
                <div>
                  <small className="accent">SIMULATOR KOMPUTASI REAL-TIME</small>
                  <h3>LABORATORIUM ARUS KAS URBAN</h3>
                </div>
                <span className="swiss-calc-status">● LIVE SANDBOX</span>
              </div>

              {/* PRESET CHIPS */}
              <div className="swiss-preset-chips">
                {incomePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`swiss-chip ${activePresetId === preset.id ? 'active' : ''}`}
                    onClick={() => setActivePresetId(preset.id)}
                  >
                    <span>{preset.badge.split(' // ')[1]}</span>
                    <strong>{preset.salaryFormatted}</strong>
                  </button>
                ))}
              </div>

              {/* CALCULATION TELEMETRY DISPLAY */}
              <div className="swiss-calc-display">
                <div className="swiss-calc-card primary-output">
                  <small>BATAS PENGELUARAN AMAN HARIAN (SAFE-TO-SPEND)</small>
                  <div className="swiss-calc-value">
                    <strong>{activePreset.safeToSpend}</strong>
                    <span className="status-tag">STATUS: KUOTA AKTIF</span>
                  </div>
                  <p className="swiss-calc-desc">{activePreset.strategy}</p>
                </div>

                <div className="swiss-calc-twins">
                  <div className="swiss-calc-card">
                    <small>PLAFON SEWA KOST BULANAN</small>
                    <strong>{activePreset.kostLimit}</strong>
                    <span>Maksimal 25.0% dari gaji bersih</span>
                    <div className="swiss-subtext">{activePreset.kostProfile}</div>
                  </div>

                  <div className="swiss-calc-card">
                    <small>STRATEGI LOGISTIK KONSUMSI</small>
                    <strong style={{ fontSize: '16px', lineHeight: 1.3 }}>WARTEG + RETAIL PREP</strong>
                    <span>Estimasi kebutuhan nutrisi harian</span>
                    <div className="swiss-subtext">{activePreset.mealProfile}</div>
                  </div>
                </div>

                {/* ALLOCATION RATIO BAR */}
                <div className="swiss-calc-card allocation-strip">
                  <small>DISTRIBUSI ALOKASI SISTEMIK</small>
                  <div className="swiss-ratio-bars">
                    <div className="ratio-segment needs" style={{ width: '50%' }}>
                      <span>Needs 50%</span>
                    </div>
                    <div className="ratio-segment wants" style={{ width: '30%' }}>
                      <span>Wants 30%</span>
                    </div>
                    <div className="ratio-segment savings" style={{ width: '20%' }}>
                      <span>Save 20%</span>
                    </div>
                  </div>
                  <div className="swiss-ratio-legend">
                    <span><b>50% Kebutuhan:</b> {activePreset.needs}</span>
                    <span><b>30% Gaya Hidup:</b> {activePreset.wants}</span>
                    <span><b>20% Investasi:</b> {activePreset.savings}</span>
                  </div>
                </div>

                <div className="swiss-calc-footer">
                  <span>VERIFIKASI: <b>{activePreset.status}</b></span>
                  <button className="pill dark mini-btn" type="button" onClick={handleStart}>
                    TERAPKAN PROFIL INI <Icon name="arrowRight" size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SWISS NARRATIVE PROTOCOL SECTION */}
        <section id="matriks" className="swiss-matrix-section reveal">
          <div className="swiss-section-meta">
            <span>SISTEM 02 // PROTOKOL & DOKTRIN PENGELUARAN URBAN</span>
            <span>4 HUKUM DISIPLIN ARUS KAS METROPOLITAN 2026</span>
          </div>

          <div className="swiss-matrix-header">
            <div>
              <small className="accent">DOKTRIN ARUS KAS REALISTIS</small>
              <h2>4 PRINSIP MUTLAK ARUS KAS URBAN</h2>
            </div>
            <p>
              Bukan sekadar kalkulasi angka. Ini adalah 4 kaidah baku yang membedakan pekerja yang berhasil membangun aset dengan mereka yang terjebak dalam siklus gaji numpang lewat.
            </p>
          </div>

          <div className="swiss-protocols-editorial">
            <article className="swiss-protocol-item">
              <div className="protocol-index">01</div>
              <div className="protocol-content">
                <small className="accent">DOKTRIN #1 // BATAS ATAP HUNIAN</small>
                <h3>PLAFON SEWA KOST TIDAK BOLEH LEBIH DARI 25% GAJI</h3>
                <p className="protocol-quote">
                  "Jangan biarkan gengsi kost mewah melumpuhkan kapasitas akumulasi aset masa depan Anda."
                </p>
                <p className="protocol-body">
                  Banyak pekerja muda di kota besar menghabiskan 40% hingga 50% gaji hanya untuk sewa kost eksklusif demi prestise sesaat. Akibatnya, kapasitas untuk menabung dan berinvestasi menjadi nol. FATrack membatasi batas sewa maksimal pada 25% take-home pay dan membantu Anda menghitung komparasi rasional antara jarak komuter KRL/TransJakarta dan efisiensi biaya sewa.
                </p>
                <div className="protocol-foot">
                  <span>ATURAN BAKU: <b>MAKSIMAL 25% TAKE-HOME PAY</b></span>
                  <span className="swiss-tag green">RULE #1 MUTLAK</span>
                </div>
              </div>
            </article>

            <article className="swiss-protocol-item">
              <div className="protocol-index">02</div>
              <div className="protocol-content">
                <small className="accent">DOKTRIN #2 // LOGISTIK KONSUMSI</small>
                <h3>REKAYASA PANTRY MINIMARKET & WARTEG BERGIZI</h3>
                <p className="protocol-quote">
                  "Food delivery tiga kali sehari dengan ongkir dan service fee ganda adalah kebocoran kas paling senyap."
                </p>
                <p className="protocol-body">
                  Ketergantungan memesan makanan online tanpa disadari menyedot Rp 1,8 juta hingga Rp 2,5 juta ekstra per bulan hanya dari biaya pengiriman dan markup aplikasi. Standar hidup sehat di perkotaan dibangun dari perpaduan realistis: makan siang warteg berprotein lengkap dan meal prep bahan pokok (beras, telur, sayur) yang dibeli dengan indeks harga promo retail terukur.
                </p>
                <div className="protocol-foot">
                  <span>STANDAR BIAYA: <b>RP 35.000 – RP 65.000 / HARI</b></span>
                  <span className="swiss-tag orange">OPTIMASI HARIAN</span>
                </div>
              </div>
            </article>

            <article className="swiss-protocol-item">
              <div className="protocol-index">03</div>
              <div className="protocol-content">
                <small className="accent">DOKTRIN #3 // KENDALI LIKUIDITAS</small>
                <h3>DISIPLIN HARIAN DENGAN KUOTA SAFE-TO-SPEND</h3>
                <p className="protocol-quote">
                  "Saldo tebal di awal bulan adalah ilusi visual paling berbahaya bagi rekening Anda."
                </p>
                <p className="protocol-body">
                  Melihat saldo rekening yang utuh di tanggal gajian memicu bias psikologis bahwa Anda kaya, sehingga pengeluaran impulsif melonjak di sepuluh hari pertama. FATrack memecah sisa likuiditas Anda menjadi angka harian riil (Safe-to-Spend). Anda bebas ngopi atau jajan santai tanpa rasa bersalah selama nominalnya berada di dalam batas aman hari ini.
                </p>
                <div className="protocol-foot">
                  <span>METODOLOGI: <b>SISA LIKUIDITAS ÷ SISA HARI KERJA</b></span>
                  <span className="swiss-tag green">LIVE ENFORCEMENT</span>
                </div>
              </div>
            </article>

            <article className="swiss-protocol-item">
              <div className="protocol-index">04</div>
              <div className="protocol-content">
                <small className="accent">DOKTRIN #4 // AKUMULASI MODAL</small>
                <h3>OTOMASI DISIPLIN PAY YOURSELF FIRST 20%</h3>
                <p className="protocol-quote">
                  "Menabung dari sisa uang di akhir bulan secara empiris selalu berujung pada angka nol."
                </p>
                <p className="protocol-body">
                  Uang yang tidak memiliki pos terencana pasti akan habis terpakai untuk hal-hal sepele. Prinsip dasar kemandirian finansial adalah membayar masa depan Anda sendiri terlebih dahulu. Begitu gaji masuk, minimal 20% langsung dikunci untuk akumulasi dana darurat 3 hingga 6 bulan pengeluaran sebelum sepeser pun uang operasional mulai dibelanjakan.
                </p>
                <div className="protocol-foot">
                  <span>TARGET ALOKASI: <b>MINIMAL 20% TABUNGAN AWAL BULAN</b></span>
                  <span className="swiss-tag dark">OTOMASI DISIPLIN</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* SWISS TELEMETRY BENTO SECTION */}
        <section id="telemetri" className="swiss-telemetry-section reveal">
          <div className="swiss-section-meta">
            <span>SISTEM 03 // TELEMETRI KEBOCORAN & KEAMANAN SISTEM</span>
            <span>INTEGRITAS ARITMATIKA & KEDAULATAN DATA</span>
          </div>

          <div className="swiss-telemetry-grid">
            <article className="swiss-telemetry-card leak-audit">
              <span className="swiss-index-badge">03.A // AUDIT DEVIASI MIKRO</span>
              <h3>DAMPAK KOPI SUSU & JAJAN MIKRO HARIAN</h3>
              <p>
                Pengeluaran kecil yang tidak dicatat seringkali merupakan penyebab utama kegagalan menabung.
              </p>

              <div className="swiss-leak-meter">
                <div className="leak-stat">
                  <small>PENGELUARAN HARIAN</small>
                  <strong>Rp 28.000</strong>
                  <span>1 Gelas Kopi Kekinian</span>
                </div>
                <div className="leak-arrow">→</div>
                <div className="leak-stat">
                  <small>TOTAL 1 BULAN (30 HARI)</small>
                  <strong>Rp 840.000</strong>
                  <span>16.1% dari Gaji UMR</span>
                </div>
                <div className="leak-arrow">→</div>
                <div className="leak-stat highlight">
                  <small>TOTAL 1 TAHUN</small>
                  <strong className="accent">Rp 10.080.000</strong>
                  <span>Modal Investasi Terbuang</span>
                </div>
              </div>

              <div className="swiss-leak-insight">
                <span className="swiss-pill-marker">REKOMENDASI FATRACK</span>
                <p>
                  Bukan berarti Anda dilarang ngopi. Dengan Safe-to-Spend, jajan kopi masuk ke kuota 30% Wants terukur, bukan memotong dana kost atau tabungan darurat.
                </p>
              </div>
            </article>

            <article className="swiss-telemetry-card security-manifesto">
              <span className="swiss-index-badge">03.B // KEDAULATAN DATA</span>
              <h3>ARSITEKTUR KEAMANAN SUPABASE ENCRYPTED</h3>
              <p>
                Informasi finansial Anda adalah hak pribadi mutlak. Kami tidak menjual data ke pihak ketiga atau agensi periklanan.
              </p>

              <div className="swiss-security-grid">
                <div className="swiss-sec-item">
                  <div className="sec-icon"><Icon name="lock" size={16} /></div>
                  <div>
                    <strong>POSTGRES ROW LEVEL SECURITY (RLS)</strong>
                    <p>Hanya token autentikasi akun Anda yang memiliki izin membaca dan menulis data tabel.</p>
                  </div>
                </div>

                <div className="swiss-sec-item">
                  <div className="sec-icon"><Icon name="sparkle" size={16} /></div>
                  <div>
                    <strong>ZERO TELEMETRY AD TRACKERS</strong>
                    <p>Bebas dari Google Analytics pihak ketiga, pixel marketing agresif, atau broker data pinjol.</p>
                  </div>
                </div>

                <div className="swiss-sec-item">
                  <div className="sec-icon"><Icon name="check" size={16} /></div>
                  <div>
                    <strong>LOCAL STORAGE FAILOVER READY</strong>
                    <p>Pencatatan harian tetap bekerja lancar dan sinkron otomatis saat koneksi internet pulih.</p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* CTA */}
        <section id="formula" className="cta reveal">
          <small className="accent">MULAI LANGKAH DISIPLIN KEUANGAN</small>
          <h2>ATUR GAJI ANDA DENGAN STRUKTUR JELAS.</h2>
          <p className="lead">
            Bergabunglah dengan anak muda Indonesia yang mengontrol arus kas dan gaya hidup dengan kalkulasi riil.
          </p>
          <div className="cta-actions">
            <button className="pill dark" type="button" onClick={handleStart}>
              BUAT AKUN SEKARANG
            </button>
            <button className="outline" type="button" onClick={handleDemo}>
              MASUK KE DEMO MODE
            </button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer id="tentang" className="site-footer">
        <div>
          <small>01 / IDENTITAS</small>
          <p>FATrack adalah sistem personal finance advisor untuk ekosistem kerja Indonesia.</p>
        </div>
        <div>
          <small>02 / FORMULA DASAR</small>
          <p>Safe-to-Spend Daily Formula<br />50/30/20 Adaptive Allocation<br />25% Max Rent Ratio</p>
        </div>
        <div>
          <small>03 / DATABASE & KEAMANAN</small>
          <p>Supabase Postgres Engine<br />Row Level Security (RLS)<br />Local Storage Failover</p>
        </div>
        <div>
          <small>04 / STATUS SISTEM</small>
          <p className="green">● OPERASIONAL NORMAL</p>
        </div>
      </footer>
    </div>
  );
};
