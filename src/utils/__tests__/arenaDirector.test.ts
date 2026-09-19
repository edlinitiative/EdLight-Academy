import {
  ARENA_EVENT_PRIORITY,
  ARENA_EVENT_TTL_MS,
  type ArenaEvent,
} from '../../../shared/arena/events';
import { createDirector } from '../../../shared/arena/director';

/**
 * An event reduced to what the director actually reads: seq, type, priority,
 * createdAt, ttlMs, and the school it is about. The payload carries both
 * `school` and `newLeader` so one helper covers every shape `schoolKeyOf`
 * inspects.
 */
const event = (
  seq: number,
  type: ArenaEvent['type'],
  opts: { schoolKey?: string; priority?: number; createdAt?: number; ttlMs?: number } = {},
): ArenaEvent => {
  const school = {
    key: opts.schoolKey ?? `school-${seq}`,
    label: `Lycée ${opts.schoolKey ?? seq}`,
    shortName: (opts.schoolKey ?? `S${seq}`).toUpperCase(),
  };
  return {
    seq,
    type,
    priority: opts.priority ?? ARENA_EVENT_PRIORITY[type],
    createdAt: opts.createdAt ?? 0,
    round: 1,
    questionIndex: 1,
    ttlMs: opts.ttlMs ?? ARENA_EVENT_TTL_MS[type],
    payload: { school, newLeader: school },
  } as unknown as ArenaEvent;
};

const overtake = (seq: number, schoolKey: string, over = {}) =>
  event(seq, 'SCHOOL_OVERTAKE', { schoolKey, ...over });
const substitution = (seq: number, schoolKey: string, over = {}) =>
  event(seq, 'PLAYER_ENTERS_TOP_5', { schoolKey, ...over });
const leadChange = (seq: number, schoolKey: string, over = {}) =>
  event(seq, 'LEAD_CHANGE', { schoolKey, ...over });
const championSchool = (seq: number, over = {}) =>
  event(seq, 'CHAMPION_SCHOOL', { schoolKey: undefined, ...over });
const championIndividual = (seq: number, over = {}) =>
  event(seq, 'CHAMPION_INDIVIDUAL', { schoolKey: undefined, ...over });
const halftime = (seq: number, over = {}) =>
  event(seq, 'HALFTIME', { schoolKey: undefined, ...over });

describe('director — the board is the resting state, not the only state', () => {
  it('opens on the board and returns the same scene while nothing has happened', () => {
    const director = createDirector();

    const first = director.tick(0);
    expect(first.kind).toBe('BOARD');
    expect(first.since).toBe(0);
    expect(first.needsAmbient).toBe(false);
    // Identity is stable so the page does not restart the board's own
    // animations on every tick of the clock.
    expect(director.tick(1200)).toBe(first);
  });

  it('gives a moment the screen as soon as one arrives, and gives it back afterwards', () => {
    const director = createDirector();
    director.tick(0);
    director.push([overtake(1, 'codosa')]);

    const moment = director.tick(500);
    expect(moment.kind).toBe('SCHOOL_OVERTAKE');
    expect(moment.since).toBe(500);
    expect(moment.event?.seq).toBe(1);

    expect(director.tick(7499).kind).toBe('SCHOOL_OVERTAKE');
    const back = director.tick(7500); // 500 + maxDwell
    expect(back.kind).toBe('BOARD');
    expect(back.since).toBe(7500);
  });
});

