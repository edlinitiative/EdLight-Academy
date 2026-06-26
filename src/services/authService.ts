import useStore from '../contexts/store';

/**
 * Service layer for authentication
 * This handles the mapping between Firebase auth and your app's user state.
 *
 * Firebase is imported DYNAMICALLY here so its ~600 KB SDK is not bundled into
 * the initial/main chunk. It only downloads the first time a visitor actually
 * signs in / out — keeping first paint fast on slow mobile connections.
 */
let _fbPromise: Promise<typeof import('./firebase')> | null = null;
function loadFirebase() {
  if (!_fbPromise) _fbPromise = import('./firebase');
  return _fbPromise;
}

/**
 * After authentication, load user profile from Firestore and sync track to store.
 */
async function syncUserProfile(uid) {
  try {
    const { getUserProfile } = await loadFirebase();
    const profile = await getUserProfile(uid);
    if (profile) {
      const store = useStore.getState();
      if (profile.track) {
        store.setTrack(profile.track);
      }
      if (profile.onboarding_completed) {
        store.setOnboardingCompleted(true);
      }
    }
  } catch (err) {
    console.warn('Could not sync user profile:', err);
  }
}

function getDefaultStudentName() {
  const language = useStore.getState().language;
  return language === 'ht' ? 'Elèv' : 'Élève';
}

export async function loginWithEmailPassword(email, password) {
  try {
    const { signIn, upsertUserDocument } = await loadFirebase();
    const result = await signIn(email, password);
    const user = result.user;
    
    // Update user document in Firestore (update last_seen)
    await upsertUserDocument(user, false);
    
    // Sync track/onboarding from Firestore
    await syncUserProfile(user.uid);
    
    return {
      uid: user.uid,
      name: user.displayName || getDefaultStudentName(),
      email: user.email || '',
      picture: user.photoURL || '',
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function registerWithEmailPassword(email, password, name) {
  try {
    const { signUp, upsertUserDocument } = await loadFirebase();
    const result = await signUp(email, password, name);
    const user = result.user;
    
    // Create user document in Firestore (new user)
    await upsertUserDocument(user, true);
    
    return {
      uid: user.uid,
      name: name || user.displayName || getDefaultStudentName(),
      email: user.email || '',
      picture: user.photoURL || '',
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function loginWithGoogle() {
  try {
    const { signInWithGoogle, upsertUserDocument } = await loadFirebase();
    const result = await signInWithGoogle();
    const user = result.user;
    
    const isNewUser = result.isNewUser ?? false;
    
    // Create or update user document in Firestore
    await upsertUserDocument(user, isNewUser);
    
    // Sync track/onboarding from Firestore
    await syncUserProfile(user.uid);
    
    return {
      uid: user.uid,
      name: user.displayName || getDefaultStudentName(),
      email: user.email || '',
      picture: user.photoURL || '',
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function logoutUser() {
  try {
    const { logout: firebaseLogout } = await loadFirebase();
    await firebaseLogout();
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function sendPasswordReset(email) {
  try {
    const { resetPassword } = await loadFirebase();
    await resetPassword(email);
  } catch (error) {
    throw new Error(error.message);
  }
}

export function getAuthUser() {
  // Read from the app store (kept in sync with Firebase auth) so this stays
  // synchronous and free of any Firebase import.
  const user = useStore.getState().user;
  if (!user) return null;

  return {
    uid: user.uid,
    name: user.name || getDefaultStudentName(),
    email: user.email || '',
    picture: user.picture || '',
  };
}

