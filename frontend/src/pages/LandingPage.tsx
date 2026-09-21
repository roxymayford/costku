import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from '../components/Icon';

gsap.registerPlugin(ScrollTrigger);

const metrics = [
  {
    code: '01 / JAJAN HARIAN',
    targetValue: 87500,
    prefix: 'Rp ',
    suffix: ' / hari',
    label: 'Batas Jajan Harian',
    desc: 'Angka aman jajan hari ini, otomatis dihitung dari gaji bersih setelah dipotong biaya tetap dan tabungan.',
  },
  {
    code: '02 / SEWA KOST',
    targetValue: 25,
    prefix: '',
    suffix: '% maksimal',
    label: 'Batas Sewa Kost',
    desc: 'Agar biaya kost tidak menghabiskan gaji: maksimal seperempat dari uang yang kamu bawa pulang tiap bulan.',
  },
  {
    code: '03 / PEMBAGIAN GAJI',
    targetValue: 100,
    prefix: '',
    suffix: '% terbagi',
    label: 'Alokasi 50/30/20',
    desc: 'Gaji dibagi jadi kebutuhan, keinginan, dan tabungan. Bisa kamu geser sesuai kondisi aslimu.',
  },
  {
    code: '04 / SKOR KEUANGAN',
    targetValue: 88,
    prefix: '',
    suffix: ' / 100',
    label: 'Skor Kesehatan Finansial',
    desc: 'Nilai 0–100 dari tabungan, kedisiplinan, dan pengeluaranmu — plus saran apa yang harus diperbaiki.',
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
    badge: 'GAJI UMR',
    title: 'UMR Metropolitan',
    salary: 5200000,
    salaryFormatted: 'Rp 5.200.000',
    kostLimit: 'Rp 1.300.000',
    kostPercent: '25.0%',
    safeToSpend: 'Rp 52.000 / hari',
    needs: 'Rp 2.600.000 (50%)',
    wants: 'Rp 1.560.000 (30%)',
    savings: 'Rp 1.040.000 (20%)',
    kostProfile: 'Kamar non-AC, kamar mandi luar, dekat jalur KRL atau angkot.',
    mealProfile: 'Warteg untuk makan siang, masak nasi dan lauk sendiri di kos.',
    strategy: 'Fokus pegang batas jajan harian Rp 52 ribu dan kumpulkan dana darurat Rp 2 juta pertama.',
    status: 'Sedang membangun dana darurat',
  },
  {
    id: 'preset-2',
    badge: 'PEKERJA MUDA',
    title: 'Junior Specialist',
    salary: 8500000,
    salaryFormatted: 'Rp 8.500.000',
    kostLimit: 'Rp 2.125.000',
    kostPercent: '25.0%',
    safeToSpend: 'Rp 85.000 / hari',
    needs: 'Rp 4.250.000 (50%)',
    wants: 'Rp 2.550.000 (30%)',
    savings: 'Rp 1.700.000 (20%)',
    kostProfile: 'Kost AC kamar mandi dalam, dekat MRT atau koridor utama.',
    mealProfile: 'Kantin kantor untuk makan siang, belanja mingguan untuk meal prep.',
    strategy: 'Pasang auto-debit tabungan 20% tepat di tanggal gajian, dan tahan belanja marketplace.',
    status: 'Arus kas stabil, mulai menabung',
  },
  {
    id: 'preset-3',
    badge: 'KARIER MENENGAH',
    title: 'Mid-Career Talent',
    salary: 14000000,
    salaryFormatted: 'Rp 14.000.000',
    kostLimit: 'Rp 3.500.000',
    kostPercent: '25.0%',
    safeToSpend: 'Rp 140.000 / hari',
    needs: 'Rp 7.000.000 (50%)',
    wants: 'Rp 4.200.000 (30%)',
    savings: 'Rp 2.800.000 (20%)',
    kostProfile: 'Co-living eksklusif atau apartemen studio di area bisnis.',
    mealProfile: 'Bahan segar dari supermarket dipadu kafe produktif sesuai anggaran.',
    strategy: 'Jaga gaya hidup agar tidak ikut naik terus, dan arahkan sisa ke investasi.',
    status: 'Siap menambah portofolio investasi',
  },
];

