import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { AuthModal } from './Auth';
import useStore from '../contexts/store';

export function Layout() {
  const { showAuthModal, toggleAuthModal } = useStore();

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-shell__main">
        <Outlet />
      </main>
      <Footer />
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </div>
  );
}