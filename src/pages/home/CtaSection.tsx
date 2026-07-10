import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../contexts/store';
import { TFn } from './content';

export default function CtaSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated } = useStore();

  return (
    <section className="lp-section lp-cta">
      <div className="lp-container">
        <div className="lp-cta__card" data-reveal>
          <div className="lp-cta__glow" aria-hidden="true" />
          <div className="lp-cta__content">
            <h2 className="lp-cta__title">
              {t('Commencez aujourd’hui.', 'Kòmanse jodi a.')}
              <br />
              <span className="lp-text-accent">{t('Réussissez demain.', 'Reyisi demen.')}</span>
            </h2>
            <p className="lp-cta__desc">
              {t(
                'Rejoignez les milliers d’élèves qui préparent leur avenir avec EdLight Academy.',
                'Rejwenn plizyè milye elèv k ap prepare avni yo ak EdLight Academy.'
              )}
            </p>
            <div className="lp-hero__actions">
              <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}>
                {t('Créer un compte gratuit', 'Kreye yon kont gratis')}
              </button>
              <button className="lp-btn lp-btn--ghost lp-btn--lg" onClick={() => navigate('/courses')}>
                {t('Parcourir les cours', 'Parkouri kou yo')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
