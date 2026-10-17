/**
 * The three authored sequences as state-machine definitions — pure data, so
 * they are unit-tested on their own and read 1:1 into RIVE-PORT.md.
 */
import { defineMachine } from './stateMachine';
import { DUR } from './tokens';

// ─── Opponent reveal (brief #8, #9) ─────────────────────────────────────────
//
// Authoritative inputs come from the matchmaking server (search, match,
// cancel, fail, start). `found` and `introduce` are cosmetic: together they
// last exactly one routine intro (DUR.intro), and `start` — the match phase
// actually beginning — preempts them.

export const REVEAL_TIMING = { found: 550, introduce: DUR.intro - 550 } as const;

export type RevealState = 'idle' | 'searching' | 'found' | 'introduce' | 'settled' | 'cancelled' | 'failed';
export type RevealTrigger = 'search' | 'match' | 'cancel' | 'fail' | 'start' | 'reset';
export const REVEAL_STATES: RevealState[] = ['idle', 'searching', 'found', 'introduce', 'settled', 'cancelled', 'failed'];

export const revealMachine = defineMachine<RevealState, RevealTrigger, Record<string, never>>({
  id: 'opponentReveal',
  initial: 'idle',
  inputs: {},
  any: {
    reset: 'idle',
    // The match phase began: whatever cosmetic beat is running, land now.
    start: [{ to: 'settled' }],
  },
  states: {
    idle: {
      on: { search: 'searching', match: 'settled' }, // `match` here = reconnect: recover, don't replay
      note: 'Own card centred. Nothing implies a search is running.',
    },
    searching: {
      on: { match: 'found', cancel: 'cancelled', fail: 'failed' },
      note: 'Rings pulse around the own card; real elapsed time; Cancel visible.',
    },
    found: {
      cosmetic: true,
      after: { ms: REVEAL_TIMING.found, to: 'introduce' },
      note: 'Light flash; own card glides to its side; opponent slides in from the opposite edge.',
    },
    introduce: {
      cosmetic: true,
      after: { ms: REVEAL_TIMING.introduce, to: 'settled' },
      note: 'School-colour washes fill each half; VS lockup stamps at the seam.',
    },
    settled: { note: 'Static matchup. Holds until the next scene.' },
    cancelled: { on: { search: 'searching' }, note: 'Truthful: search stopped by the student.' },
    failed: { on: { search: 'searching' }, note: 'Truthful: search failed; retry offered.' },
  },
});

// ─── Ready countdown (brief #10) ───────────────────────────────────────────
//
// Driven by NUMBER input `remaining` (ms until the real start) and BOOLEAN
// `armed`. Each state's condition transitions read the clock-derived value,
// so the shown beat is always the one the clock says — it cannot drift, and a
// tab that slept lands on the right beat instead of replaying old ones.

export const GO_HOLD_MS = 800;
export type CountdownState = 'idle' | 'three' | 'two' | 'one' | 'go' | 'done';
export const COUNTDOWN_STATES: CountdownState[] = ['idle', 'three', 'two', 'one', 'go', 'done'];
export type CountdownInputs = { remaining: number; armed: boolean };
/** Where each beat begins, relative to the start (ms). */
export const BEAT_OFFSET: Record<Exclude<CountdownState, 'idle'>, number> = {
  three: -3000, two: -2000, one: -1000, go: 0, done: GO_HOLD_MS,
};

export function beatAt({ remaining, armed }: CountdownInputs): CountdownState {
  if (!armed) return 'idle';
  if (remaining > 3000) return 'idle';
  if (remaining > 2000) return 'three';
  if (remaining > 1000) return 'two';
  if (remaining > 0) return 'one';
  if (remaining > -GO_HOLD_MS) return 'go';
  return 'done';
}

const toBeat = COUNTDOWN_STATES.map((to) => ({ to, guard: (i: CountdownInputs) => beatAt(i) === to }));

export const countdownMachine = defineMachine<CountdownState, 'reset', CountdownInputs>({
  id: 'readyCountdown',
  initial: 'idle',
  inputs: { remaining: Infinity, armed: false },
  states: {
    idle: { always: toBeat, note: 'Unarmed, or more than 3 s out ("Départ dans N s").' },
    three: { always: toBeat, note: 'Beat 1. remaining ∈ (2000, 3000].' },
    two: { always: toBeat, note: 'Beat 2. remaining ∈ (1000, 2000].' },
    one: { always: toBeat, note: 'Beat 3. remaining ∈ (0, 1000].' },
    go: { always: toBeat, note: `The real start. Held ${GO_HOLD_MS} ms.` },
    done: { always: toBeat, note: 'Countdown hands over to the question.' },
  },
});

// ─── Trophy ceremony (brief #19, "Championship ceremony") ──────────────────
//
// The winner reveal (dark → … → settled) is reachable ONLY through `confirm`.
// `provisional` and `tie` are Any-State transitions: an authoritative result
// change preempts a running ceremony. `skip` exists only on the cosmetic beats.

export const CEREMONY_TIMING = { dark: 500, anticipation: 1500, reveal: 1700, roster: 1800 } as const;

export type CeremonyState = 'waiting' | 'dark' | 'anticipation' | 'reveal' | 'roster' | 'settled' | 'provisional' | 'tie';
export type CeremonyTrigger = 'confirm' | 'provisional' | 'tie' | 'skip' | 'replay' | 'restore' | 'reset';
export const CEREMONY_STATES: CeremonyState[] = ['waiting', 'dark', 'anticipation', 'reveal', 'roster', 'settled', 'provisional', 'tie'];

const skippable = { skip: 'settled' as const };

export const ceremonyMachine = defineMachine<CeremonyState, CeremonyTrigger, Record<string, never>>({
  id: 'trophyCeremony',
  initial: 'waiting',
  inputs: {},
  any: { provisional: 'provisional', tie: 'tie', reset: 'waiting' },
  states: {
    waiting: { on: { confirm: 'dark', restore: 'settled' }, note: 'No result yet.' },
    dark: {
      cosmetic: true, on: skippable, after: { ms: CEREMONY_TIMING.dark, to: 'anticipation' },
      note: 'House lights down. Event identity stays visible.',
    },
    anticipation: {
      cosmetic: true, on: skippable, after: { ms: CEREMONY_TIMING.anticipation, to: 'reveal' },
      note: 'Two spotlights sweep in and converge on the empty plinth.',
    },
    reveal: {
      cosmetic: true, on: skippable, after: { ms: CEREMONY_TIMING.reveal, to: 'roster' },
      note: 'Trophy rises; one gold sheen pass; winning school name.',
    },
    roster: {
      cosmetic: true, on: skippable, after: { ms: CEREMONY_TIMING.roster, to: 'settled' },
      note: 'Roster names appear one by one.',
    },
    settled: { on: { replay: 'dark' }, note: 'Static, shareable final composition. Keeps the result.' },
    provisional: { on: { confirm: 'dark', restore: 'settled' }, note: 'Explicitly provisional. No winner, no gold.' },
    tie: { on: { confirm: 'dark', restore: 'settled' }, note: 'Tied schools shown equally. No winner, no gold.' },
  },
});
