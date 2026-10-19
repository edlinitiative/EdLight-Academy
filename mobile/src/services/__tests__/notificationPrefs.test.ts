jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({})),
}));
jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(() => ({})),
  getAuth: jest.fn(() => ({})),
  getReactNativePersistence: jest.fn(),
  GoogleAuthProvider: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn((...parts: any[]) => ({ path: parts.slice(1).join('/') })),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'ts'),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('../../config/firebase', () => ({ firebaseConfig: {} }));

import { getDoc, setDoc } from 'firebase/firestore';
import { getNotificationPrefs, saveNotificationPrefs } from '../firebase';

describe('notification prefs (users/{uid}/settings/notifications)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads competitionUpdates as ON when the doc or the field is absent', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    expect((await getNotificationPrefs('u1')).competitionUpdates).toBe(true);
    (getDoc as jest.Mock).mockResolvedValueOnce({ exists: () => true, data: () => ({ studyReminders: false }) });
    expect((await getNotificationPrefs('u1')).competitionUpdates).toBe(true);
  });

  it('reads competitionUpdates: false as OFF, matching the server check', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce({ exists: () => true, data: () => ({ competitionUpdates: false }) });
    expect(await getNotificationPrefs('u1')).toMatchObject({ competitionUpdates: false, studyReminders: true });
  });

  it('writes only the changed key, merged into the settings doc', async () => {
    await saveNotificationPrefs('u1', { competitionUpdates: false });
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/u1/settings/notifications' },
      { competitionUpdates: false, updated_at: 'ts' },
      { merge: true },
    );
  });
});
