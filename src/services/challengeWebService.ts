/**
 * challengeWebService — "Défi d'un ami" for the web.
 * ───────────────────────────────────────────────────
 * Mirrors mobile/src/services/challengeService.ts call for call, against the
 * same server: the challenger mints a duel from a finished round (exact
 * question draw + score) via POST /api/challenges/create and shares the link;
 * the opponent plays the SAME questions once and posts their score via
 * POST /api/challenges/accept, which records the one attempt transactionally
 * and pays duel XP server-side. Nothing here decides an outcome — the server
 * is the authority, the web only reports what it said.
 *
 * Reads are direct Firestore GETs: challenges/{code} is get-only for any
 * signed-in user, and LIST is allowed only for challengerUid == you (see
 * firestore.rules). There is no rule that lets you list duels you RECEIVED,
 * so the web remembers the codes it opened in localStorage and re-reads them
 * one GET at a time — the same "per device is enough" trade the app makes for
 * its seen-results list.
 *
 * Firebase is loaded on first use (same pattern as referralService), so this
 * module costs nothing until a duel is actually touched.
 */
import { createObservedFetch } from '../../shared/observedFetch';
import { trackEvent } from '../utils/telemetry';

import type { DuelLike } from '../utils/duels';

const observedFetch = createObservedFetch(trackEvent, 'challenge');

const loadFirebase = () => import('./firebase');
const loadFirestore = () => import('firebase/firestore');

const CREATE_URL = '/api/challenges/create';
const ACCEPT_URL = '/api/challenges/accept';

export interface Challenge extends DuelLike {
  challengerName: string | null;
  /** The challenger's chosen avatar (wire string), when they made one. */
  challengerAvatar?: string;
  categoryId: string;
  questionIdxs: number[];
  createdAt: number; // epoch ms
}

export interface CreatedChallenge {
  code: string;
  url: string;
  appUrl: string;
  expiresAt: number;
}

/**
 * Flat result rather than a union: the root tsconfig runs without
 * strictNullChecks, under which a `{ok:true}|{ok:false}` union does not narrow
 * at the call site (see arenaWebService for the same choice).
 */
export interface AcceptResult {
  ok: boolean;
  result?: 'won' | 'lost' | 'tie';
  challengerScore?: number;
  opponentScore?: number;
  total?: number;
  xpAwarded?: number;
  /** Server error code (already_played, expired, …) or 'network' / 'auth'. */
  error?: string;
}

export interface CreateResult {
  ok: boolean;
  challenge?: CreatedChallenge;
  error?: string;
}

/**
 * The signed-in user once Firebase has restored the session. On a cold page
 * load the store can already hold a persisted user while auth.currentUser is
 * still null; asking for a token in that window would read as "signed out".
 */
async function readyUser() {
  const { auth } = await loadFirebase();
  try {
    await auth.authStateReady();
  } catch {
    /* fall through to whatever currentUser is */
  }
  return auth.currentUser;
}

async function authedPost(url: string, payload: Record<string, unknown>): Promise<{ status: number; data: any } | null> {
  const user = await readyUser();
  if (!user) return { status: 401, data: { error: 'auth' } };
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    return { status: 401, data: { error: 'auth' } };
  }
  try {
    const res = await observedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    console.error('[Challenge] request error:', err);
    return null;
  }
}

/** Mint a duel from a finished round. `questionIdxs` index the duel bank. */
export async function createChallenge(opts: {
  categoryId: string;
  questionIdxs: number[];
  score: number;
}): Promise<CreateResult> {
  const r = await authedPost(CREATE_URL, opts);
  if (!r) return { ok: false, error: 'network' };
  if (r.status !== 200 || !r.data?.ok) return { ok: false, error: String(r.data?.error || `http_${r.status}`) };
  const d = r.data;
  return { ok: true, challenge: { code: d.code, url: d.url, appUrl: d.appUrl, expiresAt: Number(d.expiresAt) || 0 } };
}

/** Post the opponent's one attempt. */
export async function acceptChallenge(opts: { code: string; score: number }): Promise<AcceptResult> {
  const r = await authedPost(ACCEPT_URL, opts);
  if (!r) return { ok: false, error: 'network' };
  if (r.status !== 200 || !r.data?.ok) return { ok: false, error: String(r.data?.error || `http_${r.status}`) };
  const d = r.data;
  return {
    ok: true,
    result: d.result,
    challengerScore: Number(d.challengerScore) || 0,
    opponentScore: Number(d.opponentScore) || 0,
    total: Number(d.total) || 0,
    xpAwarded: Number(d.xpAwarded) || 0,
  };
}

