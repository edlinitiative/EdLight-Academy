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
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, addDoc, query, where, orderBy, onSnapshot, getDocs, updateDoc, arrayUnion, increment, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase';

// Initialize Firebase
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
    const result = await signInWithPopup(auth, googleProvider);
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
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting course:', error);
    throw error;
  }
}

/**
 * Remove a specific lesson from a course unit
 * @param {string} courseId - The course ID
 * @param {string} unitId - The unit ID
 * @param {string} lessonId - The lesson ID to remove
 */
export async function removeLessonFromCourse(courseId, unitId, lessonId) {
  try {
    
    // Get the course document
    const courseRef = doc(db, 'courses', courseId);
    const courseSnap = await getDoc(courseRef);
    
    if (!courseSnap.exists()) {
      throw new Error(`Course ${courseId} not found`);
    }
    
    const courseData = courseSnap.data();
    const units = courseData.units || [];
    
    // Find the unit and remove the lesson
    const updatedUnits = units.map(unit => {
      if (unit.unitId === unitId || unit.id === unitId) {
        return {
          ...unit,
          lessons: (unit.lessons || []).filter(lesson => lesson.lessonId !== lessonId)
        };
      }
      return unit;
    });
    
    // Update the course with modified units
    await setDoc(courseRef, {
      ...courseData,
      units: updatedUnits,
      updated_at: serverTimestamp()
    });
    
    return { success: true, message: `Lesson removed from ${courseId}` };
  } catch (error) {
    console.error('[Firebase] Error removing lesson:', error);
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
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting quiz:', error);
    throw error;
  }
}

/**
 * Delete all documents in the quizzes collection.
 * Use a batched delete to avoid per-doc overhead.
 */
export async function deleteAllQuizzes() {
  try {
    const quizzesRef = collection(db, 'quizzes');
    const snap = await getDocs(quizzesRef);
    if (snap.empty) {
      return { success: true, deleted: 0 };
    }

    // Firestore batches are limited (500), process in slices
    const docs = [];
    snap.forEach((d) => docs.push(d));
    let deleted = 0;

    while (docs.length > 0) {
      const batch = writeBatch(db);
      const chunk = docs.splice(0, 400); // keep under 500
      for (const d of chunk) {
        batch.delete(doc(db, 'quizzes', d.id));
      }
      await batch.commit();
      deleted += chunk.length;
    }

    return { success: true, deleted };
  } catch (error) {
    console.error('[Firebase] Error deleting all quizzes:', error);
    throw error;
  }
}

/**
 * Update or create a user document in Firestore
 * @param {string} userId - The user ID
 * @param {Object} userData - The user data to save
 */
export async function updateUser(userId, userData) {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      ...userData,
      updated_at: serverTimestamp()
    }, { merge: true });
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating user:', error);
    throw error;
  }
}

/**
 * Delete a user document from Firestore
 * @param {string} userId - The user ID to delete
 */
export async function deleteUser(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    await deleteDoc(userRef);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting user:', error);
    throw error;
  }
}

// ============================================
// COMMENTS / DISCUSSION FUNCTIONS
// ============================================

/**
 * Add a comment to a video/lesson thread
 * @param {string} threadKey - The thread identifier (e.g., "comments:courseId:videoId")
 * @param {string} text - The comment text
 * @param {Object} user - The user object with uid, displayName, email
 * @returns {Promise<Object>} The created comment with ID
 */
export async function addComment(threadKey, text, user) {
  try {
    const commentsRef = collection(db, 'comments');
    const commentData = {
      threadKey,
      text: text.trim(),
      authorId: user.uid,
      authorName: user.displayName || user.email?.split('@')[0] || 'Student',
      authorEmail: user.email,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      replyCount: 0,
      likes: 0
    };
    
    const docRef = await addDoc(commentsRef, commentData);
    
    return { 
      id: docRef.id, 
      ...commentData,
      created_at: Date.now(), // Use client timestamp for immediate display
      updated_at: Date.now()
    };
  } catch (error) {
    console.error('[Firebase] Error adding comment:', error);
    throw error;
  }
}

/**
 * Add a reply to a comment
 * @param {string} commentId - The parent comment ID
 * @param {string} text - The reply text
 * @param {Object} user - The user object with uid, displayName, email
 * @returns {Promise<Object>} The created reply
 */
export async function addReply(commentId, text, user) {
  try {
    const repliesRef = collection(db, 'comments', commentId, 'replies');
    const replyData = {
      text: text.trim(),
      authorId: user.uid,
      authorName: user.displayName || user.email?.split('@')[0] || 'Student',
      authorEmail: user.email,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    };
    
    const docRef = await addDoc(repliesRef, replyData);
    
    // Increment reply count on parent comment
    const commentRef = doc(db, 'comments', commentId);
    await updateDoc(commentRef, {
      replyCount: increment(1),
      updated_at: serverTimestamp()
    });
    
    
    return { 
      id: docRef.id, 
      ...replyData,
      created_at: Date.now(),
      updated_at: Date.now()
    };
  } catch (error) {
    console.error('[Firebase] Error adding reply:', error);
    throw error;
  }
}

/**
 * Subscribe to comments for a specific thread
 * @param {string} threadKey - The thread identifier
 * @param {Function} callback - Callback function to receive comments updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToComments(threadKey, callback) {
  try {
    const commentsRef = collection(db, 'comments');
    const q = query(
      commentsRef,
      where('threadKey', '==', threadKey),
      orderBy('created_at', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const comments = [];
      snapshot.forEach((doc) => {
        comments.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(comments);
    }, (error) => {
      console.error('[Firebase] Error in comments subscription:', error);
      callback([]);
    });
  } catch (error) {
    console.error('[Firebase] Error subscribing to comments:', error);
    return () => {}; // Return empty unsubscribe function
  }
}

/**
 * Subscribe to replies for a specific comment
 * @param {string} commentId - The parent comment ID
 * @param {Function} callback - Callback function to receive replies updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToReplies(commentId, callback) {
  try {
    const repliesRef = collection(db, 'comments', commentId, 'replies');
    const q = query(repliesRef, orderBy('created_at', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
      const replies = [];
      snapshot.forEach((doc) => {
        replies.push({
          id: doc.id,
          ...doc.data()
        });
      });
      callback(replies);
    }, (error) => {
      console.error('[Firebase] Error in replies subscription:', error);
      callback([]);
    });
  } catch (error) {
    console.error('[Firebase] Error subscribing to replies:', error);
    return () => {};
  }
}

/**
 * Delete a comment
 * @param {string} commentId - The comment ID to delete
 */
export async function deleteComment(commentId) {
  try {
    // Delete all replies first
    const repliesRef = collection(db, 'comments', commentId, 'replies');
    const repliesSnapshot = await getDocs(repliesRef);
    const deletePromises = repliesSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Delete the comment
    const commentRef = doc(db, 'comments', commentId);
    await deleteDoc(commentRef);
    
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error deleting comment:', error);
    throw error;
  }
}

/**
 * Update a comment
 * @param {string} commentId - The comment ID
 * @param {string} text - The new comment text
 */
export async function updateComment(commentId, text) {
  try {
    const commentRef = doc(db, 'comments', commentId);
    await updateDoc(commentRef, {
      text: text.trim(),
      updated_at: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating comment:', error);
    throw error;
  }
}
