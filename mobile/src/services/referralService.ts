/**
 * Referral service (mobile).
 * ──────────────────────────
 * Thin client for the two-sided referral program. Talks to the SAME serverless
 * endpoints as the web app, authenticated with the caller's Firebase ID token
 * (mirrors sandraService / leaderboardService auth pattern):
 *
 *   • GET  /api/referrals/code    → { code, link }  (idempotent — creates on first call)
 *   • POST /api/referrals/redeem  { code } → { ok:true, reward } | { ok:false, reason }
 *
 * Every call is best-effort and swallows failures into a typed result so the UI
 * can degrade gracefully — a referral must never crash a screen or block signup.
 */

import { auth } from './firebase';

const CODE_URL = 'https://academy.edlight.org/api/referrals/code';
const REDEEM_URL = 'https://academy.edlight.org/api/referrals/redeem';

export type ReferralCode = { code: string; link: string };

export type RedeemReason = 'invalid_code' | 'self' | 'already_referred' | 'too_old';

export type RedeemResult =
  | { kind: 'ok'; reward: { streakFreeze: number; xp: number } }
  | { kind: 'rejected'; reason: RedeemReason }
  | { kind: 'auth' }
  | { kind: 'error' };

async function idToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Fetch (creating on first call) the signed-in user's referral code + share
 * link. Returns null when signed-out or on any network/server failure.
 */
export async function getReferralCode(): Promise<ReferralCode | null> {
  const token = await idToken();
  if (!token) return null;
  try {
    const res = await fetch(CODE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.code === 'string' && typeof data?.link === 'string') {
      return { code: data.code, link: data.link };
    }
    return null;
  } catch (err) {
    console.error('[Referral] getReferralCode error:', err);
    return null;
  }
}

/**
 * Redeem a friend's code. Best-effort: never throws. The backend is idempotent
 * and guards self / already-referred / too-old / invalid, returning a typed
 * reason the caller renders as a gentle note.
 */
export async function redeemReferral(code: string): Promise<RedeemResult> {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { kind: 'rejected', reason: 'invalid_code' };

  const token = await idToken();
  if (!token) return { kind: 'auth' };

  try {
    const res = await fetch(REDEEM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: clean }),
    });
    if (res.status === 401) return { kind: 'auth' };
    if (!res.ok) return { kind: 'error' };
    const data = await res.json();
    if (data?.ok === true && data?.reward) {
      return {
        kind: 'ok',
        reward: {
          streakFreeze: Number(data.reward.streakFreeze) || 0,
          xp: Number(data.reward.xp) || 0,
        },
      };
    }
    if (data?.ok === false && typeof data?.reason === 'string') {
      return { kind: 'rejected', reason: data.reason as RedeemReason };
    }
    return { kind: 'error' };
  } catch (err) {
    console.error('[Referral] redeemReferral error:', err);
    return { kind: 'error' };
  }
}

/**
 * Bilingual share copy. Includes the CODE visibly, the reward hook, and the
 * link — used identically by the WhatsApp deep-link and the native share sheet.
 */
export function inviteMessage(code: string, link: string, lang: 'fr' | 'ht'): string {
  if (lang === 'ht') {
    return `📚 Vin jwenn mwen sou EdLight Academy pou n revize Bak la ! Sèvi ak kòd mwen ${code} lè w enskri — nou chak ap genyen yon bonus. ${link}`;
  }
  return `📚 Rejoins-moi sur EdLight Academy pour réviser le Bac ! Utilise mon code ${code} à l'inscription — on gagne chacun un bonus. ${link}`;
}
