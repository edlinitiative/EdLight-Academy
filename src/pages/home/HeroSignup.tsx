import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../../contexts/store';
import { loginWithGoogle, warmAuth } from '../../services/authService';
import { redeemReferral, getStoredRef, clearStoredRef } from '../../services/referralService';
import { TFn } from './content';

/** Google's mark, inline: an external image would be one more blocking request
 *  on a connection where every round-trip counts. */
function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.600v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.6 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.4-9.1z" />
    </svg>
  );
}

/**
 * Sign-up, in the hero.
 *
 * The account was previously two clicks away behind a modal, and the hero's
 * primary button ("Explorer les cours") led somewhere that creates no account —
 * so a visitor could read, browse and leave without the product ever being able
 * to bring them back. Progress, streaks, revision and reminders all hang off
 * having an account, so asking for it is the hero's real job.
 */
export default function HeroSignup({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);
  const setShowAuthModal = useStore((s) => s.setShowAuthModal);
  const setActiveTab = useStore((s) => s.setActiveTab);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      const userData = await loginWithGoogle();
      setUser(userData);

      // A referral link only pays out for a genuinely new account.
      if (userData?.isNewUser) {
        const code = (getStoredRef() || '').trim();
        if (code) {
          await redeemReferral(code).catch(() => null);
          clearStoredRef();
        }
      }
      navigate('/dashboard');
    } catch (err: any) {
      const msg = String(err?.message || '');
      // Closing the picker is a decision, not a failure — say nothing.
      if (!msg.includes('popup-closed-by-user') && !msg.includes('cancelled-popup-request')) {
        setError(t(
          'La connexion Google n’a pas abouti. Réessayez.',
          'Koneksyon Google la pa pase. Eseye ankò.'
        ));
      }
    } finally {
      setBusy(false);
    }
  };

  const openEmailSignup = () => {
    setActiveTab('signup');
    setShowAuthModal(true);
  };

  return (
    <div className="lp-signup">
      <h2 className="lp-signup__title">
        {t('Commencez gratuitement', 'Kòmanse gratis')}
      </h2>
      <p className="lp-signup__lede">
        {t(
          'Votre progression, vos révisions et votre série vous suivent partout.',
          'Pwogrè ou, revizyon ou ak seri ou swiv ou tout kote.'
        )}
      </p>

      <button
        type="button"
        className="lp-signup__google"
        onClick={handleGoogle}
        /* Firebase must fetch gapi and boot an iframe on a third origin before
           it can even open the Google popup. Starting that on intent rather
           than on click takes roughly a second off the wait. */
        onMouseEnter={warmAuth}
        onFocus={warmAuth}
        onTouchStart={warmAuth}
        disabled={busy}
      >
        <GoogleMark />
        <span>
          {busy
            ? t('Connexion…', 'Koneksyon…')
            : t('Continuer avec Google', 'Kontinye ak Google')}
        </span>
      </button>

      <div className="lp-signup__or">
        <span>{t('ou', 'oswa')}</span>
      </div>

      <button type="button" className="lp-signup__email" onClick={openEmailSignup}>
        {t('S’inscrire avec un e-mail', 'Enskri ak yon imèl')}
      </button>

      {error && <p className="lp-signup__error" role="alert">{error}</p>}

      <p className="lp-signup__fine">
        {t('Déjà inscrit ? ', 'Ou gen kont deja? ')}
        <button
          type="button"
          className="lp-signup__link"
          onClick={() => { setActiveTab('signin'); setShowAuthModal(true); }}
        >
          {t('Se connecter', 'Konekte')}
        </button>
      </p>
    </div>
  );
}
