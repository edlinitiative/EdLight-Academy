/**
 * Vercel serverless function: POST /api/challenges/accept
 * ────────────────────────────────────────────────────────
 * The opponent's single attempt at a "Défi d'un ami". Transactionally records
 * their score on the challenge (one attempt ever — the write is rejected if an
 * opponent is already set), then awards duel XP to the winner's weekly +
 * all-time leaderboard entries via the same increment pattern as
 * /api/leaderboard/award. Ties pay both sides half.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   { code: string, score: number }
 *
 * Response 200:
 *   { ok: true, result: 'won' | 'lost' | 'tie',
 *     challengerScore, opponentScore, total, xpAwarded }
 *   xpAwarded is what the CALLER earned (0 on a loss).
 *
 * Errors: 404 not_found · 409 already_played · 410 expired ·
 *         400 self_challenge / invalid input · 429 rate limited.
 *
 * NOTE: rate limiting uses the 'challenge-accept' bucket — add it to LIMITS in
 * api/_lib/rateLimit.ts (see CHALLENGE_INTEGRATION.md).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';

/** Duel stakes — winner takes WIN_XP, a tie pays TIE_XP to each side. */
const WIN_XP = 20;
const TIE_XP = 10;

function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/** Same privacy-safe derivation as create.ts / award.ts. */
function defaultAlias(name: string | undefined): string | null {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !isValidAlias(parts[0])) return null;
  const first = parts[0].slice(0, 30);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial}`;
}

/** ISO-8601 week id — identical logic to leaderboardService/award.ts. */
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

interface AcceptBody {
  code?: unknown;
  score?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid, name: tokenName } = decoded;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'challenge-accept');
  if (!allowed) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  const body: AcceptBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[2-9A-Z]{8}$/.test(code)) {
    res.status(400).json({ error: 'invalid_code' });
    return;
  }
  const score = Math.round(Number(body.score));
  if (!Number.isFinite(score) || score < 0) {
    res.status(400).json({ error: 'invalid_score' });
    return;
  }

  const db = getDb();
  const ref = db.doc(`challenges/${code}`);

  // Opponent's public name — stored alias first, else token derivation.
  let opponentName: string | null = null;
  try {
    const entry = (await db.doc(`leaderboards/all-time/entries/${uid}`).get()).data();
    if (entry && entry.hidden !== true && isValidAlias(entry.displayName)) {
      opponentName = String(entry.displayName).slice(0, 40);
    }
  } catch {
    /* best-effort */
  }
  if (!opponentName) opponentName = defaultAlias(tokenName);

  try {
    // One attempt, transactionally: reject if already played, expired, or own.
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: 404 as const };
      const c = snap.data() as any;
      if (c.challengerUid === uid) return { error: 400 as const, code: 'self_challenge' };
      if (c.opponent || c.status === 'played') return { error: 409 as const };
      const expMs = c.expiresAt instanceof Timestamp ? c.expiresAt.toMillis() : Number(c.expiresAt) || 0;
      if (expMs && Date.now() > expMs) return { error: 410 as const };

      const total = Number(c.total) || 0;
      const oppScore = Math.min(score, total); // score can't exceed the round
      tx.update(ref, {
        opponent: { uid, name: opponentName, score: oppScore, playedAt: Timestamp.now() },
        status: 'played',
      });
      return {
        challengerUid: c.challengerUid as string,
        challengerScore: Number(c.challengerScore) || 0,
        opponentScore: oppScore,
        total,
      };
    });

    if ('error' in outcome) {
      const messages: Record<number, string> = {
        404: 'not_found',
        400: outcome.code || 'bad_request',
        409: 'already_played',
        410: 'expired',
      };
      res.status(outcome.error).json({ error: messages[outcome.error] });
      return;
    }

    // ── Duel XP — winner's weekly + all-time entries (increment, capped). ──
    const tie = outcome.opponentScore === outcome.challengerScore;
    const winnerUid = tie
      ? null
      : outcome.opponentScore > outcome.challengerScore
        ? uid
        : outcome.challengerUid;
    const id = weekId();
    const payout = async (toUid: string, xp: number) => {
      const patch = { uid: toUid, xp: FieldValue.increment(xp), updatedAt: FieldValue.serverTimestamp() };
      await Promise.all([
        db.doc(`leaderboards/${id}/entries/${toUid}`).set({ ...patch, weekId: id }, { merge: true }),
        db.doc(`leaderboards/all-time/entries/${toUid}`).set(patch, { merge: true }),
        // Server-only award, so the gamification profile (which drives the
        // level the student SEES, via levelInfo) must be bumped here too.
        // Every other XP path writes the profile client-side and only posts
        // the delta to the board — skipping this write is exactly the
        // board-vs-profile drift the 2026-08-11 data audit flagged.
        db.doc(`users/${toUid}/gamification/profile`).set(
          { xp: FieldValue.increment(xp), updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        ),
      ]);
    };
    let callerXp = 0;
    try {
      if (tie) {
        await Promise.all([payout(uid, TIE_XP), payout(outcome.challengerUid, TIE_XP)]);
        callerXp = TIE_XP;
      } else if (winnerUid) {
        await payout(winnerUid, WIN_XP);
        callerXp = winnerUid === uid ? WIN_XP : 0;
      }
    } catch (err) {
      // The duel result is already recorded — XP payout is best-effort.
      console.error('[challenges/accept] payout error:', err);
    }

    res.status(200).json({
      ok: true,
      result: tie ? 'tie' : winnerUid === uid ? 'won' : 'lost',
      challengerScore: outcome.challengerScore,
      opponentScore: outcome.opponentScore,
      total: outcome.total,
      xpAwarded: callerXp,
    });
  } catch (err) {
    console.error('[challenges/accept] error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
