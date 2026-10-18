/**
 * The student's chosen avatar (the avatar editor at /profile/avatar).
 *
 * Source of truth: `users/{uid}.avatar` — the 17-char wire string from
 * src/arena-art/avatars/avatarConfig.ts (owner-writable under firestore.rules).
 *
 * Propagation: POST /api/users/avatar re-sanitizes it server-side and merges it
 * onto the student's public leaderboard entries, which is where duels, the
 * Arène and the boards read a student's public identity from. If that endpoint
 * is unreachable (offline, or not deployed yet) the client merges the same
 * string onto its own EXISTING entries directly — the entry rules allow an
 * owner update that leaves `xp` untouched. Every renderer sanitizes again
 * before drawing, so a bad value can only ever fall back to the seeded face.
 */
import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { db, auth, authedFetch } from './firebase';
import { cleanAvatar, sanitizeConfig, serializeConfig, type AvatarConfig } from '../arena-art/avatars/avatarConfig';
import { weekId } from './leaderboardService';

export async function loadAvatar(uid: string): Promise<string | null> {
  // users/{uid} is owner-read only: without that Firebase session the read can
  // only fail, so don't spend it (also keeps fake-session tests off the network).
  // Wait for the persisted session to restore first, or a fresh page load
  // would read "no user" and cache the seeded face.
  await auth.authStateReady();
  if (auth.currentUser?.uid !== uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return cleanAvatar(snap.exists() ? (snap.data() as Record<string, unknown>).avatar : null);
}

export interface SaveAvatarResult {
  avatar: string | null;
  /** True when the public copies (board entries) were updated too. */
  propagated: boolean;
}

/** Save (or, with null, reset to the seeded face). Throws only if the user doc write fails. */
export async function saveAvatar(uid: string, config: AvatarConfig | null): Promise<SaveAvatarResult> {
  const clean = config ? sanitizeConfig(config) : null;
  const avatar = clean ? serializeConfig(clean) : null;
  await setDoc(
    doc(db, 'users', uid),
    { avatar: avatar ?? deleteField(), avatar_updated_at: serverTimestamp() },
    { merge: true },
  );

  try {
    const res = await authedFetch('/api/users/avatar', { avatar });
    if (res.ok) return { avatar, propagated: true };
  } catch {
    /* fall through to the direct write */
  }
  const value = avatar ?? deleteField();
  const results = await Promise.allSettled([
    updateDoc(doc(db, 'leaderboards', 'all-time', 'entries', uid), { avatar: value }),
    updateDoc(doc(db, 'leaderboards', weekId(), 'entries', uid), { avatar: value }),
  ]);
  return { avatar, propagated: results.some((r) => r.status === 'fulfilled') };
}
