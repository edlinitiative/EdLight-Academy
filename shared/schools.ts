import { normalizeName } from './leaderboardAgg';
import seedDoc from './data/schools-seed.json';

/**
 * Finding a school in a list, and deciding when two names are the same school.
 *
 * The school board groups by name, so spelling IS the grouping. Left to free
 * text, "Lycée Toussaint", "lycee toussaint" and "L. Toussaint Louverture"
 * become three schools with a third of the points each, and the comparison the
 * whole competition is built on quietly stops working. haitiGeo.ts solved this
 * one level up for villes, for the same reason and in the same way: pick from a
 * list rather than type.
 *
 * The hard part is not the list, it is what happens when someone's school is
 * not on it. Most duplicates are not people wanting a new entry — they are
 * people failing to find the one that exists. So search has to forgive
 * accents, abbreviations and the institution type before it offers to add.
 */

export interface School {
  /** Stable grouping key — matches how the leaderboard groups by school. */
  key: string;
  name: string;
  /** Where the SCHOOL is, when a student who added it said so. Often empty. */
  commune: string;
  /** Only on schools added by a student: how they described where it is. */
  address?: string;
  /** How many ESLP applicants named it — orders the seeded list. */
  applicants?: number;
  /**
   * What the school's own students call it: CODOSA, SLG. ALWAYS supplied by a
   * student, never derived — no rule turns "Collège Dominique Savio" into
   * CODOSA, and a generated one would put a name on the tournament stage that
   * nobody at the school recognises as theirs.
   */
  shortName?: string;
  /** Other names the same school is genuinely known by, for search only. */
  aliases?: string[];
  /**
   * Whether the school is canonical. A school a student added is `pending`
   * until an admin approves it — it can still be picked and played with, it
   * just cannot yet claim a short name away from an approved school. Absent
   * means approved: the seeded schools shipped in the bundle.
   */
  status?: 'approved' | 'pending' | 'merged';
  /** When `status` is 'merged', the key of the school that absorbed it. */
  mergedInto?: string;
  /** The town, when the commune is not the name a student would recognise. */
  city?: string;
}

/**
 * Short names — the identity the tournament stage is actually built on.
 *
 * A stage has room for CODOSA, not for "Collège Dominique Savio", and a school
 * chanting its own short name is the whole point of an inter-school race. Two
 * rules keep that honest: the name comes from a student, and it is unique, so
 * one school's supporters can never end up cheering a bar that belongs to
 * another.
 */

/** 2 is the shortest a real school abbreviates to; 8 is what the stage fits. */
export const SHORT_NAME_MIN = 2;
export const SHORT_NAME_MAX = 8;

/**
 * Names nobody may claim. EDLIGHT and ADMIN would let a school speak for us on
 * a public stream; TEST is what a first submission is always called; NULL,
 * NONE and UNDEFINED are what a missing value looks like once something
 * upstream stringifies it, and a school called NULL on the standings is
 * indistinguishable from a bug we would then hunt for.
 */
const RESERVED_SHORT_NAMES = new Set(['EDLIGHT', 'ADMIN', 'TEST', 'NULL', 'NONE', 'UNDEFINED']);

export type ShortNameReason = 'too-short' | 'too-long' | 'charset' | 'taken' | 'reserved';

export type ShortNameCheck =
  | { ok: true; value: string }
  | { ok: false; reason: ShortNameReason };

/** The form a short name is stored, compared and displayed in: it is a shout. */
export function shortNameKey(raw: string): string {
  return String(raw).trim().toUpperCase();
}

/**
 * Approved means canonical. A school with no status is a seeded one — it
 * shipped inside the app, so nothing needs to approve it; only the two
 * explicit non-approved states are not.
 */
export function isApproved(school: School): boolean {
  return (school.status ?? 'approved') === 'approved';
}

