import { signIn, signUp, signInWithGoogle, logout as firebaseLogout, getCurrentUser, upsertUserDocument } from './firebase';

/**
 * Service layer for authentication
 * This handles the mapping between Firebase auth and your app's user state
 */

export async function loginWithEmailPassword(email, password) {
  try {
    const result = await signIn(email, password);
    const user = result.user;
    
    // Update user document in Firestore (update last_seen)
    await upsertUserDocument(user, false);
    
    return {
      uid: user.uid,
      name: user.displayName || 'Student',
      email: user.email || '',
      picture: user.photoURL || '',
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function registerWithEmailPassword(email, password, name) {
  try {
    const result = await signUp(email, password, name);
    const user = result.user;
    
    // Create user document in Firestore (new user)
    await upsertUserDocument(user, true);
    
    return {
      uid: user.uid,
      name: name || user.displayName || 'Student',
      email: user.email || '',
      picture: user.photoURL || '',
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithGoogle();
    const user = result.user;
    
    // Check if this is a new user via additionalUserInfo
    const isNewUser = result._tokenResponse?.isNewUser || false;
    
    // Create or update user document in Firestore
    await upsertUserDocument(user, isNewUser);
    
    return {
      uid: user.uid,
      name: user.displayName || 'Student',
      email: user.email || '',
      picture: user.photoURL || '',
    };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function logoutUser() {
  try {
    await firebaseLogout();
  } catch (error) {
    throw new Error(error.message);
  }
}

export function getAuthUser() {
  const user = getCurrentUser();
  
  if (!user) return null;
  
  return {
    uid: user.uid,
    name: user.displayName || 'Student',
    email: user.email || '',
    picture: user.photoURL || '',
  };
}

