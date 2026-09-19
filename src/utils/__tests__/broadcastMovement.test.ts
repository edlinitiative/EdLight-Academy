/**
 * The arithmetic behind the movement sequences (`src/broadcast/scenes/movement.ts`).
 *
 * The stage is not wired to a route yet and a scene cannot be watched, so this
 * is where the sequences are actually verified: every rule in section K that is
 * a NUMBER — where a lane starts so that it travels, what shape a comeback
 * drew, what a counter reads at a given millisecond, which players get named —
 * is checked here rather than by rendering React.
 *
 * The rules being defended, in the order they break:
 *   1. a lane never teleports, and the lanes it passed move with it;
 *   2. a comeback's path contains only points that happened;
 *   3. a counter lands on the truth and holds it, and reduced motion starts
 *      there;
 *   4. a composed scene names each student once.
 */

import {
  composedKinds,
  countUpAt,
  easeOutStage,
  laneWindow,
  mergeCauses,
  movementClause,
  namedCauses,
  overtakeTravel,
  polylinePoints,
  progressAt,
  rankPath,
  rankPathPoints,
  sceneCauses,
  schoolHue,
  substitutionSlots,
  tieCountdownStart,
  tieMarginAt,
  valueAt,
} from '../../broadcast/scenes/movement';
import type { ArenaCause, ArenaEvent } from '../../../shared/arena/events';
import type { Scene } from '../../../shared/arena/director';

// ── Test doubles ────────────────────────────────────────────────────────────

const cause = (uid: string, gained: number): ArenaCause => ({
  uid, displayName: uid.toUpperCase(), schoolKey: 'sch', gained,
});

const event = (type: string, payload: unknown, seq = 1): ArenaEvent => ({
  seq,
  type,
  priority: 8,
  createdAt: 0,
  round: 1,
  questionIndex: 1,
  ttlMs: 12_000,
  payload,
} as unknown as ArenaEvent);

const scene = (events: ArenaEvent[]): Scene => ({
  kind: events[0]?.type ?? 'BOARD',
  event: events[0],
  composed: events,
  since: 0,
} as Scene);

// ── The clock ───────────────────────────────────────────────────────────────

describe('progressAt', () => {
  it('is zero before the beat starts and one after it ends', () => {
    expect(progressAt(0, { delayMs: 200, durationMs: 1000 })).toBe(0);
    expect(progressAt(200, { delayMs: 200, durationMs: 1000 })).toBe(0);
    expect(progressAt(700, { delayMs: 200, durationMs: 1000 })).toBe(0.5);
    expect(progressAt(1200, { delayMs: 200, durationMs: 1000 })).toBe(1);
    expect(progressAt(9999, { delayMs: 200, durationMs: 1000 })).toBe(1);
  });

  it('never divides by zero', () => {
    expect(progressAt(50, { durationMs: 0 })).toBe(1);
  });
});

describe('easeOutStage', () => {
  it('starts at 0, ends at 1 and is monotonic', () => {
    expect(easeOutStage(0)).toBe(0);
    expect(easeOutStage(1)).toBe(1);
    let last = -1;
    for (let x = 0; x <= 1.001; x += 0.05) {
      const y = easeOutStage(x);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
    }
  });

  it('spends most of its time near the value it will hold', () => {
    // The whole reason for an ease-out on a counter: half way through the
    // beat the figure is already most of the way to the truth.
    expect(easeOutStage(0.5)).toBeGreaterThan(0.9);
  });

  it('clamps out-of-range input rather than overshooting', () => {
    expect(easeOutStage(-3)).toBe(0);
    expect(easeOutStage(4)).toBe(1);
  });
});