/**
 * The 94 schools that ship inside the bundle, as `School` records.
 *
 * Lives here rather than in any one client because THE SERVER NEEDS IT TOO,
 * and until it had it the Arena got school identity wrong in two ways at once
 * (CORRECTION, from an external audit — E9):
 *
 *  · `api/arena/_shared.ts`'s label lookup queried the `schools` Firestore
 *    collection and nothing else. But Firestore "holds only what the seed does
 *    not: schools students add themselves" — a seeded school has no document
 *    until an admin types its location in. So for most real registrations the
 *    lookup found nothing and fell back to the raw key, and the board that is
 *    supposed to say CODOSA said `college dominique savio`: lowercased,
 *    accents stripped, on a public broadcast.
 *  · Registration validated the key's SHAPE and never asked whether it named
 *    a school at all, so a client bypassing the picker could invent one and
 *    put it on the same broadcast.
 *
 * Derived lazily so this never depends on where it sits relative to
 * `schoolKey()`'s own dependencies, and cached because the derivation is pure.
 * The key is computed with `schoolKey()` — the same function the picker and
 * the leaderboard group by — because a seed keyed any other way would be a
 * second opinion about school identity, which is the bug this whole module
 * exists to prevent.
 */
let seedCache: School[] | null = null;

export function seedSchools(): School[] {
  if (!seedCache) {
    const rows = seedDoc.schools as Array<{ name: string; shortName?: string; applicants?: number }>;
    seedCache = rows.map((s) => ({
      key: schoolKey(s.name),
      name: s.name,
      // The seed records no location: its source is the student's home
      // address, not the school's, so a school is one entry per name
      // nationally. A commune only appears once a student adds one.
      commune: '',
      applicants: s.applicants,
      // Only the schools whose short name someone actually told us carry one.
      shortName: s.shortName,
    }));
  }
  return seedCache;
}

/**
 * Read a stored school document into a School.
 *
 * Shared because BOTH clients read the same `schools` collection, and the web
 * and mobile services had every reason to grow their own mapping — which is
 * "two opinions about school identity waiting to drift", the thing this module
 * exists to stop. A document whose status is unreadable is treated as approved:
 * those were written before short names existed, their schools are already on
 * the live board, and demoting them to pending would strip schools students
 * have been playing under for months.
 *
 * Returns null for a document that cannot name a school at all — there is
 * nothing a picker could usefully do with it.
 */
export function schoolFromDoc(raw: unknown): School | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  const str = (x: unknown): string => (typeof x === 'string' ? x : '');

  const name = str(v.name);
  const key = str(v.key) || schoolKey(name);
  if (!name || !key) return null;

  const status = v.status === 'pending' || v.status === 'merged' || v.status === 'approved'
    ? (v.status as School['status'])
    : undefined;

  const aliases = Array.isArray(v.aliases)
    ? v.aliases.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
    : [];

  return {
    key,
    name,
    commune: str(v.commune),
    address: str(v.address) || undefined,
    city: str(v.city) || undefined,
    shortName: shortNameKey(str(v.shortName)) || undefined,
    aliases: aliases.length ? aliases : undefined,
    status,
    mergedInto: str(v.mergedInto) || undefined,
  };
}

let seedByKey: Map<string, School> | null = null;

/** The seeded school a key names, or null when the seed does not have it. */
export function seedSchoolByKey(key: string): School | null {
  if (!seedByKey) seedByKey = new Map(seedSchools().map((s) => [s.key, s]));
  return seedByKey.get(key) ?? null;
}

/**
 * Validate a short name a student typed for their school.
 *
 * Uniqueness is checked against APPROVED schools only, and deliberately so: a
 * pending submission must not be able to reserve CODOSA and lock out the real
 * Collège Dominique Savio, and two students submitting the same pending school
 * on launch night must both get through rather than the second being told an
 * invisible entry already took the name. Collisions between pending schools are
 * an admin's problem at approval time, where a human can see both.
 */
/**
 * Why a short-name check failed, or null when it passed.
 *
 * `ShortNameCheck` is a discriminated union, and the WEB app compiles with
 * `strictNullChecks: false`, under which TypeScript will not narrow one — a
 * web caller reading `.reason` off the union gets an error and reaches for a
 * cast. This accessor gives both apps one way to ask the question that the
 * compiler can check either way.
 */
