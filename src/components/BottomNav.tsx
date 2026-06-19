import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, BookOpen, ClipboardList, Gamepad2, Menu as MenuIcon } from 'lucide-react';
import useStore from '../contexts/store';

/**
 * Mobile-only bottom tab bar — the primary navigation on phones.
 *
 * Gives EdLight an app-like, native feel: a frosted, safe-area-aware bar with
 * five thumb-friendly destinations. The "Menu" tab opens the full drawer
 * (owned by Navbar via the shared store flag `showMobileMenu`).
 *
 * Hidden on >= 768px via CSS (see mobile-premium.css).
 */
const TABS = [
  { to: '/', label: 'Accueil', icon: Home, exact: true },
  { to: '/courses', label: 'Cours', icon: BookOpen },
  { to: '/exams', label: 'Examens', icon: ClipboardList },
  { to: '/trivia', label: 'Trivia', icon: Gamepad2 },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const { showMobileMenu, toggleMobileMenu } = useStore();

  const isActive = (path, exact = false) => {
    if (path === '/' || exact) return pathname === path;
    return pathname.startsWith(path);
  };

  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      <div className="bottom-nav__inner">
        {TABS.map(({ to, label, icon: Icon, exact }) => {
          const active = isActive(to, exact);
          return (
            <Link
              key={to}
              to={to}
              className={`bottom-nav__item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="bottom-nav__icon">
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              </span>
              <span className="bottom-nav__label">{label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className={`bottom-nav__item bottom-nav__item--menu ${showMobileMenu ? 'is-active' : ''}`}
          onClick={() => toggleMobileMenu()}
          aria-expanded={showMobileMenu}
          aria-label="Ouvrir le menu"
        >
          <span className="bottom-nav__icon">
            <MenuIcon size={22} strokeWidth={showMobileMenu ? 2.4 : 2} aria-hidden="true" />
          </span>
          <span className="bottom-nav__label">Menu</span>
        </button>
      </div>
    </nav>
  );
}
