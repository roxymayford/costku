import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from '../lib/gsap';

let lenis: Lenis | null = null;

export function stopLenis() {
  if (lenis && window.location.pathname === '/') {
    lenis.stop();
  }
}

export function startLenis() {
  if (lenis && window.location.pathname === '/') {
    lenis.start();
  }
}

/** Shared velocity state consumed by the Marquee component */
export const scrollState = { v: 0, dir: 1 };

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  useEffect(() => {
    // Only initialize and run Lenis on the landing page ('/')
    // Dashboard and other internal routes MUST use native browser scrolling
    // so desktop mouse wheel, forms, and mobile sheets work flawlessly.
    if (pathname !== '/') {
      if (lenis) {
        lenis.destroy();
        lenis = null;
      }
      scrollState.v = 0;
      return;
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const instance = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis = instance;
    instance.on('scroll', ScrollTrigger.update);

    // Track velocity for the Marquee
    const velTrigger = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        scrollState.v = self.getVelocity();
        scrollState.dir = self.direction;
      },
    });

    const tick = (t: number) => {
      instance.raf(t * 1000);
      scrollState.v *= 0.9; // decay supaya velocity turun saat scroll berhenti
    };

    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    document.fonts.ready.then(() => ScrollTrigger.refresh());

    return () => {
      velTrigger.kill();
      gsap.ticker.remove(tick);
      instance.destroy();
      if (lenis === instance) {
        lenis = null;
      }
      scrollState.v = 0;
    };
  }, [pathname]);

  // Scroll to top on route change
  useEffect(() => {
    if (lenis && pathname === '/') {
      lenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
    ScrollTrigger.refresh();
  }, [pathname]);

  return <>{children}</>;
}
