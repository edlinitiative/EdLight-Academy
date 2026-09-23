import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Smartphone } from 'lucide-react';
import useStore from '../../contexts/store';
import { ArrowIcon, TFn } from './content';

/**
 * The closing banner — Ted's mockup's navy panel: one sign-up action, the app
 * beside it. The mockup's "APK 18 Mo" and fake QR become the real /download
 * page, which already routes each phone to its store.
 */
export default function CtaSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated } = useStore();

  return (
    <section className="lp-section lp-cta">
      <div className="lp-container">
        <div className="lp-cta__card lp-cta__card--navy" data-reveal>
          <div className="lp-cta__glow" aria-hidden="true" />
          <div className="lp-cta__content">
            <span className="lp-cta__eyebrow">
              {t('Inscription gratuite · sans engagement', 'Enskripsyon gratis · san angajman')}
            </span>
            <h2 className="lp-cta__title">
              {isAuthenticated
                ? t('Ta prochaine étape est prête.', 'Pwochen etap ou pare.')
                : t('Prêt à décrocher ta mention ?', 'Pare pou w pran mansyon ou ?')}
            </h2>
            <p className="lp-cta__desc">
              {isAuthenticated
                ? t('Tes cours, tes erreurs à revoir et ta progression t’attendent.', 'Kou ou, erè pou revize ak pwogrè ou ap tann ou.')
                : t(
                  'Crée ton compte en 30 secondes pour garder tes résultats, revoir tes erreurs et faire gagner des points à ton école.',
                  'Kreye kont ou nan 30 segonn pou kenbe rezilta ou, revize erè ou epi fè lekòl ou genyen pwen.',
                )}
            </p>
          </div>

          <div className="lp-cta__actions">
            <button
              className="lp-btn lp-btn--light lp-btn--lg"
              onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}
            >
              <span>
                {isAuthenticated
                  ? t('Reprendre mon apprentissage', 'Kontinye aprann')
                  : t('Créer un compte gratuit', 'Kreye yon kont gratis')}
              </span>
              <ArrowIcon />
            </button>
            <Link to="/download?from=home" className="lp-btn lp-btn--navy-ghost lp-btn--lg">
              <Smartphone size={18} aria-hidden="true" />
              <span>{t('Télécharger l’application', 'Telechaje aplikasyon an')}</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
