import React from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { AuthModal } from './Auth';
import useStore from '../contexts/store';

export function Layout() {
  const { showAuthModal, toggleAuthModal } = useStore();
  // Hide footer on course detail page only
  const isCourseDetail = Boolean(useMatch('/courses/:courseId'));

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-shell__main">
        <Outlet />
      </main>
      {!isCourseDetail && <Footer />}
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </div>
  );
}