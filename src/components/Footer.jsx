import React from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  const footerLinks = {
    platform: {
      title: 'Plateforme',
      links: [
        { to: '/about', label: 'À propos' },
        { to: '/courses', label: 'Cours' },
        { to: '/quizzes', label: 'Quiz' },
        { to: '/exams', label: 'Examens' }
      ]
    },
    resources: {
      title: 'Ressources',
      links: [
        { to: '/help', label: 'Aide' },
        { to: '/faq', label: 'FAQ' },
        { to: '/contact', label: 'Nous contacter' }
      ]
    },
    legal: {
      title: 'Légal',
      links: [
        { to: '/privacy', label: 'Confidentialité' },
        { to: '/terms', label: "Conditions d'utilisation" }
      ]
    }
  };

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__top">
          <div>
            <Link to="/" className="logo footer__logo" aria-label="EdLight Academy home">
              <img src="/assets/logo.png" alt="" className="logo__image" />
              <span>EdLight Academy</span>
            </Link>
            <p className="footer__brand-copy">
              Une plateforme communautaire pour aider les élèves haïtiens à maîtriser les matières STEM grâce à des ressources modernes et bilingues.
            </p>
          </div>

          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h4 className="footer__column-title">{section.title}</h4>
              <nav className="flex flex-col">
                {section.links.map(link => (
                  <Link 
                    key={link.to}
                    to={link.to}
                    className="footer__link"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}

          <div>
            <h4 className="footer__column-title">Rester connecté</h4>
            <div className="footer__social">
              <a href="https://twitter.com/EdLightAcademy" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="EdLight on X (Twitter)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X / Twitter
              </a>
              <a href="https://facebook.com/EdLightAcademy" target="_blank" rel="noopener noreferrer" className="footer__social-link" aria-label="EdLight on Facebook">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </a>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} EdLight Academy. Conçu pour les apprenants haïtiens.</span>
          <div className="flex" style={{ gap: '0.75rem' }}>
          <a href="https://github.com/edlinitiative" target="_blank" rel="noopener noreferrer" className="footer__link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}