import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';

export type StackCardItem = {
  n: string;
  title: string;
  line: string;
  desc?: string;
};

type Props = {
  items: StackCardItem[];
};

export function StackCards({ items }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const cards = gsap.utils.toArray<HTMLElement>('[data-stack-card]', root.current);
      cards.forEach((card, i) => {
        if (i === cards.length - 1) return; // last card stays full
        gsap.to(card, {
          scale: 0.94,
          opacity: 0.45,
          ease: 'none',
          scrollTrigger: {
            trigger: cards[i + 1],
            start: 'top 85%',
            end: 'top 25%',
            scrub: true,
          },
        });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="stack-cards">
      {items.map((it, i) => (
        <article
          key={it.n}
          data-stack-card
          className="stack-card"
          style={{ top: `calc(var(--nav-h, 64px) + ${i * 12}px)` }}
        >
          <div className="stack-card__inner">
            <span className="stack-card__n" aria-hidden="true">
              {it.n}
            </span>
            <div className="stack-card__body">
              <h3>{it.title}</h3>
              <p className="stack-card__line">{it.line}</p>
              {it.desc && <p className="stack-card__desc">{it.desc}</p>}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
