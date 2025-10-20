import React, { useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { UserDropdown } from './Auth';

export function Navbar() {
  const navigate = useNavigate();
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

  return (
    <header className="navbar">
      <div className="container nav-container">
        <Link to="/" className="logo">
          <div className="logo-box">E</div>
          <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>EdLight Academy</span>
        </Link>

        <nav className="nav-links">
          <Link to="/courses" className="nav-link">Courses</Link>
          <Link to="/quizzes" className="nav-link">Quizzes</Link>
          <Link to="/about" className="nav-link">About</Link>
        </nav>
        
        <div className="user-menu" ref={dropdownRef}>
          {isAuthenticated ? (
            <>
              <div className="relative">
                <button 
                  className="btn-outline btn-sm"
                  onClick={() => navigate('/dashboard')}
                >
                  Dashboard
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
                Sign In
              </button>
              <button 
                className="btn btn-sm"
                onClick={() => {
                  useStore.getState().toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                }}
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}