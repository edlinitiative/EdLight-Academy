import { addDoc, collection, getDocs, limit, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { schoolKey, mergeSchools, likelyDuplicate, type School } from '../../../shared/schools';
import seedDoc from '../../../shared/data/schools-seed.json';

/**
 * The school list: a bundled seed plus whatever students have added.
 *
 * The seed is 105 schools pulled from four years of ESLP applications, and it
 * ships INSIDE the app on purpose. The picker has to work on the first launch,
 * on a bad connection, before any Firestore read returns — because a student
 * who sees an empty list types their own spelling, and the school board groups
 * by spelling. An empty picker is how the rankings fragment.
 *
 * Firestore holds only what the seed does not: schools students add themselves.
 * If that read fails, or its rules are not deployed yet, the picker still works
 * with the seed and nothing on screen breaks.
 */

// The seed records no location: its source is the student's home address, not
// the school's, so a school is one entry per name nationally. A commune only
// appears once a student adds a school and types the school's own address.
const SEED: School[] = (seedDoc.schools as { name: string; applicants?: number }[])
  .map((s) => ({ key: schoolKey(s.name), name: s.name, commune: '', applicants: s.applicants }));

/** Bound the read: the list is a picker, not an archive. */
const MAX_ADDED = 500;

let cache: School[] | null = null;

/** Every school the picker can offer — seed first, then anything added. */
export async function loadSchools(): Promise<School[]> {
  if (cache) return cache;
  let added: School[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'schools'), limit(MAX_ADDED)));
    added = snap.docs.map((d) => {
      const v = d.data() as any;
      return {
        key: String(v.key || schoolKey(String(v.name ?? ''))),
        name: String(v.name ?? ''),
        commune: String(v.commune ?? ''),
        address: v.address ? String(v.address) : undefined,
      };
    }).filter((s) => s.name && s.key);
  } catch (err) {
    // Rules not deployed, offline, or signed out — the seed is enough to pick from.
    console.error('[Schools] load error:', err);
  }
  cache = mergeSchools(SEED, added);
  return cache;
}

/** The bundled list, for a first paint that does not wait on the network. */
export function seedSchools(): School[] {
  return SEED;
}

export type AddResult =
  | { ok: true; school: School }
  | { ok: false; reason: 'duplicate'; existing: School }
  | { ok: false; reason: 'signed-out' | 'invalid' | 'failed' };

/**
 * Add a school a student could not find.
 *
 * The duplicate check runs here as well as in the UI: the list can have grown
 * between the search and the tap, and on launch night two students at the same
 * school will do this within a minute of each other.
 */
export async function addSchool(input: {
  name: string;
  commune: string;
  address?: string;
}): Promise<AddResult> {
  const name = input.name.trim();
  const key = schoolKey(name);
  if (!auth.currentUser) return { ok: false, reason: 'signed-out' };
  if (name.length < 4 || !key) return { ok: false, reason: 'invalid' };

  const all = await loadSchools();
  const existing = likelyDuplicate(all, name) ?? all.find((s) => s.key === key) ?? null;
  if (existing) return { ok: false, reason: 'duplicate', existing };

  const school: School = { key, name, commune: input.commune.trim(), address: input.address?.trim() || undefined };
  try {
    await addDoc(collection(db, 'schools'), {
      ...school,
      address: school.address ?? null,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[Schools] add error:', err);
    return { ok: false, reason: 'failed' };
  }
  cache = mergeSchools(cache ?? SEED, [school]);
  return { ok: true, school };
}

/** Drop the cache so a newly added school shows up for the next picker. */
export function invalidateSchools(): void {
  cache = null;
}
