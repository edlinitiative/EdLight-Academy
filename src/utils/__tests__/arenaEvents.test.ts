import {
  deriveEvents,
  schoolKeyOf,
  ARENA_ROUND_EVENT_CAP,
  type ArenaEvent,
  type DeriveContext,
  type IndividualStanding,
  type SchoolStanding,
  type StandingsSnapshot,
} from '../../../shared/arena/events';

/** One player as the aggregator writes them onto the standings doc. */
interface Squad {
  uid: string;
  score: number;
  streak?: number;
  perfectRound?: boolean;
}

interface Row {
  key: string;
  rank: number;
  /** The five that count. teamAvg is their mean, the way the school is scored. */
  five: Squad[];
  /** Players on the board but outside the five. */
  bench?: Squad[];
}

/** `squad('a', [900, 900])` → a1 and a2, both on 900. */
const squad = (key: string, scores: number[], startAt = 1): Squad[] =>
  scores.map((score, i) => ({ uid: `${key}${startAt + i}`, score }));

const build = (rows: Row[], seq = 1): StandingsSnapshot => {
  const schools: SchoolStanding[] = rows.map((r) => ({
    key: r.key,
    label: `Lycée ${r.key.toUpperCase()}`,
    shortName: r.key.toUpperCase(),
    teamAvg: r.five.reduce((n, p) => n + p.score, 0) / r.five.length,
    counted: r.five.length,
    members: r.five.length + (r.bench?.length ?? 0),
    qualified: r.rank > 0,
    rank: r.rank,
    top5: r.five.map((p) => p.uid),
  }));
  const individuals: IndividualStanding[] = rows.flatMap((r) =>
    [...r.five, ...(r.bench ?? [])].map((p) => ({
      uid: p.uid,
      displayName: p.uid.toUpperCase(),
      schoolKey: r.key,
      schoolShort: r.key.toUpperCase(),
      score: p.score,
      correct: 0,
      avgMs: 9000,
      rank: 0,
      streak: p.streak ?? 0,
      perfectRound: p.perfectRound ?? false,
    })),
  );
  return { seq, computedAt: 0, schools, individuals };
};

const ctx = (over: Partial<DeriveContext> = {}): DeriveContext => ({
  seq: 100,
  round: 3,
  questionIndex: 3,
  questionsRemaining: 20,
  totalQuestions: 25,
  now: 1_000_000,
  ...over,
});

const typesOf = (events: ArenaEvent[]) => events.map((e) => e.type);
/** Narrowed to one event type, so a test can read that type's payload. */
function only<T extends ArenaEvent['type']>(
  events: ArenaEvent[],
  type: T,
): Extract<ArenaEvent, { type: T }>[] {
  return events.filter((e): e is Extract<ArenaEvent, { type: T }> => e.type === type);
}

describe('deriveEvents — the first snapshot', () => {
  it('emits no movement events, because a first paint is not everyone arriving at once', () => {
    const first = build([
      { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 2, five: squad('b', [800, 800, 800, 800, 800]) },
      { key: 'c', rank: 3, five: squad('c', [700, 700, 700, 700, 700]) },
    ]);

    expect(deriveEvents(null, first, ctx())).toEqual([]);
  });

  it('still emits the cadence, because halftime comes from the clock and not from a comparison', () => {
    const first = build([{ key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) }]);
    const events = deriveEvents(null, first, ctx({ questionsRemaining: 12, totalQuestions: 25 }));

    expect(typesOf(events)).toEqual(['HALFTIME']);
  });
});

