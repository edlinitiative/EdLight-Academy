import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import BottomNav from './BottomNav';
import NetworkStatus from './NetworkStatus';
import RouteMeta from './RouteMeta';
import { AuthModal } from './Auth';
import { StreakMilestoneModal } from './Streak';
import { WelcomeLanguageModal } from './WelcomeLanguageModal';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { useNotificationRuntime } from '../hooks/useNotificationRuntime';
import useStore from '../contexts/store';
import { SandraWidget } from './SandraWidget';
import DownloadAppBanner from './DownloadAppBanner';

// Notification panel is only shown on demand — keep it (and its Firebase use)
// out of the initial shell bundle.
const NotificationCenter = lazyWithRetry(() => import('./NotificationCenter'));

export function Layout() {
  const { showAuthModal, toggleAuthModal, language, theme, showNotifications, setShowNotifications, focusMode } = useStore();
  const { t } = useTranslation();
  const isCreole = language === 'ht';
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  // Start reminder scheduling / push sync once a user is signed in.
  useNotificationRuntime();

  // Focused, app-like flows that should shed the global chrome (bottom tab bar
  // + footer) so the task owns the screen:
  //   • Taking an exam:  /exams/:level/:examId  (but NOT the .../results page)
  // The exam-taking flow goes fully immersive (the global navbar is hidden too,
  // since the exam has its own sticky top bar with a back button).
  //
  // A course LESSON is also immersive, but the same /courses/:id route first
  // shows a (non-immersive) overview, so that screen drives focus mode itself
  // via the `focusMode` store flag rather than this URL test.
  const isExamTaking =
    /^\/exams\/[^/]+\/[^/]+$/.test(pathname) && !pathname.endsWith('/results');
  // Trivia is a single-route, app-like game flow (landing -> round picker ->
  // quiz -> results). It keeps the bottom tab bar for navigation, but the
  // marketing footer (Contact/Confidentialité/Conditions) is out of place in a
  // game screen, so we drop it here.
  const isTrivia = pathname === '/jeux' || pathname.startsWith('/jeux/') || pathname === '/trivia';
  const isImmersive = isExamTaking;
  // `focusMode` is a transient store flag set by phase-based flows (via the
  // useFocusMode hook) that can't be detected from the URL alone — e.g. an
  // active trivia round (screen === 'play'), a live practice question on
  // /quizzes, or a course lesson (vs its overview). It drops the bottom tab bar
  // + footer for the same "maximum focus" effect as the route-based flow above.
  const isFocused = isExamTaking || focusMode;

  const shellClassName = [
    'app-shell',
    isImmersive ? 'app-shell--immersive' : '',
    isFocused ? 'app-shell--focused' : '',
  ]
    .filter(Boolean)
    .join(' ');

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }, [theme]);

  // Warm the course catalog when the browser is idle so navigating to /courses
  // is instant. The data layer (and Firebase) is imported dynamically here so
  // it stays out of the main bundle and never blocks first paint.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefetch = () => {
      import('../services/dataService')
        .then(({ loadCoursesData }) => {
          queryClient.prefetchQuery({
            queryKey: ['coursesData'],
            queryFn: loadCoursesData,
            staleTime: 5 * 60 * 1000,
          });
        })
        .catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 1500);
    return () => window.clearTimeout(id);
  }, [queryClient]);

  // Reveal-on-scroll: any element with data-reveal fades + slides in once visible.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    const attach = () => document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach((el) => io.observe(el));
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { subtree: true, childList: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);

  return (
    <div className={shellClassName}>
      <RouteMeta />
      <DownloadAppBanner />
      <a href="#main-content" className="skip-to-content">
        {t('a11y.skipToContent', 'Aller au contenu')}
      </a>
      <NetworkStatus />
      <Navbar />
      <main id="main-content" className="app-shell__main">
        <Outlet />
      </main>
      {!isTrivia && <Footer />}
      {!isFocused && <BottomNav />}
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
      {showNotifications && (
        <Suspense fallback={null}>
          <div
            className="notification-overlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowNotifications(false);
            }}
          >
            <NotificationCenter onClose={() => setShowNotifications(false)} />
          </div>
        </Suspense>
      )}
      <SandraWidget />
      <StreakMilestoneModal isCreole={isCreole} />
      <WelcomeLanguageModal />
    </div>
  );
}