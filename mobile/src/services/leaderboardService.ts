/**
 * Leaderboard Service
 * ───────────────────
 * Lightweight, weekly XP leaderboard. Each ISO week has its own entries
 * subcollection so the board "resets" every Monday simply by writing to a new
 * week id — no scheduled cleanup required.
 *
 * Firestore path: leaderboards/{weekId}/entries/{uid}
 *   { uid, displayName, level, xp, school, city, department, weekId, updatedAt }
 *
 * Privacy: entries are written ONLY for learners who opt in (see triviaService
 * `setLeaderboardOptIn`). Display names default to a first-name + initial alias,
 * never the full account name, because many users are minors.
 *
 * XP writes are now server-authoritative: XP-award functions POST to
 * `https://academy.edlight.org/api/leaderboard/award` (see api/leaderboard/award.ts)
 * with the caller's Firebase ID token, and the Admin SDK increments the weekly +
 * all-time entries (and claims per-game records) from a trusted uid. The client
 * can no longer write an arbitrary `xp` value straight into Firestore. READS
 * below still hit Firestore directly; only the profile-seed write
 * (updateEntryProfile) remains a bounded client write because the award
 * endpoint requires an xpDelta > 0.
 */

import { auth, db } from './firebase';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  increment,
  query,
  orderBy,
  limit as fbLimit,
} from 'firebase/firestore';

/** Same serverless base as sandraService / studyPlan — the deployed web API. */
const AWARD_URL = 'https://academy.edlight.org/api/leaderboard/award';

/**
 * A public alias must contain at least one letter. Entries that fail this
 * (legacy ".", empty, digits-only) are never rendered on the board — the owner
 * is prompted to pick a pseudo instead of us inventing one for them.
 */
export function isValidAlias(name: any) {
  return /\p{L}/u.test(String(name || ''));
}

// ─── Week id ────────────────────────────────────────────────────────────────

/**
 * ISO-8601 week id, e.g. "2026-W26". Weeks start Monday; the week containing the
 * year's first Thursday is week 1 (matches `date.getISOWeek` semantics).
 */
export function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function entriesRef(id: string) {
  return collection(db, 'leaderboards', id, 'entries');
}

function entryRef(id: string, uid: string) {
  return doc(db, 'leaderboards', id, 'entries', uid);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Best-effort POST to the server-authoritative award endpoint. Mirrors
 * sandraService's auth pattern: uid comes from the verified ID token
 * server-side (never the body). Failures (offline, no user, 401/429/5xx) are
 * logged and swallowed — an XP award must never crash gameplay, matching the
 * old fire-and-forget Firestore writes.
 */
async function postAward(payload: Record<string, unknown>) {
  const user = auth.currentUser;
  if (!user) return;
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return;
  }
  try {
    const res = await fetch(AWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[Leaderboard] award endpoint returned', res.status);
    }
  } catch (err) {
    console.error('[Leaderboard] postAward error:', err);
  }
}

/**
 * Award XP for the current event. Routes to POST /api/leaderboard/award, which
 * increments BOTH the current week's entry and the all-time entry by `xp`
 * (FieldValue.increment) and, when `meta.gameId`/`meta.score` are present,
 * claims the per-game record in the same request. `xp` is the DELTA earned this
 * event (not a lifetime total) — the server accumulates it.
 *
 * @param {string} uid  — retained for signature parity; server trusts the token.
 * @param {number} xp   — XP earned in this event (must be > 0)
 * @param {Object} meta — { displayName, level, school, city, department, gameId?, score? }
 */
export async function addWeeklyXp(uid: string, xp: number, meta: any = {}) {
  if (!uid || !xp || xp <= 0) return;
  await postAward({
    xpDelta: xp,
    // Endpoint only writes displayName when it's a valid alias, so an award
    // never erases a pseudo the learner already set.
    displayName: meta.displayName ?? undefined,
    level: meta.level || 1,
    school: meta.school ?? null,
    city: meta.city ?? null,
    department: meta.department ?? null,
    // Optional per-game record claim rides along on the same award.
    ...(meta.gameId ? { gameId: meta.gameId, score: meta.score } : {}),
  });
}

