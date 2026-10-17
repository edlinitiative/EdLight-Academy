/**
 * The spectator screen's pure logic: the board a viewer sees, and the
 * answer-along tally that stays on the viewer's phone.
 *
 * ANSWER-ALONG IS LOCAL ONLY. A spectator's taps are never sent anywhere,
 * never scored, never ranked — the official answer path is the player API
 * with its server clock, and nothing here goes near it. The tally exists so
 * watching is something to do, the way the web demo lets everyone answer
 * along. Correctness is only known once the server writes `answerIndex` at
 * the close (integrity rule 4), so a spectator learns it with everyone else.
 */

export interface BoardSchool {
  key: string;
  label: string;
  shortName: string;
  teamAvg: number;
  rank: number;
  qualified: boolean;
}

export interface BoardRow<S extends BoardSchool = BoardSchool> {
  school: S;
  followed: boolean;
  /** Shown below the top rows because the viewer follows it. */
  pinned: boolean;
}

/**
 * The top `limit` qualified schools by rank, plus the followed school pinned
 * underneath when it is not among them — a race you follow but cannot see is
 * someone else's race. Unqualified schools have no rank and are never placed
 * in the ranked list.
 */
export function boardRows<S extends BoardSchool>(schools: S[], followKey: string | null, limit = 8): BoardRow<S>[] {
  const ranked = schools
    .filter((s) => s.qualified && s.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, Math.max(0, limit));
  const rows: BoardRow<S>[] = ranked.map((s) => ({ school: s, followed: s.key === followKey, pinned: false }));
  if (followKey && !rows.some((r) => r.followed)) {
    const mine = schools.find((s) => s.key === followKey);
    if (mine) rows.push({ school: mine, followed: true, pinned: true });
  }
  return rows;
}

/** What the spectator chose, per question index. Local only. */
export type PlayAlongAnswers = Record<number, number>;

export function recordPlayAlong(
  answers: PlayAlongAnswers,
  index: number,
  choice: number,
  questionOpen: boolean,
): PlayAlongAnswers {
  // One choice per question, while it is open — same rule as the players,
  // so answering along means the same thing.
  if (!questionOpen || answers[index] != null) return answers;
  return { ...answers, [index]: choice };
}

export interface PlayAlongTally {
  answered: number;
  correct: number;
}

/** Only revealed questions count; an unrevealed answer is not yet right or wrong. */
export function tallyPlayAlong(answers: PlayAlongAnswers, revealed: Record<number, number>): PlayAlongTally {
  let answered = 0;
  let correct = 0;
  for (const [k, choice] of Object.entries(answers)) {
    const key = Number(k);
    if (revealed[key] == null) continue;
    answered += 1;
    if (revealed[key] === choice) correct += 1;
  }
  return { answered, correct };
}

// ── Follow preference (audit M4) ─────────────────────────────────────────────

/**
 * Three different answers, kept apart:
 *  - `default`  never chose — follow the viewer's own registered school;
 *  - `none`     chose to follow nobody — stays nobody across relaunches,
 *               even though an own school exists;
 *  - `school`   chose this school.
 * Collapsing `none` into "no stored value" is the bug this replaces: clearing
 * the default school fell straight back to it.
 */
export type FollowPref =
  | { kind: 'default' }
  | { kind: 'none' }
  | { kind: 'school'; key: string };

export const FOLLOW_STORAGE_KEY = 'arena.watch.follow';
/** The stored sentinel for "nobody". Not a valid school key (keys are normalized names). */
export const FOLLOW_NONE = '__none__';

/** Read the stored value (null = never written). */
export function parseFollowPref(stored: string | null | undefined): FollowPref {
  if (stored == null || stored === '') return { kind: 'default' };
  if (stored === FOLLOW_NONE) return { kind: 'none' };
  return { kind: 'school', key: stored };
}

/** What to store: null means remove the key (back to the default). */
export function serializeFollowPref(pref: FollowPref): string | null {
  if (pref.kind === 'default') return null;
  if (pref.kind === 'none') return FOLLOW_NONE;
  return pref.key;
}

/** The school actually followed, or null for nobody. */
export function resolveFollowKey(pref: FollowPref, ownSchoolKey: string | null): string | null {
  if (pref.kind === 'none') return null;
  if (pref.kind === 'school') return pref.key;
  return ownSchoolKey;
}

/**
 * A tap on a school row: tapping the school you follow (by default or by
 * choice) unfollows it EXPLICITLY; tapping any other school follows it.
 */
export function toggleFollowPref(pref: FollowPref, ownSchoolKey: string | null, tapped: string): FollowPref {
  const current = resolveFollowKey(pref, ownSchoolKey);
  if (current === tapped) return { kind: 'none' };
  return { kind: 'school', key: tapped };
}
