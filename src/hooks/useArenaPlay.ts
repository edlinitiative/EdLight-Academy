/**
 * useArenaPlay — the Arena's live state on the web, as hooks.
 *
 * The web twin of mobile/src/hooks/useArena.ts, reading the same four
 * client-readable documents (tournament, live question, standings, own
 * registration) and posting to the same endpoints. `useEffect` + `onSnapshot`
 * for every read: a live question is a document that changes under you, not a
 * query to refetch, and during the one minute where the screen must not
 * disagree with the room there should be one source of truth, not a cache.
 *
 * No running personal score, by design and by the rules: `players/{uid}` is
 * unreadable, so a student's score appears only when the public standings move
 * after a question closes — the same moment for everybody.
 *
 * Every hook degrades to null instead of throwing. Signed out, never
 * registered, rules rejecting a listener, a tournament that does not exist —
 * each one wants a calm explanation on screen, never an error over a student
 * who is trying to play.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../contexts/store';
import {
  markPresent,
  submitAnswer,
  subscribeLiveQuestion,
  subscribePlayableTournament,
  subscribeRegistration,
  subscribeStandings,
  subscribeTournament,
} from '../services/arenaWebService';
import {
  qualificationState,
  type AnswerResult,
  type ArenaIndividualStanding,
  type ArenaLiveQuestion,
  type ArenaRegistration,
  type ArenaSchoolCounts,
  type ArenaSchoolStanding,
  type ArenaStandings,
  type ArenaTournament,
  type QualificationState,
} from '../utils/arenaPlay';

/**
 * A ticking `Date.now()`. Every countdown is re-derived from server timestamps
 * and the clock rather than decremented, so a backgrounded tab comes back
 * telling the truth instead of claiming 40 seconds left on a closed question.
 */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/** `undefined` until the first snapshot, then the tournament or null. */
export function useArenaTournament(tid: string | null | undefined): ArenaTournament | null | undefined {
  const [t, setT] = useState<ArenaTournament | null | undefined>(undefined);
  useEffect(() => {
    if (!tid) { setT(null); return undefined; }
    setT(undefined);
    return subscribeTournament(tid, setT);
  }, [tid]);
  return t;
}

/** Which edition to open when the URL names none. `undefined` while unknown. */
export function usePlayableArena(enabled = true): ArenaTournament | null | undefined {
  const [t, setT] = useState<ArenaTournament | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribePlayableTournament(setT);
  }, [enabled]);
  return t;
}

/** Null between questions — no subscription is held for a document that does not exist yet. */
export function useArenaLiveQuestion(tid: string | null | undefined, index: number | null | undefined): ArenaLiveQuestion | null {
  const [q, setQ] = useState<ArenaLiveQuestion | null>(null);
  useEffect(() => {
    if (!tid || index == null || index < 0) { setQ(null); return undefined; }
    return subscribeLiveQuestion(tid, index, setQ);
  }, [tid, index]);
  return q;
}

/**
 * `undefined` until known; null means not registered (or signed out).
 *
 * `version` exists because of the rule shape: reading a registration that does
 * not exist is a PERMISSION error, and Firestore ends a listener on its first
 * error — so the subscription opened before a student registers is dead by the
 * time they do. Bumping `version` after a successful registration opens a
 * fresh one, which then sees the new document.
 */
export function useArenaMyRegistration(tid: string | null | undefined, version = 0): ArenaRegistration | null | undefined {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  const [r, setR] = useState<ArenaRegistration | null | undefined>(undefined);
  useEffect(() => {
    if (!tid || !uid) { setR(null); return undefined; }
    setR(undefined);
    return subscribeRegistration(tid, uid, setR);
  }, [tid, uid, version]);
  return r;
}

export function useArenaStandings(tid: string | null | undefined): ArenaStandings | null {
  const [s, setS] = useState<ArenaStandings | null>(null);
  useEffect(() => {
    if (!tid) { setS(null); return undefined; }
    return subscribeStandings(tid, setS);
  }, [tid]);
  return s;
}

const PRESENCE_HEARTBEAT_MS = 45_000;

/**
 * Presence, announced from doors open and repeated while the student is here.
 *
 * Qualification is judged at doors close on players PRESENT, so a lost
 * presence call silently costs a school its team: a heartbeat retries on the
 * next beat, and the endpoint is idempotent and generously rate-limited for
 * exactly this. `live` keeps beating across the transition, which the endpoint
 * accepts on purpose. Returns the registered-vs-present split, which exists
 * only in the endpoint's response.
 */
