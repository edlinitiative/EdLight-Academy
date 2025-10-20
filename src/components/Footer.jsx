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
              Follow Us
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