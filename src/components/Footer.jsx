import React from 'react';
import { Link } from 'react-router-dom';

export function Footer() {
  const footerLinks = {
    platform: {
      title: 'Platform',
      links: [
        { to: '/about', label: 'About' },
        { to: '/courses', label: 'Courses' },
        { to: '/quizzes', label: 'Quizzes' }
      ]
    },
    resources: {
      title: 'Resources',
      links: [
        { to: '/help', label: 'Help' },
        { to: '/faq', label: 'FAQ' },
        { to: '/contact', label: 'Contact Us' }
      ]
    },
    legal: {
      title: 'Legal',
      links: [
        { to: '/privacy', label: 'Privacy' },
        { to: '/terms', label: 'Terms of Use' }
      ]
    }
  };

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__top">
          <div>
            <Link to="/" className="logo" style={{ marginBottom: '1rem', display: 'inline-flex' }}>
              <span className="logo__mark">E</span>
              <span>EdLight Academy</span>
            </Link>
            <p className="footer__brand-copy">
              A community-built platform helping Haiti’s NS students master STEM subjects through modern, bilingual resources.
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
            <h4 className="footer__column-title">Stay connected</h4>
            <div className="flex" style={{ gap: '0.75rem' }}>
              <a href="https://twitter.com/EdLightAcademy" target="_blank" rel="noopener noreferrer" className="footer__link">
                Twitter
              </a>
              <a href="https://facebook.com/EdLightAcademy" target="_blank" rel="noopener noreferrer" className="footer__link">
                Facebook
              </a>
            </div>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} EdLight Academy. Crafted for Haitian learners.</span>
          <div className="flex" style={{ gap: '0.75rem' }}>
            <a href="https://github.com/edlinitiative" target="_blank" rel="noopener noreferrer" className="footer__link">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}