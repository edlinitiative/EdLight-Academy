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
 * Start the sign-in machinery on intent (hover/focus/touch) rather than on click.
 *
 * `signInWithPopup` cannot open its popup until Firebase has fetched gapi from
 * apis.google.com and booted an iframe on the firebaseapp.com auth domain —
 * measured at ~800ms to popup and ~2.5s to a usable handshake on a fast link,
 * and far worse on the mobile connections most students are on. None of that
 * work depends on the click, so it should not wait for it.
 *
 * Safe to call repeatedly: the import promise is memoised, and a warm-up that
 * fails is simply a click that pays the old cost.
 */
export function warmAuth() {
  loadFirebase()
    .then((fb) => fb.warmGoogleAuth())
    .catch(() => {});
}

/**
 * After authentication, hydrate the store from the Firestore profile and record
 * the visit.
 *
 * Sign-in used to spend three *sequential* Firestore round-trips here before
 * the student saw the app: upsert read the document to decide create-vs-update,
 * upsert wrote it, then the profile was read all over again. On a Haitian
 * mobile connection that is several seconds of spinner after Google has already
 * said yes.
 *
 * Now exactly one read is on the critical path — it doubles as the existence
 * check — and the write is a side-effect nobody waits on. Auth has already
 * succeeded by this point, so a failed write must never fail the login.
 */
async function hydrateSession(user, isNewUser = false) {
  try {
    const { getUserProfile, writeUserDocument } = await loadFirebase();

    // A brand-new account has nothing to read: skip straight to the create.
    const profile = isNewUser ? null : await getUserProfile(user.uid);

    if (profile) {
      const store = useStore.getState();
      if (profile.track) {
        store.setTrack(profile.track);
      }
      if (profile.onboarding_completed) {
        store.setOnboardingCompleted(true);
      }
    }

    // Deliberately not awaited: last_seen is not worth a round-trip of delay.
    writeUserDocument(user, { create: isNewUser || !profile }).catch((err) => {
      console.warn('Could not write user document on login:', err);
    });
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
    const { signIn } = await loadFirebase();
    const result = await signIn(email, password);
    const user = result.user;

    // One read to hydrate track/onboarding; the last_seen write is fire-and-forget.
    await hydrateSession(user, false);
    
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
    const { signUp, writeUserDocument } = await loadFirebase();
    const result = await signUp(email, password, name);
    const user = result.user;

    // Non-critical: if this write fails the account still exists and the
    // document is recreated on the next login, so it must not fail signup —
    // and the new student should not wait on it to reach the app.
    writeUserDocument(user, { create: true }).catch((err) => {
      console.warn('Could not create user document on signup:', err);
    });
    
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
    const { signInWithGoogle } = await loadFirebase();
    const result = await signInWithGoogle();
    const user = result.user;

    const isNewUser = result.isNewUser ?? false;

    // One read to hydrate track/onboarding; the document write is fire-and-forget.
    await hydrateSession(user, isNewUser);

    return {
      uid: user.uid,
      name: user.displayName || getDefaultStudentName(),
      email: user.email || '',
      picture: user.photoURL || '',
      // Surfaced so the signup UI can redeem a referral only for first-time
      // Google accounts (not returning logins). Not persisted into the store.
      isNewUser,
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

