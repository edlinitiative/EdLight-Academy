import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { AuthModal } from './Auth';
import { StreakMilestoneModal } from './Streak';
import useStore from '../contexts/store';

export function Layout() {
  const { showAuthModal, toggleAuthModal, language } = useStore();
  const isCreole = language === 'ht';

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="app-shell__main">
        <Outlet />
      </main>
      <Footer />
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
      <StreakMilestoneModal isCreole={isCreole} />
    </div>
  );
}