/** One Firestore challenge doc → Challenge. Exported for tests. */
export function toChallenge(id: string, d: any): Challenge {
  const ms = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : Number(v) || 0);
  return {
    code: id,
    challengerUid: String(d?.challengerUid ?? ''),
    challengerName: d?.challengerName ?? null,
    ...(typeof d?.challengerAvatar === 'string' ? { challengerAvatar: d.challengerAvatar } : {}),
    categoryId: String(d?.categoryId ?? ''),
    questionIdxs: Array.isArray(d?.questionIdxs) ? d.questionIdxs.map(Number) : [],
    total: Number(d?.total) || 0,
    challengerScore: Number(d?.challengerScore) || 0,
    createdAt: ms(d?.createdAt),
    expiresAt: ms(d?.expiresAt),
    opponent: d?.opponent
      ? {
        uid: String(d.opponent.uid), name: d.opponent.name ?? null, score: Number(d.opponent.score) || 0, playedAt: ms(d.opponent.playedAt),
        ...(typeof d.opponent.avatar === 'string' ? { avatar: d.opponent.avatar } : {}),
      }
      : null,
    status: d?.status === 'played' ? 'played' : 'open',
  };
}

export type GetResult = { challenge: Challenge | null; error?: 'auth' | 'network' };

/** Fetch a duel by its code. Requires a signed-in user (rules). */
export async function getChallenge(code: string): Promise<GetResult> {
  const user = await readyUser();
  if (!user) return { challenge: null, error: 'auth' };
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([loadFirebase(), loadFirestore()]);
    const snap = await getDoc(doc(db, 'challenges', code.trim().toUpperCase()));
    return { challenge: snap.exists() ? toChallenge(snap.id, snap.data()) : null };
  } catch (err) {
    console.error('[Challenge] getChallenge error:', err);
    return { challenge: null, error: 'network' };
  }
}

/** The duels you sent, newest first. [] when rules/index are missing. */
export async function listMyChallenges(max = 20): Promise<Challenge[]> {
  const user = await readyUser();
  if (!user) return [];
  try {
    const [{ db }, fs] = await Promise.all([loadFirebase(), loadFirestore()]);
    // The `where` is what the list rule checks — drop it and Firestore
    // rejects the whole query.
    const snap = await fs.getDocs(fs.query(
      fs.collection(db, 'challenges'),
      fs.where('challengerUid', '==', user.uid),
      fs.orderBy('createdAt', 'desc'),
      fs.limit(max),
    ));
    return snap.docs.map((d) => toChallenge(d.id, d.data()));
  } catch (err) {
    console.error('[Challenge] listMyChallenges error:', err);
    return [];
  }
}

/* ─── Duels received on this device ─────────────────────────────────────── */

const RECEIVED_KEY = 'edlight:duels:received';
const RECEIVED_MAX = 30;

/** Codes of duels opened on this device, newest first (per signed-in uid). */
export function receivedCodes(uid: string | null | undefined): string[] {
  if (!uid) return [];
  try {
    const all = JSON.parse(localStorage.getItem(RECEIVED_KEY) || '{}');
    const list = all && typeof all === 'object' ? all[uid] : null;
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export function rememberReceived(uid: string | null | undefined, code: string): void {
  if (!uid || !code) return;
  try {
    const all = JSON.parse(localStorage.getItem(RECEIVED_KEY) || '{}') || {};
    const prev: string[] = Array.isArray(all[uid]) ? all[uid] : [];
    all[uid] = [code, ...prev.filter((c) => c !== code)].slice(0, RECEIVED_MAX);
    localStorage.setItem(RECEIVED_KEY, JSON.stringify(all));
  } catch {
    /* storage disabled — the duel still plays, it just isn't listed */
  }
}

/** Re-read the duels this device has opened that are not yours. */
export async function listReceivedChallenges(uid: string | null | undefined): Promise<Challenge[]> {
  const codes = receivedCodes(uid);
  if (!codes.length) return [];
  const got = await Promise.all(codes.map((c) => getChallenge(c)));
  return got.map((g) => g.challenge).filter((c): c is Challenge => !!c && c.challengerUid !== uid);
}

/** The student's referral code for the share text — never blocking. */
export async function referralCodeForShare(): Promise<string | null> {
  try {
    const { getReferralCode } = await import('./referralService');
    const r = await getReferralCode();
    return r?.code ?? null;
  } catch {
    return null;
  }
}