/**
 * Update only the public profile fields of the current week's entry (e.g. after
 * the learner changes their alias or school) without touching XP.
 */
export async function updateEntryProfile(uid: string, meta: any = {}) {
  if (!uid) return;
  const id = weekId();
  try {
    await setDoc(
      entryRef(id, uid),
      {
        uid,
        weekId: id,
        // Seed xp so the entry is visible to the orderBy('xp') board query —
        // Firestore drops documents that lack the ordered field. increment(0)
        // creates it as 0 on opt-in and leaves any earned XP untouched.
        xp: increment(0),
        ...(meta.displayName != null ? { displayName: meta.displayName } : {}),
        ...(meta.level != null ? { level: meta.level } : {}),
        ...(meta.school !== undefined ? { school: meta.school } : {}),
        ...(meta.city !== undefined ? { city: meta.city } : {}),
        ...(meta.department !== undefined ? { department: meta.department } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error('[Leaderboard] updateEntryProfile error:', err);
  }
}

// ─── All-time board ─────────────────────────────────────────────────────────
// Same entries shape under a fixed period id.

const ALL_TIME_ID = 'all-time';

/**
 * @deprecated No-op. The all-time entry is now incremented server-side by the
 * award endpoint inside addWeeklyXp (a single POST /api/leaderboard/award
 * increments BOTH the weekly and all-time entries by the earned delta). This
 * used to write an ABSOLUTE lifetime total; calling the endpoint AND writing an
 * absolute value would double-count, so this is intentionally a no-op. Kept
 * exported so the public signature is preserved for any legacy caller.
 */
export async function upsertAllTimeEntry(_uid: string, _meta: any = {}) {
  /* intentionally empty — see addWeeklyXp / api/leaderboard/award */
}

export async function getAllTimeTop(max = 50) {
  return getWeeklyTop(max, ALL_TIME_ID);
}

// ─── Per-game records ───────────────────────────────────────────────────────
// One public doc holding the best-ever score per arcade game and who set it.
// Only opted-in players (public alias) can hold a record.

function recordsRef() {
  return doc(db, 'leaderboards', 'records');
}

/** { [gameId]: { score, displayName, uid } } — {} on error. */
export async function getGameRecords() {
  try {
    const snap = await getDoc(recordsRef());
    return snap.exists() ? (snap.data() as any).games || {} : {};
  } catch (err) {
    console.error('[Leaderboard] getGameRecords error:', err);
    return {};
  }
}

/**
 * @deprecated No-op. Record claims now ride along on the award endpoint:
 * recordGameResult passes { gameId, score } to addWeeklyXp, and
 * POST /api/leaderboard/award claims the per-game record transactionally in the
 * same request (server-authoritative, from a trusted uid). Kept exported so the
 * public signature is preserved for any legacy caller.
 */
export async function maybeSetGameRecord(_uid: string, _gameId: string, _score: number, _displayName: any) {
  /* intentionally empty — see addWeeklyXp / api/leaderboard/award */
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Top entries for a week, ranked by XP desc. Returns [] on error/offline so the
 * UI can degrade gracefully.
 */
export async function getWeeklyTop(max = 50, id = weekId()) {
  try {
    const q = query(entriesRef(id), orderBy('xp', 'desc'), fbLimit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d, i) => ({ rank: i + 1, id: d.id, ...(d.data() as any) }));
  } catch (err) {
    console.error('[Leaderboard] getWeeklyTop error:', err);
    return [];
  }
}

/** A single learner's entry for the current week (or null). */
export async function getUserWeeklyEntry(uid: string, id = weekId()) {
  if (!uid) return null;
  try {
    const snap = await getDoc(entryRef(id, uid));
    return snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null;
  } catch (err) {
    console.error('[Leaderboard] getUserWeeklyEntry error:', err);
    return null;
  }
}
