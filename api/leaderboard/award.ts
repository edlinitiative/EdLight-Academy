/**
 * Vercel serverless function: POST /api/leaderboard/award
 * ───────────────────────────────────────────────────────
 * Server-authoritative leaderboard XP. Awards weekly + all-time XP AFTER the
 * caller's Firebase ID token is verified, so the client can no longer write an
 * arbitrary `xp` value straight into Firestore (the previous MVP model). The
 * uid is taken from the verified token — NEVER from the request body — and the
 * write goes through the Admin SDK (which bypasses security rules), so once the
 * client-write lockdown in firestore.rules is flipped on (see the gated TODO
 * there), this endpoint becomes the only way XP reaches the board.
 *
 * Anti-cheat measures:
 *   • ID-token auth (uid is trusted, from the token).
 *   • Per-uid rate limit ('leaderboard-award' — see api/_lib/rateLimit.ts).
 *   • Per-request `xpDelta` ceiling (MAX_XP_DELTA) — a single call can't inject
 *     an absurd amount.
 *   • XP is written with FieldValue.increment (monotonic accumulation); the
 *     body never supplies an absolute total, so a tampered client can't set the
 *     all-time total to an arbitrary value the way the old client write could.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   {
 *     xpDelta: number,          // XP earned this event — required, 0 < x <= MAX_XP_DELTA
 *     displayName?: string,     // written only if a valid alias (>=1 letter), <= 40 chars
 *     level?: number,           // clamped 1..1000
 *     school?: string | null,   // <= 120 chars
 *     city?: string | null,     // <= 120 chars
 *     department?: string | null, // <= 120 chars
 *     gameId?: string,          // optional record claim — [A-Za-z0-9_-], <= 64
 *     score?: number,           // optional record claim — 0 < x <= MAX_SCORE
 *   }
 *
 * Response:
 *   200 → { ok: true, weekId, weeklyXp, allTimeXp }
 *   400 / 401 / 429 / 500 on the corresponding failures.
 *
 * Mirrors the doc shape written by src/services/leaderboardService.ts and
 * mobile/src/services/leaderboardService.ts:
 *   leaderboards/{weekId}/entries/{uid}
 *   leaderboards/all-time/entries/{uid}
 *     { uid, xp, displayName?, level, school, city, department, weekId?, updatedAt }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';

/** A single call can award at most this much XP (bounds injection abuse). */
const MAX_XP_DELTA = 5000;
/** Sane per-request ceiling for an arcade record score claim. */
const MAX_SCORE = 10_000_000;
const ALL_TIME_ID = 'all-time';
const FIELD_MAX = 120;

/**
 * A public alias must contain at least one letter (matches leaderboardService).
 * Aliases that fail this (empty, digits-only, legacy ".") are never written, so
 * a later XP award can't erase a pseudo the learner already set.
 */
function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/**
 * ISO-8601 week id, e.g. "2026-W26" — identical logic to leaderboardService so
 * the server writes to the same weekly bucket the clients read from.
 */
function weekId(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Optional string field, trimmed to FIELD_MAX; null when absent/empty. */
function optStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, FIELD_MAX) : null;
}

interface AwardBody {
  xpDelta?: unknown;
  displayName?: unknown;
  level?: unknown;
  school?: unknown;
  city?: unknown;
  department?: unknown;
  gameId?: unknown;
  score?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // uid comes from the verified token — never from the body.
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'leaderboard-award');
  if (!allowed) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  // ── Validate input ──────────────────────────────────────────────────────
  const body: AwardBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  const xpDelta = Math.round(Number(body.xpDelta));
  if (!Number.isFinite(xpDelta) || xpDelta <= 0 || xpDelta > MAX_XP_DELTA) {
    res.status(400).json({ error: 'invalid_xp', message: `xpDelta must be a number in (0, ${MAX_XP_DELTA}].` });
    return;
  }

  const levelRaw = Math.round(Number(body.level));
  const level = Number.isFinite(levelRaw) ? Math.min(1000, Math.max(1, levelRaw)) : 1;
  const school = optStr(body.school);
  const city = optStr(body.city);
  const department = optStr(body.department);
  const hasAlias = isValidAlias(body.displayName);
  const displayName = hasAlias ? String(body.displayName).slice(0, 40) : null;

  // Shared profile fields for both entries. Only write displayName when it's a
  // valid alias, so an XP award never erases a pseudo the learner already set.
  const profile: Record<string, unknown> = {
    uid,
    level,
    school,
    city,
    department,
    ...(hasAlias ? { displayName } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const db = getDb();
  const id = weekId();

  try {
    const weeklyRef = db.doc(`leaderboards/${id}/entries/${uid}`);
    const allTimeRef = db.doc(`leaderboards/${ALL_TIME_ID}/entries/${uid}`);

    await Promise.all([
      weeklyRef.set({ ...profile, weekId: id, xp: FieldValue.increment(xpDelta) }, { merge: true }),
      allTimeRef.set({ ...profile, xp: FieldValue.increment(xpDelta) }, { merge: true }),
    ]);

    // ── Optional per-game record claim (leaderboards/records) ──────────────
    // Same transactional "only increase, deep-merge one game" model as
    // leaderboardService.maybeSetGameRecord. Only opted-in players (valid alias)
    // can hold a record.
    const gameId = typeof body.gameId === 'string' ? body.gameId : '';
    const score = Math.round(Number(body.score));
    if (gameId && /^[A-Za-z0-9_-]{1,64}$/.test(gameId) && Number.isFinite(score) && score > 0 && score <= MAX_SCORE && hasAlias) {
      const recordsRef = db.doc('leaderboards/records');
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(recordsRef);
        const games = snap.exists ? (snap.data() as any)?.games || {} : {};
        const current = games[gameId];
        if (current && current.score >= score) return;
        tx.set(
          recordsRef,
          { games: { [gameId]: { score, displayName, uid } }, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      });
    }

    // Read back the accumulated totals for the response.
    const [weeklySnap, allTimeSnap] = await Promise.all([weeklyRef.get(), allTimeRef.get()]);
    res.status(200).json({
      ok: true,
      weekId: id,
      weeklyXp: (weeklySnap.data()?.xp as number | undefined) ?? xpDelta,
      allTimeXp: (allTimeSnap.data()?.xp as number | undefined) ?? xpDelta,
    });
  } catch (err) {
    console.error('[leaderboard/award] write error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
