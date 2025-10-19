import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { AuthModal } from './Auth';
import useStore from '../contexts/store';

export function Layout() {
  const { showAuthModal, toggleAuthModal } = useStore();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </div>
  );
}