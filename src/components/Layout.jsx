import React from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { PublicLayout } from './PublicLayout';
import { PrivateLayout } from './PrivateLayout';

export function Layout() {
  const { isAuthenticated } = useStore();
  const location = useLocation();

  // Root path - show landing page or redirect to dashboard
  if (location.pathname === '/') {
    // If logged in, redirect to dashboard
    if (isAuthenticated) {
      return <Navigate to="/dashboard" replace />;
    }
    // If not logged in, show landing page
    return <PublicLayout />;
  }

  // Auth callback - allow access without authentication
  if (location.pathname.startsWith('/auth/')) {
    return (
      <div className="app-shell">
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    );
  }

  // All other routes - require authentication
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Authenticated user - show private layout with sidebar
  return <PrivateLayout />;
}