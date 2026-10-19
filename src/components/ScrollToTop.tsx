import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * ScrollToTop — owns the window scroll position across route changes.
 *
 * • A NEW navigation (link, tab, push/replace) starts at the top. React Router
 *   keeps the previous offset otherwise, so tapping a tab while scrolled down
 *   landed the next page "in the middle". On mobile that felt broken.
 * • Browser BACK/FORWARD (a POP within this session) returns to where the
 *   student was on that entry — the course list, the exam catalogue, a long
 *   lesson page (roadmap §4 "preserve scroll position", release CON-10). The
 *   page is often still loading (lazy route, data), so the restore re-tries
 *   until the page is tall enough, for at most RESTORE_MAX_MS, and gives up the
 *   moment the student scrolls or touches the page themselves.
 *
 * Details
 * -------
 * • Positions are kept per history entry (`location.key`) in sessionStorage,
 *   capped at MAX_ENTRIES, so they survive a lazy-chunk reload but not a new tab.
 * • The first render of the app never restores: a reload or a fresh open of a
 *   shared URL starts at the top (the browser's own restoration re-applied a
 *   stale offset after the lazy route landed, jumping to mid-page — which is why
 *   it is switched off below).
 * • Ignores navigations that target an in-page anchor (#hash) so deep links
 *   and "skip to content" still work.
 * • Temporarily disables CSS `scroll-behavior: smooth` so jumps are instant.
 */
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

export const SCROLL_STORE_KEY = 'edlight:scroll:v1';
const MAX_ENTRIES = 50;
export const RESTORE_MAX_MS = 2500;

type ScrollMap = Record<string, number>;

function readMap(): ScrollMap {
  try {
    const raw = window.sessionStorage.getItem(SCROLL_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePosition(key: string, y: number) {
  try {
    const map = readMap();
    delete map[key];
    map[key] = Math.max(0, Math.round(y));
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete map[k];
    window.sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify(map));
  } catch { /* storage blocked: back simply starts at the top */ }
}

export function savedScrollFor(key: string): number | null {
  const v = readMap()[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function jumpTo(y: number) {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, y);
  root.style.scrollBehavior = previous;
}

export default function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType();
  const { pathname, hash, key } = location;
  const firstRender = useRef(true);
  const lastPath = useRef(pathname);

  // Remember this entry's position as the student scrolls (rAF-throttled).
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        writePosition(key, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [key]);

  useLayoutEffect(() => {
    const isFirst = firstRender.current;
    firstRender.current = false;
    const pathChanged = lastPath.current !== pathname;
    lastPath.current = pathname;
    // Let the browser handle in-page anchor navigation natively.
    if (hash) return undefined;

    const target = !isFirst && navType === 'POP' ? savedScrollFor(key) : null;
    if (target == null) {
      // Same page, new search params (a filter, ?lesson=): the page handles
      // its own scroll, as before. A new page starts at the top.
      if (isFirst || pathChanged) jumpTo(0);
      return undefined;
    }

    // Back/forward: restore, re-trying while the page grows into place.
    let cancelled = false;
    const started = Date.now();
    const stop = () => { cancelled = true; };
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    window.addEventListener('keydown', stop, { once: true });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      if (cancelled) return;
      jumpTo(target);
      const reached = Math.abs(window.scrollY - target) < 2;
      if (reached || Date.now() - started >= RESTORE_MAX_MS) return;
      timer = setTimeout(attempt, 100);
    };
    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [pathname, hash, key, navType]);

  return null;
}
