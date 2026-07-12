import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Sparkles } from 'lucide-react';
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
              {t('Préparation au Bac · 100% gratuit', 'Preparasyon Bak · 100% gratis')}
            </span>

            <h1 className="lp-hero__title">
              {t('Maîtrisez le ', 'Metrize ')}
              <span className="lp-hero__title-accent lp-text-accent">Bac</span>
              {t(' avec une rigueur digne d’une école d’élite.', ' ak rigè tankou yon lekòl elit.')}
            </h1>

            <p className="lp-hero__lede">
              {t(
                'Cours, quiz adaptatifs et examens blancs alignés sur le programme officiel, pensés pour les élèves haïtiens et conçus comme une expérience premium.',
                'Kou, quiz adaptatif ak egzamen blan ki swiv pwogram ofisyèl la, pou elèv ayisyen, epi ki fèt tankou yon eksperyans premye klas.'
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

            <div className="lp-hero__trust">
              <span className="lp-hero__avatars" aria-hidden="true">
                <span>A</span><span>M</span><span>J</span><span>+</span>
              </span>
              <span>
                <span className="lp-hero__stars" aria-hidden="true">★★★★★</span>
                <br />
                <strong>12 000+</strong> {t('élèves haïtiens accompagnés', 'elèv ayisyen akonpaye')}
              </span>
            </div>
          </div>

          <div className="lp-hero__visual">
            <div className="lp-hero__glow" aria-hidden="true" />
            <div className="lp-hero__frame hatch-frame">
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

            <div className="lp-hero__float lp-hero__float--a" aria-hidden="true">
              <span className="lp-hero__float-icon"><Flame size={18} strokeWidth={2.4} /></span>
              <span className="lp-hero__float-text">
                <span className="lp-hero__float-label">{t('Série', 'Seri')}</span>
                <span className="lp-hero__float-value">12 {t('jours', 'jou')}</span>
              </span>
            </div>
            <div className="lp-hero__float lp-hero__float--b" aria-hidden="true">
              <span className="lp-hero__float-icon"><Sparkles size={18} strokeWidth={2.4} /></span>
              <span className="lp-hero__float-text">
                <span className="lp-hero__float-label">{t('Maîtrise', 'Metrize')}</span>
                <span className="lp-hero__float-value">82%</span>
              </span>
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
