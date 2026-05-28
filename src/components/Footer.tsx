import React from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__left">
          <Link to="/" className="logo footer__logo" aria-label="EdLight Academy home">
            <img src="/assets/logo.png" alt="" className="logo__image" />
            <span>EdLight Academy</span>
          </Link>
          <p className="footer__brand-copy">
            Une plateforme communautaire pour aider les élèves haïtiens à maîtriser les matières STEM grâce à des ressources modernes et bilingues.
          </p>
        </div>
        <div className="footer__right">
          <nav className="footer__nav">
            <Link to="/contact" className="footer__link">Contact</Link>
            <Link to="/privacy" className="footer__link">Confidentialité</Link>
            <Link to="/terms" className="footer__link">Conditions</Link>
          </nav>
          <span className="footer__copy">© {new Date().getFullYear()} EdLight Academy. Tous droits réservés.</span>
        </div>
      </div>
    </footer>
  );
}