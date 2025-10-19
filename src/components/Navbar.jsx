import React, { useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { useLanguage } from '../hooks/useTracking';
import { UserDropdown } from './Auth';

export function Navbar() {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const { currentLanguage, toggleLanguage } = useLanguage();
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

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="container nav-container">
        <Link to="/" className="logo">
          <div className="logo-box">E</div>
          <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>EdLight Academy</span>
        </Link>

        <nav className="nav-links">
          <Link to="/courses" className="nav-link">
            {currentLanguage === 'ht' ? 'Kou yo' : 'Cours'}
          </Link>
          <Link to="/quizzes" className="nav-link">
            {currentLanguage === 'ht' ? 'Egzèsis' : 'Exercices'}
          </Link>
          <Link to="/about" className="nav-link">
            {currentLanguage === 'ht' ? 'Apropo' : 'À propos'}
          </Link>
          <button 
            onClick={toggleLanguage}
            className="btn-outline btn-sm"
            style={{ padding: '0.25rem 0.75rem' }}
          >
            {currentLanguage === 'ht' ? 'FR' : 'KR'}
          </button>
        </nav>
        
        <div className="user-menu" ref={dropdownRef}>
          {isAuthenticated ? (
            <>
              <div className="relative">
                <button 
                  className="btn-outline btn-sm"
                  onClick={() => navigate('/dashboard')}
                >
                  {currentLanguage === 'ht' ? 'Pwogre' : 'Progrès'}
                </button>
              </div>
              
              <div className="relative">
                <button 
                  className="user-avatar"
                  onClick={() => toggleUserDropdown()}
                  style={{ cursor: 'pointer' }}
                >
                  {user.name.split(' ').map(n => n[0]).join('')}
                </button>
                {showUserDropdown && (
                  <UserDropdown user={user} onLogout={handleLogout} />
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="btn-outline btn-sm"
                onClick={() => useStore.getState().toggleAuthModal()}
              >
                {currentLanguage === 'ht' ? 'Konekte' : 'Connexion'}
              </button>
              <button 
                className="btn btn-sm"
                onClick={() => {
                  useStore.getState().toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                }}
              >
                {currentLanguage === 'ht' ? 'Enskri' : "S'inscrire"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}