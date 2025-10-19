import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useTracking';

export function Footer() {
  const { currentLanguage } = useLanguage();
  
  const footerLinks = {
    platform: {
      title: currentLanguage === 'ht' ? 'Platfòm' : 'Plateforme',
      links: [
        { to: '/about', label: currentLanguage === 'ht' ? 'Apropo' : 'À propos' },
        { to: '/courses', label: currentLanguage === 'ht' ? 'Kou yo' : 'Cours' },
        { to: '/quizzes', label: currentLanguage === 'ht' ? 'Egzèsis' : 'Exercices' }
      ]
    },
    resources: {
      title: currentLanguage === 'ht' ? 'Resous' : 'Ressources',
      links: [
        { to: '/help', label: currentLanguage === 'ht' ? 'Èd' : 'Aide' },
        { to: '/faq', label: 'FAQ' },
        { to: '/contact', label: currentLanguage === 'ht' ? 'Kontakte nou' : 'Contactez-nous' }
      ]
    },
    legal: {
      title: currentLanguage === 'ht' ? 'Legal' : 'Légal',
      links: [
        { to: '/privacy', label: currentLanguage === 'ht' ? 'Konfidansyalite' : 'Confidentialité' },
        { to: '/terms', label: currentLanguage === 'ht' ? 'Tèm yo' : "Conditions d'utilisation" }
      ]
    }
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h4 className="text-lg font-semibold mb-4">{section.title}</h4>
              <nav className="flex flex-col gap-2">
                {section.links.map(link => (
                  <Link 
                    key={link.to}
                    to={link.to}
                    className="footer-link"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}

          <div>
            <h4 className="text-lg font-semibold mb-4">
              {currentLanguage === 'ht' ? 'Swiv nou' : 'Suivez-nous'}
            </h4>
            <div className="flex gap-4">
              <a href="https://twitter.com/EdLightAcademy" target="_blank" rel="noopener noreferrer" className="footer-link">
                Twitter
              </a>
              <a href="https://facebook.com/EdLightAcademy" target="_blank" rel="noopener noreferrer" className="footer-link">
                Facebook
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <img src="/assets/logo.png" alt="" style={{ width: '24px', height: '24px' }} />
              <span>© 2025 EdLight Academy</span>
            </div>
            <div className="flex gap-4">
              <a href="https://github.com/edlinitiative" target="_blank" rel="noopener noreferrer" className="text-sm footer-link">
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}