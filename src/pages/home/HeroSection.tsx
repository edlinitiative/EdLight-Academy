import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowIcon, TFn } from './content';
import HeroSignup from './HeroSignup';
import useStore from '../../contexts/store';

export default function HeroSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const [heroSrc, setHeroSrc] = useState('/assets/landing-hero.webp');

  return (
    <section className="lp-hero">
      <div className="lp-container">
        <div className="lp-hero__layout">
          <div className="lp-hero__copy">
            <span className="lp-eyebrow">
              <span className="lp-eyebrow__dot" />
              {t('Apprendre · pratiquer · progresser', 'Aprann · pratike · pwogrese')}
            </span>

            <h1 className="lp-hero__title">
              {t('Avancez dans vos cours. ', 'Avanse nan kou ou yo. ')}
              <span className="lp-text-accent">{t('Pratiquez là où ça compte.', 'Pratike kote sa enpòtan.')}</span>
            </h1>

            <p className="lp-hero__lede">
              {t(
                'Des cours bilingues, des exercices ciblés et des examens blancs alignés sur le programme haïtien — réunis dans un parcours qui vous montre toujours la prochaine étape.',
                'Kou nan de lang, egzèsis vize ak egzamen blan ki swiv pwogram ayisyen an — nan yon chemen ki toujou montre w pwochen etap la.'
              )}
            </p>

            {/* Signed out, the sign-up card beside this is the primary action,
                so these step down to secondary — two competing primaries just
                split the click. */}
            <div className="lp-hero__actions">
              <button
                className={isAuthenticated ? 'lp-btn lp-btn--primary' : 'lp-btn lp-btn--ghost'}
                onClick={() => navigate('/courses')}
              >
                <span>{t('Voir les cours', 'Gade kou yo')}</span>
                {isAuthenticated && <ArrowIcon />}
              </button>
              <button className="lp-btn lp-btn--ghost" onClick={() => navigate('/practice')}>
                {t('Choisir une pratique', 'Chwazi yon pratik')}
              </button>
            </div>

            {/* Trust line: verifiable facts only — invented counts and
                decorative star ratings read as the opposite of premium. */}
            <div className="lp-hero__trust">
              <span>
                <strong>{t('Gratuit pour les élèves', 'Gratis pou elèv yo')}</strong>
                {t(' · Français et créole haïtien · Web, iOS et Android', ' · Fransè ak kreyòl ayisyen · Wèb, iOS ak Android')}
              </span>
            </div>
          </div>

          {/* Signed out, the hero's job is to open an account — everything the
              product does to bring a student back (progress, streak, revision,
              reminders) needs one. Signed in, there is nothing to ask for, so
              the artwork stays. */}
          {!isAuthenticated ? (
            <div className="lp-hero__visual lp-hero__visual--signup">
              <HeroSignup t={t} />
            </div>
          ) : (
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

          </div>
          )}
        </div>

      </div>
    </section>
  );
}
