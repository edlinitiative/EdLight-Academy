/**
 * Vercel serverless function: POST /api/users/avatar
 * ──────────────────────────────────────────────────
 * Saves the caller's chosen avatar (the avatar editor) and carries it onto the
 * caller's PUBLIC identity, so other students see the same face wherever this
 * student appears (leaderboards, duels, Arène, tournaments).
 *
 * Body (Authorization: Bearer <Firebase ID token>):
 *   { avatar: string | object | null }   // null → back to the seeded face
 *
 * • uid comes from the verified token, never from the body.
 * • The avatar is re-sanitized here (cleanAvatar: whitelist every field) and
 *   stored as the 17-char wire string — never the raw input.
 * • Written to users/{uid}.avatar AND merged into the caller's existing
 *   leaderboard entries (all-time + this week). Entries are never CREATED here
 *   (an entry without XP is not a board entry); /api/leaderboard/award copies
 *   the all-time avatar onto each new weekly entry.
 *
 * Response: 200 { ok: true, avatar: string | null } · 400 · 401 · 429 · 500.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';
import { cleanAvatar } from '../../src/arena-art/avatars/avatarConfig';

/** ISO week id — same logic as api/leaderboard/award.ts and leaderboardService. */
function weekId(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid } = decoded;

  const { allowed, resetAt } = await checkRateLimit(uid, 'users-avatar');
  if (!allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'rate_limit_exceeded' });
    return;
  }

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    body = {};
  }
  const reset = body.avatar === null;
  const avatar = reset ? null : cleanAvatar(body.avatar);
  if (!reset && !avatar) {
    res.status(400).json({ error: 'invalid_avatar' });
    return;
  }

  const db = getDb();
  const value = avatar ?? FieldValue.delete();
  try {
    await db.doc(`users/${uid}`).set({ avatar: value, avatar_updated_at: FieldValue.serverTimestamp() }, { merge: true });
    const refs = [db.doc(`leaderboards/all-time/entries/${uid}`), db.doc(`leaderboards/${weekId()}/entries/${uid}`)];
    const snaps = await Promise.all(refs.map((r) => r.get()));
    await Promise.all(snaps.filter((s) => s.exists).map((s) => s.ref.set({ avatar: value }, { merge: true })));
    res.status(200).json({ ok: true, avatar });
  } catch (err) {
    console.error('[users/avatar] write error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
