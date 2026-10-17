import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, BookOpen, GraduationCap, Swords, User } from './icons';

/**
 * Mobile-only bottom tab bar — the primary navigation on phones.
 *
 * Gives EdLight an app-like, native feel: a frosted, safe-area-aware bar with
 * FIVE thumb-friendly destinations, the same five as the native app
 * (Accueil / Apprendre / Examens / Arène / Profil). Six was too many to read
 * at 390px; Pratiquer now lives under Apprendre — its tab lights up there, and
 * <LearnSwitch> at the top of /courses and /practice moves between the two.
 * The "Profil" tab is the account hub — it folds in the secondary destinations
 * (dashboard, study plan, notifications, settings, sign-out) that used to live
 * in the slide-out drawer.
 *
 * Hidden on >= 768px via CSS (see mobile-premium.css).
 */
const TABS = [
  { to: '/', labelKey: 'nav.home', icon: Home, exact: true },
  { to: '/courses', labelKey: 'nav.learn', icon: BookOpen },
  { to: '/exams', labelKey: 'nav.exams', icon: GraduationCap },
  { to: '/arena', labelKey: 'nav.arena', icon: Swords },
  { to: '/profile', labelKey: 'nav.profile', icon: User },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  // Auto-hide the bar to give content more room: slide it away when the user
  // scrolls DOWN into content, bring it back when they scroll UP (or reach the
  // top). A small threshold avoids jitter; it's always shown near the top.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // The scroll container varies (the app scrolls <body>, but some routes use
    // an inner overflow container). Listen in the CAPTURE phase — scroll events
    // don't bubble, but capture catches them from any scroller — and read the
    // position from the event target, falling back to the document scrollers.
    const readY = (target) => {
      if (target && target !== document && typeof target.scrollTop === 'number') return target.scrollTop;
      return window.scrollY || document.body.scrollTop || document.documentElement.scrollTop || 0;
    };
    let lastY = readY(document.body);
    let curTarget = null;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = readY(curTarget);
      const delta = y - lastY;
      if (y < 72) {
        setHidden(false); // always visible near the top
      } else if (Math.abs(delta) > 6) {
        setHidden(delta > 0); // scrolling down → hide; up → show
      }
      lastY = y;
    };

    const onScroll = (e) => {
      curTarget = e.target;
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  // A new route resets scroll to the top, so make sure the bar is shown.
  useEffect(() => { setHidden(false); }, [pathname]);

  const isActive = (path, exact = false) => {
    if (path === '/' || exact) return pathname === path;
    // Practice (/practice, /quizzes) sits under the Apprendre tab.
    if (path === '/courses' && /^\/(practice|quizzes)(\/|$)/.test(pathname)) return true;
    if (path === '/arena' && /^\/(jeux|trivia|tournois|classement|defi)(\/|$)/.test(pathname)) return true;
    return pathname.startsWith(path);
  };

  // Tab bar taps are ordinary navigation. The one extra: tapping the tab of
  // the page you are already on scrolls it back to the top (the <Link> won't
  // navigate, so it wouldn't otherwise reset scroll). There used to be a
  // hidden double-tap-to-reload gesture here; it reloaded the whole document
  // and could discard an answer in progress or a pending save (audit #18,
  // PRD LJ-11), so it is gone. Refresh lives in explicit controls instead.
  const scrollToTop = () => {
    try {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
      window.scrollTo({ top: 0, behavior });
      document.scrollingElement?.scrollTo?.({ top: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  const handleTabTap = () => {
    scrollToTop();
  };

  return (
    <nav className={`bottom-nav ${hidden ? 'is-hidden' : ''}`} aria-label="Navigation principale">
      <div className="bottom-nav__inner">
        {TABS.map(({ to, labelKey, icon: Icon, exact }) => {
          const active = isActive(to, exact);
          return (
            <Link
              key={to}
              to={to}
              className={`bottom-nav__item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={handleTabTap}
            >
              <span className="bottom-nav__icon">
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              </span>
              <span className="bottom-nav__label">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