export function useArenaPresence(tid: string | null | undefined, state: string | null, enabled: boolean): ArenaSchoolCounts | null {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  const [counts, setCounts] = useState<ArenaSchoolCounts | null>(null);
  const inFlight = useRef(false);
  const active = enabled && (state === 'doors' || state === 'live');

  useEffect(() => {
    if (!active || !tid || !uid) return undefined;
    let alive = true;
    const announce = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await markPresent(tid);
        if (alive && res.ok && res.counts) setCounts(res.counts);
      } finally {
        inFlight.current = false;
      }
    };
    void announce();
    const id = window.setInterval(announce, PRESENCE_HEARTBEAT_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [active, tid, uid]);

  return counts;
}

/**
 * How often the student left this tab during one question — the browser
 * equivalent of the app's AppState counter. A tab hidden (switch, minimise)
 * or the window losing focus (another app, another window) each count as one
 * departure; returning ends it. EVIDENCE ONLY: it rides along with the answer
 * and nothing anywhere blocks on it — a notification, a call or a cat on the
 * keyboard look exactly like tabbing out to an AI.
 */
export function useFocusLossCounter(active: boolean): () => { focusLosses: number } {
  const losses = useRef(0);
  const away = useRef(false);

  useEffect(() => {
    if (!active) return undefined;
    const leave = () => {
      if (away.current) return;
      away.current = true;
      losses.current += 1;
    };
    const back = () => { away.current = false; };
    const onVisibility = () => (document.visibilityState === 'hidden' ? leave() : back());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, [active]);

  /** Read and reset — once per question, so each answer carries its own count. */
  return useCallback(() => {
    const reading = { focusLosses: losses.current };
    losses.current = 0;
    return reading;
  }, []);
}

/** One submission at a time; resolves with the server's verdict on RECORDING only. */
export function useArenaAnswer(tid: string | null | undefined) {
  return useCallback(async (vars: {
    questionIndex: number;
    choice: number;
    clientShownAt: number;
    focusLosses: number;
  }): Promise<AnswerResult> => {
    if (!tid) return { ok: false, error: 'no_tournament' };
    return submitAnswer({ tournamentId: tid, ...vars });
  }, [tid]);
}

// ── The composed view ───────────────────────────────────────────────────────

export interface ArenaPlayView {
  /** `undefined` while the first snapshot is pending. */
  tournament: ArenaTournament | null | undefined;
  registration: ArenaRegistration | null | undefined;
  question: ArenaLiveQuestion | null;
  standings: ArenaStandings | null;
  /** The student's school lane, once standings carry it. */
  mySchool: ArenaSchoolStanding | null;
  /** The student's own row in the ranked slice, when they are in it. */
  me: ArenaIndividualStanding | null;
  inFive: boolean;
  counts: ArenaSchoolCounts | null;
  qualification: QualificationState | null;
  /** A question is open and the tournament will score a submission. */
  answerable: boolean;
  now: number;
}

/**
 * Everything the play room renders, assembled once.
 *
 * Ticks at 100ms while a question is open (the tier ring has to cross its
 * boundary visibly) and at 1s otherwise.
 */
export function useArenaPlay(tid: string | null | undefined, webPlay: boolean, registrationVersion = 0): ArenaPlayView {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  const tournament = useArenaTournament(tid);
  const registration = useArenaMyRegistration(tid, registrationVersion);
  const standings = useArenaStandings(tid);
  const index = tournament?.currentQuestion?.index ?? null;
  const question = useArenaLiveQuestion(tid, tournament?.state === 'live' ? index : null);
  const counts = useArenaPresence(tid, tournament?.state ?? null, webPlay && !!registration);

  const open = question?.state === 'open';
  const now = useNow(open ? 100 : 1000);

  const schoolKey = registration?.schoolKey || null;
  const mySchool = useMemo(
    () => (schoolKey && standings ? standings.schools.find((s) => s.key === schoolKey) ?? null : null),
    [schoolKey, standings],
  );
  const me = useMemo(
    () => (uid && standings ? standings.individuals.find((p) => p.uid === uid) ?? null : null),
    [uid, standings],
  );

  const doorsOpen = tournament?.state === 'doors' || tournament?.state === 'live';
  const qualification = useMemo(() => {
    if (!tournament || !registration) return null;
    if (!counts && !mySchool) return null;
    return qualificationState({
      registered: counts?.registered ?? mySchool?.members ?? 0,
      present: counts?.present ?? 0,
      minPlayers: tournament.minPlayers,
      doorsOpen,
    });
  }, [tournament, registration, counts, mySchool, doorsOpen]);

  const answerable = tournament?.state === 'live'
    && !!question
    && question.state === 'open'
    && now < question.closesAt;

  return {
    tournament,
    registration,
    question,
    standings,
    mySchool,
    me,
    inFive: !!uid && !!mySchool && mySchool.top5.includes(uid),
    counts,
    qualification,
    answerable,
    now,
  };
}
