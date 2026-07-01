import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  getAdditionalUserInfo,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
// getReactNativePersistence lives in the RN bundle of firebase/auth (resolved at runtime)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNativePersistence } = require('firebase/auth') as { getReactNativePersistence: (s: any) => any };
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  updateDoc,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { firebaseConfig } from '../config/firebase';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function getOrInitAuth() {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // initializeAuth already called (e.g. hot reload) — fall back to getAuth
    return getAuth(app);
  }
}
export const auth = getOrInitAuth();

export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(email: string, password: string, name: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(cred.user, { displayName: name });
  sendEmailVerification(cred.user).catch(console.warn);
  return cred;
}

export async function signInWithGoogleCredential(idToken: string, accessToken?: string) {
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const result = await signInWithCredential(auth, credential);
  const additionalInfo = getAdditionalUserInfo(result);
  return { ...result, isNewUser: additionalInfo?.isNewUser ?? false };
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  return signOut(auth);
}

export function onAuthStateChange(callback: (user: any) => void) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}

// ─── User document ────────────────────────────────────────────────────────

export async function upsertUserDocument(user: any, isNewUser = false) {
  const userRef = doc(db, 'users', user.uid);
  if (isNewUser) {
    await setDoc(userRef, {
      created_at: serverTimestamp(),
      email: user.email || '',
      enrollment: '',
      track: '',
      full_name: user.displayName || '',
      last_seen: serverTimestamp(),
      onboarding_completed: false,
      profile_picture: user.photoURL || '',
    });
  } else {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        created_at: serverTimestamp(),
        email: user.email || '',
        enrollment: '',
        track: '',
        full_name: user.displayName || '',
        last_seen: serverTimestamp(),
        onboarding_completed: false,
        profile_picture: user.photoURL || '',
      });
    } else {
      await setDoc(userRef, {
        last_seen: serverTimestamp(),
        email: user.email || '',
        full_name: user.displayName || '',
        profile_picture: user.photoURL || '',
      }, { merge: true });
    }
  }
}

export async function updateUserTrack(uid: string, trackCode: string) {
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    track: trackCode,
    enrollment: trackCode,
    onboarding_completed: true,
    updated_at: serverTimestamp(),
  }, { merge: true });
}

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUser(userId: string, userData: any) {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { ...userData, updated_at: serverTimestamp() }, { merge: true });
  return { success: true };
}

// ─── Comments ─────────────────────────────────────────────────────────────

export async function addComment(threadKey: string, text: string, user: any) {
  const commentsRef = collection(db, 'comments');
  const data = {
    threadKey,
    text: text.trim(),
    authorId: user.uid,
    authorName: user.displayName || user.email?.split('@')[0] || 'Élève',
    authorEmail: user.email,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    replyCount: 0,
    likes: 0,
  };
  const ref = await addDoc(commentsRef, data);
  return { id: ref.id, ...data, created_at: Date.now(), updated_at: Date.now() };
}

export function subscribeToComments(threadKey: string, callback: (c: any[]) => void) {
  const q = query(
    collection(db, 'comments'),
    where('threadKey', '==', threadKey),
    orderBy('created_at', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const comments: any[] = [];
    snap.forEach((d) => comments.push({ id: d.id, ...d.data() }));
    callback(comments);
  }, () => callback([]));
}
