import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AuthModal } from './Auth';
import useStore from '../contexts/store';

export function PrivateLayout() {
  const { showAuthModal, toggleAuthModal, user, isAuthenticated } = useStore();

  // Redirect to home if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-shell app-shell--sidebar">
      <Sidebar />
      
      <div className="app-content">
        <main className="app-shell__main app-shell__main--with-sidebar">
          <Outlet />
        </main>
      </div>

      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </div>
  );
}

