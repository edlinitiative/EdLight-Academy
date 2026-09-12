/**
 * Serve every question in a category before serving any of them twice.
 * ---------------------------------------------------------------------------
 * Rounds used to be built with `shuffle(bank).slice(0, count)` — a fresh
 * shuffle every time, with no memory of what had already been asked. That is
 * random, but random is not the same as varied: each round samples
 * independently, so a question can come back immediately and, by the birthday
 * problem, comes back far sooner than it feels like it should. With a bank of
 * 200 and rounds of 10, about one question in five is a repeat by the tenth
 * round, and about a third of them by the twentieth.
 *
 * ── The model: a bingo cage, not a dice roll ───────────────────────────────
 * Draw from a bag. Each question served is set aside, so it cannot be drawn
 * again. When the bag runs dry, refill it with the whole bank and carry on.
 * The property that buys, and the reason it is worth the extra state: you see
 * EVERY question in a category before you see any of them a second time. That
 * turns "hopefully not a repeat" into a guarantee.
 *
 * One deliberate deviation from the pure model. When the bag empties partway
 * through a round, the rest of that round is drawn from the fresh bag — and
 * everything served in that round, including the draws from the old bag, is
 * marked as seen in the new pass. Strictly the old-bag draws belong to the
 * previous pass and could legitimately reappear in the very next round; a
 * repeat one round later is exactly the annoyance this module exists to
 * remove, so they are held back too.
 *
 * ── Why localStorage and not Firestore ─────────────────────────────────────
 * A read and a write per round per user, against a project whose Firestore
 * quota has already taken the whole product down once. This is a
 * quality-of-life record of which trivia questions somebody has seen: it is not
 * worth a single billed read, it does not need to survive a cleared cache, and
 * nothing else ever needs to look at it. Per device is the right scope.
 *
 * Every access is wrapped: a browser with storage disabled (private windows,
 * blocked site data) falls back to the old plain-shuffle behaviour rather than
 * breaking the game.
 */

const STORAGE_PREFIX = 'edlight-trivia-seen-v1:';

/** Cheap, stable string hash (FNV-1a), base36. */
function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface RotatableQuestion {
  q?: string;
  id?: string;
  [key: string]: unknown;
}

/**
 * A stable identity for a question.
 *
 * The static banks carry no id, so the French question text is the identity.
 * Hashing it keeps the stored list small — 200 ids is about 1.5 KB rather than
 * 15 KB of prose — and an id from Firestore is preferred when present.
 *
 * Editing a question's text changes its id, so it reads as new. That is the
 * right outcome: a rewritten question IS a different question to a learner.
 */
export function questionId(question: RotatableQuestion): string {
  const raw = (question && (question.id || question.q)) || '';
  return hash(String(raw));
}

/** Fisher-Yates, non-mutating. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Draw<T> {
  /** The round, in the order it should be played. */
  questions: T[];
  /** The seen-list to persist for next time. */
  seen: string[];
  /** True when the bag was refilled during this draw — a full pass completed. */
  recycled: boolean;
}

/**
 * Draw one round.
 *
 * Pure: no storage, no clock. `seen` goes in, the next `seen` comes out, so
 * every rule above can be tested without a browser.
 */
export function drawRound<T extends RotatableQuestion>(
  bank: T[],
  count: number,
  seen: string[] = [],
): Draw<T> {
  const pool = Array.isArray(bank) ? bank : [];
  const want = Math.max(0, Math.min(count, pool.length));
  if (want === 0) return { questions: [], seen: [], recycled: false };

  const seenSet = new Set(seen);
  const unseen = pool.filter((item) => !seenSet.has(questionId(item)));
  const picked = shuffle(unseen).slice(0, want);

  if (picked.length === want) {
    // Still questions in the bag. Set aside what was served.
    const bankIds = new Set(pool.map(questionId));
    return {
      questions: picked,
      // Stale ids are dropped as we go: a question deleted by an admin would
      // otherwise sit in the list for ever and shrink the bag permanently.
      seen: [...seen.filter((id) => bankIds.has(id)), ...picked.map(questionId)],
      recycled: false,
    };
  }

  // The bag is empty. Refill from the whole bank, excluding what this round has
  // already served so the same round cannot contain a duplicate.
  const already = new Set(picked.map(questionId));
  const topUp = shuffle(pool.filter((item) => !already.has(questionId(item))))
    .slice(0, want - picked.length);
  const questions = shuffle([...picked, ...topUp]);

  return {
    questions,
    // The new pass starts with everything served this round, so nothing here
    // can come back in the very next round.
    seen: questions.map(questionId),
    recycled: true,
  };
}

function storageKey(categoryId: string): string {
  return `${STORAGE_PREFIX}${categoryId}`;
}

/** Ids already served for a category. [] when storage is unavailable. */
export function loadSeen(categoryId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(categoryId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Persist the seen list. Silent no-op when storage is unavailable or full. */
export function saveSeen(categoryId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(storageKey(categoryId), JSON.stringify(ids));
  } catch {
    /* private window, blocked site data, or quota — the game still works */
  }
}

/**
 * Draw a round for a category and persist the result. The one call the UI
 * makes; `drawRound` stays pure behind it.
 */
export function drawAndRemember<T extends RotatableQuestion>(
  categoryId: string,
  bank: T[],
  count: number,
): T[] {
  const { questions, seen } = drawRound(bank, count, loadSeen(categoryId));
  saveSeen(categoryId, seen);
  return questions;
}
