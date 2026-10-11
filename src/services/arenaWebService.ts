/**
 * arenaWebService — what the WEB is allowed to do with a tournament.
 *
 * Ted's call, 2026-09-21: "only the play is now allowed on website, everything
 * else is." Superseded for PLAY on 2026-10-10 — "for now let people play on
 * laptops as well … then we'll put the barriers after" — behind the one switch
 * `ARENA_WEB_PLAY` in shared/arena/webPlay.ts. The play half (subscriptions,
 * presence, answers) is at the bottom of this file and talks to exactly the
 * same client-readable documents and endpoints the app does; nothing here can
 * read an answer key or a player row, because the rules do not let it.
 *
 * Registration was mobile-only before this, which meant a student on a school
 * computer — a lot of this audience — hit a QR code and stopped there. The
 * expensive step (install the app) was demanded before the cheap one (say
 * which school you are with), and the cheap one is the one that has to happen
 * while a student's interest is live.
 *
 * SIGNED-IN ONLY, also Ted's call: registration writes a player row keyed by
 * uid, so it needs an identity before it can mean anything.
 */
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, getIdToken } from './firebase';
import {
  PLAYABLE_STATES,
  countsFrom as readCounts,
  isValidDeviceHash,
  makeWebDeviceHash,
  pickPlayableArena,
  toLiveQuestion,
  toRegistration,
  toStandings,
  toTournament,
  type AnswerResult,
  type ArenaLiveQuestion,
  type ArenaRegistration,
  type ArenaStandings,
  type ArenaTournament,
} from '../utils/arenaPlay';

const REGISTER_URL = '/api/arena/register';
const ANSWER_URL = '/api/arena/answer';
const PRESENCE_URL = '/api/arena/presence';

export interface ArenaSchoolCounts {
  registered: number;
  present: number;
  qualified: boolean;
  needed: number;
}

/**
 * One shape rather than a discriminated union: the root tsconfig runs with
 * `strictNullChecks: false`, and under it TypeScript will not narrow a
 * `{ok:true}|{ok:false}` union at the call site — the caller would have to
 * cast to read `error`. A flat result with optional fields tells the truth
 * about what the compiler can actually check here.
 */
export interface ArenaRegisterResult {
  ok: boolean;
  /** Present on success, when the server reported the school's tally. */
  counts?: ArenaSchoolCounts | null;
  /** Present on failure — a machine code, mapped by registerErrorMessage. */
  error?: string;
}

/**
 * The register endpoint answers with the counts at the TOP level; this used
 * to look for a nested `counts` and so always came back null.
 */
function countsFrom(data: any): ArenaSchoolCounts | null {
  return readCounts(data);
}

/**
 * Register the signed-in student for a tournament.
 *
 * The server is the authority on every rule that matters — whether sign-up is
 * open, whether the grade may compete, whether the school key names a real
 * school — so this sends the three facts and reports back what it said. It
 * never decides eligibility locally; a client that "knows" the rules is a
 * client that disagrees with the server the day one changes.
 */
export async function registerForTournament(opts: {
  tournamentId: string;
  schoolKey: string;
  grade: string;
}): Promise<ArenaRegisterResult> {
  const token = await getIdToken();
  if (!token) return { ok: false, error: 'not_signed_in' };

  try {
    const res = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tournamentId: opts.tournamentId,
        schoolKey: opts.schoolKey,
        grade: opts.grade,
        // The browser's own per-profile id — see webDeviceHash(). Evidence for
        // a reviewer ("forty accounts from one machine"), never a control.
        deviceHash: webDeviceHash(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error || `http_${res.status}`) };
    }
    return { ok: true, counts: countsFrom(data) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** The errors the register endpoint can answer with, in the student's words. */
export function registerErrorMessage(code: string, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  switch (code) {
    case 'not_signed_in':
      return t('Connectez-vous pour vous inscrire.', 'Konekte pou w enskri.');
    case 'registration_closed':
      return t(
        'Les inscriptions sont fermées pour ce championnat.',
        'Enskripsyon yo fèmen pou chanpyona sa a.',
      );
    case 'grade_not_eligible':
      return t(
        'Ce championnat est réservé aux élèves du primaire et du secondaire.',
        'Chanpyona sa a se pou elèv primè ak segondè.',
      );
    case 'unknown_school':
      return t(
        'Cette école n’est pas encore dans notre liste. Choisissez-en une autre pour l’instant.',
        'Lekòl sa a poko nan lis nou an. Chwazi yon lòt pou kounye a.',
      );
    case 'offline':
      return t(
        'Pas de connexion — réessayez dans un instant.',
        'Pa gen koneksyon — eseye ankò nan yon ti moman.',
      );
    default:
      return t('Inscription impossible pour le moment.', 'Nou pa ka enskri w kounye a.');
  }
}

// ── Playing on the web (ARENA_WEB_PLAY) ─────────────────────────────────────
//
// READS are direct Firestore subscriptions to the four documents a client may
// read — the tournament, `live/{index}`, `standings/current`, and the
// student's own `tournamentRegistrations/{tid}_{uid}`. WRITES are POSTs to the
// same endpoints the app uses, with the Firebase ID token. Every subscriber
// hands back null on a missing document AND on a listener error: to a screen,
// "no such tournament" and "the rules said no" are the same calm empty state.

const DEVICE_KEY = 'edlight.arena.deviceHash';
let deviceMemo: string | null = null;

/**
 * This browser's stable random id, minted once and kept in localStorage.
 *
 * Falls back to an in-memory id when storage is blocked (private mode, a
 * locked-down school machine) — still consistent for the session, which is
 * what a per-answer device comparison needs.
 */
export function webDeviceHash(): string | null {
  if (deviceMemo) return deviceMemo;
  const random = (n: number): Uint8Array => {
    const out = new Uint8Array(n);
    const c = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : null;
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(out);
    else for (let i = 0; i < n; i += 1) out[i] = Math.floor(Math.random() * 256);
    return out;
  };
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (isValidDeviceHash(stored)) {
      deviceMemo = stored;
      return stored;
    }
    const fresh = makeWebDeviceHash(random);
    window.localStorage.setItem(DEVICE_KEY, fresh);
    deviceMemo = fresh;
    return fresh;
  } catch {
    deviceMemo = makeWebDeviceHash(random);
    return deviceMemo;
  }
}

