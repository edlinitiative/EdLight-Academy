import React from 'react';
import useStore from '../contexts/store';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Both targets stay lazy so the index route only ships the bundle the current
// visitor actually needs (marketing page for guests, dashboard for learners).
const Home = lazyWithRetry(() => import('../pages/Home'));
const Dashboard = lazyWithRetry(() => import('../pages/Dashboard'));

/**
 * The index route ("/") adapts to who is viewing it:
 *  - Signed-out visitors get the marketing landing page (Home).
 *  - Signed-in learners get their personalized Dashboard.
 *
 * When localStorage says the user is authenticated but Firebase hasn't
 * confirmed the session yet (authConfirmed = false), we hold on a spinner
 * rather than rendering Dashboard with a potentially stale token. Firebase's
 * onAuthStateChanged typically fires within ~200 ms of the idle-callback
 * bootstrap, so the delay is imperceptible on a warm session.
 */
export default function HomeRoute() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const authConfirmed = useStore((s) => s.authConfirmed);

  // Wait for Firebase to confirm before trusting persisted isAuthenticated.
  if (isAuthenticated && !authConfirmed) {
    return (
      <div className="suspense-fallback">
        <div className="loading-spinner" />
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Home />;
}
