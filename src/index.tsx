import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './mobile-fixes.css';
import './mobile-first.css';
import './mobile-premium.css';
import { initI18n } from './utils/i18n';
import useStore from './contexts/store';
import { registerServiceWorker } from './utils/registerServiceWorker';
import { initTelemetry } from './utils/telemetry';

function getDefaultStudentName(language) {
  return language === 'ht' ? 'Elèv' : 'Élève';
}

const initViewportHeightVar = () => {
  const root = document.documentElement;
  let rafId = null;

  const update = () => {
    const height = window.visualViewport?.height ?? window.innerHeight;
    root.style.setProperty('--vvh', `${height * 0.01}px`);
  };

  const schedule = () => {
    if (rafId != null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      update();
    });
  };

  update();

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule, { passive: true });
    window.visualViewport.addEventListener('scroll', schedule, { passive: true });
  }
};

// Keep iOS Safari viewport/keyboard quirks from breaking vh-based layouts.
initViewportHeightVar();

// Install global error/observability hooks as early as possible.
initTelemetry();

// Low-data / slow-connection awareness. When the user has Data Saver enabled
// (or is on a 2G-class connection), we flag the document so CSS can drop
// decorative gradients/animations and defer non-essential media — important
// for EdLight's low-bandwidth audience.
const initConnectionAwareness = () => {
  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return;
  const apply = () => {
    const root = document.documentElement;
    const slow = /(^|-)2g$/.test(conn.effectiveType || '');
    root.toggleAttribute('data-save-data', !!conn.saveData);
    root.toggleAttribute('data-slow-network', slow);
  };
  apply();
  conn.addEventListener?.('change', apply);
};
initConnectionAwareness();

// Initialize internationalization
initI18n();

// Create root and render app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Ensure store marks as hydrated and syncs isAuthenticated from persisted user on boot
setTimeout(() => {
  const state = useStore.getState();
  if (state.language === 'en') {
    useStore.setState({ language: 'fr' });
  }
  if (!state.hydrated) {
    useStore.setState({ hydrated: true, isAuthenticated: !!state.user });
  } else if (state.isAuthenticated !== !!state.user) {
    useStore.setState({ isAuthenticated: !!state.user });
  }
}, 0);

// Sync Firebase auth state to app store.
// Firebase (~600 KB) is imported DYNAMICALLY and scheduled AFTER first paint so
// it never blocks initial render. The persisted user from the store already
// drives the UI immediately, so there is no logged-out flash; Firebase simply
// confirms/refreshes the session in the background.
function bootstrapFirebaseAuth() {
  import('./services/firebase')
    .then(({ onAuthStateChange, upsertUserDocument }) => {
      onAuthStateChange(async (user) => {
        const setUser = useStore.getState().setUser;
        if (user) {
          // Update last_seen in Firestore on session restore
          try {
            await upsertUserDocument(user, false);
          } catch (error) {
            console.error('Failed to update user document:', error);
          }

          setUser({
            uid: user.uid,
            name: user.displayName || getDefaultStudentName(useStore.getState().language),
            email: user.email || '',
            picture: user.photoURL || '',
          });
        } else {
          useStore.getState().logout();
        }
      });
    })
    .catch((error) => {
      console.error('Failed to initialize Firebase auth:', error);
    });
}

// Defer to browser idle time (with a safety timeout) so the SDK downloads
// without competing with the first meaningful paint.
if (typeof window !== 'undefined') {
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(bootstrapFirebaseAuth, { timeout: 3000 });
  } else {
    setTimeout(bootstrapFirebaseAuth, 1);
  }
}

// Register the PWA service worker (production only, after window load).
registerServiceWorker();

// Global safety net for stale deploys.
// If any dynamic import slips past lazyWithRetry (e.g. a prefetch or a chunk
// requested outside the router) and fails because its hashed file was removed
// by a newer deploy, force a single guarded reload to pull the fresh shell.
if (typeof window !== 'undefined') {
  const RELOAD_KEY = 'edlight:chunk-reload-ts';
  const looksLikeStaleChunk = (message: string) =>
    /ChunkLoadError|Loading chunk \d+ failed|error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      message,
    );

  const reloadOnce = () => {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (!last || Date.now() - last > 10_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      /* sessionStorage unavailable — skip to avoid reload loops */
    }
  };

  window.addEventListener('error', (event) => {
    const msg = event?.message || (event?.error && String(event.error)) || '';
    if (looksLikeStaleChunk(msg)) reloadOnce();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event?.reason;
    const msg = (reason && (reason.message || String(reason))) || '';
    if (looksLikeStaleChunk(msg)) reloadOnce();
  });
}