export function shortNameFailure(check: ShortNameCheck | null): ShortNameReason | null {
  if (!check || check.ok) return null;
  // The one cast, here rather than at every call site — `ok: false` is already
  // established above, and the web compiler simply cannot see it.
  return (check as { ok: false; reason: ShortNameReason }).reason;
}

export function validateShortName(raw: string, existing: School[]): ShortNameCheck {
  const value = shortNameKey(raw);
  if (value.length < SHORT_NAME_MIN) return { ok: false, reason: 'too-short' };
  if (value.length > SHORT_NAME_MAX) return { ok: false, reason: 'too-long' };
  // Letters and digits only: the stage sets these in one type style, and a
  // short name carrying an accent or a space stops being chantable.
  if (!/^[A-Z0-9]+$/.test(value)) return { ok: false, reason: 'charset' };
  if (RESERVED_SHORT_NAMES.has(value)) return { ok: false, reason: 'reserved' };
  if (existing.some((s) => isApproved(s) && s.shortName && shortNameKey(s.shortName) === value)) {
    return { ok: false, reason: 'taken' };
  }
  return { ok: true, value };
}

/** Institution types, which people include or omit interchangeably. */
const TYPE_PREFIX =
  /^(nouveau |petit |grand )?(coll?ege|lycee|institution|institut|ecole|centre|academie|academy|seminaire|externat|juvenat|foyer|school)\s+/;

/**
 * Types that mean the same thing. Everything else is a real distinction:
 * a school called an École is not the one called an Institution, because its
 * own students never write it the other way. "Ecole du Sacré-Cœur des Filles
 * de Marie" and "Institution du Sacré-Cœur" are two schools, not one.
 */
const TYPE_FAMILY: Record<string, string> = {
  college: 'college',
  lycee: 'lycee',
  institution: 'institution',
  institut: 'institution',
  ecole: 'ecole',
  school: 'ecole',
  centre: 'centre',
  academie: 'academie',
  academy: 'academie',
  seminaire: 'seminaire',
  externat: 'externat',
  juvenat: 'juvenat',
  foyer: 'foyer',
};

/** The kind of school a name declares, or null when it does not say. */
export function schoolType(raw: string): string | null {
  const m = TYPE_PREFIX.exec(schoolKey(raw));
  return m ? (TYPE_FAMILY[m[2]] ?? m[2]) : null;
}

/**
 * True when two names declare DIFFERENT kinds of school.
 *
 * This RANKS, it never excludes. The type is a real signal — a school called an
 * Institution is rarely written "École" by its own students — but it is not
 * reliable enough to hide a match on, and hiding one is the expensive
 * direction: the student adds the school again and the board splits.
 *
 * Collège Marie regine and Institution Marie Régine des sœurs salésiennes are
 * one school, written two ways. Meanwhile "Ecole du Sacré-Cœur des Filles de
 * Marie" and "Institution du Sacré-Cœur" — two schools — already score zero
 * against each other on their names alone, with no help from the type at all.
 * So the type earns its place in the ordering and nowhere else.
 */
function typesConflict(a: string, b: string): boolean {
  const ta = schoolType(a);
  const tb = schoolType(b);
  return !!ta && !!tb && ta !== tb;
}

/** Words that carry no identity: "Collège DE la Sainte Famille", "École MIXTE X". */
const FILLER = /\b(de|du|des|la|le|les|d|l|et|saint|sainte|mixte|nationale?)\b/g;

/**
 * A street address typed into the name box. The corpus has "…(FDM) Rue 2k" and
 * "…, # 9, Route de Jacquet", with and without a comma before it.
 */
