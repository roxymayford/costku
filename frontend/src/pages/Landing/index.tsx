import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap, useGSAP, ScrollTrigger } from '../../lib/gsap';
import { useAuth } from '../../contexts/AuthContext';
import { Icon } from '../../components/Icon';
import logoSrc from '../../assets/logo.png';

import { Hero } from './sections/Hero';
import { MarqueeStrip } from './sections/MarqueeStrip';
import { HowItWorks } from './sections/HowItWorks';
import { Numbers } from './sections/Numbers';
import { Simulator } from './sections/Simulator';
import { Trust } from './sections/Trust';
import { FinalCta } from './sections/FinalCta';

export const LandingPage: React.FC = () => {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, loginDemo } = useAuth();

  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isStickyVisible, setIsStickyVisible] = useState(false);

  /* ── Navigation actions ── */
  const handleStart = () => {
    setIsNavOpen(false);
    navigate(user ? '/dashboard' : '/auth?mode=register');
  };

  const handleDemo = () => {
    setIsNavOpen(false);
    loginDemo();
    navigate('/dashboard');
  };

  /* ── Mobile nav dismiss on Escape / Outside click / Resize ── */
  useEffect(() => {
    if (!isNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNavOpen(false);
    };
    const onPtr = (e: MouseEvent | TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.landing-mobile-nav, .landing-menu-btn')) return;
      setIsNavOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900) setIsNavOpen(false);
    };

    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPtr);
    document.addEventListener('touchstart', onPtr);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPtr);
      document.removeEventListener('touchstart', onPtr);
      window.removeEventListener('resize', onResize);
    };
  }, [isNavOpen]);

  /* ── GSAP Orchestration ── */
  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;

      // Scroll progress bar
      gsap.to('.lp-scroll-fill', {
        width: '100%',
        ease: 'none',
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.1,
        },
      });

      // Hero reveal line-by-line
      const heroLines = gsap.utils.toArray<HTMLElement>('.hero-line');
      heroLines.forEach((line, i) => {
        gsap.from(line, {
          y: '100%',
          opacity: 0,
          duration: 0.7,
          delay: i * 0.08,
          ease: 'power3.out',
        });
      });

      // Hero CTA & Counter
      gsap.from('.hero-big-num, .hero-cta-wrap, .hero-sub', {
        y: 24,
        opacity: 0,
        duration: 0.7,
        delay: 0.35,
        stagger: 0.08,
        ease: 'power3.out',
      });

      // Hero preview panel
      const isWide = window.matchMedia('(min-width: 901px)').matches;
      gsap.from('.hero-preview-panel', {
        ...(isWide ? { x: 40 } : { y: 28 }),
        opacity: 0,
        duration: 0.9,
        delay: 0.2,
        ease: 'power3.out',
        clearProps: 'transform',
      });

      // Numbers grid reveal
      gsap.from('.lp-number-item', {
        scrollTrigger: { trigger: '.lp-numbers', start: 'top 80%' },
        y: 32,
        opacity: 0,
        stagger: 0.1,
        duration: 0.65,
        ease: 'power2.out',
      });

      // Trust chips reveal
      gsap.from('.trust-chip', {
        scrollTrigger: { trigger: '.lp-trust', start: 'top 82%' },
        y: 20,
        opacity: 0,
        stagger: 0.08,
        duration: 0.55,
        ease: 'power2.out',
      });

      // Navbar smart hide on scroll down, show on scroll up
      let lastY = 0;
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: () => {
          const y = window.scrollY;
          const nav = document.querySelector<HTMLElement>('.topbar');
          if (!nav) return;
          if (y > 80 && y > lastY) {
            nav.style.transform = 'translateY(-100%)';
          } else {
            nav.style.transform = 'translateY(0)';
          }
          lastY = y;
        },
      });

      // Mobile sticky CTA bar triggers only AFTER hero is scrolled past
      ScrollTrigger.create({
        trigger: '.lp-hero',
        start: 'bottom 20%',
        onEnter: () => setIsStickyVisible(true),
        onLeaveBack: () => setIsStickyVisible(false),
      });

      document.fonts.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: root },
  );

  return (
    <div ref={root} className="fatrack-landing lp-rombak">
      {/* SCROLL PROGRESS */}
      <div className="lp-scroll-ruler">
        <div className="lp-scroll-fill" />
      </div>

      {/* ── 1. NAVBAR ───────────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand">
          <img src={logoSrc} alt="costKu" className="brand-logo" />
          <b>COSTKU</b>
          <i>/</i>
          <span className="landing-brand-sub">PENDAMPING KEUANGAN</span>
        </div>

        <nav className="landing-nav desktop-only">
          <a href="#cara-kerja">Cara Kerja</a>
          <a href="#simulasi">Simulasi</a>
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
            onClick={() => setIsNavOpen((o) => !o)}
            aria-label={isNavOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={isNavOpen}
          >
            <Icon name={isNavOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </header>

      {/* Mobile menu dropdown */}
      <div className={`landing-mobile-nav ${isNavOpen ? 'is-open' : ''}`}>
        <a href="#cara-kerja" onClick={() => setIsNavOpen(false)}>
          Cara Kerja
        </a>
        <a href="#simulasi" onClick={() => setIsNavOpen(false)}>
          Simulasi
        </a>
        <button type="button" className="nav-link" onClick={() => navigate('/auth?mode=login')}>
          Masuk
        </button>
        <button type="button" className="pill dark" onClick={handleStart}>
          Coba Gratis
        </button>
      </div>

      <main>
        {/* ── 2. HERO ───────────────────────────────────────────── */}
        <Hero onStart={handleStart} onDemo={handleDemo} />

        {/* ── 3. MARQUEE STRIP ─────────────────────────────────── */}
        <MarqueeStrip />

        {/* ── 4. CARA KERJA (StackCards) ────────────────────────── */}
        <HowItWorks />

        {/* ── 5. ANGKA BICARA ───────────────────────────────────── */}
        <Numbers />

        {/* ── 6. SIMULASI KOPI ─────────────────────────────────── */}
        <Simulator />

        {/* ── 7. AMAN ───────────────────────────────────────────── */}
        <Trust />

        {/* ── 8. CTA FINAL + FOOTER (Overlapping dark block) ─────── */}
        <FinalCta onStart={handleStart} />
      </main>

      {/* ── STICKY CTA BAR (Mobile, appears after hero is passed) ── */}
      <div className={`lp-sticky-cta ${isStickyVisible ? 'is-visible' : ''}`}>
        <button className="pill dark" type="button" onClick={handleStart}>
          Coba Gratis
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