const NAV_LINKS = [
  { href: '#metrik', label: 'Cara Kerja' },
  { href: '#arsitektur', label: 'Simulasi' },
  { href: '#matriks', label: 'Prinsip' },
  { href: '#harga', label: 'Harga' },
];

export const LandingPage: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, loginDemo } = useAuth();

  const [isNavOpen, setIsNavOpen] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>('preset-2');

  const activePreset = incomePresets.find((p) => p.id === activePresetId) || incomePresets[1];

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Top scroll progress bar
      gsap.to('.swiss-scroll-ruler-fill', {
        width: '100%',
        ease: 'none',
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.1,
        },
      });

      // Hero headline & badge entrance
      gsap.from('.hero-copy > *', {
        y: 28,
        opacity: 0,
        duration: 0.75,
        stagger: 0.08,
        ease: 'power3.out',
      });

      // Hero preview panel entrance.
      // Below 901px the hero collapses to one column and the panel goes
      // full-bleed, so a horizontal slide would drag its right edge up to 40px
      // past the viewport and flash a horizontal scrollbar for the whole
      // ~1.1s entrance. Slide it vertically there instead.
      const isWideHero = window.matchMedia('(min-width: 901px)').matches;
      gsap.from('.hero-preview-panel', {
        ...(isWideHero ? { x: 40 } : { y: 28 }),
        opacity: 0,
        duration: 0.9,
        delay: 0.2,
        ease: 'power3.out',
        clearProps: 'transform',
      });

      // Metrics entrance
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

      // Animated number counters when metrics scroll into view
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

      // Simulator section reveal
      gsap.from('.swiss-lab-grid > *', {
        scrollTrigger: { trigger: '.swiss-lab-section', start: 'top 80%' },
        y: 32,
        opacity: 0,
        stagger: 0.12,
        duration: 0.7,
        ease: 'power3.out',
      });

      // Principle items reveal
      gsap.from('.swiss-protocol-item', {
        scrollTrigger: { trigger: '.swiss-matrix-section', start: 'top 80%' },
        y: 25,
        opacity: 0,
        stagger: 0.1,
        duration: 0.6,
        ease: 'power2.out',
      });

      // Telemetry cards reveal
      gsap.from('.swiss-telemetry-card', {
        scrollTrigger: { trigger: '.swiss-telemetry-section', start: 'top 82%' },
        y: 28,
        opacity: 0,
        stagger: 0.12,
        duration: 0.65,
        ease: 'power2.out',
      });

      // Pricing cards + CTA reveal
      gsap.from('.price-card, .cta > *', {
        scrollTrigger: { trigger: '.pricing-section', start: 'top 82%' },
        y: 25,
        opacity: 0,
        stagger: 0.08,
        duration: 0.65,
        ease: 'power2.out',
      });

      ScrollTrigger.refresh();
    }, root);

    return () => ctx.revert();
  }, []);

  const handleStart = () => {
    setIsNavOpen(false);
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth?mode=register');
    }
  };

  const handleDemo = () => {
    setIsNavOpen(false);
    loginDemo();
    navigate('/dashboard');
  };

  const closeNav = () => setIsNavOpen(false);

  // The landing mobile dropdown must always be dismissable: close it on Escape,
  // on a tap outside the header, and whenever the viewport leaves the mobile
  // breakpoint so it can never get stranded in an open state.
  useEffect(() => {
    if (!isNavOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNavOpen(false);
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest('.landing-mobile-nav, .landing-menu-btn')) return;
      setIsNavOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900) setIsNavOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('resize', onResize);
    };
  }, [isNavOpen]);

  return (
    <div ref={root} className="fatrack-landing">
      {/* READING PROGRESS BAR */}
      <div className="swiss-scroll-ruler">
        <div className="swiss-scroll-ruler-fill" />
      </div>

      {/* TOPBAR */}
      <header className="topbar">
        <div className="brand">
          <span className="avatar">FA</span>
          <b>COSTKU</b>
          <i>/</i>
          <span className="landing-brand-sub">PENDAMPING KEUANGAN PRIBADI</span>
        </div>

        <nav className="landing-nav desktop-only">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>

        <div className="actions">
          <button className="nav-link" type="button" onClick={() => navigate('/auth?mode=login')}>
            Masuk
          </button>
          <button className="pill dark" type="button" onClick={handleStart}>
            Coba Gratis
          </button>
          <button
            className="landing-menu-btn mobile-only"
            type="button"
            onClick={() => setIsNavOpen((open) => !open)}
            aria-label={isNavOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={isNavOpen}
          >
            <Icon name={isNavOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </header>

      {/* MOBILE NAV DROPDOWN */}
      <div className={`landing-mobile-nav ${isNavOpen ? 'is-open' : ''}`}>
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={closeNav}>{link.label}</a>
        ))}
        <button type="button" className="pill dark" onClick={handleStart}>
          Mulai Sekarang — Gratis
        </button>
      </div>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> Dibuat untuk pekerja muda Indonesia
            </div>
            <h1>
              Gaji masuk.
              <br />
              Tahu persis
              <br />
              batas jajanmu.
            </h1>
            <p className="lead">
              costKu mengubah gaji bulananmu jadi satu angka sederhana: <b>boleh jajan berapa hari ini</b>.
              Lengkap dengan batas sewa kost, pembagian gaji 50/30/20, dan skor kesehatan keuangan.
            </p>
            <div className="hero-bottom">
              <div className="hero-cta-group">
                <button className="pill dark" type="button" onClick={handleStart}>
                  Buat Akun Gratis
                </button>
                <button className="outline" type="button" onClick={handleDemo}>
                  <span className="inline-flex items-center gap-1.5">Lihat Demo <Icon name="arrowRight" size={14} /></span>
                </button>
              </div>
              <ul className="hero-proof">
                <li><Icon name="check" size={14} /> Gratis selamanya untuk pencatatan transaksi</li>
                <li><Icon name="check" size={14} /> Tanpa kartu kredit, tanpa iklan</li>
                <li><Icon name="check" size={14} /> Datamu tidak dijual ke pihak ketiga</li>
              </ul>
            </div>
          </div>

          {/* RIGHT: DASHBOARD PREVIEW */}
          <aside className="hero-preview-panel terminal">
            <div className="terminal-head">
              <span className="terminal-pulse" aria-hidden="true" /> PREVIEW DASHBOARD
              <span>CONTOH DATA</span>
            </div>

            <div className="terminal-body">
              <div className="worth terminal-card">
                <span className="terminal-scan" />
                <small>
                  BATAS JAJAN HARI INI
                </small>
                <strong>Rp 87.500 <small style={{ fontSize: '14px', fontWeight: 500 }}>/ hari</small></strong>
                <span>Dihitung dari gaji bersih, biaya tetap, dan target tabunganmu</span>
              </div>

              <div className="twins terminal-card">
                <div>
                  <small>GAJI BULANAN</small>
                  <b>Rp 5.500.000</b>
                  <span>Gajian tiap tanggal 25</span>
                </div>
                <div>
                  <small>BATAS SEWA KOST</small>
                  <b className="accent">Rp 1.375.000</b>
                  <span>Maksimal 25% gaji</span>
                </div>
              </div>

              <div className="allocation terminal-card">
                <small>PEMBAGIAN GAJI 50/30/20</small>
                <span>
                  Kebutuhan (kost, makan, transport) <b>50% · Rp 2.750.000</b>
                  <i><em style={{ width: '50%' }} /></i>
                </span>
                <span>
                  Keinginan (ngopi, hobi, jalan) <b>30% · Rp 1.650.000</b>
                  <i><em style={{ width: '30%', backgroundColor: 'var(--orange)' }} /></i>
                </span>
                <span>
                  Tabungan &amp; investasi <b>20% · Rp 1.100.000</b>
                  <i><em style={{ width: '20%', backgroundColor: '#008547' }} /></i>
                </span>
              </div>
            </div>

            <div className="terminal-foot">
              STATUS HARI INI <b className="green">MASIH DALAM BATAS</b>
            </div>
          </aside>
        </section>

        {/* METRICS — WHAT YOU GET */}
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

        {/* SIMULATOR */}
        <section id="arsitektur" className="swiss-lab-section reveal">
          <div className="swiss-section-meta">
            <span>COBA LANGSUNG</span>
            <span>PILIH GAJIMU, LIHAT HASILNYA</span>
          </div>

          <div className="swiss-lab-grid">
            <div className="swiss-lab-manifesto">
              <span className="swiss-index-badge">KENAPA COSTKU</span>
              <h2>
                Uang bukan sumber cemas.
                <br />
                Uang adalah alat.
              </h2>
              <p className="lead">
                Cemas soal uang biasanya muncul karena kita menebak-nebak isi rekening.
                costKu menggantinya dengan satu angka jelas: batas aman jajan hari ini.
                Setiap rupiah punya tujuan sebelum hari berganti.
              </p>

              <div className="swiss-manifesto-pillars">
                <div className="swiss-pillar">
                  <small className="accent">PRINSIP 1</small>
                  <h4>SEWA KOST MAKS 25%</h4>
                  <p>Agar biaya tempat tinggal tidak menelan seluruh gaji dan menyisakan nol untuk menabung.</p>
                </div>
                <div className="swiss-pillar">
                  <small className="accent">PRINSIP 2</small>
                  <h4>BATAS JAJAN HARIAN</h4>
                  <p>Satu angka untuk hari ini. Kamu tetap bebas ngopi tanpa rasa bersalah selama di dalam batas.</p>
                </div>
                <div className="swiss-pillar">
                  <small className="accent">PRINSIP 3</small>
                  <h4>TABUNG DULU, BARU BELANJA</h4>
                  <p>Tabungan 20% dikunci di tanggal gajian, sebelum uang operasional dipakai.</p>
                </div>
              </div>
            </div>

            <div className="swiss-lab-calculator">
              <div className="swiss-calc-header">
                <div>
                  <small className="accent">SIMULATOR GRATIS</small>
                  <h3>LIHAT HASILNYA UNTUK GAJIMU</h3>
                </div>
                <span className="swiss-calc-status">LIVE</span>
              </div>

              {/* PRESET CHIPS */}
              <div className="swiss-preset-chips">
                {incomePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`swiss-chip ${activePresetId === preset.id ? 'active' : ''}`}
                    onClick={() => setActivePresetId(preset.id)}
                    aria-pressed={activePresetId === preset.id}
                  >
                    <span>{preset.badge}</span>
                    <strong>{preset.salaryFormatted}</strong>
                  </button>
                ))}
              </div>

              {/* CALCULATION DISPLAY */}
              <div className="swiss-calc-display">
                <div className="swiss-calc-card primary-output">
                  <small>BOLEH JAJAN BERAPA HARI INI?</small>
                  <div className="swiss-calc-value">
                    <strong>{activePreset.safeToSpend}</strong>
                    <span className="status-tag">SIAP DIPAKAI</span>
                  </div>
                  <p className="swiss-calc-desc">{activePreset.strategy}</p>
                </div>

                <div className="swiss-calc-twins">
                  <div className="swiss-calc-card">
                    <small>BATAS SEWA KOST PER BULAN</small>
                    <strong>{activePreset.kostLimit}</strong>
                    <span>Maksimal 25% dari gaji bersih</span>
                    <div className="swiss-subtext">{activePreset.kostProfile}</div>
                  </div>

                  <div className="swiss-calc-card">
                    <small>GAYA MAKAN YANG MASUK ANGGARAN</small>
                    <strong style={{ fontSize: '16px', lineHeight: 1.3 }}>WARTEG + MASAK SENDIRI</strong>
                    <span>Perkiraan kebutuhan makan harian</span>
                    <div className="swiss-subtext">{activePreset.mealProfile}</div>
                  </div>
                </div>

                {/* ALLOCATION RATIO BAR */}
                <div className="swiss-calc-card allocation-strip">
                  <small>PEMBAGIAN GAJI</small>
                  <div className="swiss-ratio-bars">
                    <div className="ratio-segment needs" style={{ width: '50%' }}>
                      <span>Kebutuhan 50%</span>
                    </div>
                    <div className="ratio-segment wants" style={{ width: '30%' }}>
                      <span>Keinginan 30%</span>
                    </div>
                    <div className="ratio-segment savings" style={{ width: '20%' }}>
                      <span>Tabungan 20%</span>
                    </div>
                  </div>
                  <div className="swiss-ratio-legend">
                    <span><b>Kebutuhan:</b> {activePreset.needs}</span>
                    <span><b>Keinginan:</b> {activePreset.wants}</span>
                    <span><b>Tabungan:</b> {activePreset.savings}</span>
                  </div>
                </div>

                <div className="swiss-calc-footer">
                  <span>Status: <b>{activePreset.status}</b></span>
                  <button className="pill dark mini-btn" type="button" onClick={handleStart}>
                    PAKAI PROFIL INI <Icon name="arrowRight" size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section id="matriks" className="swiss-matrix-section reveal">
          <div className="swiss-section-meta">
            <span>4 PRINSIP</span>
            <span>YANG BIKIN GAJI TIDAK NAMPANG LEWAT</span>
          </div>

          <div className="swiss-matrix-header">
            <div>
              <small className="accent">CARA PIKIRNYA</small>
              <h2>4 ATURAN SEDERHANA YANG BERTAHAN LAMA</h2>
            </div>
            <p>
              Bukan rumus rumit. Ini empat kebiasaan dasar yang membedakan orang yang uangnya berkembang
              dengan yang gajinya selalu habis di tanggal 20.
            </p>
          </div>

          <div className="swiss-protocols-editorial">
            <article className="swiss-protocol-item">
              <div className="protocol-index">01</div>
              <div className="protocol-content">
                <small className="accent">ATURAN 1</small>
                <h3>BIAYA KOST JANGAN LEBIH DARI 25% GAJI</h3>
                <p className="protocol-quote">
                  "Gengsi kost mewah hari ini bisa menghabiskan tabungan masa depanmu."
                </p>
                <p className="protocol-body">
                  Banyak pekerja muda di kota besar menghabiskan 40–50% gaji hanya untuk kost demi gengsi.
                  Akibatnya tidak ada sisa untuk menabung. costKu membatasi sewa maksimal 25% gaji dan
                  membantumu membandingkan biaya kost vs ongkos transport dari tempat yang lebih jauh.
                </p>
                <div className="protocol-foot">
                  <span>BATAS: <b>MAKSIMAL 25% GAJI BERSIH</b></span>
                  <span className="swiss-tag green">ATURAN UTAMA</span>
                </div>
              </div>
            </article>

            <article className="swiss-protocol-item">
              <div className="protocol-index">02</div>
              <div className="protocol-content">
                <small className="accent">ATURAN 2</small>
                <h3>KURANGI OJEK ONLINE BERTURUT-TURUT</h3>
                <p className="protocol-quote">
                  "Pesan makanan tiga kali sehari dengan ongkir dan biaya layanan adalah kebocoran paling sunyi."
                </p>
                <p className="protocol-body">
                  Ketergantungan pesan makanan online diam-diam menyedot Rp 1,8–2,5 juta per bulan hanya dari
                  ongkir dan markup aplikasi. Hidup sehat di kota tetap bisa realistis: makan siang warteg
                  bergizi, sisanya masak sendiri dengan bahan yang dibeli saat promo di minimarket.
                </p>
                <div className="protocol-foot">
                  <span>PATOKAN: <b>Rp 35.000 – Rp 65.000 / HARI</b></span>
                  <span className="swiss-tag orange">HEMAT HARIAN</span>
                </div>
              </div>
            </article>

            <article className="swiss-protocol-item">
              <div className="protocol-index">03</div>
              <div className="protocol-content">
                <small className="accent">ATURAN 3</small>
                <h3>JANGAN TERTIPU SALDO BESAR DI AWAL BULAN</h3>
                <p className="protocol-quote">
                  "Saldo tebal di tanggal gajian itu ilusi yang paling berbahaya."
                </p>
                <p className="protocol-body">
                  Lihat saldo utuh di tanggal gajian dan otak langsung bilang "aku masih kaya", lalu belanja
                  melonjak di sepuluh hari pertama. costKu memecah sisa uangmu jadi angka harian. Selama
                  masih di dalam batas hari ini, kamu bebas jajan santai.
                </p>
                <div className="protocol-foot">
                  <span>CARANYA: <b>SISA UANG ÷ SISA HARI</b></span>
                  <span className="swiss-tag green">DIPANTAU HARIAN</span>
                </div>
              </div>
            </article>

            <article className="swiss-protocol-item">
              <div className="protocol-index">04</div>
              <div className="protocol-content">
                <small className="accent">ATURAN 4</small>
                <h3>BAYAR DIRI SENDIRI DULUAN, MINIMAL 20%</h3>
                <p className="protocol-quote">
                  "Menabung dari sisa uang akhir bulan hasilnya hampir selalu nol."
                </p>
                <p className="protocol-body">
                  Uang tanpa pos yang jelas pasti habis untuk hal sepele. Prinsipnya simpel: begitu gaji
                  masuk, sisihkan minimal 20% untuk dana darurat sebelum mulai dibelanjakan. Target dana
                  darurat adalah 3–6 bulan biaya hidup.
                </p>
                <div className="protocol-foot">
                  <span>TARGET: <b>MINIMAL 20% DI AWAL BULAN</b></span>
                  <span className="swiss-tag dark">OTOMATIS</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* TELEMETRY */}
        <section id="telemetri" className="swiss-telemetry-section reveal">
          <div className="swiss-section-meta">
            <span>KENYATAAN &amp; KEAMANAN</span>
            <span>TRANSPARAN SOAL DATA DAN ANGKANYA</span>
          </div>

          <div className="swiss-telemetry-grid">
            <article className="swiss-telemetry-card leak-audit">
              <span className="swiss-index-badge">HITUNG-HITUNGAN</span>
              <h3>SEBEGITU BESARKAH DAMPAK KOPI HARIAN?</h3>
              <p>
                Pengeluaran kecil yang tidak dicatat sering jadi penyebab utama gagal menabung.
              </p>

              <div className="swiss-leak-meter">
                <div className="leak-stat">
                  <small>SEHARI</small>
                  <strong>Rp 28.000</strong>
                  <span>1 gelas kopi susu</span>
                </div>
                <div className="leak-arrow" aria-hidden="true"><Icon name="arrowRight" size={18} /></div>
                <div className="leak-stat">
                  <small>SEBULAN (30 HARI)</small>
                  <strong>Rp 840.000</strong>
                  <span>16,1% dari gaji UMR</span>
                </div>
                <div className="leak-arrow" aria-hidden="true"><Icon name="arrowRight" size={18} /></div>
                <div className="leak-stat highlight">
                  <small>SETAHUN</small>
                  <strong className="accent">Rp 10.080.000</strong>
                  <span>Modal investasi yang hilang</span>
                </div>
              </div>

              <div className="swiss-leak-insight">
                <span className="swiss-pill-marker">CATATAN</span>
                <p>
                  Bukan berarti kamu dilarang ngopi. Dengan batas harian, jajan kopi masuk ke porsi 30%
                  keinginan yang sudah dianggarkan — bukan mengambil dari uang kost atau tabungan.
                </p>
              </div>
            </article>

            <article className="swiss-telemetry-card security-manifesto">
              <span className="swiss-index-badge">KEAMANAN</span>
              <h3>DATAMU TETAP MILIKMU</h3>
              <p>
                Informasi keuanganmu adalah hak pribadi. Kami tidak menjual data ke pihak ketiga atau
                agensi periklanan.
              </p>

              <div className="swiss-security-grid">
                <div className="swiss-sec-item">
                  <div className="sec-icon"><Icon name="lock" size={16} /></div>
                  <div>
                    <strong>AKSES TERKUNCI PER AKUN</strong>
                    <p>Hanya akunmu yang bisa membaca dan mengubah data keuanganmu.</p>
                  </div>
                </div>

                <div className="swiss-sec-item">
                  <div className="sec-icon"><Icon name="sparkle" size={16} /></div>
                  <div>
                    <strong>TANPA IKLAN &amp; PELACAK</strong>
                    <p>Tidak ada analitik pihak ketiga, pixel iklan, atau jual data ke pinjol.</p>
                  </div>
                </div>

                <div className="swiss-sec-item">
                  <div className="sec-icon"><Icon name="check" size={16} /></div>
                  <div>
                    <strong>TETAP JALAN TANPA INTERNET</strong>
                    <p>Pencatatan harian tetap tersimpan dan tersinkron saat koneksi kembali.</p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* PRICING */}
        <section id="harga" className="pricing-section reveal">
          <div className="swiss-section-meta">
            <span>HARGA</span>
            <span>MULAI GRATIS, NAIK KELAS KAPAN SAJA</span>
          </div>

          <div className="pricing-head">
            <small className="accent">PILIH SESUAI KEBUTUHANMU</small>
            <h2>GRATIS UNTUK MULAI. BAYAR KALAU SUDAH TERBANTU.</h2>
          </div>

          <div className="price-card-grid">
            <article className="price-card">
              <header>
                <h3>Money Tracker</h3>
                <span className="price-tag">Rp 0<span>/ selamanya</span></span>
              </header>
              <p>Cukup untuk mulai disiplin mencatat setiap pengeluaran.</p>
              <ul>
                <li><Icon name="check" size={14} /> Catat pemasukan &amp; pengeluaran</li>
                <li><Icon name="check" size={14} /> Buku besar transaksi + filter kategori</li>
                <li><Icon name="check" size={14} /> Ringkasan dashboard dasar</li>
                <li className="price-card-off"><Icon name="x" size={14} /> Batas jajan harian</li>
                <li className="price-card-off"><Icon name="x" size={14} /> Alokasi 50/30/20</li>
                <li className="price-card-off"><Icon name="x" size={14} /> Rekomendasi kost &amp; makan</li>
              </ul>
              <button className="outline price-card-btn" type="button" onClick={handleStart}>
                Mulai Gratis
              </button>
            </article>

            <article className="price-card price-card--featured">
              <span className="price-card-ribbon">PALING BANYAK DIPILIH</span>
              <header>
                <h3>Advisor Bulanan</h3>
                <span className="price-tag">Rp 29.900<span>/ bulan</span></span>
              </header>
              <p>Semua fitur pendamping keuangan, aktif penuh.</p>
              <ul>
                <li><Icon name="star" size={14} /> Batas jajan harian otomatis</li>
                <li><Icon name="star" size={14} /> Alokasi 50/30/20 yang bisa diatur</li>
                <li><Icon name="star" size={14} /> Rekomendasi tipe kost sesuai gaji</li>
                <li><Icon name="star" size={14} /> Paket belanja minimarket &amp; meal plan</li>
                <li><Icon name="star" size={14} /> Skor kesehatan keuangan (0–100)</li>
                <li><Icon name="star" size={14} /> Semua fitur Money Tracker</li>
              </ul>
              <button className="pill dark price-card-btn" type="button" onClick={handleStart}>
                Coba Advisor
              </button>
            </article>

            <article className="price-card">
              <header>
                <h3>Advisor Tahunan</h3>
                <span className="price-tag">Rp 249.000<span>/ tahun</span></span>
              </header>
              <p>Pilihan paling hemat — setara Rp 20.750 per bulan.</p>
              <ul>
                <li><Icon name="check" size={14} /> Semua fitur Advisor Bulanan</li>
                <li><Icon name="check" size={14} /> Hemat 30% dibanding bulanan</li>
                <li><Icon name="check" size={14} /> Bayar sekali untuk 12 bulan</li>
                <li><Icon name="check" size={14} /> Harga terkunci selama satu tahun</li>
              </ul>
              <button className="outline price-card-btn" type="button" onClick={handleStart}>
                Pilih Tahunan
              </button>
            </article>
          </div>
        </section>

        {/* CTA */}
        <section id="formula" className="cta reveal">
          <small className="accent">SIAP MULAI?</small>
          <h2>Tahu batas jajanmu dalam 2 menit.</h2>
          <p className="lead">
            Masukkan gaji dan biaya tetapmu, lalu lihat angka harian yang bisa kamu pakai hari ini.
            Gratis, tanpa kartu kredit.
          </p>
          <div className="cta-actions">
            <button className="pill dark" type="button" onClick={handleStart}>
              Buat Akun Gratis
            </button>
            <button className="outline" type="button" onClick={handleDemo}>
              Lihat Demo Dulu
            </button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer id="tentang" className="site-footer">
        <div>
          <small>TENTANG</small>
          <p>costKu adalah pendamping keuangan pribadi untuk pekerja muda Indonesia.</p>
        </div>
        <div>
          <small>CARA MENGHITUNG</small>
          <p>Batas jajan harian<br />Pembagian gaji 50/30/20<br />Batas sewa kost maksimal 25%</p>
        </div>
        <div>
          <small>DATA &amp; KEAMANAN</small>
          <p>Enkripsi Supabase<br />Akses terkunci per akun<br />Tetap jalan tanpa internet</p>
        </div>
        <div>
          <small>STATUS LAYANAN</small>
          <p className="green"><Icon name="dot" size={9} className="status-dot" /> Berjalan normal</p>
        </div>
      </footer>
    </div>
  );
};
