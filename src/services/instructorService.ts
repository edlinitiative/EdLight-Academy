/**
 * instructorService — public teacher profiles.
 *
 * The `instructors` collection is world-readable (see firestore.rules): a
 * profile is shown on the course pages it's bound to (via `courseIds`) and on
 * /enseignants/:id. Docs are created by admins from approved applications
 * (AdminInstructors) and edited from the admin console.
 */

import {
  collection, doc, getDoc, getDocs, query, where, limit as fbLimit,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Instructor {
  id: string;
  name: string;
  photoUrl?: string;
  /** Short bios, one per language; ht falls back to fr. */
  bio_fr?: string;
  bio_ht?: string;
  subjects?: string[];
  levels?: string[];
  school?: string;
  credentials?: string;
  courseIds?: string[];
  visible?: boolean;
}

const fromSnap = (id: string, data: any): Instructor => ({
  id,
  name: data?.name || '',
  photoUrl: data?.photoUrl || '',
  bio_fr: data?.bio_fr || '',
  bio_ht: data?.bio_ht || '',
  subjects: Array.isArray(data?.subjects) ? data.subjects : [],
  levels: Array.isArray(data?.levels) ? data.levels : [],
  school: data?.school || '',
  credentials: data?.credentials || '',
  courseIds: Array.isArray(data?.courseIds) ? data.courseIds : [],
  visible: data?.visible !== false,
});

export async function getInstructor(id: string): Promise<Instructor | null> {
  try {
    const snap = await getDoc(doc(db, 'instructors', id));
    return snap.exists() ? fromSnap(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

/** Teachers bound to a course. Filters `visible` client-side so the query
 *  needs no composite index. */
export async function getInstructorsForCourse(courseId: string): Promise<Instructor[]> {
  try {
    const snap = await getDocs(query(
      collection(db, 'instructors'),
      where('courseIds', 'array-contains', courseId),
      fbLimit(4),
    ));
    return snap.docs.map((d) => fromSnap(d.id, d.data())).filter((i) => i.visible);
  } catch {
    return [];
  }
}
