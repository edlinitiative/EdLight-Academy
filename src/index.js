import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './mobile-fixes.css';
import { initI18n } from './utils/i18n';
import useStore from './contexts/store';
import { onAuthStateChange, upsertUserDocument } from './services/firebase';

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
  if (!state.hydrated) {
    useStore.setState({ hydrated: true, isAuthenticated: !!state.user });
  } else if (state.isAuthenticated !== !!state.user) {
    useStore.setState({ isAuthenticated: !!state.user });
  }
}, 0);

// Sync Firebase auth state to app store
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
      name: user.displayName || 'Student',
      email: user.email || '',
      picture: user.photoURL || '',
    });
  } else {
    useStore.getState().logout();
  }
});