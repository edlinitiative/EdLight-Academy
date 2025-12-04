import React from 'react';
import { Navigate } from 'react-router-dom';
import Landing from '../pages/Landing';
import { AuthModal } from './Auth';
import useStore from '../contexts/store';

export function PublicLayout() {
  const { showAuthModal, toggleAuthModal } = useStore();

  return (
    <>
      <Landing />
      {showAuthModal && <AuthModal onClose={() => toggleAuthModal()} />}
    </>
  );
}

