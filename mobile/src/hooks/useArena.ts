/**
 * useArena — the Arena's live state, as hooks.
 *
 * Two shapes, chosen per data source rather than per taste:
 *
 *  - react-query for the WRITES (register, answer, presence). They are
 *    request/response, they need pending and error states in the UI, and
 *    `useMutation` already owns both.
 *  - `useEffect` + `onSnapshot` for the READS. A live question is not a query
 *    that can be refetched; it is a document that changes under you, and
 *    wrapping a subscription in a query cache means two sources of truth about
 *    what is on screen during the one minute of the product where that cannot
 *    be allowed to disagree.
 *
 * What a client may read is narrow and the narrowness shapes these hooks: the
 * tournament document, the live question, the public standings, and the
 * student's own registration. NOT the player row — `players/{uid}` is
 * `allow read: if false` even for its owner, because a score that moves the
 * instant an answer is scored tells five friends which option was right while
 * the question is still open. So there is no running personal score here, and
 * "am I in my school's five" is read off the standings document's `top5`.
 *
 * Every hook degrades to nothing rather than throwing. On tournament night the
 * failure modes are all real — signed out, never registered, tournament absent,
 * rules not deployed, listener rejected — and in every one of them the correct
 * behaviour is a calm screen with an explanation, never a red box over a
 * student who is trying to play.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import useStore from '../contexts/store';
import {
  subscribeTournament,
  subscribeOpenTournament,
  subscribeActiveTournament,
  subscribeLiveQuestion,
  subscribeRegistration,
  subscribeStandings,
  subscribeLatestFinishedTournament,
  fetchPreviousArenaScore,
  registerForTournament,
  submitAnswer,
  markPresent,
  qualificationState,
  type ArenaTournament,
  type ArenaLiveQuestion,
  type ArenaRegistration,
  type ArenaStandings,
  type ArenaSchoolStanding,
  type ArenaSchoolCounts,
  type ArenaIndividualStanding,
  type QualificationState,
  type SnapMeta,
} from '../services/arenaService';
import { acceptsAnswers } from '../../../shared/arena/state';
import {
  classifyFirestoreError,
  retryDelayMs,
  deriveEventStatus,
  deriveLivePhase,
  type LiveSource,
  type EventStatus,
  type LivePhase,
} from '../utils/arenaViewState';
import { summarizeResult, type ResultSummary } from '../utils/arenaResultTier';

/**
 * What every live subscription hook returns. Nothing here throws — it renders.
 *
 * `data` is the LAST-KNOWN value and survives a listener failure; `error`,
 * `errorKind` and `fromCache` say how much to trust it. utils/arenaViewState.ts
 * turns these into the screen's state so that a failure is never shown as an
 * ordinary moment of the event.
 */
export interface LiveValue<T> extends LiveSource<T> {
  /** Re-subscribe now (resets the backoff). */
  retry: () => void;
}

const idleSource = <T,>(): LiveSource<T> => ({
  data: null, loading: false, error: false, errorKind: null, exists: null, fromCache: false,
});
const loadingSource = <T,>(): LiveSource<T> => ({ ...idleSource<T>(), loading: true });

type Subscribe<T> = (
  cb: (value: T | null, meta?: SnapMeta) => void,
  onError: (err: unknown) => void,
) => () => void;

/**
 * One Firestore listener with honest failure states and a reconnect loop.
 *
 * A Firestore listener that errors is DEAD — it never recovers by itself — so
 * "reconnecting" has to mean re-subscribing. Transient failures retry on a
 * backoff (utils/arenaViewState.retryDelayMs); a rules rejection waits for the
 * student's retry, because it will not change by itself.
 *
 * `key` identifies what is being watched; a new key drops the old value (a
 * different tournament's data is not "last known", it is wrong).
 */
