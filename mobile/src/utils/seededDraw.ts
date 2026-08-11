/**
 * Deterministic question-draw helpers for "Défi d'un ami".
 *
 * A challenge stores the exact bank indexes the challenger played
 * (`questionIdxs`), so the opponent replays the identical set. The seeded
 * PRNG here mirrors utils/dailyChallenge.ts (copied, not imported, to keep
 * this module dependency-free); it's used for stable-but-shuffled option
 * order when both sides should see the same arrangement.
 */

/** xfnv1a string hash → 32-bit seed. */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates shuffle (does not mutate input). */
export function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Materialize a challenge's question set from its category bank.
 * Returns null when any index is out of range — the banks are static per app
 * version, so a miss means challenger and opponent run different builds and
 * the duel can't be reproduced faithfully (callers show "mets à jour l'app").
 */
export function drawByIdxs<T>(bank: T[] | undefined, idxs: number[]): T[] | null {
  if (!bank || !idxs.length) return null;
  const out: T[] = [];
  for (const i of idxs) {
    const q = bank[i];
    if (q == null) return null;
    out.push(q);
  }
  return out;
}

/** The bank indexes for a set of questions picked FROM that bank (by identity). */
export function idxsOf<T>(bank: T[], picked: T[]): number[] | null {
  const out: number[] = [];
  for (const q of picked) {
    const i = bank.indexOf(q);
    if (i < 0) return null;
    out.push(i);
  }
  return out;
}
