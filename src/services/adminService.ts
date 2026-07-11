/**
 * adminService — shared data helpers for the admin console.
 *
 * Thin wrappers over Firestore for the admin pages (users, moderation,
 * overview counts). Content CRUD (videos/courses/quizzes) already lives in
 * `services/firebase.ts` (updateVideo, deleteQuiz, updateUser, …) — reuse those.
 */
import {
  collection, getDocs, getCountFromServer, query, orderBy, limit as fbLimit,
  doc, updateDoc, deleteDoc, getDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface AdminUser {
  uid: string;
  full_name?: string;
  email?: string;
  role?: string;
  track?: string;
  last_seen?: any;
  created_at?: any;
  onboarding_completed?: boolean;
  profile_picture?: string;
  [k: string]: any;
}

/** List users (most-recently-seen first when the field exists). */
export async function listUsers(max = 500): Promise<AdminUser[]> {
  const ref = collection(db, 'users');
  let snap;
  try {
    snap = await getDocs(query(ref, orderBy('last_seen', 'desc'), fbLimit(max)));
  } catch {
    // Some docs may lack last_seen → fall back to an unordered read.
    snap = await getDocs(query(ref, fbLimit(max)));
  }
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AdminUser));
}

/** Fetch a single user document. */
export async function getUser(uid: string): Promise<AdminUser | null> {
  const d = await getDoc(doc(db, 'users', uid));
  return d.exists() ? ({ uid: d.id, ...d.data() } as AdminUser) : null;
}

/** Promote/demote a user. Pass 'admin' or '' (student). */
export async function setUserRole(uid: string, role: 'admin' | ''): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role });
}

export interface CommentReport {
  id: string;
  commentId: string;
  threadKey: string;
  reporterId: string;
  reason: string;
  created_at?: any;
}

/** Pending comment reports for the moderation queue. */
export async function listCommentReports(max = 200): Promise<CommentReport[]> {
  const ref = collection(db, 'commentReports');
  let snap;
  try {
    snap = await getDocs(query(ref, orderBy('created_at', 'desc'), fbLimit(max)));
  } catch {
    snap = await getDocs(query(ref, fbLimit(max)));
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommentReport));
}

/** Dismiss/resolve a report (removes it from the queue). */
export async function resolveReport(reportId: string): Promise<void> {
  await deleteDoc(doc(db, 'commentReports', reportId));
}

/** Best-effort document count for a collection. Tries the server aggregate
 *  first, then falls back to counting a plain read (some rule/index setups
 *  reject the aggregate query even when the collection is readable). */
export async function countCollection(name: string): Promise<number | null> {
  try {
    const snap = await getCountFromServer(collection(db, name));
    return snap.data().count;
  } catch {
    try {
      const snap = await getDocs(collection(db, name));
      return snap.size;
    } catch {
      return null;
    }
  }
}

export interface AdminOverviewCounts {
  users: number | null;
  videos: number | null;
  quizzes: number | null;
  pendingReports: number | null;
}

/** Headline counts for the overview dashboard (server-side aggregates). */
export async function getAdminOverview(): Promise<AdminOverviewCounts> {
  const [users, videos, quizzes, pendingReports] = await Promise.all([
    countCollection('users'),
    countCollection('videos'),
    countCollection('quizzes'),
    countCollection('commentReports'),
  ]);
  return { users, videos, quizzes, pendingReports };
}