export function subscribeTournament(
  tid: string,
  cb: (t: ArenaTournament | null) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid),
    (snap) => cb(snap.exists() ? toTournament(snap.id, snap.data()) : null),
    (err) => {
      console.error('[Arena] tournament listener error:', err);
      onError?.();
      cb(null);
    },
  );
}

/** The edition `/arena/jouer` should open when no id is given, or null. */
export function subscribePlayableTournament(
  cb: (t: ArenaTournament | null) => void,
): Unsubscribe {
  const q = query(collection(db, 'tournaments'), where('state', 'in', PLAYABLE_STATES));
  return onSnapshot(
    q,
    (snap) => cb(pickPlayableArena(snap.docs.map((d) => toTournament(d.id, d.data())))),
    (err) => {
      console.error('[Arena] playable-tournament listener error:', err);
      cb(null);
    },
  );
}

/** The delivery document — no answer key until it is closed, by construction. */
export function subscribeLiveQuestion(
  tid: string,
  index: number,
  cb: (q: ArenaLiveQuestion | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid, 'live', String(index)),
    (snap) => cb(snap.exists() ? toLiveQuestion(snap.data()) : null),
    (err) => {
      console.error('[Arena] live question listener error:', err);
      cb(null);
    },
  );
}

/**
 * The student's own registration. The rule reads `resource.data.uid`, so a
 * registration that does not exist answers with a permission error rather
 * than an empty snapshot — both mean "not registered" and both report `null`.
 */
export function subscribeRegistration(
  tid: string,
  uid: string,
  cb: (r: ArenaRegistration | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournamentRegistrations', `${tid}_${uid}`),
    (snap) => cb(snap.exists() ? toRegistration(uid, snap.data()) : null),
    () => cb(null),
  );
}

export function subscribeStandings(
  tid: string,
  cb: (s: ArenaStandings | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'tournaments', tid, 'standings', 'current'),
    (snap) => cb(snap.exists() ? toStandings(snap.data()) : null),
    (err) => {
      console.error('[Arena] standings listener error:', err);
      cb(null);
    },
  );
}

/** Authed POST. Never throws: offline is `{ok:false, error:'offline'}`. */
async function arenaPost(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; data?: any }> {
  const token = await getIdToken();
  if (!token) return { ok: false, error: 'not_signed_in' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error || `http_${res.status}`), data };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/**
 * One submission — which is the commitment.
 *
 * `clientShownAt` is when the question painted in THIS browser; the server
 * clamps it into [opensAt, opensAt + 3s], so it can cost a tier, never buy one.
 * `focusLosses` counts how often the tab was left during this question —
 * evidence for review, never a reason to refuse. The response says whether the
 * submission was RECORDED and nothing about whether it was right.
 */
export async function submitAnswer(opts: {
  tournamentId: string;
  questionIndex: number;
  choice: number;
  clientShownAt: number;
  focusLosses: number;
}): Promise<AnswerResult> {
  const r = await arenaPost(ANSWER_URL, {
    tournamentId: opts.tournamentId,
    questionIndex: opts.questionIndex,
    choice: opts.choice,
    clientShownAt: opts.clientShownAt,
    focusLosses: opts.focusLosses,
    deviceHash: webDeviceHash(),
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, duplicate: r.data?.duplicate === true };
}

/** "I am in the room." A heartbeat: idempotent, safe to repeat. */
export async function markPresent(
  tournamentId: string,
): Promise<{ ok: boolean; error?: string; counts?: ArenaSchoolCounts | null }> {
  const r = await arenaPost(PRESENCE_URL, { tournamentId });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, counts: readCounts(r.data) };
}
