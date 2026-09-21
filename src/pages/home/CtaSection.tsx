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
              {t('Votre prochaine étape', 'Pwochen etap ou')}
              <br />
              <span className="lp-text-accent">{t('est déjà prête.', 'deja pare.')}</span>
            </h2>
            <p className="lp-cta__desc">
              {t(
                'Créez votre espace pour retrouver vos cours, vos erreurs à revoir et votre progression sur chaque appareil.',
                'Kreye espas ou pou jwenn kou ou, erè pou revize ak pwogrè ou sou chak aparèy.'
              )}
            </p>
            <div className="lp-hero__actions">
              <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}>
                {t('Créer un compte gratuit', 'Kreye yon kont gratis')}
              </button>
              <button className="lp-btn lp-btn--ghost lp-btn--lg" onClick={() => navigate('/practice')}>
                {t('Découvrir la pratique', 'Dekouvri pratik la')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
