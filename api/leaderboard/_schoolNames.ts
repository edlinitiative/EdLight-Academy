/**
 * The school catalogue the board's display names come from: the bundled seed
 * plus the schools students added (Firestore `schools`). Read once per
 * warm instance — the list changes rarely and a stale entry only means a
 * typed spelling shows for a few minutes longer.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { mergeSchools, schoolFromDoc, seedSchools, relabelSchoolGroups, type School } from '../../shared/schools';

let cache: { at: number; list: School[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function schoolCatalogue(db: Firestore): Promise<School[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  let added: School[] = [];
  try {
    const snap = await db.collection('schools').get();
    added = snap.docs.map((d) => schoolFromDoc({ id: d.id, ...d.data() })).filter(Boolean) as School[];
  } catch {
    // The seed alone still fixes most names; never fail the board over this.
  }
  cache = { at: Date.now(), list: mergeSchools(seedSchools(), added) };
  return cache.list;
}

export { relabelSchoolGroups };
