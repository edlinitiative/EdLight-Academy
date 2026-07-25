/**
 * Referral service (web).
 * ───────────────────────
 * Client for the two-sided referral program plus the ?ref= capture that lets an
 * invite link survive the navigation to signup.
 *
 *   • GET  /api/referrals/code    → { code, link }  (idempotent — creates on first call)
 *   • POST /api/referrals/redeem  { code } → { ok:true, reward } | { ok:false, reason }
 *
 * Calls are relative (same origin as the PWA) and authenticated with the
 * current user's Firebase ID token. Best-effort throughout — a referral must
 * never crash a page or block signup.
 */

import { getIdToken, authedFetch } from './firebase';

const REF_KEY = 'edlight:ref';
const CODE_URL = '/api/referrals/code';
const REDEEM_URL = '/api/referrals/redeem';

export type ReferralCode = { code: string; link: string };

export type RedeemReason = 'invalid_code' | 'self' | 'already_referred' | 'too_old';

export type RedeemResult =
  | { kind: 'ok'; reward: { streakFreeze: number; xp: number } }
  | { kind: 'rejected'; reason: RedeemReason }
  | { kind: 'auth' }
  | { kind: 'error' };

/**
 * On app load: read ?ref=CODE from the URL, persist it (so it survives the
 * route change to signup), and strip it from the address bar. Safe to call on
 * every load — a no-op when there is no ref param. Never throws.
 */
export function captureRefFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('ref');
    if (!raw) return;
    const code = raw.trim().toUpperCase().slice(0, 12);
    if (code) localStorage.setItem(REF_KEY, code);
    // Strip ?ref from the URL without adding a history entry.
    params.delete('ref');
    const qs = params.toString();
    const clean = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
    window.history.replaceState({}, '', clean);
  } catch {
    /* SSR / privacy-mode storage — ignore */
  }
}

export function getStoredRef(): string {
  try {
    return localStorage.getItem(REF_KEY) || '';
  } catch {
    return '';
  }
}

export function clearStoredRef(): void {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Fetch (creating on first call) the signed-in user's referral code + share
 * link. Returns null when signed-out or on any network/server failure.
 */
export async function getReferralCode(): Promise<ReferralCode | null> {
  const token = await getIdToken();
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
 * Redeem a friend's code. Best-effort: never throws. Returns a typed result the
 * caller renders as celebration (ok) or a gentle note (rejected).
 */
export async function redeemReferral(code: string): Promise<RedeemResult> {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return { kind: 'rejected', reason: 'invalid_code' };
  try {
    const res = await authedFetch(REDEEM_URL, { code: clean });
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
 * Bilingual share copy — same message on WhatsApp and the native share sheet.
 * Includes the CODE visibly, the reward hook, and the link.
 */
export function inviteMessage(code: string, link: string, lang: 'fr' | 'ht'): string {
  if (lang === 'ht') {
    return `📚 Vin jwenn mwen sou EdLight Academy pou n revize Bak la ! Sèvi ak kòd mwen ${code} lè w enskri — nou chak ap genyen yon bonus. ${link}`;
  }
  return `📚 Rejoins-moi sur EdLight Academy pour réviser le Bac ! Utilise mon code ${code} à l'inscription — on gagne chacun un bonus. ${link}`;
}
