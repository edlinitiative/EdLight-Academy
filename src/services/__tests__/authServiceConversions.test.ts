/**
 * The Google Ads conversion (`sign_up`) must fire only for a brand-new account,
 * with `{ method }` only — never on a returning login, never with PII.
 */
const mockFirebase = {
  signUp: jest.fn(),
  signIn: jest.fn(),
  signInWithGoogle: jest.fn(),
  getUserProfile: jest.fn(),
  writeUserDocument: jest.fn(),
};

jest.mock('../firebase', () => mockFirebase);
jest.mock('../../utils/analytics', () => ({ track: jest.fn() }));

import { track } from '../../utils/analytics';
import {
  registerWithEmailPassword,
  loginWithEmailPassword,
  loginWithGoogle,
} from '../authService';

const user = { uid: 'u1', email: 'student@example.com', displayName: 'Student', photoURL: '' };

beforeEach(() => {
  mockFirebase.getUserProfile.mockResolvedValue(null);
  mockFirebase.writeUserDocument.mockResolvedValue(undefined);
});

describe('authService GA4 conversions', () => {
  it('sends sign_up { method: password } after email registration', async () => {
    mockFirebase.signUp.mockResolvedValue({ user });
    await registerWithEmailPassword('student@example.com', 'secret123', 'Student');
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('sign_up', { method: 'password' });
  });

  it('sends login, not sign_up, for an email sign-in', async () => {
    mockFirebase.signIn.mockResolvedValue({ user });
    await loginWithEmailPassword('student@example.com', 'secret123');
    expect(track).toHaveBeenCalledWith('login', { method: 'password' });
    expect(track).not.toHaveBeenCalledWith('sign_up', expect.anything());
  });

  it('sends sign_up { method: google } only for a first-ever Google sign-in', async () => {
    mockFirebase.signInWithGoogle.mockResolvedValue({ user, isNewUser: true });
    await loginWithGoogle();
    expect(track).toHaveBeenCalledWith('sign_up', { method: 'google' });
  });

  it('sends login for a returning Google user', async () => {
    mockFirebase.signInWithGoogle.mockResolvedValue({ user, isNewUser: false });
    await loginWithGoogle();
    expect(track).toHaveBeenCalledWith('login', { method: 'google' });
    expect(track).not.toHaveBeenCalledWith('sign_up', expect.anything());
  });

  it('sends nothing when sign-up fails', async () => {
    mockFirebase.signUp.mockRejectedValue(new Error('auth/email-already-in-use'));
    await expect(registerWithEmailPassword('a@b.c', 'x', 'n')).rejects.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});
