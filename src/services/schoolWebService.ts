/**
 * The school list on the web: a bundled seed plus whatever students have added.
 *
 * Mirrors mobile/src/services/schoolService.ts, and deliberately so — both
 * read the same `schools` collection and both feed the same school board, so
 * the parts where they could disagree about school identity (the document
 * mapping, the duplicate test, short-name validation, the merge) all live in
 * shared/schools.ts and are called from here rather than reimplemented.
 *
 * Why the web needed this at all: the /arena page shipped searching only the
 * bundled 94-school seed, so a student whose school had been ADDED by someone
 * else could not find it, and a student whose school was in neither place had
 * no way forward — "arène does not let me register my school". The seed is
 * four years of ESLP applicants; it was never the whole country.
 */
import { addDoc, collection, getDocs, limit, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  schoolKey,
  schoolFromDoc,
  mergeSchools,
  likelyDuplicate,
  validateShortName,
  shortNameFailure,
  seedSchools as bundledSeedSchools,
  type School,
  type ShortNameReason,
} from '../../shared/schools';

// From shared/, not mapped again here: the SERVER resolves a school's board
// label from the same list (api/arena/_shared.ts), and a second mapping of the
// same JSON is how the board ends up with two entries for one school.
const SEED: School[] = bundledSeedSchools();

/** Bound the read: the list is a picker, not an archive. */
const MAX_ADDED = 500;

let cache: School[] | null = null;

/** Every school the picker can offer — seed first, then anything added. */
export async function loadSchools(): Promise<School[]> {
  if (cache) return cache;

  // `schools` is readable only to a signed-in user (firestore.rules), and the
  // /arena picker renders for signed-out visitors too. Asking anyway would
  // spend a round-trip to be denied and log an error on every anonymous page
  // load. Nothing is cached in that case, so the read happens once they sign
  // in — which is before they can register anyway.
  if (!auth.currentUser) return mergeSchools(SEED, []);

  let added: School[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'schools'), limit(MAX_ADDED)));
    added = snap.docs
      .map((d) => schoolFromDoc(d.data()))
      // A pending school stays in the picker — the student who just added
      // theirs must be able to pick it, or they cannot finish signing up at
      // all. A merged one does not: it has been folded into another entry, and
      // offering it again re-splits the points the merge just brought together.
      .filter((s): s is School => !!s && s.status !== 'merged');
  } catch (err) {
    // Rules not deployed, offline, or signed out — the seed is enough to pick
    // from, and a picker that works offline is the point of bundling it.
    console.error('[Schools] load error:', err);
  }
  cache = mergeSchools(SEED, added);
  return cache;
}

/** The bundled list, for a first paint that does not wait on the network. */
export function seedSchools(): School[] {
  return SEED;
}

export interface AddSchoolResult {
  ok: boolean;
  school?: School;
  reason?: 'duplicate' | 'short-name' | 'signed-out' | 'invalid' | 'failed';
  /** On 'duplicate': the school the student should pick instead. */
  existing?: School;
  /** On 'short-name': which rule the typed short name broke. */
  detail?: ShortNameReason;
}

/**
 * Add a school a student could not find.
 *
 * The duplicate check runs here as well as in the UI: the list can have grown
 * between the search and the click, and on launch night two students at the
 * same school will do this within a minute of each other.
 */
export async function addSchool(input: {
  name: string;
  commune: string;
  address?: string;
  city?: string;
  /** Optional: a student who does not know their school's short name leaves it
   *  blank, and an admin asks later. Demanding one here is how invented short
   *  names get created. */
  shortName?: string;
}): Promise<AddSchoolResult> {
  const name = input.name.trim();
  const key = schoolKey(name);
  if (!auth.currentUser) return { ok: false, reason: 'signed-out' };
  if (name.length < 4 || !key) return { ok: false, reason: 'invalid' };

  const all = await loadSchools();
  const existing = likelyDuplicate(all, name) ?? all.find((s) => s.key === key) ?? null;
  if (existing) return { ok: false, reason: 'duplicate', existing };

  // Re-validated here and not only in the form, for the same reason the
  // duplicate check is: the list can have grown between the two, and a short
  // name is the one field where a second student getting through would put two
  // schools behind one bar on the tournament stage.
  let shortName: string | undefined;
  if (input.shortName?.trim()) {
    const check = validateShortName(input.shortName, all);
    const failure = shortNameFailure(check);
    if (failure) return { ok: false, reason: 'short-name', detail: failure };
    shortName = (check as { ok: true; value: string }).value;
  }

  const school: School = {
    key,
    name,
    commune: input.commune.trim(),
    address: input.address?.trim() || undefined,
    city: input.city?.trim() || undefined,
    shortName,
    // Student-submitted, so NOT canonical yet: an admin approves it, merges it
    // into an existing school, or rejects it. Writing 'approved' here would put
    // every typo into the tournament's list of real schools.
    status: 'pending',
  };
  try {
    await addDoc(collection(db, 'schools'), {
      ...school,
      address: school.address ?? null,
      city: school.city ?? null,
      shortName: school.shortName ?? null,
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