describe('director — dwell', () => {
  it('never cuts a scene before it can be read, not even for a priority 10', () => {
    const director = createDirector();
    director.push([overtake(1, 'codosa')]);
    expect(director.tick(0).kind).toBe('SCHOOL_OVERTAKE');

    director.push([leadChange(2, 'sldg')]);

    // Inside minDwell the big event waits. A burst of priority 10s cutting each
    // other on arrival is a strobe, and the room reads none of them.
    expect(director.tick(1).kind).toBe('SCHOOL_OVERTAKE');
    expect(director.tick(1200).kind).toBe('SCHOOL_OVERTAKE');
    expect(director.tick(2399).kind).toBe('SCHOOL_OVERTAKE');

    const preempted = director.tick(2400);
    expect(preempted.kind).toBe('LEAD_CHANGE');
    expect(preempted.since).toBe(2400);
    // And the preempting scene now gets its own full minDwell.
    expect(director.tick(4799).kind).toBe('LEAD_CHANGE');
  });

  it('lets a lower-priority moment wait its turn rather than preempting after minDwell', () => {
    const director = createDirector();
    director.push([leadChange(1, 'codosa')]);
    expect(director.tick(0).kind).toBe('LEAD_CHANGE');

    director.push([overtake(2, 'sldg')]);
    expect(director.tick(2400).kind).toBe('LEAD_CHANGE');
    expect(director.tick(6999).kind).toBe('LEAD_CHANGE');
    expect(director.tick(7000).kind).toBe('SCHOOL_OVERTAKE');
  });

  it('goes straight into the next queued moment at maxDwell, so the board does not flash between scenes', () => {
    const director = createDirector();
    director.push([overtake(1, 'codosa'), overtake(2, 'sldg')]);

    expect(director.tick(0).event?.seq).toBe(1);
    const second = director.tick(7000);
    expect(second.event?.seq).toBe(2);
    expect(second.since).toBe(7000);
    expect(director.tick(14000).kind).toBe('BOARD');
  });

  /*
   * The champion reveal is two priority-10 events, emitted TOGETHER by
   * api/arena/state.ts on grading → provisional, and meant to play one after
   * the other — section K gives CHAMPION_SCHOOL ~15s and CHAMPION_INDIVIDUAL
   * ~10s. Before this fix the second, already sitting in queue at the same
   * priority, cut the first at minDwell (2.4s) regardless of maxDwell: any
   * priority ≥ 10 in queue preempted, with no check against what was already
   * playing.
   */
  it('does not let a same-priority scene steal the screen from another at minDwell', () => {
    const director = createDirector();
    director.push([championSchool(1), championIndividual(2)]);

    const first = director.tick(0);
    expect(first.kind).toBe('CHAMPION_SCHOOL');

    // Past minDwell, with CHAMPION_INDIVIDUAL (same priority) still queued —
    // the old bug fired exactly here.
    expect(director.tick(2400).kind).toBe('CHAMPION_SCHOOL');
    expect(director.tick(6999).kind).toBe('CHAMPION_SCHOOL');

    // It still ends, at its own maxDwell, and hands off to what was waiting —
    // same-priority events are not stuck forever, only not trampled early.
    const second = director.tick(7000);
    expect(second.kind).toBe('CHAMPION_INDIVIDUAL');
    expect(second.since).toBe(7000);
  });

  it('still lets a STRICTLY higher priority cut in past minDwell — the same-priority rule does not become "nothing preempts"', () => {
    const director = createDirector();
    director.push([overtake(1, 'codosa')]); // priority 8
    expect(director.tick(0).kind).toBe('SCHOOL_OVERTAKE');

    director.push([leadChange(2, 'sldg')]); // priority 10
    expect(director.tick(2400).kind).toBe('LEAD_CHANGE');
  });
});

describe('director — per-kind dwell ceilings', () => {
  it('holds a scene named in maxDwellByKind past the global ceiling', () => {
    const director = createDirector({ maxDwellByKind: { HALFTIME: 120_000 } });
    director.push([halftime(1)]);
    expect(director.tick(0).kind).toBe('HALFTIME');

    // Well past the GLOBAL default (7000ms) — still holding, because HALFTIME
    // has its own ceiling.
    expect(director.tick(60_000).kind).toBe('HALFTIME');
    expect(director.tick(119_999).kind).toBe('HALFTIME');
    expect(director.tick(120_000).kind).toBe('BOARD');
  });

  it('a kind with no override still falls back to the global maxDwellMs', () => {
    const director = createDirector({ maxDwellByKind: { HALFTIME: 120_000 } });
    director.push([overtake(1, 'codosa')]);
    expect(director.tick(0).kind).toBe('SCHOOL_OVERTAKE');
    expect(director.tick(6999).kind).toBe('SCHOOL_OVERTAKE');
    expect(director.tick(7000).kind).toBe('BOARD');
  });
});

