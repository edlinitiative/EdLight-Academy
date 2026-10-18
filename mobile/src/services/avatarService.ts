/**
 * The student's chosen avatar (the AvatarEditor screen). Mirrors the web's
 * src/services/avatarService.ts.
 *
 * Source of truth: `users/{uid}.avatar` — the 17-char wire string from
 * components/arena/art/avatars/avatarConfig.ts (owner-writable under
 * firestore.rules). A student whose look equals their seeded face stores
 * NOTHING (the field is deleted), so "never customised" and "reset" are the
 * same state everywhere.
 *
 * Propagation: POST /api/users/avatar re-sanitizes it server-side and merges it
 * onto the student's public leaderboard entries (where duels, the Arène and
 * the boards read a public identity from). If that endpoint is unreachable
 * (offline, or not deployed yet) the client merges the same string onto its
 * own EXISTING entries directly — updateDoc, never create, and `xp` untouched,
 * which the entry rules allow. Every renderer sanitizes again before drawing.
 */
import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { weekId } from './leaderboardService';
import {
  cleanAvatar, defaultConfigFor, sameConfig, sanitizeConfig, serializeConfig, type AvatarConfig,
} from '../components/arena/art/avatars/avatarConfig';

const AVATAR_URL = 'https://academy.edlight.org/api/users/avatar';
const ALL_TIME_ID = 'all-time';

/**
 * What gets stored for this look: the sanitized wire string, or null when the
 * look IS the student's seeded face (or the input is junk).
 */
export function storedAvatarFor(uid: string, config: AvatarConfig | string | null | undefined): string | null {
  const clean = sanitizeConfig(config ?? null);
  if (!clean) return null;
  if (sameConfig(clean, defaultConfigFor(uid))) return null;
  return serializeConfig(clean);
}

/** Own users/{uid}.avatar, sanitized on read (junk → null → the seeded face). */
export async function loadAvatar(uid: string): Promise<string | null> {
  // users/{uid} is owner-read only: wait for the persisted session to restore,
  // and don't spend a read that can only be denied.
  try { await (auth as any).authStateReady?.(); } catch { /* ignore */ }
  if (auth.currentUser?.uid !== uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return cleanAvatar(snap.exists() ? (snap.data() as Record<string, unknown>).avatar : null);
}

export interface SaveAvatarResult {
  avatar: string | null;
  /** True when the public copies (board entries) were updated too. */
  propagated: boolean;
}

async function postAvatar(avatar: string | null): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdToken();
    const res = await fetch(AVATAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatar }),
    });
    return res.ok; // 404 until the endpoint ships with the next web push
  } catch {
    return false;
  }
}

/** Save a look (the seeded face → the field is removed). Throws only if the user doc write fails. */
export async function saveAvatar(uid: string, config: AvatarConfig | null): Promise<SaveAvatarResult> {
  const avatar = storedAvatarFor(uid, config);
  await setDoc(
    doc(db, 'users', uid),
    { avatar: avatar ?? deleteField(), avatar_updated_at: serverTimestamp() },
    { merge: true },
  );

  if (await postAvatar(avatar)) return { avatar, propagated: true };

  const value = avatar ?? deleteField();
  const results = await Promise.allSettled([
    updateDoc(doc(db, 'leaderboards', ALL_TIME_ID, 'entries', uid), { avatar: value }),
    updateDoc(doc(db, 'leaderboards', weekId(), 'entries', uid), { avatar: value }),
  ]);
  return { avatar, propagated: results.some((r) => r.status === 'fulfilled') };
}
