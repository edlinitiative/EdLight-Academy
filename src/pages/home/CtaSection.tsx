import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../contexts/store';
import { ArrowIcon, TFn } from './content';

export default function CtaSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated } = useStore();

  return (
    <section className="lp-section lp-cta">
      <div className="lp-container">
        <div className="lp-cta__card" data-reveal>
          <div className="lp-cta__glow" aria-hidden="true" />
          <div className="lp-cta__content">
            <span className="lp-cta__eyebrow">
              {t('Accès gratuit', 'Aksè gratis')}
            </span>
            <h2 className="lp-cta__title">
              {t('Votre prochaine étape', 'Pwochen etap ou')}
              <br />
              <span className="lp-text-accent">{t('est déjà prête.', 'deja pare.')}</span>
            </h2>
            <p className="lp-cta__desc">
              {isAuthenticated
                ? t(
                    'Vos cours, vos erreurs à revoir et votre progression vous attendent sur votre tableau de bord.',
                    'Kou ou, erè pou revize ak pwogrè ou ap tann ou nan tablodbò ou.'
                  )
                : t(
                    'Créez votre espace pour retrouver vos cours, vos erreurs à revoir et votre progression sur chaque appareil.',
                    'Kreye espas ou pou jwenn kou ou, erè pou revize ak pwogrè ou sou chak aparèy.'
                  )}
            </p>
          </div>

          {/* The page's single closing action. It used to sit beside a
              second, equally large button (§13: competing calls to action),
              and it invited a signed-in student to "create a free account"
              they already had. */}
          <div className="lp-cta__actions">
            <button
              className="lp-btn lp-btn--primary lp-btn--lg"
              onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}
            >
              <span>
                {isAuthenticated
                  ? t('Reprendre mon apprentissage', 'Kontinye aprann')
                  : t('Créer un compte gratuit', 'Kreye yon kont gratis')}
              </span>
              <ArrowIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
