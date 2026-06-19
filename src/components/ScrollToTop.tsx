import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop — resets the window scroll position to the top whenever the
 * route (pathname) changes.
 *
 * Why this exists
 * ---------------
 * React Router keeps the previous scroll offset on navigation, so tapping a
 * bottom-nav tab or any link while scrolled down would land the next page
 * "in the middle" instead of at the top. On mobile — where EdLight is used
 * first — that felt broken. This restores the expected, app-like behaviour:
 * every new page starts at the top.
 *
 * Details
 * -------
 * • Runs in useLayoutEffect so the jump happens before paint (no flash of
 *   mid-scrolled content).
 * • Ignores navigations that target an in-page anchor (#hash) so deep links
 *   and "skip to content" still work.
 * • Temporarily disables CSS `scroll-behavior: smooth` so the reset is an
 *   instant jump rather than a slow animated scroll on low-end devices.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    // Let the browser handle in-page anchor navigation natively.
    if (hash) return;

    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    // Force an instant jump regardless of the global smooth-scroll rule.
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = previous;
  }, [pathname, hash]);

  return null;
}
