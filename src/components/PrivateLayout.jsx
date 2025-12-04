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
        {/* Top bar with avatar */}
        <div className="top-bar">
          <div className="top-bar__left">
            <h2 className="top-bar__logo">EdLight Academy</h2>
          </div>
          <div className="top-bar__right">
            {user && (
              <button 
                className="top-bar__avatar"
                onClick={() => {}}
                aria-label="User menu"
                title={user.name || user.email}
              >
                {user.name?.split(' ').map(n => n[0]).join('') || user.email?.[0]?.toUpperCase() || 'U'}
              </button>
            )}
          </div>
        </div>

        <main className="app-shell__main app-shell__main--with-sidebar">
          <Outlet />
        </main>
      </div>

      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </div>
  );
}

