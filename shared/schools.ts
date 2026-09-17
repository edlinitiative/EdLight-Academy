import { normalizeName } from './leaderboardAgg';

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
 * Rank schools against what the student typed. Higher is better; 0 means no
 * match at all. Exactness wins, then prefix, then all-words-present — someone
 * typing "marie anne" must be shown "Collège Marie-Anne" before anything else.
 */
export function matchScore(school: School, query: string): number {
  const q = schoolKey(query);
  if (!q) return 0;
  const name = schoolKey(school.name);
  const qc = core(query);
  const nc = core(school.name);

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
