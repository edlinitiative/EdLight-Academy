import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useStore from '../contexts/store';

export function Footer() {
  const { t } = useTranslation();
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__left">
          <Link to="/" className="logo footer__logo" aria-label={t('footer.home')}>
            <img src="/assets/logo.png" alt="" className="logo__image" />
            <span>EdLight Academy</span>
          </Link>
          <p className="footer__brand-copy">
            {t('footer.brandCopy')}
          </p>
        </div>
        <div className="footer__right">
          <nav className="footer__nav">
            <Link to="/about" className="footer__link">{t('footer.about')}</Link>
            <Link to="/contact" className="footer__link">{t('footer.contact')}</Link>
            <Link to="/enseigner" className="footer__link">{t('footer.teach')}</Link>
            <Link to="/privacy" className="footer__link">{t('footer.privacy')}</Link>
            <Link to="/terms" className="footer__link">{t('footer.terms')}</Link>
          </nav>
          {/* The one place, with the profile page, where the language changes
              (Ted: not a toggle on every screen). */}
          <div className="footer__lang" role="group" aria-label="Langue / Lang">
            <button type="button" className={language !== 'ht' ? 'is-on' : ''} aria-pressed={language !== 'ht'} onClick={() => setLanguage('fr')}>Français</button>
            <button type="button" className={language === 'ht' ? 'is-on' : ''} aria-pressed={language === 'ht'} onClick={() => setLanguage('ht')}>Kreyòl</button>
          </div>
          <span className="footer__copy">© {new Date().getFullYear()} EdLight Academy. {t('footer.rights')}</span>
        </div>
      </div>
    </footer>
  );
}
