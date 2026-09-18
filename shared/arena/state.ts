/**
 * arena/state — the tournament state machine.
 *
 * Pure and framework-free: the states live on the tournament document, but the
 * rules about which state may follow which live here, so the API route, the
 * admin run console, the player client and the broadcast all agree. A machine
 * re-implemented per surface is a machine that disagrees with itself at 18:40
 * on a stream.
 *
 *   draft ──▶ registration ──▶ doors ──▶ live ──▶ grading ──▶ provisional ──▶ final
 *                                                                │
 *                                         void ◀─────────────────┘
 *                                    (reachable from anywhere but `final`)
 *
 * Nothing about the clock is trusted to a client: states advance only by an
 * admin action or a scheduled job. This module says what is LEGAL, never when.
 */

export type ArenaState =
  | 'draft'
  | 'registration'
  | 'doors'
  | 'live'
  | 'grading'
  | 'provisional'
  | 'final'
  | 'void';

export const ARENA_STATES: readonly ArenaState[] = [
  'draft', 'registration', 'doors', 'live', 'grading', 'provisional', 'final', 'void',
];

/**
 * The happy path, one step at a time. `null` is terminal.
 *
 * `final` is terminal because prizes have been released; `void` is terminal
 * because an event that did not count cannot be un-voided into one that did —
 * re-running it means a new tournament with a new record, not a resurrection
 * of a record students have already been told was cancelled.
 */
const HAPPY_PATH: Record<ArenaState, ArenaState | null> = {
  draft: 'registration',
  registration: 'doors',
  doors: 'live',
  live: 'grading',
  grading: 'provisional',
  provisional: 'final',
  final: null,
  void: null,
};

const isArenaState = (s: ArenaState): boolean => ARENA_STATES.includes(s);

/** The next state on the happy path, or null when the tournament is over. */
export function nextState(from: ArenaState): ArenaState | null {
  if (!isArenaState(from)) return null;
  return HAPPY_PATH[from];
}

/**
 * May the tournament move from `from` to `to`?
 *
 * Three rules:
 *  - The happy path advances exactly one step. No skipping: jumping straight
 *    from `live` to `provisional` would publish standings that the grading
 *    pass never settled, and `final` released prize money without the
 *    integrity review that `provisional` exists to hold the door for.
 *  - `void` is reachable from every state except `final`. Once prizes are paid
 *    the event happened; voiding it afterwards is a refund problem, not a
 *    state transition, and pretending otherwise would let one admin click
 *    erase a published champion.
 *  - A state cannot transition to itself. Re-writing the same state is an
 *    idempotent no-op the caller should recognise as such, not a transition —
 *    treating it as one would let a "start" pressed twice emit two
 *    ROUND_START events and play the opening sequence over a live question.
 */
export function canTransition(from: ArenaState, to: ArenaState): boolean {
  if (!isArenaState(from) || !isArenaState(to)) return false;
  if (from === to) return false;
  if (to === 'void') return from !== 'final';
  return HAPPY_PATH[from] === to;
}

/**
 * Is the Arena the screen the student is on — tab bar hidden, takeover active?
 *
 * Broader than `acceptsAnswers` on purpose. The room fills at `doors` and the
 * "Calcul des scores…" hold at `grading` are both part of the night; letting a
 * student wander back into Cours during either is how they miss the first
 * question or the podium. `registration` is the Lobby and `provisional`/`final`
 * are the Result screen — neither is the takeover.
 */
export function isPlayable(state: ArenaState): boolean {
  return state === 'doors' || state === 'live' || state === 'grading';
}

/**
 * May a submission be scored?
 *
 * ONLY `live`. This is the narrow one, and the narrowness is the point: an
 * answer accepted in `grading` lands after aggregates have begun settling, so
 * it either scores in a tournament that has already been totalled or silently
 * does not — and an answer accepted in `provisional` rewrites a standing that
 * has been announced on a stream. The ~10s pause between questions is inside
 * `live`, which is exactly why late submissions are still accepted there.
 */
export function acceptsAnswers(state: ArenaState): boolean {
  return state === 'live';
}
