import React from 'react';
import { getTestimonials, TFn } from './content';

export default function TestimonialsSection({ t }: { t: TFn }) {
  const testimonials = getTestimonials(t);

  return (
    <section className="lp-section lp-testi">
      <div className="lp-container">
        <header className="lp-section__head lp-section__head--center" data-reveal>
          <span className="lp-eyebrow lp-eyebrow--muted">{t('Témoignages', 'Temwayaj')}</span>
          <h2 className="lp-section__title">
            {t('Ils progressent avec ', 'Y ap pwogrese ak ')}
            <span className="lp-text-accent">EdLight</span>.
          </h2>
        </header>
        <div className="lp-testi__grid">
          {testimonials.map((q, i) => (
            <figure className="lp-quote" key={i} data-reveal style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="lp-quote__mark" aria-hidden="true">“</span>
              <blockquote>{q.quote}</blockquote>
              <figcaption>
                <strong>{q.name}</strong>
                <span>{q.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
