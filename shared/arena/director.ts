/**
 * arena/director — what is on screen, and for how long.
 *
 * This is the piece that decides whether the spectator page is cinema or a
 * table. Without it you inevitably build an animated leaderboard, because every
 * event becomes a row that moves; with it the CAMERA moves and the board is
 * where it rests between moments.
 *
 * The rules all exist because of a specific way the screen breaks:
 *
 *  - BOARD IS THE RESTING STATE, NOT THE ONLY STATE. A moment takes the screen
 *    and gives it back.
 *  - NOTHING IS CUT BEFORE `minDwellMs`. A scene the viewer cannot finish
 *    reading conveyed nothing, so it cost four seconds and a rewind.
 *  - NOTHING HOLDS PAST `maxDwellMs`. A screen frozen on a celebration while
 *    the next question is already live is the audience watching the past.
 *  - PRIORITY 10 PREEMPTS, BUT NOT INSIDE minDwell. This is the subtle one: a
 *    burst of big events at the end of a round would otherwise cut each other
 *    every few milliseconds and the screen strobes through five moments the
 *    room never sees.
 *  - TWO EVENTS ABOUT ONE SCHOOL ARE ONE SCENE. A `PLAYER_ENTERS_TOP_5` and the
 *    `SCHOOL_OVERTAKE` it caused played in sequence is a notification feed;
 *    composed, it is a story — *she came into the five, so they passed three
 *    schools*.
 *
 * Pure: it owns no timer and never reads the clock. `tick(now)` is the only way
 * time enters, which is what makes the whole sequence testable — and what stops
 * a `Date.now()` inside here from making the broadcast untestable forever.
 */

import { type ArenaEvent, type ArenaEventType, schoolKeyOf } from './events';

/** A scene is either the board, or one event type taking the screen. */
export type SceneKind = 'BOARD' | ArenaEventType;

export interface Scene {
  kind: SceneKind;
  /** The event driving the scene. Absent on BOARD. */
  event?: ArenaEvent;
  /**
   * Every event this scene speaks for, `event` first. One entry is the common
   * case; more means the render layer must tell one combined story rather than
   * play them back to back.
   */
  composed?: ArenaEvent[];
  /** When the scene took the screen, in the caller's clock. */
  since: number;
  /**
   * The board has been resting long enough to look stuck. The page should show
   * a closest-race callout or a streak stat — something true — rather than
   * sitting still and reading as a frozen stream.
   */
  needsAmbient?: boolean;
}

export interface DirectorOptions {
  /** A scene is never cut before it can be read. */
  minDwellMs?: number;
  /** Nothing holds the screen forever. */
  maxDwellMs?: number;
  /** Quiet board time before the page needs something to say. */
  idleMs?: number;
}

export interface Director {
  /** Queue events. Already-seen `seq`s are ignored. */
  push(events: ArenaEvent[]): void;
  /** What should be on screen at `now`. Stable by identity while unchanged. */
  tick(now: number): Scene;
}

export const DEFAULT_MIN_DWELL_MS = 2400;
export const DEFAULT_MAX_DWELL_MS = 7000;
export const DEFAULT_IDLE_MS = 20_000;

/** Only a 10 takes the screen from a scene already playing. */
export const PREEMPT_PRIORITY = 10;

export function createDirector(opts: DirectorOptions = {}): Director {
  const minDwellMs = opts.minDwellMs ?? DEFAULT_MIN_DWELL_MS;
  const maxDwellMs = opts.maxDwellMs ?? DEFAULT_MAX_DWELL_MS;
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;

  const queue: ArenaEvent[] = [];
  /**
   * Seqs already accepted. A Firestore listener re-delivers the whole events
   * collection on reconnect, and without this the screen replays every moment
   * of the match from the top the first time the venue's wifi blinks.
   */
  const seen = new Set<number>();
  let current: Scene | null = null;

  const board = (since: number, needsAmbient: boolean): Scene => ({
    kind: 'BOARD', since, needsAmbient,
  });

  /**
   * Forget events that can no longer be told honestly.
   *
   * An overtake shown after its TTL contradicts the board underneath it — the
   * lanes have already settled — so a late moment is worse than a missed one.
   */
  function dropStale(now: number): void {
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (now - queue[i].createdAt > queue[i].ttlMs) queue.splice(i, 1);
    }
  }

  /** Highest priority wins; equal priority is settled by seq, never by arrival. */
  function pickIndex(): number {
    let best = 0;
    for (let i = 1; i < queue.length; i += 1) {
      const a = queue[i];
      const b = queue[best];
      if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
    }
    return best;
  }

  /**
   * Take the next scene off the queue, absorbing everything in it about the
   * same school. The absorbed events are not replayed afterwards: they were
   * told, as part of one scene.
   */
  function takeScene(now: number): Scene {
    const primary = queue.splice(pickIndex(), 1)[0];
    const key = schoolKeyOf(primary);
    const composed: ArenaEvent[] = [primary];

    if (key) {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (schoolKeyOf(queue[i]) === key) composed.push(queue.splice(i, 1)[0]);
      }
      // Seq order after the primary, so the composed scene reads in the order
      // the match produced it rather than in queue-removal order.
      composed.sort((a, b) => (a === primary ? -1 : b === primary ? 1 : a.seq - b.seq));
    }

    return { kind: primary.type, event: primary, composed, since: now };
  }

  return {
    push(events: ArenaEvent[]): void {
      for (const event of events || []) {
        if (!event || seen.has(event.seq)) continue;
        seen.add(event.seq);
        queue.push(event);
      }
    },

    tick(now: number): Scene {
      dropStale(now);

      // The first tick establishes the board's clock. Starting it at 0 would
      // make the page ask for ambient content on its very first frame.
      if (!current) current = board(now, false);

      if (current.kind === 'BOARD') {
        if (queue.length > 0) {
          current = takeScene(now);
          return current;
        }
        const idle = now - current.since >= idleMs;
        // A new object only when the flag actually flips: the page re-renders
        // on scene identity, and a fresh object every tick would restart the
        // board's own animations several times a second.
        if (idle !== !!current.needsAmbient) current = board(current.since, idle);
        return current;
      }

      const elapsed = now - current.since;
      // Inside minDwell nothing may take the screen — not even a priority 10.
      // This is what turns a burst of champion-grade events into a readable
      // sequence instead of a strobe.
      if (elapsed < minDwellMs) return current;

      if (queue.some((e) => e.priority >= PREEMPT_PRIORITY)) {
        current = takeScene(now);
        return current;
      }

      if (elapsed >= maxDwellMs) {
        // Straight into the next moment when one is waiting. A one-frame board
        // flash between two scenes reads as a glitch, not as a return to rest;
        // the board is where we go when there is nothing left to say.
        current = queue.length > 0 ? takeScene(now) : board(now, false);
      }
      return current;
    },
  };
}
