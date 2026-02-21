import React, { useRef, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { logoutUser } from '../services/authService';
import { UserDropdown } from './Auth';

export function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dropdownRef = useRef(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { 
    isAuthenticated, 
    user, 
    showUserDropdown,
    toggleUserDropdown,
    logout 
  } = useStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        useStore.getState().setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserDropdown]);

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false);
  }, [pathname]);

  // Lock scroll when mobile menu is open + allow ESC to close
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setShowMobileMenu(false);
    };

    if (showMobileMenu) {
      document.body.classList.add('no-scroll');
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.body.classList.remove('no-scroll');
        document.removeEventListener('keydown', onKeyDown);
      };
    }

    document.body.classList.remove('no-scroll');
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showMobileMenu]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {}
    logout();
    navigate('/');
  };

  const isActive = (path) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Link to="/" className="logo">
          <img src="/assets/logo.png" alt="EdLight Academy" className="logo__image" />
          <span className="logo__text">EdLight Academy</span>
        </Link>

        {/* Mobile Menu Toggle Button */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setShowMobileMenu((v) => !v)}
          aria-label={showMobileMenu ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-controls="primary-navigation"
          aria-expanded={showMobileMenu}
        >
          {showMobileMenu ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          )}
        </button>

        <nav id="primary-navigation" className={`nav-links ${showMobileMenu ? 'nav-links--mobile-open' : ''}`}>
          <div className="nav-links__header">
            <span className="nav-links__title">Menu</span>
            <button
              type="button"
              className="nav-links__close"
              onClick={() => setShowMobileMenu(false)}
              aria-label="Fermer le menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <Link 
            to="/courses" 
            className={['nav-link', isActive('/courses') ? 'active' : ''].join(' ')}
            onClick={() => setShowMobileMenu(false)}
          >
            Cours
          </Link>
          <Link 
            to="/quizzes" 
            className={['nav-link', isActive('/quizzes') ? 'active' : ''].join(' ')}
            onClick={() => setShowMobileMenu(false)}
          >
            Quiz
          </Link>
          <Link 
            to="/exams" 
            className={['nav-link', isActive('/exams') ? 'active' : ''].join(' ')}
            onClick={() => setShowMobileMenu(false)}
          >
            Examens
          </Link>
          <Link 
            to="/about" 
            className={['nav-link', isActive('/about') ? 'active' : ''].join(' ')}
            onClick={() => setShowMobileMenu(false)}
          >
            À propos
          </Link>
          
          {/* Mobile-only auth actions */}
          {isAuthenticated ? (
            <Link 
              to="/dashboard" 
              className="nav-link nav-link--mobile-only"
              onClick={() => setShowMobileMenu(false)}
            >
              Tableau de bord
            </Link>
          ) : (
            <>
              <button 
                className="nav-link nav-link--mobile-only nav-link--button"
                onClick={() => {
                  useStore.getState().toggleAuthModal();
                  setShowMobileMenu(false);
                }}
              >
                Se connecter
              </button>
              <button 
                className="nav-link nav-link--mobile-only nav-link--button nav-link--primary"
                onClick={() => {
                  useStore.getState().toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                  setShowMobileMenu(false);
                }}
              >
                Créer un compte
              </button>
            </>
          )}
        </nav>

        {/* Mobile menu backdrop */}
        {showMobileMenu && (
          <div 
            className="mobile-menu-backdrop mobile-menu-backdrop--visible"
            onClick={() => setShowMobileMenu(false)}
          />
        )}
        
        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <button 
                className="button button--ghost button--pill nav-actions__dashboard"
                onClick={() => navigate('/dashboard')}
              >
                Tableau de bord
              </button>

              <div className="dropdown" ref={dropdownRef}>
                <button 
                  className="avatar"
                  onClick={() => toggleUserDropdown()}
                  aria-haspopup="true"
                  aria-expanded={showUserDropdown}
                >
                  {user.name.split(' ').map(n => n[0]).join('')}
                </button>
                {showUserDropdown && (
                  <UserDropdown user={user} onLogout={handleLogout} />
                )}
              </div>
            </>
          ) : (
            <>
              <button 
                className="button button--ghost button--pill nav-actions__signin"
                onClick={() => useStore.getState().toggleAuthModal()}
              >
                Se connecter
              </button>
              <button 
                className="button button--primary button--pill nav-actions__signup"
                onClick={() => {
                  useStore.getState().toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                }}
              >
                Créer un compte
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}