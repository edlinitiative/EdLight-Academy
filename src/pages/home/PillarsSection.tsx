import React from 'react';
import { getPillars, TFn } from './content';

export default function PillarsSection({ t }: { t: TFn }) {
  const pillars = getPillars(t);

  return (
    <section className="lp-section lp-pillars">
      <div className="lp-container">
        <header className="lp-section__head" data-reveal>
          <span className="lp-eyebrow lp-eyebrow--muted">{t('Pourquoi EdLight', 'Poukisa EdLight')}</span>
          <h2 className="lp-section__title">
            {t('Une méthode complète,', 'Yon metòd konplè,')}
            <br />
            <span className="lp-text-accent">{t('soigneusement conçue.', 'fè ak swen.')}</span>
          </h2>
          <p className="lp-section__lede">
            {t(
              'Chaque détail est pensé pour donner aux élèves haïtiens les mêmes armes que les meilleures écoles internationales.',
              'Chak detay panse pou bay elèv ayisyen yo menm zouti ak pi bon lekòl entènasyonal yo.'
            )}
          </p>
        </header>

        <div className="lp-pillars__grid">
          {pillars.map((p, i) => (
            <article className="lp-pillar" key={p.eyebrow} data-reveal style={{ transitionDelay: `${i * 60}ms` }}>
              <div className="lp-pillar__head">
                <span className="lp-pillar__num">{p.eyebrow}</span>
                <span className="lp-pillar__icon" aria-hidden="true">{p.icon}</span>
              </div>
              <h3 className="lp-pillar__title">{p.title}</h3>
              <p className="lp-pillar__desc">{p.desc}</p>
              <span className="lp-pillar__corner" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
