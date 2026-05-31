import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Sparkles } from 'lucide-react';
import { ArrowIcon, getStats, TFn } from './content';

export default function HeroSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const [heroSrc, setHeroSrc] = useState('/assets/landing-hero.png');
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

            <div className="lp-hero__trust">
              <div className="lp-hero__avatars" aria-hidden="true">
                <span style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>C</span>
                <span style={{ background: 'linear-gradient(135deg,#0A66C2,#22d3ee)' }}>J</span>
                <span style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)' }}>M</span>
                <span style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)' }}>+</span>
              </div>
              <div className="lp-hero__trust-copy">
                <strong>4 000+ {t('élèves', 'elèv')}</strong>
                <span>{t('progressent déjà avec EdLight', 'k ap pwogrese deja ak EdLight')}</span>
              </div>
            </div>
          </div>

          <div className="lp-hero__visual">
            <div className="lp-hero__frame">
              <img
                src={heroSrc}
                alt={t('Élève haïtien apprenant en ligne', 'Elèv ayisyen k ap aprann sou entènèt')}
                loading="eager"
                onError={(e) => {
                  if (heroSrc !== '/assets/student-hero.svg') {
                    setHeroSrc('/assets/student-hero.svg');
                    (e.target as HTMLImageElement).alt = t('Illustration EdLight', 'Ilistrasyon EdLight');
                  }
                }}
              />
              <div className="lp-hero__chip lp-hero__chip--a">
                <span className="lp-hero__chip-dot" />
                {t('Quiz Physique · 8/10', 'Quiz Fizik · 8/10')}
              </div>
              <div className="lp-hero__chip lp-hero__chip--b"><Flame size={14} strokeWidth={2.2} /> {t('Série de 12 jours', 'Seri 12 jou')}</div>
              <div className="lp-hero__chip lp-hero__chip--c"><Sparkles size={14} strokeWidth={2.2} /> {t('Plan d’étude prêt', 'Plan etid pare')}</div>
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
