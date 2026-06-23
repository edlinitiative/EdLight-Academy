import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, BookOpen, ClipboardList, Gamepad2, User } from 'lucide-react';

/**
 * Mobile-only bottom tab bar — the primary navigation on phones.
 *
 * Gives EdLight an app-like, native feel: a frosted, safe-area-aware bar with
 * five thumb-friendly destinations (Home / Learn / Exam Prep / Trivia / Profile).
 * The "Profil" tab is the account hub — it folds in the secondary destinations
 * (dashboard, study plan, notifications, settings, sign-out) that used to live
 * in the slide-out drawer.
 *
 * Hidden on >= 768px via CSS (see mobile-premium.css).
 */
const TABS = [
  { to: '/', label: 'Accueil', icon: Home, exact: true },
  { to: '/courses', label: 'Cours', icon: BookOpen },
  { to: '/exams', label: 'Examens', icon: ClipboardList },
  { to: '/trivia', label: 'Trivia', icon: Gamepad2 },
  { to: '/profile', label: 'Profil', icon: User },
];

export default function BottomNav() {
  const { pathname } = useLocation();

  const isActive = (path, exact = false) => {
    if (path === '/' || exact) return pathname === path;
    return pathname.startsWith(path);
  };

  // Native-app feel for the tab bar:
  //   • single tap → smooth-scroll the current page back to the top (the <Link>
  //                 still handles navigation when the route is different)
  //   • double tap → reload the route (a quick "pull-to-refresh" equivalent)
  const lastTapRef = useRef({ to: '', time: 0 });

  const scrollToTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      document.scrollingElement?.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  const handleTabTap = (to) => (e) => {
    const now = Date.now();
    const prev = lastTapRef.current;
    const isDoubleTap = prev.to === to && now - prev.time < 350;
    lastTapRef.current = { to, time: now };

    if (isDoubleTap) {
      // Second quick tap on the same tab → refresh.
      e.preventDefault();
      window.location.reload();
      return;
    }
    // First tap → jump to the top. Essential when we're already on this route,
    // since the <Link> won't navigate (and so wouldn't otherwise reset scroll).
    scrollToTop();
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
              onClick={handleTabTap(to)}
            >
              <span className="bottom-nav__icon">
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              </span>
              <span className="bottom-nav__label">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
