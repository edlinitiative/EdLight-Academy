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

import { createObservedFetch } from '../../../shared/observedFetch';
import { trackEvent } from './telemetry';

import { Share } from 'react-native';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getReferralCode } from './referralService';

const observedFetch = createObservedFetch(trackEvent, 'challenge');

const CREATE_URL = 'https://academy.edlight.org/api/challenges/create';
const ACCEPT_URL = 'https://academy.edlight.org/api/challenges/accept';

export interface Challenge {
  code: string;
  challengerUid: string;
  challengerName: string | null;
  /** The challenger's chosen avatar (wire string), when they made one. */
  challengerAvatar?: string;
  categoryId: string;
  questionIdxs: number[];
  total: number;
  challengerScore: number;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
  opponent: { uid: string; name: string | null; score: number; playedAt: number; avatar?: string } | null;
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
    const res = await observedFetch(url, {
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
      ...(typeof d.challengerAvatar === 'string' ? { challengerAvatar: d.challengerAvatar } : {}),
      categoryId: d.categoryId,
      questionIdxs: Array.isArray(d.questionIdxs) ? d.questionIdxs : [],
      total: Number(d.total) || 0,
      challengerScore: Number(d.challengerScore) || 0,
      createdAt: ms(d.createdAt),
      expiresAt: ms(d.expiresAt),
      opponent: d.opponent
        ? { uid: d.opponent.uid, name: d.opponent.name ?? null, score: Number(d.opponent.score) || 0, playedAt: ms(d.opponent.playedAt), ...(typeof d.opponent.avatar === 'string' ? { avatar: d.opponent.avatar } : {}) }
        : null,
      status: d.status === 'played' ? 'played' : 'open',
    };
  } catch (err) {
    console.error('[Challenge] getChallenge error:', err);
    return null;
  }
}

/** Read one Firestore challenge doc into a Challenge. */
function toChallenge(id: string, d: any): Challenge {
  const ms = (v: any) => (v instanceof Timestamp ? v.toMillis() : Number(v) || 0);
  return {
    code: id,
    challengerUid: d.challengerUid,
    challengerName: d.challengerName ?? null,
    ...(typeof d.challengerAvatar === 'string' ? { challengerAvatar: d.challengerAvatar } : {}),
    categoryId: d.categoryId,
    questionIdxs: Array.isArray(d.questionIdxs) ? d.questionIdxs : [],
    total: Number(d.total) || 0,
    challengerScore: Number(d.challengerScore) || 0,
    createdAt: ms(d.createdAt),
    expiresAt: ms(d.expiresAt),
    opponent: d.opponent
      ? { uid: d.opponent.uid, name: d.opponent.name ?? null, score: Number(d.opponent.score) || 0, playedAt: ms(d.opponent.playedAt), ...(typeof d.opponent.avatar === 'string' ? { avatar: d.opponent.avatar } : {}) }
      : null,
    status: d.status === 'played' ? 'played' : 'open',
  };
}

/**
 * The duels YOU sent, newest first.
 *
 * A duel used to run one way: you shared a link and never learned what
 * happened unless you re-opened your own link. The rule for this query is
 * scoped to challengerUid == your uid, so the `where` below is not a filter
 * for convenience — drop it and Firestore rejects the whole query.
 *
 * Returns [] rather than throwing when the rules or the composite index are
 * not deployed yet, so the screen simply shows nothing instead of erroring.
 */
export async function listMyChallenges(max = 20): Promise<Challenge[]> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'challenges'),
      where('challengerUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(max),
    ));
    return snap.docs.map((d) => toChallenge(d.id, d.data()));
  } catch (err) {
    console.error('[Challenge] listMyChallenges error:', err);
    return [];
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
  // One sentence + the link, no emoji, no em-dash (owner feedback, build 61).
  // The referral code rides along only as "(code X)" so it stays one line.
  const code = ref?.code ? (opts.lang === 'ht' ? ` (kòd ${ref.code})` : ` (code ${ref.code})`) : '';
  return opts.lang === 'ht'
    ? `Mwen fè ${opts.score}/${opts.total} nan ${opts.categoryLabel} sou EdLight, bat mwen sou menm kesyon yo${code} : ${opts.url}`
    : `J'ai fait ${opts.score}/${opts.total} en ${opts.categoryLabel} sur EdLight, bats-moi sur les mêmes questions${code} : ${opts.url}`;
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