const STREET_TAIL =
  /[,\s]+(?:#\s*\d|no\.?\s*\d|rue\b|route\b|ruelle\b|avenue\b|ave\.?\b|impasse\b|angle\b|delmas\s*\d).*$/i;

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bcoll?\.?\b/g, 'college'],
  [/\binst\.?\b/g, 'institution'],
  [/\bst\.?\b/g, 'saint'],
  [/\bste\.?\b/g, 'sainte'],
  [/\bnd\b/g, 'notre dame'],
  [/\bnat\.?\b/g, 'national'],
];

/**
 * The form a name is compared in: accents folded, abbreviations expanded,
 * punctuation dropped. Keeps the institution type — two schools in one commune
 * can genuinely differ only by being a Collège and a Lycée.
 */
export function schoolKey(raw: string): string {
  let s = normalizeName(String(raw).replace(STREET_TAIL, ''));
  for (const [pattern, replacement] of ABBREVIATIONS) s = s.replace(pattern, replacement);
  return s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The identity-bearing words, for matching a name typed without its type. */
function core(raw: string): string {
  // Twice, with the filler dropped between: "École mixte Académie Chrétienne"
  // leads with a type, then a descriptor, then the type that actually names it.
  let s = schoolKey(raw).replace(TYPE_PREFIX, '').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(TYPE_PREFIX, '').trim();
  return s;
}

/** Letters only — catches "SacréCoeur" written without its space. */
const squash = (s: string) => s.replace(/[^a-z0-9]/g, '');

/** Every word of the query appears in the candidate, in any order. */
function containsAllWords(haystack: string, needle: string): boolean {
  const words = needle.split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => haystack.includes(w));
}

/**
 * Rank ONE name — a school's own, or one of its aliases — against what the
 * student typed. Higher is better; 0 means no match at all. Exactness wins,
 * then prefix, then all-words-present — someone typing "marie anne" must be
 * shown "Collège Marie-Anne" before anything else.
 */
function nameScore(candidate: string, query: string): number {
  const q = schoolKey(query);
  if (!q) return 0;
  const name = schoolKey(candidate);
  const qc = core(query);
  const nc = core(candidate);

  if (name === q) return 100;
  if (nc && nc === qc) return 90;          // "Saint Louis" ≡ "Collège Saint Louis"
  // The same letters, spaced or punctuated differently: "Institution du
  // SacréCoeur" for "Institution du Sacré Coeur", "L'ouverture Cleary School"
  // for "Louverture Cleary School". Checked before the looser rules below,
  // because identical letters are a stronger signal than shared words.
  if (squash(name) === squash(q)) return 85;
  if (name.startsWith(q)) return 80;
  if (nc && squash(nc) === squash(qc)) return 74;
  if (nc.startsWith(qc)) return 70;
  if (containsAllWords(name, q)) return 60;
  if (nc && containsAllWords(nc, qc)) return 50;
  if (name.includes(q) && q.length >= 4) return 40;
  return 0;
}

/**
 * Rank a school against what the student typed, across every name it answers
 * to: its own, its short name, and its aliases.
 *
 * An exact short name scores above the top of the name ladder because it is
 * the most confident signal the picker will ever get — nobody types CODOSA by
 * accident, and the student who types it is telling us exactly which school
 * they mean. It has to beat an exact name match too: a school elsewhere in the
 * list called "Codosa" would otherwise tie with the school whose students
 * actually chant it.
 *
 * Only an EXACT short name counts. Matching a prefix would make "CO" pull in
 * every school in the country, and short names are too dense for a near miss
 * to mean anything.
 */
export function matchScore(school: School, query: string): number {
  if (!schoolKey(query)) return 0;
  if (school.shortName && shortNameKey(query) === shortNameKey(school.shortName)) return 110;

  // Aliases are scored on the same ladder as the name: an alias is recorded
  // because the school is genuinely called that, so "Ti Kolèj" deserves what
  // the registered name would get. The best of them wins.
  let best = nameScore(school.name, query);
  for (const alias of school.aliases ?? []) {
    if (best >= 100) break;
    best = Math.max(best, nameScore(alias, query));
  }
  return best;
}

