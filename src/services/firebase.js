import { initializeApp } from 'firebase/app';
import { getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google OAuth Provider
export const googleProvider = new GoogleAuthProvider();

// Authentication functions

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential;
  } catch (error) {
    throw error;
  }
}

/**
 * Create a new user account with email and password
 */
export async function signUp(email, password, name) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update profile with name if provided
    if (name) {
      await updateProfile(user, { displayName: name });
    }
    
    return userCredential;
  } catch (error) {
    throw error;
  }
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Sign out the current user
 */
export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    throw error;
  }
}

/**
 * Listen to authentication state changes
 */
export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Create or update user document in Firestore
 */
export async function upsertUserDocument(user, isNewUser = false) {
  try {
    const userRef = doc(db, 'users', user.uid);
    
    if (isNewUser) {
      // Create new user document
      await setDoc(userRef, {
        created_at: serverTimestamp(),
        email: user.email || '',
        enrollment: '',
        full_name: user.displayName || '',
        last_seen: serverTimestamp(),
        onboarding_completed: false,
        profile_picture: user.photoURL || ''
      });
    } else {
      // Check if user document exists
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        // Create if doesn't exist
        await setDoc(userRef, {
          created_at: serverTimestamp(),
          email: user.email || '',
          enrollment: '',
          full_name: user.displayName || '',
          last_seen: serverTimestamp(),
          onboarding_completed: false,
          profile_picture: user.photoURL || ''
        });
      } else {
        // Update last_seen and other fields that might have changed
        await setDoc(userRef, {
          last_seen: serverTimestamp(),
          email: user.email || '',
          full_name: user.displayName || '',
          profile_picture: user.photoURL || ''
        }, { merge: true });
      }
    }
  } catch (error) {
    console.error('Error upserting user document:', error);
    throw error;
  }
}

