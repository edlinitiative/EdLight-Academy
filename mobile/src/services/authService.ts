import useStore from '../contexts/store';

import { withTimeout } from '../lifecycle/sessionLogic';
import { reportError } from './telemetry';

let _fbPromise: Promise<typeof import('./firebase')> | null = null;
function loadFirebase() {
  if (!_fbPromise) _fbPromise = import('./firebase');
  return _fbPromise;
}

/** Firestore waits for the server forever when offline; sign-in must not. */
const PROFILE_TIMEOUT_MS = 10_000;

/**
 * Create/refresh users/{uid} after an explicit sign-in. Authentication has
 * already succeeded at this point, so a slow, blocked or rejected Firestore
 * write must not turn it into a failed sign-in: it is bounded and caught, and
 * the auth gate's own profile sync retries it on foreground / reconnect.
 */
async function upsertProfileBestEffort(user: any, isNewUser: boolean) {
  try {
    const { upsertUserDocument } = await loadFirebase();
    await withTimeout(upsertUserDocument(user, isNewUser), PROFILE_TIMEOUT_MS, 'profile upsert');
    const { markProfileSynced } = await import('../lifecycle/session');
    markProfileSynced(user.uid);
  } catch (err) {
    reportError(err, { flow: 'profile_sync', reason: isNewUser ? 'sign-up' : 'sign-in' });
  }
}

async function syncUserProfile(uid: string) {
  try {
    const { getUserProfile } = await loadFirebase();
    const profile = await withTimeout(getUserProfile(uid), PROFILE_TIMEOUT_MS, 'profile read');
    if (useStore.getState().user?.uid && useStore.getState().user?.uid !== uid) return; // account changed meanwhile
    if (profile) {
      const store = useStore.getState();
      if (profile.track) store.setTrack(profile.track);
      if (profile.onboarding_completed) store.setOnboardingCompleted(true);
    }
  } catch (err) {
    console.warn('Could not sync user profile:', err);
  }
}

function getDefaultStudentName() {
  return useStore.getState().language === 'ht' ? 'Elèv' : 'Élève';
}

export async function loginWithEmailPassword(email: string, password: string) {
  const { signIn } = await loadFirebase();
  const result = await signIn(email, password);
  const user = result.user;
  await upsertProfileBestEffort(user, false);
  await syncUserProfile(user.uid);
  return {
    uid: user.uid,
    name: user.displayName || getDefaultStudentName(),
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

export async function registerWithEmailPassword(email: string, password: string, name: string) {
  const { signUp } = await loadFirebase();
  const result = await signUp(email, password, name);
  const user = result.user;
  await upsertProfileBestEffort(user, true);
  return {
    uid: user.uid,
    name: name || user.displayName || getDefaultStudentName(),
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

export async function loginWithGoogleCredential(idToken: string, accessToken?: string) {
  const { signInWithGoogleCredential } = await loadFirebase();
  const result = await signInWithGoogleCredential(idToken, accessToken);
  const user = result.user;
  await upsertProfileBestEffort(user, result.isNewUser ?? false);
  await syncUserProfile(user.uid);
  return {
    uid: user.uid,
    name: user.displayName || getDefaultStudentName(),
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

export async function loginWithAppleCredential(identityToken: string, rawNonce: string, fullName?: string) {
  const { signInWithAppleCredential } = await loadFirebase();
  const result = await signInWithAppleCredential(identityToken, rawNonce, fullName);
  const user = result.user;
  await upsertProfileBestEffort(user, result.isNewUser ?? false);
  await syncUserProfile(user.uid);
  return {
    uid: user.uid,
    name: user.displayName || getDefaultStudentName(),
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

export async function logoutUser() {
  const { logout } = await loadFirebase();
  // Best-effort: stop remote pushes to this device before signing out.
  try {
    const uid = useStore.getState().user?.uid;
    if (uid) {
      const { unregisterPushToken } = await import('./pushService');
      await unregisterPushToken(uid);
    }
  } catch {
    // never block logout
  }
  // Clear the Sandra conversation pointer so the next account on this device
  // can't resume the previous user's AI thread (context/PII bleed on shared
  // devices). Best-effort — never block logout.
  try {
    const { writeConvId } = await import('./sandraService');
    await writeConvId(null);
  } catch {
    // ignore
  }
  try {
    await logout();
  } finally {
    // Whatever happened to signOut, this device must stop showing the student:
    // store student state + in-memory and persisted query caches. The auth
    // listener does the same on its sign-out event; doing it here too covers a
    // signOut that throws, and is idempotent.
    try {
      const { clearStudentSession } = await import('../lifecycle/session');
      clearStudentSession('logout');
    } catch {
      // never block logout
    }
  }
}

export async function sendPasswordReset(email: string) {
  const { resetPassword } = await loadFirebase();
  await resetPassword(email);
}

/**
 * Permanently delete the signed-in user's account + all their data.
 * Calls the server-side endpoint (Firebase Admin) which removes the Auth user
 * and every Firestore record they own, then signs out locally. Irreversible.
 */
const DELETE_ACCOUNT_URL = 'https://academy.edlight.org/api/users/delete';
export async function deleteAccount(): Promise<void> {
  const fb = await loadFirebase();
  const user = fb.auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  const token = await user.getIdToken();

  const res = await fetch(DELETE_ACCOUNT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = '';
    try {
      const d = await res.json();
      if (typeof d?.message === 'string') msg = d.message;
    } catch { /* non-JSON error body */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  // Account is gone server-side — clear the local session too (best-effort).
  try { await logoutUser(); } catch { /* session already invalid */ }
}

export function getAuthUser() {
  const user = useStore.getState().user;
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.name || getDefaultStudentName(),
    email: user.email || '',
    picture: user.picture || '',
  };
}
