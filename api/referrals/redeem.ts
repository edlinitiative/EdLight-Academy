/**
 * Vercel serverless function: POST /api/referrals/redeem
 * ──────────────────────────────────────────────────────
 * The CALLER is the newly-signed-up REFERRED user, redeeming someone else's
 * referral code. The uid is taken from the verified Firebase ID token — never
 * from the body. Everything below runs server-side via the Admin SDK and is
 * IDEMPOTENT: a concurrent or repeated call can never double-reward.
 *
 * Request body (Authorization: Bearer <Firebase ID token>):
 *   { code: string }   — the referrer's share code (case/space-insensitive)
 *
 * Flow:
 *   1. Resolve referralCodes/{code} → referrerUid (404/400 if missing/invalid).
 *   2. Guards (return { ok:false, reason } — never 500):
 *        • self       — referrerUid === caller.uid
 *        • already    — caller already has users/{uid}.referredBy set
 *        • too_old    — caller's account is > SIGNUP_WINDOW_DAYS old (skipped if
 *                       created_at is unavailable/unparseable — don't block legit users)
 *   3. Transactionally set users/{caller}.referredBy = referrerUid and create
 *      referrals/{referrerUid}_{callerUid}; the referredBy check-before-write in
 *      the transaction is the single-winner guard against double-reward.
 *   4. Two-sided rewards (Admin SDK, only after the transaction claims the referral):
 *        • referrer: +1 streak freeze (cap 5), +100 xp (gamification/profile.xp)
 *        • referred: +1 streak freeze (cap 5),  +50 xp (gamification/profile.xp)
 *
 * Response:
 *   200 → { ok: true, reward: { streakFreeze: 1, xp: 50 } }   (the caller's reward)
 *   200 → { ok: false, reason: 'self' | 'already_referred' | 'invalid_code' | 'too_old' }
 *   401 / 405 / 429 on auth / method / rate-limit; 500 only on an unexpected write failure.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/requireAuth';
import { checkRateLimit } from '../_lib/rateLimit';
import { getDb } from '../_lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  applyReferralReward,
  normalizeCode,
  REFERRER_XP,
  REFERRED_XP,
} from '../_lib/referrals';

/** Referrals are signup-only: reject accounts older than this (0 = disabled). */
const SIGNUP_WINDOW_DAYS = 7;

interface RedeemBody {
  code?: unknown;
}

/** Best-effort account age in ms from a users doc `created_at`; null if unknown. */
function accountAgeMs(createdAt: unknown): number | null {
  if (!createdAt) return null;
  try {
    // Firestore Admin Timestamp exposes toDate(); also accept ms/ISO strings.
    if (typeof (createdAt as { toDate?: unknown }).toDate === 'function') {
      return Date.now() - (createdAt as { toDate(): Date }).toDate().getTime();
    }
    const t = new Date(createdAt as string | number).getTime();
    return Number.isFinite(t) ? Date.now() - t : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // uid comes from the verified token — never from the body.
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'referrals-redeem');
  if (!allowed) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Trop de requêtes. Réessayez plus tard.' });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  const body: RedeemBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const code = normalizeCode(body.code);
  if (!code) {
    res.status(200).json({ ok: false, reason: 'invalid_code' });
    return;
  }

  const db = getDb();

  try {
    // 1. Resolve code → referrer. The code doc is immutable, so reading it
    //    outside the transaction is safe.
    const codeSnap = await db.collection('referralCodes').doc(code).get();
    const referrerUid = codeSnap.data()?.uid as string | undefined;
    if (!referrerUid) {
      res.status(200).json({ ok: false, reason: 'invalid_code' });
      return;
    }

    // 2a. Self-referral guard.
    if (referrerUid === uid) {
      res.status(200).json({ ok: false, reason: 'self' });
      return;
    }

    // 2b/2c + 3. Claim the referral atomically. The transaction reads the
    // caller's user doc, enforces the one-referral-per-user + signup-window
    // guards, then (and only then) sets referredBy and creates the referral doc.
    // A concurrent second call reads referredBy already set and aborts, so the
    // rewards below run exactly once.
    const referralRef = db.collection('referrals').doc(`${referrerUid}_${uid}`);
    const userRef = db.collection('users').doc(uid);

    const claim = await db.runTransaction<{ ok: boolean; reason?: string }>(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};

      if (userData.referredBy) {
        return { ok: false, reason: 'already_referred' };
      }

      if (SIGNUP_WINDOW_DAYS > 0) {
        const ageMs = accountAgeMs(userData.created_at);
        // Only enforce when age is known — an unparseable/missing created_at
        // must not block a legit new user.
        if (ageMs !== null && ageMs > SIGNUP_WINDOW_DAYS * 86_400_000) {
          return { ok: false, reason: 'too_old' };
        }
      }

      tx.set(userRef, { referredBy: referrerUid }, { merge: true });
      tx.set(referralRef, {
        referrerUid,
        referredUid: uid,
        status: 'confirmed',
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ok: true };
    });

    if (!claim.ok) {
      res.status(200).json({ ok: false, reason: claim.reason });
      return;
    }

    // 4. Two-sided rewards. The referral is already claimed, so these apply once.
    await Promise.all([
      applyReferralReward(db, referrerUid, REFERRER_XP),
      applyReferralReward(db, uid, REFERRED_XP),
    ]);

    res.status(200).json({ ok: true, reward: { streakFreeze: 1, xp: REFERRED_XP } });
  } catch (err) {
    console.error('[referrals/redeem] error:', err);
    res.status(500).json({ error: 'redeem_failed' });
  }
}
