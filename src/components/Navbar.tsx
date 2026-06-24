import React, { useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  BookOpen,
  ClipboardList,
  Gamepad2,
  User,
  LayoutDashboard,
  CalendarCheck,
  LogOut,
  ChevronRight,
  Bell,
  X,
} from 'lucide-react';
import useStore from '../contexts/store';
import { logoutUser } from '../services/authService';
import { UserDropdown } from './Auth';
import { StreakBadge } from './Streak';
import { LevelBadge } from './LevelBadge';
import NotificationBell from './NotificationBell';
import { useFocusTrap } from '../hooks/useFocusTrap';

/** Primary destinations shown in the desktop inline nav and the mobile drawer.
 *  Kept identical to the PWA bottom bar (BottomNav) so web + app agree. */
const NAV_ITEMS = [
  { to: '/', label: 'Accueil', icon: Home, exact: true },
  { to: '/courses', label: 'Cours', icon: BookOpen },
  { to: '/exams', label: 'Examens', icon: ClipboardList },
  { to: '/trivia', label: 'Trivia', icon: Gamepad2 },
  { to: '/profile', label: 'Profil', icon: User },
];

export function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dropdownRef = useRef(null);
  const navLinksRef = useRef(null);
  const {
    isAuthenticated,
    user,
    showUserDropdown,
    toggleUserDropdown,
    logout,
    theme,
    toggleTheme,
    showMobileMenu,
    setShowMobileMenu,
  } = useStore();

  const isDark = theme === 'dark';
  const ThemeToggle = ({ className = '' }) => (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={() => toggleTheme()}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode nuit (Night Shift)'}
      title={isDark ? 'Mode clair' : 'Night Shift'}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );

  const closeMenu = () => setShowMobileMenu(false);

  // Trap keyboard focus inside the drawer while it's open (mobile only — on
  // desktop showMobileMenu stays false, so this is inert there).
  useFocusTrap(navLinksRef, showMobileMenu);

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
  }, [pathname, setShowMobileMenu]);

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
  }, [showMobileMenu, setShowMobileMenu]);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {}
    logout();
    closeMenu();
    navigate('/');
  };

  const isActive = (path, exact = false) => {
    if (path === '/' || exact) {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'EL';

  return (
    <header className="navbar">
      <div className="container navbar__inner">
        <Link to="/" className="logo" onClick={closeMenu}>
          <img src="/assets/logo.png" alt="EdLight Academy" className="logo__image" />
          <span className="logo__text">EdLight Academy</span>
        </Link>

        {/* Mobile menu is opened from the bottom tab bar's "Menu" tab
            (shared `showMobileMenu` store flag), so the top-bar hamburger
            is intentionally omitted to avoid a redundant control. */}

        <nav id="primary-navigation" className={`nav-links ${showMobileMenu ? 'nav-links--mobile-open' : ''}`} ref={navLinksRef}>
          {/* Drawer header (mobile only) */}
          <div className="nav-links__header nav-drawer__header">
            <Link to="/" className="nav-drawer__brand" onClick={closeMenu}>
              <img src="/assets/logo.png" alt="" className="nav-drawer__brand-img" />
              <span className="nav-drawer__brand-text">EdLight Academy</span>
            </Link>
            <button
              type="button"
              className="nav-links__close"
              onClick={closeMenu}
              aria-label="Fermer le menu"
            >
              <X size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          {/* Profile card (mobile, authenticated) */}
          {isAuthenticated && user && (
            <Link to="/dashboard" className="nav-drawer__profile" onClick={closeMenu}>
              <span className="nav-drawer__avatar">{initials}</span>
              <span className="nav-drawer__profile-info">
                <span className="nav-drawer__profile-name">{user.name}</span>
                <span className="nav-drawer__profile-email">{user.email || 'Voir le tableau de bord'}</span>
              </span>
              <ChevronRight size={18} className="nav-drawer__profile-chevron" aria-hidden="true" />
            </Link>
          )}

          {NAV_ITEMS.map(({ to, label, icon: ItemIcon, exact }) => (
            <Link
              key={to}
              to={to}
              className={['nav-link', isActive(to, exact) ? 'active' : ''].join(' ')}
              onClick={closeMenu}
            >
              <span className="nav-link__icon"><ItemIcon size={19} strokeWidth={2} aria-hidden="true" /></span>
              <span className="nav-link__label">{label}</span>
            </Link>
          ))}

          {/* Secondary actions (mobile only) */}
          <div className="nav-drawer__section">
            <span className="nav-drawer__section-label">Mon espace</span>

            <ThemeToggle className="theme-toggle--mobile-only" />

            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="nav-link nav-link--mobile-only" onClick={closeMenu}>
                  <span className="nav-link__icon"><LayoutDashboard size={19} strokeWidth={2} aria-hidden="true" /></span>
                  <span className="nav-link__label">Tableau de bord</span>
                </Link>
                <button
                  type="button"
                  className="nav-link nav-link--mobile-only"
                  onClick={() => {
                    useStore.getState().setShowNotifications(true);
                    closeMenu();
                  }}
                >
                  <span className="nav-link__icon"><Bell size={19} strokeWidth={2} aria-hidden="true" /></span>
                  <span className="nav-link__label">Notifications</span>
                </button>
                <Link to="/study-plan" className="nav-link nav-link--mobile-only" onClick={closeMenu}>
                  <span className="nav-link__icon"><CalendarCheck size={19} strokeWidth={2} aria-hidden="true" /></span>
                  <span className="nav-link__label">Plan d'étude</span>
                </Link>
                <button type="button" className="nav-link nav-link--mobile-only nav-link--danger" onClick={handleLogout}>
                  <span className="nav-link__icon"><LogOut size={19} strokeWidth={2} aria-hidden="true" /></span>
                  <span className="nav-link__label">Déconnexion</span>
                </button>
              </>
            ) : (
              <div className="nav-drawer__footer">
                <button
                  className="button button--ghost nav-drawer__cta"
                  onClick={() => {
                    useStore.getState().toggleAuthModal();
                    closeMenu();
                  }}
                >
                  Se connecter
                </button>
                <button
                  className="button button--primary nav-drawer__cta"
                  onClick={() => {
                    useStore.getState().toggleAuthModal();
                    useStore.getState().setActiveTab('signup');
                    closeMenu();
                  }}
                >
                  Créer un compte
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Mobile menu backdrop */}
        {showMobileMenu && (
          <div
            className="mobile-menu-backdrop mobile-menu-backdrop--visible"
            onClick={closeMenu}
          />
        )}

        <div className="nav-actions">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <StreakBadge />

              <LevelBadge />

              <NotificationBell />

              <div className="dropdown" ref={dropdownRef}>
                <button
                  className="avatar"
                  onClick={() => toggleUserDropdown()}
                  aria-haspopup="true"
                  aria-expanded={showUserDropdown}
                >
                  {initials}
                </button>
                {showUserDropdown && (
                  <UserDropdown user={user} onLogout={handleLogout} />
                )}
              </div>
            </>
          ) : (
            <>
              <button
                className="button button--ghost nav-actions__signin"
                onClick={() => useStore.getState().toggleAuthModal()}
              >
                Se connecter
              </button>
              <button
                className="button button--primary nav-actions__signup"
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
