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
            {/* The mockups' kicker chip. A marker dot, never the little azure
                bar they put beside headings — that is the left-border accent
                the app removed everywhere else. */}
            <span className="lp-kicker">
              <span className="lp-kicker__dot" aria-hidden="true" />
              {t('Apprendre · Pratiquer · Progresser', 'Aprann · Pratike · Avanse')}
            </span>

            {/* One voice, no accented fragment. Colouring the second
                sentence a different colour was decoration standing in for
                emphasis; the sentence already carries it. */}
            <h1 className="lp-hero__title">
              {t('Avancez dans vos cours. Pratiquez là où ça compte.',
                 'Avanse nan kou ou yo. Pratike kote sa enpòtan.')}
            </h1>

            <p className="lp-hero__lede">
              {t(
                'Des cours bilingues, des exercices ciblés et des examens blancs alignés sur le programme haïtien — réunis dans un parcours qui vous montre toujours la prochaine étape.',
                'Kou nan de lang, egzèsis vize ak egzamen blan ki swiv pwogram ayisyen an — nan yon chemen ki toujou montre w pwochen etap la.'
              )}
            </p>

            {/* Signed out, the sign-up card beside this is the primary action,
                so this steps down to secondary — two competing primaries just
                split the click — and it is the only other thing to click
                (§6.10: one clear entry point). Signed in there is nothing to
                sign up for, so both learning destinations are offered. */}
            <div className="lp-hero__actions">
              <button
                className={isAuthenticated ? 'lp-btn lp-btn--primary' : 'lp-btn lp-btn--ghost'}
                onClick={() => navigate('/courses')}
              >
                <span>{t('Voir les cours', 'Gade kou yo')}</span>
                {isAuthenticated && <ArrowIcon />}
              </button>
              {isAuthenticated && (
                <button className="lp-btn lp-btn--ghost" onClick={() => navigate('/practice')}>
                  {t('Choisir une pratique', 'Chwazi yon pratik')}
                </button>
              )}
            </div>

            {/* Trust line: verifiable facts only — invented counts and
                decorative star ratings read as the opposite of premium. */}
            <div className="lp-hero__trust">
              <span className="lp-hero__trust-chip">
                <span className="lp-hero__trust-dot" aria-hidden="true" />
                {t('Gratuit pour les élèves', 'Gratis pou elèv yo')}
              </span>
              <span>
                {t('Français et créole haïtien · Web, iOS et Android', 'Fransè ak kreyòl ayisyen · Wèb, iOS ak Android')}
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
