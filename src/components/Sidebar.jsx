import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { logoutUser } from '../services/authService';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error('Logout error:', error);
    }
    logout();
    navigate('/', { replace: true });
  };

  const isActive = (path) => {
    if (path === '/dashboard' || path === '/') {
      return location.pathname === '/dashboard' || location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavClick = (e, path) => {
    e.preventDefault();
    navigate(path);
    setIsMobileOpen(false); // Close mobile menu after navigation
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const navItems = [
    {
      path: '/dashboard',
      label: 'Dashboard',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
      )
    },
    {
      path: '/my-learning',
      label: 'My Learning',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          <path d="M12 6v6"></path>
          <path d="M9 9l3 3 3-3"></path>
        </svg>
      )
    },
    {
      path: '/courses',
      label: 'Courses',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
      )
    },
    {
      path: '/quizzes',
      label: 'Practice',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      )
    },
  ];

  const bottomItems = [
    {
      path: '/profile',
      label: 'Profile',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      )
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M12 1v6m0 6v6m8.66-12l-5.2 3m-3.92 2.27l-5.2 3M23 12h-6m-6 0H1m20.66 8l-5.2-3m-3.92-2.27l-5.2-3"></path>
        </svg>
      )
    }
  ];

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button 
        className="mobile-sidebar-toggle"
        onClick={toggleMobileSidebar}
        aria-label="Toggle sidebar"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      <aside className={`sidebar ${isMobileOpen ? 'sidebar--mobile-open' : ''}`}>
      {/* Logo Header */}
      <div className="sidebar__header">
        <a href="/dashboard" className="sidebar__logo" onClick={(e) => {
          e.preventDefault();
          navigate('/dashboard');
        }}>
          <span className="sidebar__logo-text">EdLight Academy</span>
        </a>
      </div>

      <div className="sidebar__nav">
        {navItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            onClick={(e) => handleNavClick(e, item.path)}
            className={`sidebar__link ${isActive(item.path) ? 'sidebar__link--active' : ''}`}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span className="sidebar__label">{item.label}</span>
          </a>
        ))}
      </div>

      <div className="sidebar__bottom">
        {bottomItems.map((item) => (
          <a
            key={item.path}
            href={item.path}
            onClick={(e) => handleNavClick(e, item.path)}
            className={`sidebar__link ${isActive(item.path) ? 'sidebar__link--active' : ''}`}
          >
            <span className="sidebar__icon">{item.icon}</span>
            <span className="sidebar__label">{item.label}</span>
          </a>
        ))}
        
        {/* Sign Out Button */}
        <button
          className="sidebar__link sidebar__link--logout"
          onClick={handleLogout}
          title="Sign Out"
        >
          <span className="sidebar__icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </span>
          <span className="sidebar__label">Sign Out</span>
        </button>
      </div>
    </aside>

    {/* Sidebar Overlay for Mobile */}
    <div 
      className={`sidebar-overlay ${isMobileOpen ? 'sidebar-overlay--visible' : ''}`}
      onClick={() => setIsMobileOpen(false)}
    />
    </>
  );
}

