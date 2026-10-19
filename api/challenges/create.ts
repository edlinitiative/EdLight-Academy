/**
 * Vercel serverless function: POST /api/challenges/create
 * ────────────────────────────────────────────────────────
 * "Défi d'un ami" — a challenger who just finished a trivia round mints an
 * asynchronous duel: the exact question draw (bank indexes) + their score,
 * addressed to whoever opens the share link. Server-authoritative like
 * /api/leaderboard/award: uid comes from the verified ID token, writes go
 * through the Admin SDK, and the challenge is immutable once created.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   {
 *     categoryId: string,        // trivia category id, [a-z0-9_-]{1,40}
 *     questionIdxs: number[],    // indexes into the category bank, 1..50 items
 *     score: number,             // challenger's correct count, 0..total
 *     answers?: (string|null)[], // what was picked per question (FR option text; null = timeout)
 *     bankHash?: string,         // shared/duelGrading bankHash of the category the round used
 *   }
 *
 * Server grading (P0 validation D-8): when the client sends its picks and the
 * server holds the same bank (same hash), the stored challengerScore is the
 * server's grade, not the claimed score. Older builds (score only) and builds
 * whose bank differs are still accepted, recorded with
 * challengerScoreSource: 'client'. The bank hash is stored so an opponent on a
 * different bank is refused instead of answering other questions (D-9).
 *
 * Response 200:
 *   { ok: true, code, url, appUrl, expiresAt }
 *     url    — https fallback  https://academy.edlight.org/defi/<code>
 *     appUrl — deep link       edlight://defi/<code>
 *
 * Firestore: challenges/{code} — doc id IS the shareable code.
 *   { code, challengerUid, challengerName, categoryId, questionIdxs, total,
 *     challengerScore, createdAt, expiresAt, opponent: null, status: 'open' }
 *
 * NOTE: rate limiting uses the 'challenge-create' bucket — add it to LIMITS in
 * api/_lib/rateLimit.ts (see CHALLENGE_INTEGRATION.md); unknown buckets fail
 * open by design, so the endpoint works (unlimited) until that entry lands.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAuthDecoded } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';
import { cleanAvatar } from '../../src/arena-art/avatars/avatarConfig';
import { decideDuelScore } from '../../shared/duelGrading';
import { serverDuelBank } from '../_lib/duelBank';

/** Challenge links stay valid this long. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Bounds — a duel is a short round, and idxs index a static bank. */
const MAX_QUESTIONS = 50;
const MAX_BANK_INDEX = 5000;

/** A public alias must contain at least one letter (matches leaderboardService). */
function isValidAlias(name: unknown): boolean {
  return /\p{L}/u.test(String(name ?? ''));
}

/**
 * Privacy-safe default alias from a verified account name — same derivation as
 * api/leaderboard/award.ts ("Ted Olivier Jacquet" → "Ted J."). Minors' full
 * names are never published on a challenge card.
 */
function defaultAlias(name: string | undefined): string | null {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !isValidAlias(parts[0])) return null;
  const first = parts[0].slice(0, 30);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${first}${lastInitial}`;
}

/** 8-char code from an unambiguous alphabet (no 0/O/1/I/L). */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

interface CreateBody {
  categoryId?: unknown;
  questionIdxs?: unknown;
  score?: unknown;
  answers?: unknown;
  bankHash?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const decoded = await requireAuthDecoded(req, res);
  if (!decoded) return;
  const { uid, name: tokenName } = decoded;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'challenge-create');
  if (!allowed) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  // ── Validate input ──────────────────────────────────────────────────────
  const body: CreateBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
  if (!/^[a-z0-9_-]{1,40}$/.test(categoryId)) {
    res.status(400).json({ error: 'invalid_category' });
    return;
  }

  const rawIdxs = Array.isArray(body.questionIdxs) ? body.questionIdxs : null;
  const questionIdxs = rawIdxs
    ?.map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_BANK_INDEX);
  if (
    !questionIdxs ||
    questionIdxs.length === 0 ||
    questionIdxs.length > MAX_QUESTIONS ||
    questionIdxs.length !== rawIdxs!.length ||
    new Set(questionIdxs).size !== questionIdxs.length
  ) {
    res.status(400).json({ error: 'invalid_questions', message: `questionIdxs must be 1..${MAX_QUESTIONS} unique bank indexes.` });
    return;
  }

  const total = questionIdxs.length;
  const claimed = Math.round(Number(body.score));
  if (!Number.isFinite(claimed) || claimed < 0 || claimed > total) {
    res.status(400).json({ error: 'invalid_score', message: 'score must be within 0..questionIdxs.length.' });
    return;
  }
  const decision = decideDuelScore({
    serverBank: serverDuelBank(categoryId),
    clientHash: body.bankHash,
    idxs: questionIdxs,
    picks: body.answers,
    clientScore: claimed,
    total,
  });
  if (!decision.ok) {
    res.status(400).json({ error: decision.error });
    return;
  }
  const score = decision.score;

  const db = getDb();

  // Challenger's public name: stored board alias first, else derived from the
  // verified token name, else null (the card shows "Élève").
  let challengerName: string | null = null;
  try {
    const entry = (await db.doc(`leaderboards/all-time/entries/${uid}`).get()).data();
    if (entry && entry.hidden !== true && isValidAlias(entry.displayName)) {
      challengerName = String(entry.displayName).slice(0, 40);
    }
  } catch {
    /* best-effort — fall through to token derivation */
  }
  if (!challengerName) challengerName = defaultAlias(tokenName);

  // Their chosen avatar (users/{uid}.avatar), re-sanitized; absent → the
  // card draws the seeded face.
  let challengerAvatar: string | null = null;
  try {
    challengerAvatar = cleanAvatar((await db.doc(`users/${uid}`).get()).data()?.avatar);
  } catch {
    /* best-effort */
  }

  // ── Mint the challenge (retry on the astronomically unlikely collision) ──
  const now = Date.now();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newCode();
      try {
        await db.doc(`challenges/${code}`).create({
          code,
          challengerUid: uid,
          challengerName,
          ...(challengerAvatar ? { challengerAvatar } : {}),
          categoryId,
          questionIdxs,
          total,
          challengerScore: score,
          challengerScoreSource: decision.source,
          ...(decision.bankHash ? { bankHash: decision.bankHash } : {}),
          createdAt: Timestamp.fromMillis(now),
          expiresAt: Timestamp.fromMillis(now + TTL_MS),
          opponent: null,
          status: 'open',
        });
        res.status(200).json({
          ok: true,
          code,
          url: `https://academy.edlight.org/defi/${code}`,
          appUrl: `edlight://defi/${code}`,
          expiresAt: now + TTL_MS,
          score,
        });
        return;
      } catch (err: any) {
        // ALREADY_EXISTS → collision; try a fresh code. Anything else bubbles.
        if (err?.code !== 6) throw err;
      }
    }
    res.status(500).json({ error: 'code_collision' });
  } catch (err) {
    console.error('[challenges/create] write error:', err);
    res.status(500).json({ error: 'write_failed' });
  }
}
