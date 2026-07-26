import { Share, Linking } from 'react-native';
import { getReferralCode } from './referralService';

/**
 * Share a score (trivia, daily challenge, or exam) to WhatsApp / the native
 * share sheet — with the caller's referral code + link baked in, so every brag
 * doubles as an invite (feeds the two-sided referral program).
 *
 * Text-based, so it ships over-the-air (core RN `Share` + the `whatsapp://`
 * scheme). A branded image card for Instagram Stories needs a native module
 * (react-native-view-shot) and a store build — see docs/ADAPTIVE_CONTENT.md /
 * the share follow-up.
 */
const APP_LINK = 'https://academy.edlight.org';

export interface ScoreShareOpts {
  /** What was scored, already localized, e.g. "Défi du jour", "Anglais · 2024". */
  title: string;
  score: number;
  /** Omit for a percent score (pass asPercent), else "score/total". */
  total?: number;
  asPercent?: boolean;
  lang: 'fr' | 'ht';
}

async function buildMessage(opts: ScoreShareOpts): Promise<string> {
  const ref = await getReferralCode().catch(() => null);
  const link = ref?.link || APP_LINK;
  const scoreStr = opts.asPercent
    ? `${opts.score}%`
    : opts.total != null
      ? `${opts.score}/${opts.total}`
      : `${opts.score}`;
  const codeLine = ref
    ? opts.lang === 'ht'
      ? ` Sèvi ak kòd mwen ${ref.code} — nou chak ap genyen yon bonus.`
      : ` Utilise mon code ${ref.code} — on gagne chacun un bonus.`
    : '';
  return opts.lang === 'ht'
    ? `🎯 Mwen fè ${scoreStr} nan ${opts.title} sou EdLight Academy ! Èske ou ka bat mwen ?${codeLine} ${link}`
    : `🎯 J'ai fait ${scoreStr} en ${opts.title} sur EdLight Academy ! Tu peux me battre ?${codeLine} ${link}`;
}

/** Open the native share sheet (WhatsApp, Messages, etc.) with the score brag. */
export async function shareScore(opts: ScoreShareOpts): Promise<void> {
  const message = await buildMessage(opts);
  try {
    await Share.share({ message });
  } catch {
    /* user cancelled */
  }
}

/** Share the score straight to WhatsApp, falling back to wa.me in a browser. */
export async function shareScoreWhatsApp(opts: ScoreShareOpts): Promise<void> {
  const message = await buildMessage(opts);
  const encoded = encodeURIComponent(message);
  const scheme = `whatsapp://send?text=${encoded}`;
  const web = `https://wa.me/?text=${encoded}`;
  try {
    const canWhatsApp = await Linking.canOpenURL(scheme);
    await Linking.openURL(canWhatsApp ? scheme : web);
  } catch {
    try { await Linking.openURL(web); } catch { /* give up silently */ }
  }
}