describe('counting', () => {
  it('counts up from zero and lands exactly on the target', () => {
    expect(countUpAt(240, 0, { delayMs: 100, durationMs: 1000 })).toBe(0);
    expect(countUpAt(240, 1100, { delayMs: 100, durationMs: 1000 })).toBe(240);
    const mid = countUpAt(240, 600, { delayMs: 100, durationMs: 1000 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(240);
  });

  it('holds the target for the rest of the scene', () => {
    expect(countUpAt(240, 4000, { durationMs: 1000 })).toBe(240);
    expect(countUpAt(240, 45_000, { durationMs: 1000 })).toBe(240);
  });

  it('starts on the truth under reduced motion — the information never goes', () => {
    expect(countUpAt(240, 0, { delayMs: 500, durationMs: 1000 }, true)).toBe(240);
    expect(valueAt(180, 240, 0, { durationMs: 1000 }, true)).toBe(240);
  });

  it('counts a substitution from the real previous average, not from zero', () => {
    // `newTeamAvg - delta` is what the board actually read a moment ago.
    expect(valueAt(212, 220, 0, { durationMs: 1000 })).toBe(212);
    expect(valueAt(212, 220, 5000, { durationMs: 1000 })).toBe(220);
  });
});

describe('the tie margin', () => {
  it('opens at a round figure above the true gap', () => {
    expect(tieCountdownStart(0.42)).toBe(2);
    expect(tieCountdownStart(0.98)).toBe(2);
    expect(tieCountdownStart(1.4)).toBe(3);
    expect(tieCountdownStart(0)).toBe(1);
  });

  it('counts down onto the true margin and then holds it', () => {
    const margin = 0.42;
    const opening = tieMarginAt(margin, 0, { delayMs: 200, durationMs: 1000 });
    expect(opening).toBe(tieCountdownStart(margin));
    expect(tieMarginAt(margin, 1200, { delayMs: 200, durationMs: 1000 })).toBeCloseTo(margin, 10);
    expect(tieMarginAt(margin, 3000, { delayMs: 200, durationMs: 1000 })).toBeCloseTo(margin, 10);
  });

  it('never counts up — the gap only ever closes', () => {
    const at = (ms: number) => tieMarginAt(0.3, ms, { durationMs: 1000 });
    expect(at(0)).toBeGreaterThan(at(300));
    expect(at(300)).toBeGreaterThan(at(600));
    expect(at(600)).toBeGreaterThanOrEqual(at(1000));
  });

  it('shows the true margin immediately under reduced motion', () => {
    expect(tieMarginAt(0.42, 0, { durationMs: 1000 }, true)).toBe(0.42);
  });
});

// ── The travel ──────────────────────────────────────────────────────────────

describe('overtakeTravel', () => {
  const ranks = [1, 2, 3, 4, 5, 6];

  it('starts the climbing lane where it was, so it travels to where it is', () => {
    const travel = overtakeTravel(5, 3, ranks, 1);
    const mover = travel.find((l) => l.role === 'mover');
    expect(mover).toEqual({ rank: 3, role: 'mover', offset: 2 });
  });

  it('moves the lanes it passed in the same motion', () => {
    const travel = overtakeTravel(5, 3, ranks, 1);
    const passed = travel.filter((l) => l.role === 'passed').map((l) => l.rank);
    // Ranks 4 and 5 now hold the places the climber came through; each was one
    // place higher a moment ago, so each starts one lane above.
    expect(passed).toEqual([4, 5]);
    for (const lane of travel.filter((l) => l.role === 'passed')) {
      expect(lane.offset).toBe(-1);
    }
  });

  it('leaves every other lane exactly where it is', () => {
    const travel = overtakeTravel(5, 3, ranks, 1);
    const still = travel.filter((l) => l.role === 'still');
    expect(still.map((l) => l.rank)).toEqual([1, 2, 6]);
    expect(still.every((l) => l.offset === 0)).toBe(true);
  });

  it('scales to whatever unit the caller measures a lane in', () => {
    const travel = overtakeTravel(4, 1, [1, 2, 3, 4], 72);
    expect(travel[0]).toEqual({ rank: 1, role: 'mover', offset: 216 });
    expect(travel[1].offset).toBe(-72);
  });

  it('moves nothing when nothing climbed', () => {
    for (const [from, to] of [[3, 3], [2, 5], [0, 0]]) {
      const travel = overtakeTravel(from, to, ranks, 1);
      expect(travel.every((l) => l.role === 'still' && l.offset === 0)).toBe(true);
    }
  });

  it('survives an empty board', () => {
    expect(overtakeTravel(5, 1, [], 1)).toEqual([]);
  });
});

describe('laneWindow', () => {
  it('shows the top of the board when the moment is at the top', () => {
    expect(laneWindow(20, [1, 3], 8)).toEqual({ start: 1, end: 8 });
  });

  it('follows the moment down the board rather than cutting it off', () => {
    // A climb from 11 to 4 shown on a top-8 board is a lane out of nowhere.
    const window = laneWindow(20, [11, 4], 8);
    expect(window.start).toBeLessThanOrEqual(4);
    expect(window.end).toBeGreaterThanOrEqual(11);
  });

  it('centres a small moment inside the window', () => {
    expect(laneWindow(20, [12, 13], 6)).toEqual({ start: 10, end: 15 });
  });

  it('never runs off either end of the board', () => {
    expect(laneWindow(20, [19, 20], 6)).toEqual({ start: 15, end: 20 });
    expect(laneWindow(4, [2], 8)).toEqual({ start: 1, end: 4 });
  });

  it('falls back to the top when the ranks make no sense', () => {
    expect(laneWindow(10, [0, 99], 5)).toEqual({ start: 1, end: 5 });
    expect(laneWindow(10, [], 5)).toEqual({ start: 1, end: 5 });
  });
});

// ── The comeback's shape ────────────────────────────────────────────────────

describe('rankPath', () => {
  it('draws the worst position and now when nothing else is known', () => {
    expect(rankPath(12, 3)).toEqual([12, 3]);
  });

  it('uses the real steps the director composed into the scene', () => {
    expect(rankPath(12, 3, [{ from: 12, to: 8 }, { from: 8, to: 5 }, { from: 5, to: 3 }]))
      .toEqual([12, 8, 5, 3]);
  });

  it('never repeats a point', () => {
    expect(rankPath(12, 3, [{ from: 12, to: 12 }, { from: 12, to: 3 }])).toEqual([12, 3]);
  });

  it('drops steps from outside the climb rather than inventing a detour', () => {
    expect(rankPath(12, 3, [{ from: 19, to: 14 }, { from: 8, to: 6 }])).toEqual([12, 8, 6, 3]);
  });

  it('always has two points, so a line can be drawn', () => {
    expect(rankPath(4, 4)).toEqual([4, 4]);
  });

  it('ignores nonsense ranks', () => {
    expect(rankPath(0, 0)).toEqual([]);
    expect(rankPath(9, 2, [{ from: NaN, to: 5 }])).toEqual([9, 5, 2]);
  });
});

describe('rankPathPoints', () => {
  it('puts the best rank on the top edge and the worst on the bottom', () => {
    const points = rankPathPoints([12, 8, 3], 900, 200);
    expect(points[0]).toEqual({ x: 0, y: 200 });
    expect(points[2]).toEqual({ x: 900, y: 0 });
    expect(points[1].x).toBe(450);
    expect(points[1].y).toBeGreaterThan(0);
    expect(points[1].y).toBeLessThan(200);
  });

  it('centres a path that never moved instead of dividing by zero', () => {
    expect(rankPathPoints([5, 5], 900, 200)).toEqual([
      { x: 0, y: 100 },
      { x: 900, y: 100 },
    ]);
  });

  it('renders as an SVG points list', () => {
    expect(polylinePoints(rankPathPoints([2, 1], 100, 50))).toBe('0,50 100,0');
    expect(polylinePoints([])).toBe('');
  });

  it('has nothing to draw for an empty path', () => {
    expect(rankPathPoints([], 900, 200)).toEqual([]);
  });
});

// ── Who caused it ───────────────────────────────────────────────────────────

describe('causes', () => {
  it('names a student once across a composed scene', () => {
    const merged = mergeCauses([
      [cause('ana', 12), cause('bo', 8)],
      [cause('ana', 5)],
    ]);
    expect(merged.map((c) => c.uid)).toEqual(['ana', 'bo']);
  });

  it('never inflates a gain by adding the same answer up twice', () => {
    // The emitter hands the SAME `causedBy` to every event it derives for a
    // school in one question, so a composed scene sees the same 12 points
    // twice. Reading "+24" out on a stage is not a rounding error.
    const merged = mergeCauses([[cause('ana', 12)], [cause('ana', 12)], [cause('ana', 7)]]);
    expect(merged).toEqual([{ uid: 'ana', displayName: 'ANA', schoolKey: 'sch', gained: 12 }]);
  });

  it('orders by the size of the gain, then by uid so nothing flickers', () => {
    const merged = mergeCauses([[cause('zed', 9), cause('abe', 9), cause('mo', 20)]]);
    expect(merged.map((c) => c.uid)).toEqual(['mo', 'abe', 'zed']);
  });

  it('reads every event the scene speaks for', () => {
    const composed = scene([
      event('PLAYER_ENTERS_TOP_5', { causedBy: [cause('ana', 10)] }, 1),
      event('SCHOOL_OVERTAKE', { causedBy: [cause('ana', 4), cause('bo', 6)] }, 2),
    ]);
    expect(sceneCauses(composed).map((c) => [c.uid, c.gained])).toEqual([['ana', 10], ['bo', 6]]);
  });

  it('survives a payload that carries no cause at all', () => {
    expect(sceneCauses(scene([event('TIE', { margin: 0.4 })]))).toEqual([]);
    expect(sceneCauses({ kind: 'BOARD', since: 0 } as Scene)).toEqual([]);
    expect(mergeCauses([[null as unknown as ArenaCause], []])).toEqual([]);
  });

  it('names three and counts the rest', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((u, i) => cause(u, 10 - i));
    const { named, others } = namedCauses(many);
    expect(named.map((c) => c.uid)).toEqual(['a', 'b', 'c']);
    expect(others).toBe(2);
    expect(namedCauses([cause('a', 1)]).others).toBe(0);
  });
});

describe('composition', () => {
  const t = (fr: string) => fr;

  it('lists the other events once each, primary excluded', () => {
    const composed = scene([
      event('LEAD_CHANGE', {}, 1),
      event('SCHOOL_OVERTAKE', {}, 2),
      event('SCHOOL_OVERTAKE', {}, 3),
      event('PLAYER_ENTERS_TOP_5', {}, 4),
    ]);
    expect(composedKinds(composed)).toEqual(['SCHOOL_OVERTAKE', 'PLAYER_ENTERS_TOP_5']);
  });

  it('has nothing to add when the scene speaks for one event', () => {
    expect(composedKinds(scene([event('LEAD_CHANGE', {})]))).toEqual([]);
  });

  it('gives every movement kind a clause, and no two the same', () => {
    const kinds = [
      'LEAD_CHANGE', 'SCHOOL_OVERTAKE', 'PLAYER_ENTERS_TOP_5', 'PLAYER_LEAVES_TOP_5',
      'PERFECT_ROUND', 'PLAYER_STREAK', 'SCHOOL_STREAK', 'COMEBACK', 'BIGGEST_CLIMBER',
      'PLAYER_CARRY',
    ] as const;
    const clauses = kinds.map((k) => movementClause(k, t));
    expect(clauses.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
    expect(new Set(clauses).size).toBe(kinds.length);
  });

  it('says nothing about a scene that is not a movement', () => {
    expect(movementClause('GRADING', t)).toBeNull();
  });
});

// ── The five ────────────────────────────────────────────────────────────────

describe('substitutionSlots', () => {
  const five = ['a', 'b', 'c', 'd', 'e'];

  it('marks the arriving player and the slot they came into', () => {
    const { slots, vacatedIndex } = substitutionSlots(five, 'c');
    expect(slots).toHaveLength(5);
    expect(vacatedIndex).toBe(2);
    expect(slots[2].role).toBe('incoming');
    expect(slots.filter((s) => s.role === 'incoming')).toHaveLength(1);
  });

  it('keeps the standings order for everyone who held their place', () => {
    const { slots } = substitutionSlots(five, 'c');
    expect(slots.map((s) => s.uid)).toEqual(five);
  });

  it('still shows the newcomer when the standings have not caught up', () => {
    const { slots, vacatedIndex } = substitutionSlots(['a', 'b', 'c', 'd'], 'z');
    expect(slots.map((s) => s.uid)).toEqual(['a', 'b', 'c', 'd', 'z']);
    expect(vacatedIndex).toBe(4);
  });

  it('never grows past five', () => {
    expect(substitutionSlots(['a', 'b', 'c', 'd', 'e', 'f'], 'z').slots).toHaveLength(5);
  });

  it('has no incoming slot when there is nobody arriving', () => {
    const { slots, vacatedIndex } = substitutionSlots(five, null);
    expect(vacatedIndex).toBe(-1);
    expect(slots.every((s) => s.role === 'held')).toBe(true);
  });

  it('survives a school with no five at all', () => {
    expect(substitutionSlots([], null)).toEqual({ slots: [], vacatedIndex: -1 });
  });
});

// ── Identity ────────────────────────────────────────────────────────────────

describe('schoolHue', () => {
  it('gives the same school the same lane colour on every screen', () => {
    expect(schoolHue('codosa')).toBe(schoolHue('codosa'));
  });

  it('is always a usable hue', () => {
    for (const key of ['codosa', 'sldg', '', 'lycée-des-jeunes-filles', 'x']) {
      const hue = schoolHue(key);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('separates schools rather than collapsing them onto one colour', () => {
    const keys = ['codosa', 'sldg', 'cndm', 'lyceej', 'stlouis', 'jeanmarie'];
    expect(new Set(keys.map(schoolHue)).size).toBeGreaterThan(keys.length - 2);
  });
});
