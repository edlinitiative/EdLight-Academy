import React, { useRef } from 'react';
import useStore from '../contexts/store';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * WelcomeLanguageModal — first-run language picker.
 * ─────────────────────────────────────────────────
 * The very first thing a new visitor does is pick the language they're most
 * comfortable in (Français / Kreyòl) — front and centre, not buried in the
 * profile menu. Shown once (gated on the persisted `languageChosen` flag) and
 * only after the store has rehydrated, so it never flashes over returning users.
 * Bilingual copy keeps it understandable whichever way the learner leans.
 */
export function WelcomeLanguageModal() {
  const hydrated = useStore((s) => s.hydrated);
  const languageChosen = useStore((s) => s.languageChosen);
  const currentLang = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const setLanguageChosen = useStore((s) => s.setLanguageChosen);

  const cardRef = useRef(null);
  const open = hydrated && !languageChosen;

  useBodyScrollLock(open);
  useFocusTrap(cardRef, open);

  if (!open) return null;

  const choose = (lang: string) => {
    setLanguage(lang);
    setLanguageChosen(true);
  };

  return (
    <div className="modal-overlay welcome-lang__overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-lang-title">
      <div className="welcome-lang" ref={cardRef} tabIndex={-1}>
        <img src="/assets/logo.png" alt="EdLight Academy" className="welcome-lang__logo" />
        <h2 id="welcome-lang-title" className="welcome-lang__title">
          Choisissez votre langue
          <span className="welcome-lang__title-ht">Chwazi lang ou</span>
        </h2>
        <p className="welcome-lang__subtitle">
          Vous pourrez la changer à tout moment.
          <span className="welcome-lang__subtitle-ht">Ou ka chanje l nenpòt lè nan pwofil ou.</span>
        </p>
        <div className="welcome-lang__options">
          <button
            type="button"
            className={`welcome-lang__option ${currentLang === 'fr' ? 'is-current' : ''}`}
            onClick={() => choose('fr')}
          >
            <span className="welcome-lang__flag" aria-hidden="true">🇫🇷</span>
            <span className="welcome-lang__option-label">Français</span>
          </button>
          <button
            type="button"
            className={`welcome-lang__option ${currentLang === 'ht' ? 'is-current' : ''}`}
            onClick={() => choose('ht')}
          >
            <span className="welcome-lang__flag" aria-hidden="true">🇭🇹</span>
            <span className="welcome-lang__option-label">Kreyòl Ayisyen</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeLanguageModal;
