/**
 * Deadline timers — THE TIMING POLICY for every countdown in the app.
 * ────────────────────────────────────────────────────────────────────
 *
 * A countdown is never a counter decremented by `setInterval`. Timer callbacks
 * are suspended or delayed when the app backgrounds or the phone locks, so a
 * counter comes back from the lock screen claiming time that has already run
 * out (or, worse, keeps a scored round open for as long as the app sat in the
 * background). Every remaining-time value is re-derived from `Date.now()`
 * against a stored deadline, so it is self-correcting on every tick.
 *
 * What happens when the app leaves the foreground is a POLICY, chosen per
 * activity, and it is explicit:
 *
 *   'pause'  SOLO PRACTICE — trivia rounds, the daily challenge, the arcade
 *            games. Nothing is at stake against another person, so leaving
 *            the app (a call, a notification, switching apps) freezes the
 *            clock, and coming back shows exactly the time that was left.
 *
 *   'run'    SCORED DUELS — a friend's challenge (ChallengeScreen). The other
 *            player's score was earned against a clock that did not stop, so
 *            this one does not stop either: the deadline keeps running while
 *            backgrounded and, on return, an expired question is expired.
 *
 *   ARENA    is neither. Its clock is the SERVER's — `opensAt`/`closesAt`
 *            timestamps on the live document, the server stamps each answer,
 *            and the window always closes on its timer (useArena.ts / useNow).
 *            Nothing in this module is used to decide an Arena answer.
 *
 * Clock skew (device clock vs server clock) is a separate problem from drift
 * and is not addressed here: practice and duels only ever compare the device
 * clock with itself.
 *
 * Pure; tested in utils/__tests__/deadlineTimer.test.ts. The React binding is
 * `useDeadlineCountdown` in components/games/RoundTimer.tsx.
 */

export type BackgroundPolicy = 'pause' | 'run';

export interface DeadlineTimer {
  durationMs: number;
  policy: BackgroundPolicy;
  /** Epoch ms when the time runs out, while running. */
  deadline: number;
  /** Remaining ms frozen at the moment of a pause; null while running. */
  pausedRemaining: number | null;
}

export function startTimer(durationMs: number, policy: BackgroundPolicy, now: number): DeadlineTimer {
  const d = Math.max(0, durationMs);
  return { durationMs: d, policy, deadline: now + d, pausedRemaining: null };
}

export function remainingMs(t: DeadlineTimer, now: number): number {
  if (t.pausedRemaining != null) return t.pausedRemaining;
  return Math.max(0, t.deadline - now);
}

/** Whole seconds left, rounded UP — "1" shows until the last millisecond. */
export function secondsLeft(t: DeadlineTimer, now: number): number {
  return Math.ceil(remainingMs(t, now) / 1000);
}

export function isExpired(t: DeadlineTimer, now: number): boolean {
  return remainingMs(t, now) <= 0;
}

/** Freeze the clock (explicit pause, e.g. a game-over overlay). */
export function pauseTimer(t: DeadlineTimer, now: number): DeadlineTimer {
  if (t.pausedRemaining != null) return t;
  return { ...t, pausedRemaining: remainingMs(t, now) };
}

export function resumeTimer(t: DeadlineTimer, now: number): DeadlineTimer {
  if (t.pausedRemaining == null) return t;
  return { ...t, deadline: now + t.pausedRemaining, pausedRemaining: null };
}

/**
 * The app left the foreground. Only a 'pause' timer stops; a 'run' timer's
 * deadline is untouched, which is the whole point of the policy.
 */
export function onBackground(t: DeadlineTimer, now: number): DeadlineTimer {
  return t.policy === 'pause' ? pauseTimer(t, now) : t;
}

/** The app came back. A paused 'pause' timer resumes with what was left. */
export function onForeground(t: DeadlineTimer, now: number): DeadlineTimer {
  return t.policy === 'pause' ? resumeTimer(t, now) : t;
}