export function useLiveSubscription<T>(key: string | null, subscribe: Subscribe<T>): LiveValue<T> {
  const [value, setValue] = useState<LiveSource<T>>(() => (key ? loadingSource<T>() : idleSource<T>()));
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  const keyRef = useRef<string | null>(key);

  useEffect(() => {
    if (!key) { keyRef.current = null; setValue(idleSource<T>()); return undefined; }
    if (keyRef.current !== key) {
      keyRef.current = key;
      failures.current = 0;
      setValue(loadingSource<T>());
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeRef.current(
      (data, meta) => {
        if (!alive) return;
        failures.current = 0;
        setValue({
          data, loading: false, error: false, errorKind: null,
          exists: data != null, fromCache: !!meta?.fromCache,
        });
      },
      (err) => {
        if (!alive) return;
        const kind = classifyFirestoreError(err);
        // Keep the last-known data; the view labels it stale.
        setValue((v) => ({ ...v, loading: false, error: true, errorKind: kind }));
        const delay = retryDelayMs(failures.current, kind);
        failures.current += 1;
        if (delay != null) timer = setTimeout(() => { if (alive) setAttempt((a) => a + 1); }, delay);
      },
    );
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    failures.current = 0;
    setValue((v) => (v.error ? { ...v, loading: !v.data } : v));
    setAttempt((a) => a + 1);
  }, []);

  return useMemo(() => ({ ...value, retry }), [value, retry]);
}

// ── The clock ───────────────────────────────────────────────────────────────

/**
 * A ticking `Date.now()`.
 *
 * Every countdown in the Arena is derived from server timestamps and the local
 * clock, never from a locally-decremented counter: a counter drifts, pauses
 * when the app backgrounds, and comes back from a lock screen claiming there
 * are 40 seconds left in a question that closed. Re-deriving from `Date.now()`
 * is self-correcting by construction. (See utils/deadlineTimer.ts for the
 * same rule applied to practice and duels.)
 */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

// ── Subscriptions ───────────────────────────────────────────────────────────

/** The tournament document: state machine, clock, public counters. Public read. */
export function useArenaTournament(tid: string | null | undefined): LiveValue<ArenaTournament> {
  return useLiveSubscription<ArenaTournament>(
    tid || null,
    (cb, onError) => subscribeTournament(tid as string, cb, onError),
  );
}

/**
 * Is there an Arena tournament open for sign-up right now?
 *
 * Home doesn't have a tid to watch a specific tournament with — this is the
 * hook that finds one, or returns null when there is nothing to announce.
 * `registration`/`doors` only; see `subscribeOpenTournament` for why.
 */
export function useOpenArenaTournament(): LiveValue<ArenaTournament> {
  return useLiveSubscription<ArenaTournament>('open', (cb, onError) => subscribeOpenTournament(cb, onError));
}

/**
 * Is there an in-progress tournament (past sign-up) at all, anywhere?
 *
 * Whether THIS student can get back into it is a separate question this hook
 * cannot answer — it does not know who is asking. See ArenaAnnounceCard,
 * which pairs this with `useArenaMyRegistration` before offering re-entry.
 */
export function useActiveArenaTournament(): LiveValue<ArenaTournament> {
  return useLiveSubscription<ArenaTournament>('active', (cb, onError) => subscribeActiveTournament(cb, onError));
}

/** The most recent provisional/final event — the hub's results row. */
export function useLatestFinishedArenaTournament(enabled = true): LiveValue<ArenaTournament> {
  return useLiveSubscription<ArenaTournament>(
    enabled ? 'finished' : null,
    (cb, onError) => subscribeLatestFinishedTournament(cb, onError),
  );
}

/**
 * The question currently on the clock.
 *
 * `index` is null between questions and before the first one — the hook then
 * holds no subscription at all rather than watching a document that does not
 * exist yet, which matters because the ~10s pause between questions is a third
 * of the night.
 */
export function useArenaLiveQuestion(
  tid: string | null | undefined,
  index: number | null | undefined,
): LiveValue<ArenaLiveQuestion> {
  return useLiveSubscription<ArenaLiveQuestion>(
    tid && index != null ? `${tid}/${index}` : null,
    (cb, onError) => subscribeLiveQuestion(tid as string, index as number, cb, onError),
  );
}

/**
 * The student's own registration, or null.
 *
 * Null covers signed out, never registered, and "the write has not landed yet".
 * All three want the same screen — register to play — so they are not
 * distinguished here. `eligible: false` (an integrity verdict) is different
 * and the lobby shows it as access denied, never as "register".
 */
export function useArenaMyRegistration(tid: string | null | undefined): LiveValue<ArenaRegistration> {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  return useLiveSubscription<ArenaRegistration>(
    tid && uid ? `${tid}_${uid}` : null,
    (cb, onError) => subscribeRegistration(tid as string, uid as string, cb, onError),
  );
}

/** The single public standings document. Read-only, and shared with the broadcast. */
export function useArenaStandings(tid: string | null | undefined, enabled = true): LiveValue<ArenaStandings> {
  return useLiveSubscription<ArenaStandings>(
    tid && enabled ? tid : null,
    (cb, onError) => subscribeStandings(tid as string, cb, onError),
  );
}

// ── Writes ──────────────────────────────────────────────────────────────────

export function useArenaRegister(tid: string | null | undefined) {
  return useMutation({
    mutationFn: async (vars: { schoolKey: string; grade: string; deviceHash?: string | null }) => {
      if (!tid) return { ok: false as const, error: 'no_tournament' };
      return registerForTournament({ tournamentId: tid, ...vars });
    },
  });
}

export function useArenaAnswer(tid: string | null | undefined) {
  return useMutation({
    mutationFn: async (vars: {
      questionIndex: number;
      choice: number;
      clientShownAt: number;
      focusLosses?: number;
    }) => {
      if (!tid) return { ok: false as const, error: 'no_tournament' };
      return submitAnswer({ tournamentId: tid, ...vars });
    },
  });
}

/** How often the presence heartbeat re-states that the student is in the room. */
const PRESENCE_HEARTBEAT_MS = 45_000;

/**
 * Presence, announced from doors open and repeated while the student is here.
 *
 * Qualification is evaluated at doors close on players actually present, so a
 * lost presence call costs a school its team — silently, which is the worst
 * version. So it is a heartbeat rather than a one-shot: a failed announcement
 * retries on the next beat, and the endpoint is idempotent and generously rate
 * limited for exactly this.
 *
 * Its response is also the only live source of the registered-vs-present split
 * the lobby has to show, so the counts are handed back rather than dropped.
 */
export function useArenaPresence(tid: string | null | undefined, state: ArenaTournament['state'] | null) {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  const [counts, setCounts] = useState<ArenaSchoolCounts | null>(null);
  const inFlight = useRef(false);

  const announce = useCallback(async () => {
    if (!tid || !uid || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await markPresent({ tournamentId: tid });
      if (res.ok) setCounts(res.counts);
    } finally {
      inFlight.current = false;
    }
  }, [tid, uid]);

  // `doors` is what presence is for; `live` keeps the beat across the
  // transition, which the endpoint accepts on purpose so the first question
  // does not spam an error at every player in the tournament.
  const active = state === 'doors' || state === 'live';

  useEffect(() => {
    if (!active || !tid || !uid) return;
    announce();
    const id = setInterval(announce, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [active, tid, uid, announce]);

  return { counts, announce };
}

// ── Composed views ──────────────────────────────────────────────────────────

/** What every composed view adds on top of its data: an honest status. */
export interface ArenaStatusFields {
  /** loading · unavailable · denied · reconnecting · ready. */
  status: EventStatus;
  /** Some of what is shown is last-known rather than current. Label it. */
  stale: boolean;
  /** Re-subscribe every listener this view depends on. */
  retry: () => void;
}

export interface ArenaLobbyView extends ArenaStatusFields {
  tournament: ArenaTournament | null;
  loading: boolean;
  /**
   * The event does not exist or was voided. NOT a listener error — that is
   * `status: 'reconnecting' | 'denied'`, which must never read as "nothing
   * scheduled".
   */
  absent: boolean;
  signedIn: boolean;
  registered: boolean;
  registration: ArenaRegistration | null;
  /** Registered, but marked ineligible by integrity review. */
  accessDenied: boolean;
  /** The student's school lane, once standings carry it. */
  mySchool: ArenaSchoolStanding | null;
  /** CODOSA when the school has a short name, the full label otherwise. */
  schoolName: string;
  counts: ArenaSchoolCounts | null;
  qualification: QualificationState | null;
  doorsOpen: boolean;
  /** ms until doors, or until the first question once doors are open. */
  msToTarget: number;
  targetIsDoors: boolean;
  now: number;
  /** Seed the counts from a register response, so the student sees themselves in it. */
  seedCounts: (c: ArenaSchoolCounts | null) => void;
}

function retryAll(...values: Array<{ retry: () => void }>): () => void {
  return () => values.forEach((v) => v.retry());
}

/**
 * Everything the Lobby renders, assembled once.
 *
 * The screen asks one question — what can this student do right now — and the
 * answer depends on three documents, one endpoint and the clock. Composing it
 * here keeps the screen declarative and, more usefully, keeps the "what counts"
 * rule in one place: before doors the qualification bar counts REGISTRATIONS;
 * from doors open it counts who actually turned up.
 *
 * The counts come from the register/presence responses rather than from the
 * standings document, because the split the lobby has to show — `5 inscrits ·
 * 3 présents` — exists only in those responses. The standings document knows a
 * school's head count and whether it qualified; it does not know how many of
 * that head count are in the room.
 */
export function useArenaLobby(tid: string | null | undefined): ArenaLobbyView {
  const signedIn = !!useStore((s) => s.user?.uid);
  const tour = useArenaTournament(tid);
  const reg = useArenaMyRegistration(tid);
  const stand = useArenaStandings(tid);
  const tournament = tour.data;
  const registration = reg.data;
  const standings = stand.data;
  const now = useNow(1000);

  const { status, stale } = deriveEventStatus(tour);
  const state = tournament?.state ?? null;
  const doorsOpen = !!tournament && (state === 'doors' || state === 'live' || state === 'grading');
  const { counts: presenceCounts } = useArenaPresence(tid, state);

  // The register response seeds the counts before the first heartbeat, so a
  // student who has just registered sees themselves in the number immediately —
  // "CODOSA · 3/5" that does not count the person reading it is the off-by-one
  // that makes somebody register twice.
  const [seeded, setSeeded] = useState<ArenaSchoolCounts | null>(null);
  const counts = presenceCounts ?? seeded;

  const targetIsDoors = !!tournament && now < tournament.doorsAt;
  const msToTarget = tournament ? Math.max(0, (targetIsDoors ? tournament.doorsAt : tournament.startsAt) - now) : 0;

  const mySchool = useMemo(() => {
    if (!registration?.schoolKey || !standings) return null;
    return standings.schools.find((s) => s.key === registration.schoolKey) ?? null;
  }, [registration?.schoolKey, standings]);

  const qualification = useMemo(() => {
    if (!tournament || !registration) return null;
    return qualificationState({
      registered: counts?.registered ?? mySchool?.members ?? 0,
      present: counts?.present ?? 0,
      minPlayers: tournament.minPlayers,
      doorsOpen,
    });
  }, [tournament, registration, counts, mySchool, doorsOpen]);

  return {
    tournament,
    loading: status === 'loading',
    absent: status === 'unavailable',
    status,
    // A registration we could not re-read is stale too: "Inscrit" might be old.
    stale: stale || (reg.error && !!registration),
    retry: retryAll(tour, reg, stand),
    signedIn,
    registered: !!registration,
    registration,
    accessDenied: !!registration && registration.eligible === false,
    mySchool,
    schoolName: mySchool?.shortName || mySchool?.label || '',
    counts,
    qualification,
    doorsOpen,
    msToTarget,
    targetIsDoors,
    now,
    seedCounts: setSeeded,
  };
}

export interface ArenaLiveView extends Omit<ArenaStatusFields, 'status'> {
  tournament: ArenaTournament | null;
  question: ArenaLiveQuestion | null;
  mySchool: ArenaSchoolStanding | null;
  /** The student's own row in the ranked slice, when they are in it. */
  me: ArenaIndividualStanding | null;
  /** The uid is in the school's counting five, per the standings document. */
  inFive: boolean;
  /**
   * What the screen is showing — see utils/arenaViewState.ts. Every failure
   * has its own phase; `interval` is ONLY the real pause between questions.
   */
  phase: LivePhase;
  /** A question is open and the tournament will score a submission. */
  answerable: boolean;
  /** The ~10s between questions — where the school position is shown. */
  inPause: boolean;
  loading: boolean;
  /** Registered but ineligible (integrity review). Answers would be refused. */
  accessDenied: boolean;
  now: number;
}

/**
 * The live round.
 *
 * Note what is deliberately NOT here: the individual leaderboard, and the
 * student's own running score. The first because watching yourself drop
 * mid-round is demoralising and invites tab-switching; the second because the
 * rules do not permit reading it, and they do not permit it because a score
 * that moves on a correct answer leaks the answer.
 *
 * Ticks at 100ms while a question is open, because the ring has to cross the
 * tier boundary visibly, and at 1s otherwise — a pause does not need 10 frames
 * a second on a cheap phone.
 */
export function useArenaLive(tid: string | null | undefined): ArenaLiveView {
  const uid = useStore((s) => s.user?.uid) as string | undefined;
  const tour = useArenaTournament(tid);
  const tournament = tour.data;
  const index = tournament?.currentQuestion?.index ?? null;
  const live = useArenaLiveQuestion(tid, index);
  const reg = useArenaMyRegistration(tid);
  const stand = useArenaStandings(tid);
  const registration = reg.data;
  const standings = stand.data;
  useArenaPresence(tid, tournament?.state ?? null);

  const open = live.data?.state === 'open';
  const now = useNow(open ? 100 : 1000);

  const view = deriveLivePhase(tour, live, now);
  // Only hand the screen a question that belongs to the current index.
  const question = live.data && index != null && live.data.index === index ? live.data : null;

  const mySchool = useMemo(() => {
    if (!registration?.schoolKey || !standings) return null;
    return standings.schools.find((s) => s.key === registration.schoolKey) ?? null;
  }, [registration?.schoolKey, standings]);

  const me = useMemo(
    () => (uid && standings ? standings.individuals.find((p) => p.uid === uid) ?? null : null),
    [uid, standings],
  );

  const answerable = view.answerable && !!tournament && acceptsAnswers(tournament.state);

  return {
    tournament,
    question,
    mySchool,
    me,
    inFive: !!uid && !!mySchool && mySchool.top5.includes(uid),
    phase: view.phase,
    stale: view.stale,
    retry: retryAll(tour, live, reg, stand),
    answerable,
    inPause: view.phase === 'interval',
    loading: view.phase === 'loading',
    accessDenied: !!registration && registration.eligible === false,
    now,
  };
}

// ── Doors ───────────────────────────────────────────────────────────────────

export interface ArenaDoorsView extends ArenaStatusFields {
  tournament: ArenaTournament | null;
  loading: boolean;
  absent: boolean;
  /** The student's own school lane, once standings carry it. */
  mySchool: ArenaSchoolStanding | null;
  schoolName: string;
  counts: ArenaSchoolCounts | null;
  qualification: QualificationState | null;
  /** Schools seen arriving since this screen mounted, newest first. */
  arrivals: string[];
  /** Total schools and players in the room, from the tournament document. */
  roomSchools: number;
  roomPlayers: number;
  /** ms until the first question opens. */
  msToStart: number;
  /** The tournament has started — the caller should hand over to Live. */
  started: boolean;
  /** The event is already over — the caller should hand over to Result. */
  ended: boolean;
  now: number;
}

/**
 * The ante-room, in the ten minutes before the first question.
 *
 * The room filling IS the content here, which is why this hook computes
 * ARRIVALS rather than just a count: a number climbing from 41 to 43 is data,
 * and "SLDG vient d'entrer" is an event. It is the only moment in the whole
 * tournament where a student is looking at the screen with nothing to do, so
 * it has to be worth looking at.
 *
 * Arrivals are diffed client-side against the previous standings rather than
 * read from a feed. There is no arrivals document and there should not be one:
 * this is decoration over data the screen already subscribes to, and a missed
 * arrival costs nothing.
 */
export function useArenaDoors(tid: string | null | undefined): ArenaDoorsView {
  const tour = useArenaTournament(tid);
  const stand = useArenaStandings(tid);
  const tournament = tour.data;
  const standings = stand.data;
  const { counts } = useArenaPresence(tid, tournament?.state ?? null);
  const now = useNow(1000);
  const uid = useStore((s) => s.user?.uid) ?? null;
  const { status, stale } = deriveEventStatus(tour);

  const mySchool = useMemo(() => {
    if (!standings || !uid) return null;
    const mine = standings.individuals.find((i) => i.uid === uid);
    if (!mine) return null;
    return standings.schools.find((s) => s.key === mine.schoolKey) ?? null;
  }, [standings, uid]);

  // Seen-set lives in a ref so a school already in the room when the screen
  // mounted is never announced as arriving — the student would be told about
  // forty schools at once, which is noise, not an event.
  const seen = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<string[]>([]);
  useEffect(() => {
    if (!standings) return;
    const names = standings.schools.map((s) => s.shortName || s.label);
    if (seen.current === null) {
      seen.current = new Set(names);
      return;
    }
    const fresh = names.filter((n) => !seen.current!.has(n));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.current!.add(n));
    setArrivals((prev) => [...fresh.reverse(), ...prev].slice(0, 8));
  }, [standings]);

  const startsAt = tournament?.startsAt ?? 0;
  const state = tournament?.state ?? null;

  return {
    tournament,
    loading: status === 'loading',
    absent: status === 'unavailable',
    status,
    stale: stale || (stand.error && !!standings),
    retry: retryAll(tour, stand),
    mySchool,
    schoolName: mySchool ? (mySchool.shortName || mySchool.label) : '',
    counts,
    qualification: counts
      ? qualificationState({
          registered: counts.registered,
          present: counts.present,
          minPlayers: tournament?.minPlayers ?? 5,
          // Doors are open by definition on this screen, so presence is the
          // test — a school qualified on registrations alone is not qualified.
          doorsOpen: true,
        })
      : null,
    arrivals,
    roomSchools: tournament?.counts?.schools ?? standings?.schools.length ?? 0,
    roomPlayers: tournament?.counts?.players ?? 0,
    msToStart: Math.max(0, startsAt - now),
    started: state === 'live',
    ended: state === 'grading' || state === 'provisional' || state === 'final',
    now,
  };
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface ArenaResultView extends ArenaStatusFields {
  tournament: ArenaTournament | null;
  loading: boolean;
  absent: boolean;
  /** True until integrity review completes. Never say "you won" before this. */
  provisional: boolean;
  me: ArenaIndividualStanding | null;
  mySchool: ArenaSchoolStanding | null;
  schoolName: string;
  /** Was the student one of the five who counted for their school. */
  inTheFive: boolean;
  accuracyPct: number | null;
  avgMs: number | null;
  /** Still settling — the scores are not final even provisionally. */
  calculating: boolean;
  /** Cents this student has waiting, from the tournament's own prize list. */
  prizeCents: number;
  /** There is money to claim AND the window is open. */
  claimOpen: boolean;
  /** The one achievement, contribution and next action — utils/arenaResultTier.ts. */
  summary: ResultSummary;
  /** The next event open for registration, when there is one. */
  nextTournamentId: string | null;
  /** The student's score at the previous event, when known (public slice only). */
  previousScore: number | null;
  now: number;
}

/**
 * What a student sees when it is over.
 *
 * Everything here is labelled PROVISIONAL and that is not a formality: prizes
 * are held until integrity review completes, and a screen that says "you won"
 * before that has to be taken back in public. Saying it up front means a later
 * removal is the rule working as announced rather than a reversal.
 */
export function useArenaResult(tid: string | null | undefined): ArenaResultView {
  const tour = useArenaTournament(tid);
  const stand = useArenaStandings(tid);
  const nextOpen = useOpenArenaTournament();
  const tournament = tour.data;
  const standings = stand.data;
  const now = useNow(1000);
  const uid = useStore((s) => s.user?.uid) ?? null;
  const { status, stale } = deriveEventStatus(tour);

  const me = useMemo(
    () => (standings && uid ? standings.individuals.find((i) => i.uid === uid) ?? null : null),
    [standings, uid],
  );
  const mySchool = useMemo(
    () => (standings && me ? standings.schools.find((s) => s.key === me.schoolKey) ?? null : null),
    [standings, me],
  );

  const answered = tournament?.questionCount ?? 0;

  /*
   * Does this student have money waiting?
   *
   * Read from the tournament's own prize list rather than hardcoded to three,
   * because a later event may pay a different number of places — and a winner
   * who never opens the claim email has no other way of learning that a
   * 72-hour window is running against them. The app is where they already are.
   */
  const prizeCents = useMemo(() => {
    if (!me || !tournament) return 0;
    const prizes = tournament.prizes || [];
    const cents = prizes[me.rank - 1];
    return typeof cents === 'number' && cents > 0 ? cents : 0;
  }, [me, tournament]);

  // "Personal best" only against a score we can actually read.
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const startsAt = tournament?.startsAt ?? 0;
  useEffect(() => {
    if (!tid || !uid || !startsAt) return undefined;
    let alive = true;
    fetchPreviousArenaScore({ tournamentId: tid, startsAt, uid })
      .then((v) => { if (alive) setPreviousScore(v); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [tid, uid, startsAt]);

  const inTheFive = !!(me && mySchool?.top5?.includes(me.uid));
  const nextTournamentId = nextOpen.data && nextOpen.data.id !== tid ? nextOpen.data.id : null;

  const summary = useMemo(() => summarizeResult({
    state: tournament?.state ?? 'grading',
    me: me ? { score: me.score, rank: me.rank } : null,
    school: mySchool ? { rank: mySchool.rank, qualified: mySchool.qualified } : null,
    inTheFive,
    prizeCents,
    previousScore,
    nextEventOpen: !!nextTournamentId,
  }), [tournament?.state, me, mySchool, inTheFive, prizeCents, previousScore, nextTournamentId]);

  return {
    tournament,
    loading: status === 'loading',
    absent: status === 'unavailable',
    status,
    stale: stale || (stand.error && !!standings),
    retry: retryAll(tour, stand),
    provisional: tournament?.state !== 'final',
    me,
    mySchool,
    prizeCents,
    claimOpen: prizeCents > 0 && tournament?.state === 'provisional',
    schoolName: mySchool ? (mySchool.shortName || mySchool.label) : '',
    inTheFive,
    accuracyPct: me && answered > 0 ? Math.round((me.correct / answered) * 100) : null,
    avgMs: me?.avgMs ?? null,
    calculating: tournament?.state === 'grading',
    summary,
    nextTournamentId,
    previousScore,
    now,
  };
}

// ── Hub ─────────────────────────────────────────────────────────────────────

export type ArenaHubPrimary =
  /** Registered and the event is running (doors/live) — one tap back in. */
  | { kind: 'rejoin'; tournament: ArenaTournament }
  /** Registered and results are out. */
  | { kind: 'results'; tournament: ArenaTournament }
  /** An event is open for registration or doors. */
  | { kind: 'open'; tournament: ArenaTournament }
  /** An event is live that this student is not in — they can watch. */
  | { kind: 'watch'; tournament: ArenaTournament }
  /** Nothing scheduled. Honest, with what to do meanwhile. */
  | { kind: 'none' };

export interface ArenaHubView extends ArenaStatusFields {
  primary: ArenaHubPrimary;
  /** A live event anyone can watch, when one is running. */
  watchable: ArenaTournament | null;
  /** The last finished event, for the results row. */
  lastFinished: ArenaTournament | null;
  /** The student's registration for the open/active event, when any. */
  registration: ArenaRegistration | null;
}

/**
 * The permanent Arena destination (Jeux tab segment and the ArenaHub route).
 *
 * Built from the same three queries Home's announcement uses plus the latest
 * finished event, so it is never empty by accident: a failed query is
 * `reconnecting`, not "nothing scheduled".
 */
export function useArenaHub(): ArenaHubView {
  const open = useOpenArenaTournament();
  const active = useActiveArenaTournament();
  const finished = useLatestFinishedArenaTournament();
  const current = open.data ?? active.data ?? null;
  const reg = useArenaMyRegistration(current?.id ?? null);
  const finishedReg = useArenaMyRegistration(!current && finished.data ? finished.data.id : null);

  const sources = [open, active];
  const loading = sources.some((s) => s.loading && !s.data);
  const failing = sources.find((s) => s.error && !s.data);
  const offlineEmpty = sources.some((s) => s.fromCache && !s.data) && !current;

  let status: EventStatus = 'ready';
  if (loading) status = 'loading';
  else if (failing) status = failing.errorKind === 'denied' ? 'denied' : 'reconnecting';
  else if (offlineEmpty) status = 'reconnecting';
  const stale = sources.some((s) => s.error || s.fromCache) && !!current;

  const registration = reg.data;
  let primary: ArenaHubPrimary = { kind: 'none' };
  if (current) {
    const st = current.state;
    if (registration && (st === 'doors' || st === 'live')) primary = { kind: 'rejoin', tournament: current };
    else if (registration && (st === 'grading' || st === 'provisional')) primary = { kind: 'results', tournament: current };
    else if (st === 'registration' || st === 'doors') primary = { kind: 'open', tournament: current };
    else if (st === 'live') primary = { kind: 'watch', tournament: current };
    else if (st === 'grading' || st === 'provisional') primary = { kind: 'results', tournament: current };
  } else if (finished.data && finishedReg.data) {
    primary = { kind: 'results', tournament: finished.data };
  }

  return {
    status,
    stale,
    retry: retryAll(open, active, finished, reg),
    primary,
    watchable: active.data && active.data.state === 'live' ? active.data : null,
    lastFinished: finished.data,
    registration,
  };
}

// ── Watch ───────────────────────────────────────────────────────────────────

export interface ArenaWatchView {
  /** The tournament being watched (the given id, or whatever is live). */
  tournament: ArenaTournament | null;
  /** Only for signed-in viewers (the rules require auth to read it). */
  question: ArenaLiveQuestion | null;
  standings: ArenaStandings | null;
  phase: LivePhase;
  stale: boolean;
  signedIn: boolean;
  /** No id was given and nothing is live right now. */
  nothingLive: boolean;
  /** The viewer's own registered school, the default to follow. */
  ownSchoolKey: string | null;
  retry: () => void;
  now: number;
}

/**
 * The spectator view. Read-only by construction: it never posts an answer,
 * never sends presence (a spectator is not "in the room" for qualification),
 * and reads only what any signed-in client may read.
 */
export function useArenaWatch(tid: string | null | undefined): ArenaWatchView {
  const signedIn = !!useStore((s) => s.user?.uid);
  const active = useActiveArenaTournament();
  const watchId = tid || (active.data && active.data.state === 'live' ? active.data.id : null);
  const tour = useArenaTournament(watchId);
  const tournament = tour.data;
  const index = tournament?.currentQuestion?.index ?? null;
  const live = useArenaLiveQuestion(signedIn ? watchId : null, index);
  const stand = useArenaStandings(watchId);
  const reg = useArenaMyRegistration(watchId);
  const open = live.data?.state === 'open';
  const now = useNow(open ? 250 : 1000);

  const view = deriveLivePhase(tour, live, now);
  const question = live.data && index != null && live.data.index === index ? live.data : null;
  const nothingLive = !tid && !active.loading && !active.error && !watchId;

  let phase: LivePhase = view.phase;
  if (!watchId) {
    phase = active.loading ? 'loading' : active.error ? (active.errorKind === 'denied' ? 'denied' : 'reconnecting') : 'unavailable';
  }

  return {
    tournament,
    question,
    standings: stand.data,
    phase,
    stale: view.stale || (stand.error && !!stand.data),
    signedIn,
    nothingLive,
    ownSchoolKey: reg.data?.schoolKey ?? null,
    retry: retryAll(active, tour, live, stand),
    now,
  };
}
