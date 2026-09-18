import { addDoc, collection, getDocs, limit, query, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  schoolKey,
  shortNameKey,
  mergeSchools,
  likelyDuplicate,
  validateShortName,
  type School,
  type ShortNameReason,
} from '../../../shared/schools';
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
const SEED: School[] = (seedDoc.schools as { name: string; applicants?: number; shortName?: string }[])
  .map((s) => ({
    key: schoolKey(s.name),
    name: s.name,
    commune: '',
    applicants: s.applicants,
    // Only the schools whose short name someone actually told us carry one.
    shortName: s.shortName,
  }));

/** A Firestore school document, before we have checked anything about it. */
type SchoolDoc = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The status of a stored school.
 *
 * A document written before short names existed has no status at all, and those
 * are treated as approved: they are already on the live school board, and
 * demoting them to pending would quietly strip schools students have been
 * playing under for months.
 */
function readStatus(v: unknown): School['status'] {
  return v === 'pending' || v === 'merged' || v === 'approved' ? v : undefined;
}

function readAliases(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const aliases = v.filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
  return aliases.length ? aliases : undefined;
}

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
      const v = d.data() as SchoolDoc;
      return {
        key: str(v.key) || schoolKey(str(v.name)),
        name: str(v.name),
        commune: str(v.commune),
        address: str(v.address) || undefined,
        city: str(v.city) || undefined,
        shortName: shortNameKey(str(v.shortName)) || undefined,
        aliases: readAliases(v.aliases),
        // Carried through rather than dropped: a caller that shows a pending
        // school has to be able to say so, and the Arena has to be able to
        // refuse a short name a pending school has not earned yet.
        status: readStatus(v.status),
        mergedInto: str(v.mergedInto) || undefined,
      };
    })
      // A pending school stays in the picker — the student who just added
      // theirs must be able to pick it, or they cannot finish signing up at
      // all. A merged one does not: it has been folded into another entry, and
      // offering it again re-splits the points the merge just brought together.
      .filter((s) => s.name && s.key && s.status !== 'merged');
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
  | { ok: false; reason: 'short-name'; detail: ShortNameReason }
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
  city?: string;
  /** Optional: a student who does not know their school's short name leaves it
   *  blank, and an admin asks later. Demanding one here is how invented short
   *  names get created. */
  shortName?: string;
}): Promise<AddResult> {
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
  // schools behind one bar on the stage.
  let shortName: string | undefined;
  if (input.shortName?.trim()) {
    const check = validateShortName(input.shortName, all);
    if (!check.ok) return { ok: false, reason: 'short-name', detail: check.reason };
    shortName = check.value;
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

/** Drop the cache so a newly added school shows up for the next picker. */
export function invalidateSchools(): void {
  cache = null;
}
