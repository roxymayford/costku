import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { scrollState } from '../../providers/SmoothScroll';

type Props = {
  items: string[];
  /** Base pixels-per-tick at rest (default 0.6) */
  base?: number;
};

export function Marquee({ items, base = 0.6 }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const el = track.current!;
      let half = el.scrollWidth / 2; // content duplicated 2×
      let x = 0;
      const setX = gsap.quickSetter(el, 'x', 'px');
      const wrap = (v: number) => gsap.utils.wrap(-half, 0, v);

      const tick = () => {
        // clamp boost so it doesn't fly off at extreme scroll speeds
        const boost = Math.min(Math.abs(scrollState.v) / 150, 20);
        // dir: 1 = scrolling down → marquee goes left (negative)
        const dir = scrollState.dir === 1 ? -1 : 1;
        x = wrap(x + dir * (base + boost));
        setX(x);
      };

      const onResize = () => {
        half = el.scrollWidth / 2;
      };

      gsap.ticker.add(tick);
      window.addEventListener('resize', onResize);

      return () => {
        gsap.ticker.remove(tick);
        window.removeEventListener('resize', onResize);
      };
    },
    { scope: root },
  );

  const row = items.map((t, i) => (
    <span key={i} className="marquee__item">
      {t}&nbsp;•
    </span>
  ));

  return (
    <div ref={root} className="marquee" aria-hidden="true">
      <div ref={track} className="marquee__track">
        {row}
        {row}
      </div>
    </div>
  );
}
