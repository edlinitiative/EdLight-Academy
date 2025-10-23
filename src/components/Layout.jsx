import React from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { Navbar } from './Navbar';
import { AuthModal } from './Auth';
import useStore from '../contexts/store';

export function Layout() {
  const { showAuthModal, toggleAuthModal } = useStore();
  // Footer intentionally hidden site-wide per request

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-shell__main">
        <Outlet />
      </main>
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </div>
  );
}