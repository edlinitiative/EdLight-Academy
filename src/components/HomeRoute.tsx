import React from 'react';
import useStore from '../contexts/store';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Both targets stay lazy so the index route only ships the bundle the current
// visitor actually needs (marketing page for guests, dashboard for learners).
const Home = lazyWithRetry(() => import('../pages/Home'));
const Dashboard = lazyWithRetry(() => import('../pages/Dashboard'));

/**
 * The index route ("/") adapts to who is viewing it:
 *  - Signed-out visitors get the marketing landing page (Home) with the full
 *    conversion funnel (hero, social proof, sign-up CTA).
 *  - Signed-in learners get their personalized home (Dashboard) instead —
 *    resume points, courses in progress, streak and recent activity — so the
 *    most valuable screen isn't spent re-selling a product they already use.
 *
 * `isAuthenticated` is rehydrated synchronously from persisted storage (the
 * same source the Navbar trusts), so there is no logged-in/out flash on refresh.
 * Suspense is provided by the router shell in App.tsx.
 */
export default function HomeRoute() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Dashboard /> : <Home />;
}
