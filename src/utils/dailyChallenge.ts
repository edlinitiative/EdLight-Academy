/**
 * Daily Challenge selection
 * ─────────────────────────
 * Deterministically picks the same N trivia questions for everyone on a given
 * calendar day (seeded by the date string). This makes the Daily Challenge a
 * fair, shared event — you can't reroll for easier questions, and a future
 * leaderboard can compare like-for-like.
 *
 * Pure module: no Firebase/React. `TRIVIA_QUESTIONS` is injected so it stays
 * testable and tree-shakeable.
 */

/** xfnv1a string hash → 32-bit seed. */
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG. */
function mulberry32(seed) {
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
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build today's challenge: a deterministic mix of questions drawn across all
 * categories, seeded by `dateStr` (YYYY-MM-DD).
 *
 * @param {Object} questionsByCategory — TRIVIA_QUESTIONS map { catId: Question[] }
 * @param {string} dateStr             — e.g. '2026-06-23'
 * @param {number} count               — number of questions (default 10)
 * @returns {Array} questions tagged with `__category` for theming
 */
export function getDailyChallengeQuestions(questionsByCategory: Record<string, any[]> = {}, dateStr, count = 10) {
  const pool = [];
  for (const [catId, list] of Object.entries(questionsByCategory)) {
    for (const q of list || []) {
      pool.push({ ...q, __category: catId });
    }
  }
  if (pool.length === 0) return [];

  const rng = mulberry32(hashSeed(`edlight-daily:${dateStr}`));
  return seededShuffle(pool, rng).slice(0, Math.min(count, pool.length));
}

/** Stable numeric id for a day's challenge (useful for keys / dedupe). */
export function dailyChallengeId(dateStr) {
  return `daily-${dateStr}`;
}
