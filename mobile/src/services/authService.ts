import useStore from '../contexts/store';

let _fbPromise: Promise<typeof import('./firebase')> | null = null;
function loadFirebase() {
  if (!_fbPromise) _fbPromise = import('./firebase');
  return _fbPromise;
}

async function syncUserProfile(uid: string) {
  try {
    const { getUserProfile } = await loadFirebase();
    const profile = await getUserProfile(uid);
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
  const { signIn, upsertUserDocument } = await loadFirebase();
  const result = await signIn(email, password);
  const user = result.user;
  await upsertUserDocument(user, false);
  await syncUserProfile(user.uid);
  return {
    uid: user.uid,
    name: user.displayName || getDefaultStudentName(),
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

export async function registerWithEmailPassword(email: string, password: string, name: string) {
  const { signUp, upsertUserDocument } = await loadFirebase();
  const result = await signUp(email, password, name);
  const user = result.user;
  await upsertUserDocument(user, true);
  return {
    uid: user.uid,
    name: name || user.displayName || getDefaultStudentName(),
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

export async function loginWithGoogleCredential(idToken: string, accessToken?: string) {
  const { signInWithGoogleCredential, upsertUserDocument } = await loadFirebase();
  const result = await signInWithGoogleCredential(idToken, accessToken);
  const user = result.user;
  await upsertUserDocument(user, result.isNewUser ?? false);
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
  await logout();
}

export async function sendPasswordReset(email: string) {
  const { resetPassword } = await loadFirebase();
  await resetPassword(email);
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