describe('deriveEvents — one event per fact', () => {
  const previous = build([
    { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
    { key: 'b', rank: 2, five: squad('b', [700, 700, 700, 700, 700]) },
    { key: 'c', rank: 3, five: squad('c', [600, 600, 600, 600, 600]) },
    { key: 'd', rank: 4, five: squad('d', [500, 500, 500, 500, 500]) },
    { key: 'e', rank: 5, five: squad('e', [100, 100, 100, 100, 100]) },
  ]);
  const next = build([
    { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
    { key: 'e', rank: 2, five: squad('e', [900, 400, 400, 400, 700]) },
    { key: 'b', rank: 3, five: squad('b', [700, 700, 700, 700, 700]) },
    { key: 'c', rank: 4, five: squad('c', [600, 600, 600, 600, 600]) },
    { key: 'd', rank: 5, five: squad('d', [500, 500, 500, 500, 500]) },
  ], 2);

  it('reports a school passing three others as ONE overtake carrying all three', () => {
    const overtakes = only(deriveEvents(previous, next, ctx()), 'SCHOOL_OVERTAKE');

    expect(overtakes).toHaveLength(1);
    expect(overtakes[0].payload.school.shortName).toBe('E');
    expect(overtakes[0].payload.from).toBe(5);
    expect(overtakes[0].payload.to).toBe(2);
    expect(overtakes[0].payload.passed.map((s) => s.shortName)).toEqual(['B', 'C', 'D']);
  });

  it('names the answers that caused the move, biggest contribution first, so the screen tells one story', () => {
    const [overtake] = only(deriveEvents(previous, next, ctx()), 'SCHOOL_OVERTAKE');

    expect(overtake.payload.causedBy.length).toBeGreaterThan(0);
    expect(overtake.payload.causedBy.map((c) => c.uid)).toEqual(['e1', 'e5', 'e2']);
    expect(overtake.payload.causedBy[0].gained).toBe(800); // 100 → 900
  });

  it('credits a new leader with a LEAD_CHANGE and not also an overtake of the same climb', () => {
    const before = build([
      { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 2, five: squad('b', [850, 850, 850, 850, 850]) },
    ]);
    const after = build([
      { key: 'b', rank: 1, five: squad('b', [1000, 1000, 900, 900, 900]) },
      { key: 'a', rank: 2, five: squad('a', [900, 900, 900, 900, 900]) },
    ], 2);

    const events = deriveEvents(before, after, ctx());
    const leads = only(events, 'LEAD_CHANGE');

    expect(leads).toHaveLength(1);
    expect(leads[0].payload.newLeader.shortName).toBe('B');
    expect(leads[0].payload.displaced?.shortName).toBe('A');
    expect(leads[0].payload.margin).toBe(40); // 940 − 900
    expect(only(events, 'SCHOOL_OVERTAKE')).toHaveLength(0);
  });
});

describe('deriveEvents — a move nobody made', () => {
  it('drops a climb its own five did not earn, so no school gets a takeover for sitting still', () => {
    // `a` loses its fifth player and stops being qualified (rank 0). `b` and `c`
    // each gain a place without a single answer between them.
    const previous = build([
      { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 2, five: squad('b', [500, 500, 500, 500, 500]) },
      { key: 'c', rank: 3, five: squad('c', [400, 400, 400, 400, 400]) },
    ]);
    const next = build([
      { key: 'a', rank: 0, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 1, five: squad('b', [500, 500, 500, 500, 500]) },
      { key: 'c', rank: 2, five: squad('c', [400, 400, 400, 400, 400]) },
    ], 2);

    expect(deriveEvents(previous, next, ctx())).toEqual([]);
  });
});

describe('deriveEvents — the top five is a substitution, not a table update', () => {
  const previous = build([{
    key: 'a',
    rank: 1,
    five: [...squad('a', [900, 900, 900, 900]), { uid: 'a5', score: 800 }],
    bench: [{ uid: 'a6', score: 0 }],
  }]);
  const next = build([{
    key: 'a',
    rank: 1,
    five: [{ uid: 'a6', score: 1200 }, ...squad('a', [900, 900, 900, 900])],
    bench: [{ uid: 'a5', score: 800 }],
  }], 2);

  it('names who came in, who went out and what it did to the team average', () => {
    const [entry] = only(deriveEvents(previous, next, ctx()), 'PLAYER_ENTERS_TOP_5');

    expect(entry.payload.player.uid).toBe('a6');
    expect(entry.payload.displaced?.uid).toBe('a5');
    expect(entry.payload.newTeamAvg).toBe(960);
    expect(entry.payload.delta).toBe(80); // 880 → 960
    expect(entry.payload.causedBy.map((c) => c.uid)).toEqual(['a6']);
  });

  it('pairs the exit with the player who replaced them, so the scene has both halves', () => {
    const [exit] = only(deriveEvents(previous, next, ctx()), 'PLAYER_LEAVES_TOP_5');

    expect(exit.payload.player.uid).toBe('a5');
    expect(exit.payload.replacedBy?.uid).toBe('a6');
  });
});

describe('deriveEvents — suppression happens here, not in the client', () => {
  it('gives a school at most one event below priority 8 per round', () => {
    const previous = build([
      { key: 'a', rank: 1, five: [{ uid: 'a1', score: 300, streak: 4 }, ...squad('a', [300, 300, 300, 300], 2)] },
      { key: 'b', rank: 2, five: [{ uid: 'b1', score: 200, streak: 4 }, ...squad('b', [200, 200, 200, 200], 2)] },
    ]);
    // a1 crosses a streak of 5 AND crosses the carry threshold in one question;
    // b1 only crosses a streak.
    const next = build([
      { key: 'a', rank: 1, five: [{ uid: 'a1', score: 2000, streak: 5 }, ...squad('a', [300, 300, 300, 300], 2)] },
      { key: 'b', rank: 2, five: [{ uid: 'b1', score: 300, streak: 5 }, ...squad('b', [200, 200, 200, 200], 2)] },
    ], 2);

    const events = deriveEvents(previous, next, ctx());

    expect(typesOf(events)).toEqual(['PLAYER_STREAK', 'PLAYER_STREAK']);
    expect(only(events, 'PLAYER_STREAK').map((e) => e.payload.school.shortName)).toEqual(['A', 'B']);
  });

  it('emits at most four events a round, keeping the highest priority, and numbers them without gaps', () => {
    const previous = build([
      { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 2, five: squad('b', [880, 880, 880, 880, 880]) },
      { key: 'c', rank: 3, five: squad('c', [860, 860, 860, 860, 860]) },
      { key: 'd', rank: 4, five: [{ uid: 'd1', score: 840, streak: 9 }, ...squad('d', [840, 840, 840, 840], 2)] },
      { key: 'e', rank: 5, five: [{ uid: 'e1', score: 820, streak: 4 }, ...squad('e', [820, 820, 820, 820], 2)] },
      { key: 'f', rank: 6, five: squad('f', [800, 800, 800, 800, 800]) },
    ]);
    const next = build([
      { key: 'f', rank: 1, five: squad('f', [1400, 1300, 1300, 1300, 1300]) },
      { key: 'e', rank: 2, five: [{ uid: 'e1', score: 1100, streak: 5 }, ...squad('e', [1000, 1000, 1000, 1000], 2)] },
      { key: 'd', rank: 3, five: [{ uid: 'd1', score: 1000, streak: 10 }, ...squad('d', [900, 900, 900, 900], 2)] },
      { key: 'a', rank: 4, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 5, five: squad('b', [880, 880, 880, 880, 880]) },
      { key: 'c', rank: 6, five: squad('c', [860, 860, 860, 860, 860]) },
    ], 2);

    const events = deriveEvents(previous, next, ctx());

    expect(events).toHaveLength(ARENA_ROUND_EVENT_CAP);
    expect(typesOf(events)).toEqual([
      'LEAD_CHANGE', 'SCHOOL_OVERTAKE', 'SCHOOL_OVERTAKE', 'PLAYER_STREAK',
    ]);
    // The priority-5 BIGGEST_CLIMBER lost its slot to events that move the board.
    expect(typesOf(events)).not.toContain('BIGGEST_CLIMBER');
    expect(events.map((e) => e.seq)).toEqual([100, 101, 102, 103]);
  });

  it('breaks priority ties by seq, so the same round always suppresses the same way', () => {
    const previous = build([
      { key: 'a', rank: 1, five: [{ uid: 'a1', score: 300, streak: 4 }, ...squad('a', [300, 300, 300, 300], 2)] },
      { key: 'b', rank: 2, five: [{ uid: 'b1', score: 200, streak: 4 }, ...squad('b', [200, 200, 200, 200], 2)] },
    ]);
    const next = build([
      { key: 'a', rank: 1, five: [{ uid: 'a1', score: 400, streak: 5 }, ...squad('a', [300, 300, 300, 300], 2)] },
      { key: 'b', rank: 2, five: [{ uid: 'b1', score: 300, streak: 5 }, ...squad('b', [200, 200, 200, 200], 2)] },
    ], 2);

    const first = deriveEvents(previous, next, ctx({ maxEvents: 1 }));
    const again = deriveEvents(previous, next, ctx({ maxEvents: 1 }));

    expect(only(first, 'PLAYER_STREAK').map((e) => e.payload.player.uid)).toEqual(['a1']);
    expect(only(again, 'PLAYER_STREAK').map((e) => e.payload.player.uid)).toEqual(['a1']);
  });
});

describe('deriveEvents — a state announced once is not a state announced every question', () => {
  const tightPrevious = build([
    { key: 'a', rank: 1, five: squad('a', [1000, 1000, 1000, 1000, 1000]) },
    { key: 'b', rank: 2, five: squad('b', [900, 900, 900, 900, 900]) },
  ]);
  const tight = build([
    { key: 'a', rank: 1, five: squad('a', [1000, 1000, 1000, 1000, 1000]) },
    { key: 'b', rank: 2, five: squad('b', [995, 995, 995, 995, 995]) },
  ], 2);

  it('calls a TIE when the top two close to within one percent', () => {
    const [tie] = only(deriveEvents(tightPrevious, tight, ctx()), 'TIE');

    expect(tie.payload.schools.map((s) => s.shortName)).toEqual(['A', 'B']);
    expect(tie.payload.margin).toBe(0.5);
  });

  it('does not call it again while it stays tight, because a permanent moment is wallpaper', () => {
    const tighter = build([
      { key: 'a', rank: 1, five: squad('a', [1000, 1000, 1000, 1000, 1000]) },
      { key: 'b', rank: 2, five: squad('b', [998, 998, 998, 998, 998]) },
    ], 3);

    expect(typesOf(deriveEvents(tight, tighter, ctx()))).not.toContain('TIE');
  });

  it('announces a streak only on the crossing, not for every question it survives', () => {
    const at5 = build([{ key: 'a', rank: 1, five: [{ uid: 'a1', score: 500, streak: 5 }, ...squad('a', [500, 500, 500, 500], 2)] }]);
    const at7 = build([{ key: 'a', rank: 1, five: [{ uid: 'a1', score: 700, streak: 7 }, ...squad('a', [500, 500, 500, 500], 2)] }], 2);
    const at10 = build([{ key: 'a', rank: 1, five: [{ uid: 'a1', score: 900, streak: 10 }, ...squad('a', [500, 500, 500, 500], 2)] }], 3);

    expect(typesOf(deriveEvents(at5, at7, ctx()))).not.toContain('PLAYER_STREAK');
    expect(typesOf(deriveEvents(at7, at10, ctx()))).toContain('PLAYER_STREAK');
  });
});

describe('deriveEvents — the envelope', () => {
  it('stamps round, question and a TTL on every event so nothing is shown late or out of context', () => {
    const previous = build([
      { key: 'a', rank: 1, five: squad('a', [900, 900, 900, 900, 900]) },
      { key: 'b', rank: 2, five: squad('b', [850, 850, 850, 850, 850]) },
    ]);
    const next = build([
      { key: 'b', rank: 1, five: squad('b', [1000, 1000, 900, 900, 900]) },
      { key: 'a', rank: 2, five: squad('a', [900, 900, 900, 900, 900]) },
    ], 2);

    const [lead] = only(deriveEvents(previous, next, ctx({ round: 7, questionIndex: 7, now: 555 })), 'LEAD_CHANGE');

    expect(lead.round).toBe(7);
    expect(lead.questionIndex).toBe(7);
    expect(lead.createdAt).toBe(555);
    expect(lead.priority).toBe(10);
    expect(lead.ttlMs).toBeGreaterThan(0);
  });

  it('opens the final five with the margins the commentator reads out', () => {
    const board = build([
      { key: 'a', rank: 1, five: squad('a', [1000, 1000, 1000, 1000, 1000]) },
      { key: 'b', rank: 2, five: squad('b', [900, 900, 900, 900, 900]) },
      { key: 'c', rank: 3, five: squad('c', [850, 850, 850, 850, 850]) },
    ]);
    const [final] = only(deriveEvents(board, board, ctx({ questionsRemaining: 5 })), 'FINAL_FIVE');

    expect(final.payload.top.map((s) => s.shortName)).toEqual(['A', 'B', 'C']);
    expect(final.payload.margins).toEqual([100, 50]);
  });
});

describe('reading an event that came off the wire', () => {
  // These arrive at the broadcast over a Firestore listener, so the document
  // may have been written by a different build of the emitter than the one
  // reading it. The types describe what WE write; they guarantee nothing about
  // what a live listener hands back.
  const malformed = (type: string, payload: unknown) => ({
    seq: 1, type, priority: 8, createdAt: 0, round: 1, questionIndex: 1,
    ttlMs: 60_000, payload,
  }) as never;

  it('returns null rather than throwing on a payload it does not recognise', () => {
    // Throwing here kills the director's tick, and the stage freezes mid
    // tournament in front of an audience — to avoid mis-grouping one animation.
    expect(schoolKeyOf(malformed('SCHOOL_OVERTAKE', {}))).toBeNull();
    expect(schoolKeyOf(malformed('SCHOOL_OVERTAKE', { school: null }))).toBeNull();
    expect(schoolKeyOf(malformed('SCHOOL_OVERTAKE', { school: { key: 42 } }))).toBeNull();
    expect(schoolKeyOf(malformed('LEAD_CHANGE', { newLeader: undefined }))).toBeNull();
    expect(schoolKeyOf(malformed('SCHOOL_OVERTAKE', null))).toBeNull();
  });

  it('still reads a well-formed one', () => {
    expect(schoolKeyOf(malformed('SCHOOL_OVERTAKE', { school: { key: 'codosa' } }))).toBe('codosa');
  });

  it('treats an empty key as absent', () => {
    // An empty string would group every malformed event together as one school.
    expect(schoolKeyOf(malformed('SCHOOL_OVERTAKE', { school: { key: '' } }))).toBeNull();
  });
});
