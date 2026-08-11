/**
 * Challenge Service — "Défi d'un ami"
 * ────────────────────────────────────
 * Asynchronous trivia duels. The challenger mints a challenge from a finished
 * round (exact question draw + score) via POST /api/challenges/create and
 * shares the returned link; the recipient plays the SAME questions once and
 * posts their score via POST /api/challenges/accept. The winner earns duel XP
 * server-side (see api/challenges/*).
 *
 * Reads are direct Firestore GETs (challenges/{code} is get-only for signed-in
 * users); writes are server-authoritative, mirroring leaderboardService's
 * Bearer-token pattern.
 */

import { Share } from 'react-native';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getReferralCode } from './referralService';

const CREATE_URL = 'https://academy.edlight.org/api/challenges/create';
const ACCEPT_URL = 'https://academy.edlight.org/api/challenges/accept';

export interface Challenge {
  code: string;
  challengerUid: string;
  challengerName: string | null;
  categoryId: string;
  questionIdxs: number[];
  total: number;
  challengerScore: number;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
  opponent: { uid: string; name: string | null; score: number; playedAt: number } | null;
  status: 'open' | 'played';
}

export interface CreatedChallenge {
  code: string;
  url: string;    // https fallback — safe in any chat app
  appUrl: string; // edlight://defi/<code>
  expiresAt: number;
}

export interface AcceptOutcome {
  result: 'won' | 'lost' | 'tie';
  challengerScore: number;
  opponentScore: number;
  total: number;
  xpAwarded: number;
}

/** Authed POST helper (same token pattern as leaderboardService.postAward). */
async function authedPost(url: string, payload: Record<string, unknown>): Promise<any | null> {
  const user = auth.currentUser;
  if (!user) return null;
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return null;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Challenge] endpoint returned', res.status, data?.error);
      return { error: data?.error || `http_${res.status}` };
    }
    return data;
  } catch (err) {
    console.error('[Challenge] request error:', err);
    return null;
  }
}

/**
 * Mint a challenge from a finished round.
 * `questionIdxs` are indexes into TRIVIA_QUESTIONS[categoryId] (see
 * utils/seededDraw.idxsOf). Returns null on auth/network failure.
 */
export async function createChallenge(opts: {
  categoryId: string;
  questionIdxs: number[];
  score: number;
}): Promise<CreatedChallenge | null> {
  const data = await authedPost(CREATE_URL, opts);
  if (!data?.ok) return null;
  return { code: data.code, url: data.url, appUrl: data.appUrl, expiresAt: data.expiresAt };
}

/** Post the opponent's single attempt. Null on failure; {error} on rejection. */
export async function acceptChallenge(opts: {
  code: string;
  score: number;
}): Promise<AcceptOutcome | { error: string } | null> {
  const data = await authedPost(ACCEPT_URL, opts);
  if (!data) return null;
  if (!data.ok) return { error: String(data.error || 'unknown') };
  return {
    result: data.result,
    challengerScore: data.challengerScore,
    opponentScore: data.opponentScore,
    total: data.total,
    xpAwarded: data.xpAwarded,
  };
}

/** Fetch a challenge by its code (requires a signed-in user per rules). */
export async function getChallenge(code: string): Promise<Challenge | null> {
  try {
    const snap = await getDoc(doc(db, 'challenges', code.trim().toUpperCase()));
    if (!snap.exists()) return null;
    const d = snap.data() as any;
    const ms = (v: any) => (v instanceof Timestamp ? v.toMillis() : Number(v) || 0);
    return {
      code: snap.id,
      challengerUid: d.challengerUid,
      challengerName: d.challengerName ?? null,
      categoryId: d.categoryId,
      questionIdxs: Array.isArray(d.questionIdxs) ? d.questionIdxs : [],
      total: Number(d.total) || 0,
      challengerScore: Number(d.challengerScore) || 0,
      createdAt: ms(d.createdAt),
      expiresAt: ms(d.expiresAt),
      opponent: d.opponent
        ? { uid: d.opponent.uid, name: d.opponent.name ?? null, score: Number(d.opponent.score) || 0, playedAt: ms(d.opponent.playedAt) }
        : null,
      status: d.status === 'played' ? 'played' : 'open',
    };
  } catch (err) {
    console.error('[Challenge] getChallenge error:', err);
    return null;
  }
}

/**
 * WhatsApp-friendly duel message with the challenge link and the sender's
 * referral code (same brag-doubles-as-invite pattern as scoreShare.ts) —
 * every accepted duel from a non-user lands attributed.
 */
export async function buildChallengeShareMessage(opts: {
  categoryLabel: string; // already localized, e.g. "Culture Générale Haïti"
  score: number;
  total: number;
  url: string;
  lang: 'fr' | 'ht';
}): Promise<string> {
  const ref = await getReferralCode().catch(() => null);
  const codeLine = ref
    ? opts.lang === 'ht'
      ? ` Sèvi ak kòd mwen ${ref.code} lè w enskri — nou chak ap genyen yon bonus.`
      : ` Utilise mon code ${ref.code} en t'inscrivant — on gagne chacun un bonus.`
    : '';
  return opts.lang === 'ht'
    ? `⚔️ M ap defye w sou EdLight Academy ! Mwen fè ${opts.score}/${opts.total} nan ${opts.categoryLabel}. Menm ${opts.total} kesyon yo, yon sèl tantativ — èske w ka bat mwen ?${codeLine} ${opts.url}`
    : `⚔️ Je te défie sur EdLight Academy ! J'ai fait ${opts.score}/${opts.total} en ${opts.categoryLabel}. Les mêmes ${opts.total} questions, une seule tentative — tu peux me battre ?${codeLine} ${opts.url}`;
}

/** Open the native share sheet with the duel message. */
export async function shareChallenge(opts: {
  categoryLabel: string;
  score: number;
  total: number;
  url: string;
  lang: 'fr' | 'ht';
}): Promise<void> {
  const message = await buildChallengeShareMessage(opts);
  try {
    await Share.share({ message });
  } catch {
    /* user cancelled */
  }
}