/**
 * Search, preferring the student's own commune.
 *
 * Scoping to the commune is what actually prevents duplicates: it turns a
 * national list into a handful of names, so the school someone is about to
 * re-add is right in front of them. Schools elsewhere still appear, below —
 * students board, move, and travel to school across communes.
 */
export function searchSchools(
  schools: School[],
  query: string,
  opts: { commune?: string | null; limit?: number } = {},
): School[] {
  const limit = opts.limit ?? 20;
  const commune = opts.commune ? normalizeName(opts.commune) : '';

  if (!query.trim()) {
    // No query yet: show this commune's schools, most-attended first.
    const local = commune ? schools.filter((s) => normalizeName(s.commune) === commune) : [];
    const rest = commune ? schools.filter((s) => normalizeName(s.commune) !== commune) : schools;
    const byPopularity = (a: School, b: School) =>
      (b.applicants ?? 0) - (a.applicants ?? 0) || a.name.localeCompare(b.name);
    return [...local.sort(byPopularity), ...rest.sort(byPopularity)].slice(0, limit);
  }

  return schools
    .map((s) => ({
      s,
      score: matchScore(s, query)
        + (commune && normalizeName(s.commune) === commune ? 5 : 0)
        // Same kind of school first — a nudge in the ordering, never a filter.
        - (typesConflict(s.name, query) ? 8 : 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || (b.s.applicants ?? 0) - (a.s.applicants ?? 0)
      || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((r) => r.s);
}

/**
 * The school a new name would collide with, if any. Only a confident match
 * counts: offering "did you mean?" for a loose one trains people to dismiss it,
 * and then it stops working for the cases that matter.
 *
 * Deliberately NOT narrowed by commune. There is one Saint-Louis de Gonzague
 * in Haiti, and its students live in Delmas, Tabarre, Carrefour-Feuilles,
 * Laboule and Pétion-Ville — so a commune test would let each of them add the
 * school again, which is the exact duplicate this is here to prevent. Students
 * also mistype and mix up communes, and a name match is the stronger signal.
 */
/**
 * Pairs that read as one school and are two. Confirmed by someone who knows
 * the schools — which is the only way to know, because nothing in the strings
 * says so: each pair is a shorter name, and a longer one adding a religious
 * order or a town. That is the same shape as Institution Marie Régine des
 * sœurs salésiennes, which IS Collège Marie regine.
 *
 * So these are recorded rather than derived, and they only ever suppress a
 * suggestion — the schools stay separate entries either way.
 */
const KNOWN_DISTINCT: [string, string][] = [
  ['institution du sacre coeur', 'ecole du sacre coeur dirrigee par les filles de marie'],
  ['ecole immaculee conception', 'ecole immaculee conception de trou du nord'],
  ['academie chretienne', 'institution chretienne mixte les gedeons'],
  ['academie chretienne', 'institution chretienne reformer adoration'],
];

function knownDistinct(a: string, b: string): boolean {
  const ka = schoolKey(a);
  const kb = schoolKey(b);
  return KNOWN_DISTINCT.some(([x, y]) => (ka === x && kb === y) || (ka === y && kb === x));
}

export function likelyDuplicate(schools: School[], name: string): School | null {
  let best: { s: School; score: number } | null = null;
  for (const s of schools) {
    if (knownDistinct(s.name, name)) continue;
    const score = matchScore(s, name);
    if (score >= 70 && (!best || score > best.score)) best = { s, score };
  }
  return best?.s ?? null;
}

/** Merge the bundled seed with schools students have added, seed winning ties. */
export function mergeSchools(seed: School[], added: School[]): School[] {
  const byKey = new Map<string, School>();
  for (const s of [...added, ...seed]) {
    const key = s.key || schoolKey(s.name);
    if (!key) continue;
    const existing = byKey.get(key);
    // Prefer whichever knows the commune; the seed's applicant count is kept.
    if (!existing || (!existing.commune && s.commune)) {
      byKey.set(key, { ...existing, ...s, key });
    }
  }
  return [...byKey.values()];
}
