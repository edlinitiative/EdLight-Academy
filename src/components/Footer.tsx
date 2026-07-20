import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
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
            <Link to="/privacy" className="footer__link">{t('footer.privacy')}</Link>
            <Link to="/terms" className="footer__link">{t('footer.terms')}</Link>
          </nav>
          <span className="footer__copy">© {new Date().getFullYear()} EdLight Academy. {t('footer.rights')}</span>
        </div>
      </div>
    </footer>
  );
}
