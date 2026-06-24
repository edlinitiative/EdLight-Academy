import React, { useEffect, useMemo, useState } from 'react';
import { getTestimonials, TFn } from './content';

/**
 * Social proof — a single, auto-rotating testimonial.
 *
 * Collapsing the old three-card grid into one centred quote keeps the section
 * compact (especially on mobile) and more editorial. Rotation pauses on hover
 * or keyboard focus, and is disabled entirely under prefers-reduced-motion.
 */
export default function TestimonialsSection({ t }: { t: TFn }) {
  const testimonials = getTestimonials(t);
  const count = testimonials.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const prefersReduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (paused || prefersReduced || count <= 1) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(id);
  }, [paused, prefersReduced, count]);

  const current = testimonials[active];

  return (
    <section className="lp-section lp-testi">
      <div className="lp-container">
        <header className="lp-section__head lp-section__head--center" data-reveal>
          <span className="lp-eyebrow">
            <span className="lp-eyebrow__dot" />
            {t('Témoignages', 'Temwayaj')}
          </span>
          <h2 className="lp-section__title">
            {t('Ils progressent avec ', 'Y ap pwogrese ak ')}
            <span className="lp-text-accent">EdLight</span>.
          </h2>
        </header>

        <div
          className="lp-testi__carousel"
          data-reveal
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <figure className="lp-quote lp-quote--solo" key={active}>
            <span className="lp-quote__mark" aria-hidden="true">“</span>
            <blockquote>{current.quote}</blockquote>
            <figcaption>
              <strong>{current.name}</strong>
              <span>{current.role}</span>
            </figcaption>
          </figure>

          <div className="lp-testi__dots">
            {testimonials.map((q, i) => (
              <button
                key={q.name}
                type="button"
                className={`lp-testi__dot${i === active ? ' is-active' : ''}`}
                aria-label={`${t('Témoignage', 'Temwayaj')} ${i + 1} / ${count}`}
                aria-current={i === active ? 'true' : undefined}
                onClick={() => setActive(i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
