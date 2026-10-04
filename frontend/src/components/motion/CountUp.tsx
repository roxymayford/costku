import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';

type Props = {
  to: number;
  from?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  /** When true, animates immediately without a ScrollTrigger (for live sliders) */
  live?: boolean;
};

const fmt = new Intl.NumberFormat('id-ID');

export function CountUp({
  to,
  from = 0,
  prefix = '',
  suffix = '',
  duration = 1.6,
  className,
  live = false,
}: Props) {
  const root = useRef<HTMLSpanElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  const final = prefix + fmt.format(to) + suffix;

  const prevVal = useRef(from);
  const isFirstRun = useRef(true);

  useGSAP(
    () => {
      const el = out.current!;
      const render = (v: number) => {
        el.textContent = prefix + fmt.format(Math.round(v)) + suffix;
      };

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        render(to);
        prevVal.current = to;
        return;
      }

      const start = live && !isFirstRun.current ? prevVal.current : from;
      isFirstRun.current = false;
      const state = { v: start };
      render(start);

      gsap.to(state, {
        v: to,
        duration: live ? 0.35 : duration,
        ease: live ? 'power2.out' : 'power3.out',
        onUpdate: () => {
          render(state.v);
          prevVal.current = state.v;
        },
        onComplete: () => {
          prevVal.current = to;
        },
        ...(live
          ? {}
          : {
              scrollTrigger: {
                trigger: el,
                start: 'top 85%',
                once: true,
              },
            }),
      });
    },
    { scope: root, dependencies: [to, live] },
  );

  return (
    <span
      ref={root}
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {/* Screen reader gets the final formatted value immediately */}
      <span className="sr-only">{final}</span>
      <span ref={out} aria-hidden="true">
        {final}
      </span>
    </span>
  );
}
