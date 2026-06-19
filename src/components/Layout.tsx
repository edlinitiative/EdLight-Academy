import React from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import BottomNav from './BottomNav';
import { AuthModal } from './Auth';
import { StreakMilestoneModal } from './Streak';
import useStore from '../contexts/store';

export function Layout() {
  const { showAuthModal, toggleAuthModal, language, theme } = useStore();
  const isCreole = language === 'ht';
  const queryClient = useQueryClient();

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
    if ('requestIdleCallback' in window) {
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
    <div className="app-shell">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="app-shell__main">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
      <StreakMilestoneModal isCreole={isCreole} />
    </div>
  );
}