describe('director — composition is what makes this storytelling and not a feed', () => {
  it('folds two events about the same school into ONE scene', () => {
    const director = createDirector();
    director.push([
      overtake(1, 'codosa'),
      substitution(2, 'codosa'),
      overtake(3, 'sldg'),
    ]);

    const scene = director.tick(0);
    expect(scene.kind).toBe('SCHOOL_OVERTAKE');
    expect(scene.composed?.map((e) => e.seq)).toEqual([1, 2]);
    expect(scene.composed?.map((e) => e.type))
      .toEqual(['SCHOOL_OVERTAKE', 'PLAYER_ENTERS_TOP_5']);
  });

  it('does not replay a composed event afterwards, because it has already been told', () => {
    const director = createDirector();
    director.push([
      overtake(1, 'codosa'),
      substitution(2, 'codosa'),
      overtake(3, 'sldg'),
    ]);

    director.tick(0);
    expect(director.tick(7000).event?.seq).toBe(3); // sldg, not codosa again
    expect(director.tick(14000).kind).toBe('BOARD');
  });

  it('never composes events about different schools, which would merge two unrelated stories', () => {
    const director = createDirector();
    director.push([overtake(1, 'codosa'), substitution(2, 'sldg')]);

    const scene = director.tick(0);
    expect(scene.composed?.map((e) => e.seq)).toEqual([1]);
  });
});

describe('director — what it refuses to show', () => {
  it('skips an event past its ttl rather than contradicting the board underneath it', () => {
    const director = createDirector();
    director.push([overtake(1, 'codosa', { createdAt: 0, ttlMs: 5000 })]);

    expect(director.tick(6000).kind).toBe('BOARD');

    // A fresh event still plays: it is the staleness that was refused, not the
    // school.
    director.push([overtake(2, 'codosa', { createdAt: 6000, ttlMs: 5000 })]);
    expect(director.tick(6500).event?.seq).toBe(2);
  });

  it('ignores an event it has already accepted, because a reconnect re-delivers the whole feed', () => {
    const director = createDirector();
    const replayed = overtake(1, 'codosa');
    director.push([replayed]);
    expect(director.tick(0).kind).toBe('SCHOOL_OVERTAKE');
    expect(director.tick(7000).kind).toBe('BOARD');

    director.push([replayed, replayed]);
    expect(director.tick(7100).kind).toBe('BOARD');
  });
});

describe('director — silence', () => {
  it('asks for ambient content once the board has rested too long', () => {
    const director = createDirector();
    director.tick(0);

    expect(director.tick(19_999).needsAmbient).toBe(false);
    const ambient = director.tick(20_000);
    expect(ambient.kind).toBe('BOARD');
    expect(ambient.needsAmbient).toBe(true);
    // Still the same resting scene — the board did not restart, it acquired a
    // reason to say something.
    expect(ambient.since).toBe(0);
  });

  it('restarts the quiet clock when a moment hands the screen back', () => {
    const director = createDirector();
    director.push([overtake(1, 'codosa')]);
    director.tick(0);
    expect(director.tick(7000).kind).toBe('BOARD');

    expect(director.tick(26_999).needsAmbient).toBe(false);
    expect(director.tick(27_000).needsAmbient).toBe(true);
  });
});

describe('director — one round, end to end', () => {
  it('plays the exact sequence the round earned', () => {
    const director = createDirector({ minDwellMs: 2400, maxDwellMs: 7000, idleMs: 20_000 });
    const seen: Array<[number, string, number | undefined]> = [];
    const at = (now: number) => {
      const scene = director.tick(now);
      seen.push([now, scene.kind, scene.event?.seq]);
    };

    at(0);                                            // board, nothing yet
    director.push([
      overtake(10, 'codosa'),
      substitution(11, 'codosa'),
      overtake(12, 'sldg', { createdAt: 0, ttlMs: 5000 }),
    ]);
    at(1000);                                         // codosa takes the screen
    director.push([leadChange(13, 'jbsa', { createdAt: 1500 })]);
    at(2000);                                         // still codosa: inside minDwell
    at(3400);                                         // the lead change preempts
    at(10_500);                                       // it held its maxDwell; sldg's overtake went stale
    at(30_000);                                       // back on the board, not yet quiet enough

    expect(seen).toEqual([
      [0, 'BOARD', undefined],
      [1000, 'SCHOOL_OVERTAKE', 10],
      [2000, 'SCHOOL_OVERTAKE', 10],
      [3400, 'LEAD_CHANGE', 13],
      [10_500, 'BOARD', undefined],
      [30_000, 'BOARD', undefined],
    ]);
    expect(director.tick(30_499).needsAmbient).toBe(false);
    expect(director.tick(30_500).needsAmbient).toBe(true);
  });
});
