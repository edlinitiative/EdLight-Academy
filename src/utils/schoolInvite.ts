/**
 * One invite, used everywhere a student can bring their school along: the
 * sign-in school step, the school card on Home and /arena, and the end of a
 * game. One message so the copy that reaches WhatsApp is the same wherever it
 * was sent from, and one telemetry event so "does anyone share?" (reach) can
 * be told apart from "does anyone join?" (conversion).
 */
import { getReferralCode } from '../services/referralService';
import { trackEvent } from './telemetry';

export type InviteChannel = 'whatsapp' | 'native' | 'copy';

// One short sentence + the link: no emoji, no em-dash (owner feedback on the
// long invite text, TestFlight build 61).
export function schoolInviteMessage(school: string | null, code: string | null, link: string, isCreole: boolean): string {
  if (!school) {
    if (isCreole) return `Vin revize Bak la avè m sou EdLight Academy${code ? ` ak kòd mwen ${code}` : ''} : ${link}`;
    return code
      ? `Rejoins-moi sur EdLight Academy pour réviser le Bac avec mon code ${code} : ${link}`
      : `Viens réviser le Bac avec moi sur EdLight Academy : ${link}`;
  }
  return isCreole
    ? `Ede ${school} monte nan klasman lekòl yo sou EdLight${code ? ` ak kòd mwen ${code}` : ''} : ${link}`
    : `Aide ${school} à monter au classement des écoles sur EdLight${code ? ` avec mon code ${code}` : ''} : ${link}`;
}

let refCache: { code: string | null; link: string } | null = null;

/** The student's referral code and link — fetched once, and never blocking:
 *  without one the invite still goes out with the site's address. */
export async function inviteRef(): Promise<{ code: string | null; link: string }> {
  if (refCache) return refCache;
  const r = await getReferralCode().catch(() => null);
  refCache = r ? { code: r.code, link: r.link } : { code: null, link: 'https://academy.edlight.org' };
  return refCache;
}

export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Sends the invite. Resolves true when the text was copied (so the caller
 *  can say so); false for the other channels. */
export async function sendInvite(channel: InviteChannel, message: string, where: string): Promise<boolean> {
  trackEvent('school_invite_sent', { channel, where });
  if (channel === 'whatsapp') {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    return false;
  }
  if (channel === 'native' && canNativeShare()) {
    try { await navigator.share({ text: message }); } catch { /* dismissed */ }
    return false;
  }
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    return false;
  }
}
