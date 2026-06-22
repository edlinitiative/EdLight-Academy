import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowIcon, getStats, TFn } from './content';

export default function HeroSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const [heroSrc, setHeroSrc] = useState('/assets/landing-hero.webp');
  const stats = getStats(t);

  return (
    <section className="lp-hero">
      <div className="lp-container">
        <div className="lp-hero__layout">
          <div className="lp-hero__copy">
            <span className="lp-eyebrow">
              <span className="lp-eyebrow__dot" />
              {t('Plateforme éducative haïtienne', 'Platfòm edikatif ayisyen')}
            </span>

            <h1 className="lp-hero__title">
              {t('Maîtrisez le ', 'Metrize ')}
              <span className="lp-hero__title-accent">Bac</span>
              {t(' avec une rigueur', ' ak rigè')}
              <br />
              {t('digne d’une école d’élite.', 'tankou yon lekòl elit.')}
            </h1>

            <p className="lp-hero__lede">
              {t(
                'Cours, quiz adaptatifs et examens blancs alignés sur le programme officiel, pensés pour les élèves haïtiens et conçus comme une expérience premium.',
                'Kou, quiz adaptatif ak egzamen blan ki swiv pwogram ofisyèl la, pou elèv ayisyen, fè tankou yon eksperyans premye klas.'
              )}
            </p>

            <div className="lp-hero__actions">
              <button className="lp-btn lp-btn--primary" onClick={() => navigate('/courses')}>
                <span>{t('Explorer les cours', 'Eksplore kou yo')}</span>
                <ArrowIcon />
              </button>
              <button className="lp-btn lp-btn--ghost" onClick={() => navigate('/exams')}>
                {t('Passer un examen blanc', 'Pase yon egzamen blan')}
              </button>
            </div>
          </div>

          <div className="lp-hero__visual">
            <div className="lp-hero__frame">
              <img
                src={heroSrc}
                alt={t('Élève haïtien apprenant en ligne', 'Elèv ayisyen k ap aprann sou entènèt')}
                width={1200}
                height={1091}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={(e) => {
                  if (heroSrc !== '/assets/student-hero.svg') {
                    setHeroSrc('/assets/student-hero.svg');
                    (e.target as HTMLImageElement).alt = t('Illustration EdLight', 'Ilistrasyon EdLight');
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="lp-hero__stats" data-reveal>
          {stats.map((s) => (
            <div className="lp-stat" key={s.label}>
              <div className="lp-stat__value">{s.value}</div>
              <div className="lp-stat__label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
