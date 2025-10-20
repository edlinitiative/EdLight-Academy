import React, { useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { UserDropdown } from './Auth';

export function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dropdownRef = useRef(null);
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
          <span className="logo__mark">E</span>
          <span>EdLight Academy</span>
        </Link>

        <nav className="nav-links">
          <Link to="/courses" className={['nav-link', isActive('/courses') ? 'active' : ''].join(' ')}>
            Courses
          </Link>
          <Link to="/quizzes" className={['nav-link', isActive('/quizzes') ? 'active' : ''].join(' ')}>
            Quizzes
          </Link>
          <Link to="/about" className={['nav-link', isActive('/about') ? 'active' : ''].join(' ')}>
            About
          </Link>
        </nav>
        
        <div className="nav-actions">
          {isAuthenticated ? (
            <>
              <button 
                className="button button--ghost button--pill"
                onClick={() => navigate('/dashboard')}
              >
                Dashboard
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
                className="button button--ghost button--pill"
                onClick={() => useStore.getState().toggleAuthModal()}
              >
                Sign In
              </button>
              <button 
                className="button button--primary button--pill"
                onClick={() => {
                  useStore.getState().toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                }}
              >
                Create Account
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}