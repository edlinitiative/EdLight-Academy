/**
 * Vercel serverless function: GET /api/referrals/code
 * ───────────────────────────────────────────────────
 * Returns the authenticated caller's referral code, creating one on first call.
 * The uid comes from the verified Firebase ID token — never from the request.
 *
 * A code is a short (6-char), uppercase, human-friendly string drawn from an
 * alphabet WITHOUT the ambiguous glyphs 0/O/1/I/L. Two docs are written (Admin
 * SDK, bypasses security rules):
 *   • users/{uid}.referralCode = CODE
 *   • referralCodes/{CODE}     = { uid, createdAt }   (code → uid lookup + uniqueness)
 *
 * Idempotent: if the user already has a code, that code is returned unchanged.
 *
 * Request (Authorization: Bearer <Firebase ID token>): no body.
 * Response:
 *   200 → { code: string, link: string }   link = https://academy.edlight.org/?ref=CODE
 *   401 / 405 / 500 on the corresponding failures.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/requireAuth';
import { getDb } from '../_lib/firebaseAdmin';
import { ensureReferralCode, referralLink } from '../_lib/referrals';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // uid comes from the verified token — never from the query/body.
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const db = getDb();

  // ensureReferralCode is atomic + idempotent, but its transaction can throw the
  // sentinel 'referral_code_collision' if every generated candidate collided —
  // retry a couple of times with fresh batches before surfacing an error.
  let code: string | null = null;
  for (let attempt = 0; attempt < 3 && !code; attempt++) {
    try {
      code = await ensureReferralCode(db, uid);
    } catch (err) {
      if (attempt === 2) {
        console.error('[referrals/code] failed to mint code:', err);
        res.status(500).json({ error: 'code_generation_failed' });
        return;
      }
    }
  }

  res.status(200).json({ code, link: referralLink(code as string) });
}
