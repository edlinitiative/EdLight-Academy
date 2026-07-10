import React from 'react';
import { render, act } from '@testing-library/react';
import useStore from '../../contexts/store';
import { AuthModal } from '../Auth';

// The modal pulls in i18n, Firebase-backed auth calls, and a few DOM hooks.
// Stub them so the test isolates the one behavior we care about here: the
// modal must close once the app is authenticated, regardless of how that
// happened (its own submit, or Firebase's global auth listener).
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../services/authService', () => ({
  loginWithEmailPassword: jest.fn(),
  registerWithEmailPassword: jest.fn(),
  loginWithGoogle: jest.fn(),
  sendPasswordReset: jest.fn(),
}));
jest.mock('../../hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }));
jest.mock('../../hooks/useFocusTrap', () => ({ useFocusTrap: () => {} }));
jest.mock('../../hooks/useSwipeToDismiss', () => ({
  useSwipeToDismiss: () => ({ style: {}, onTouchStart() {}, onTouchMove() {}, onTouchEnd() {} }),
}));

describe('AuthModal — closes when authentication is confirmed', () => {
  beforeEach(() => {
    useStore.setState({ isAuthenticated: false, user: null });
  });

  it('calls onClose once the store becomes authenticated', () => {
    const onClose = jest.fn();
    render(<AuthModal onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();

    // Simulate authentication being confirmed by any path (e.g. Firebase's
    // global onAuthStateChanged listener) while the modal is still open.
    act(() => {
      useStore.setState({ isAuthenticated: true, user: { uid: 'u1' } });
    });

    expect(onClose).toHaveBeenCalled();
  });
});
