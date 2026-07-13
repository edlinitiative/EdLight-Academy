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
 * NOTE (MVP): XP is client-reported. This is fine for a friendly board; a Cloud
 * Function can later validate increments server-side if abuse appears.
 */

import { db } from './firebase';
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

/**
 * A public alias must contain at least one letter. Entries that fail this
 * (legacy ".", empty, digits-only) are never rendered on the board — the owner
 * is prompted to pick a pseudo instead of us inventing one for them.
 */
export function isValidAlias(name) {
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

function entriesRef(id) {
  return collection(db, 'leaderboards', id, 'entries');
}

function entryRef(id, uid) {
  return doc(db, 'leaderboards', id, 'entries', uid);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Add XP to a learner's entry for the current week (creates it on first write).
 * `increment` makes this naturally accumulate across the week and reset next.
 *
 * @param {string} uid
 * @param {number} xp    — XP earned in this event (must be ≥ 0)
 * @param {Object} meta  — { displayName, level, school, city }
 */
export async function addWeeklyXp(uid, xp, meta: any = {}) {
  if (!uid || !xp || xp <= 0) return;
  const id = weekId();
  try {
    await setDoc(
      entryRef(id, uid),
      {
        uid,
        // No fabricated fallback name — a null alias keeps accumulating XP but
        // stays hidden from the board until the learner picks a pseudo.
        displayName: isValidAlias(meta.displayName) ? meta.displayName : null,
        level: meta.level || 1,
        school: meta.school || null,
        city: meta.city || null,
        department: meta.department || null,
        weekId: id,
        xp: increment(xp),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error('[Leaderboard] addWeeklyXp error:', err);
  }
}

/**
 * Update only the public profile fields of the current week's entry (e.g. after
 * the learner changes their alias or school) without touching XP.
 */
export async function updateEntryProfile(uid, meta: any = {}) {
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
// Same entries shape under a fixed period id. Unlike weekly entries (XP
// increments), all-time mirrors the profile's lifetime XP as an absolute
// value on every award — so it self-backfills the first time someone plays.

const ALL_TIME_ID = 'all-time';

export async function upsertAllTimeEntry(uid, meta: any = {}) {
  if (!uid || meta.xp == null) return;
  try {
    await setDoc(
      entryRef(ALL_TIME_ID, uid),
      {
        uid,
        xp: meta.xp,
        displayName: isValidAlias(meta.displayName) ? meta.displayName : null,
        level: meta.level || 1,
        school: meta.school || null,
        city: meta.city || null,
        department: meta.department || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error('[Leaderboard] upsertAllTimeEntry error:', err);
  }
}

export async function getAllTimeTop(max = 50) {
  return getWeeklyTop(max, ALL_TIME_ID);
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
export async function getUserWeeklyEntry(uid, id = weekId()) {
  if (!uid) return null;
  try {
    const snap = await getDoc(entryRef(id, uid));
    return snap.exists() ? { id: snap.id, ...(snap.data() as any) } : null;
  } catch (err) {
    console.error('[Leaderboard] getUserWeeklyEntry error:', err);
    return null;
  }
}
