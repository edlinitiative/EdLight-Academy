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
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase';

// Initialize Firebase
console.log('[Firebase] Initializing with config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  hasApiKey: !!firebaseConfig.apiKey
});
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google OAuth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

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
    console.log('[Firebase] Starting Google sign-in popup...');
    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Firebase] Sign-in successful:', result.user.email);
    return result;
  } catch (error) {
    console.error('[Firebase] Sign-in error:', error.code, error.message);
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

// Admin functions for managing content

/**
 * Update or create a video document in Firestore
 * @param {string} videoId - The video ID
 * @param {Object} videoData - The video data to save
 */
export async function updateVideo(videoId, videoData) {
  try {
    const videoRef = doc(db, 'videos', videoId);
    await setDoc(videoRef, {
      ...videoData,
      updated_at: serverTimestamp()
    }, { merge: true });
    console.log(`[Firebase] Updated video: ${videoId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating video:', error);
    throw error;
  }
}

/**
 * Delete a video document from Firestore
 * @param {string} videoId - The video ID to delete
 */
export async function deleteVideo(videoId) {
  try {
    const videoRef = doc(db, 'videos', videoId);
    await deleteDoc(videoRef);
    console.log(`[Firebase] Deleted video: ${videoId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting video:', error);
    throw error;
  }
}

/**
 * Update or create a course document in Firestore
 * @param {string} courseId - The course ID
 * @param {Object} courseData - The course data to save
 */
export async function updateCourse(courseId, courseData) {
  try {
    const courseRef = doc(db, 'courses', courseId);
    await setDoc(courseRef, {
      ...courseData,
      updated_at: serverTimestamp()
    }, { merge: true });
    console.log(`[Firebase] Updated course: ${courseId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating course:', error);
    throw error;
  }
}

/**
 * Delete a course document from Firestore
 * @param {string} courseId - The course ID to delete
 */
export async function deleteCourse(courseId) {
  try {
    const courseRef = doc(db, 'courses', courseId);
    await deleteDoc(courseRef);
    console.log(`[Firebase] Deleted course: ${courseId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting course:', error);
    throw error;
  }
}

/**
 * Update or create a quiz document in Firestore
 * @param {string} quizId - The quiz ID
 * @param {Object} quizData - The quiz data to save
 */
export async function updateQuiz(quizId, quizData) {
  try {
    const quizRef = doc(db, 'quizzes', quizId);
    await setDoc(quizRef, {
      ...quizData,
      updated_at: serverTimestamp()
    }, { merge: true });
    console.log(`[Firebase] Updated quiz: ${quizId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating quiz:', error);
    throw error;
  }
}

/**
 * Delete a quiz document from Firestore
 * @param {string} quizId - The quiz ID to delete
 */
export async function deleteQuiz(quizId) {
  try {
    const quizRef = doc(db, 'quizzes', quizId);
    await deleteDoc(quizRef);
    console.log(`[Firebase] Deleted quiz: ${quizId}`);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting quiz:', error);
    throw error;
  }
}

