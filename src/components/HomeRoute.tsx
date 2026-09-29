import React from 'react';
import useStore from '../contexts/store';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Both targets stay lazy so the index route only ships the bundle the current
// visitor actually needs (marketing page for guests, dashboard for learners).
// The chunk is named so the prerender can find its files (build/client-assets
// .json) and put them in the HTML's head.
const loadHome = () => import(/* webpackChunkName: "home" */ '../pages/Home');
const Home = lazyWithRetry(loadHome);

// Set once the Home module has loaded, so HomeRoute can render it directly.
// React.lazy suspends on its first render even when the chunk is already in
// memory, and a suspense fallback would replace the prerendered landing page
// in #root with a spinner for a frame before the same page came back.
let LoadedHome: React.ComponentType | null = null;

/**
 * Load the landing page before the first render. index.tsx awaits this when
 * the HTML carries the prerendered page, so the first commit swaps it for the
 * identical live tree instead of a spinner.
 */
export function preloadHome(): Promise<void> {
  return loadHome().then((m) => {
    LoadedHome = m.default;
  });
}
// Ted: the signed-in "/" shows the same content as /dashboard — the workspace.
const Workspace = lazyWithRetry(() => import('../pages/Courses'));

/**
 * The index route ("/") adapts to who is viewing it:
 *  - Signed-out visitors get the marketing landing page (Home).
 *  - Signed-in learners get their workspace (the same page as /dashboard).
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

  if (isAuthenticated) return <Workspace mode="workspace" />;
  return LoadedHome ? <LoadedHome /> : <Home />;
}
