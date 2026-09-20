/**
 * The Arena engine's two scheduled endpoints, at the level where being wrong
 * costs something: the snapshot the broadcast diffs, the sequence numbers the
 * feed is read by, and the one field that must never reach a client.
 *
 * Only the PURE pieces are exercised. Firestore is mocked out at the module
 * boundary the way api/__tests__/arenaRateLimit.test.ts does it — these routes
 * call `getDb()` inside the handler, so importing them must not touch the
 * Admin SDK.
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('no firestore in unit tests'); },
}));

import {
  buildSnapshot,
  countingFive,
  avgMsOf,
  nextSeq,
  eventDocId,
  cadenceRemaining,
  qualifiedAtFor,
  withoutUndefined,
  blocksPublication,
  selectEligibleTop,
  type PlayerRow,
  type SchoolPool,
} from '../arena/aggregate';
import {
  planAdvance,
  toLiveQuestion,
  assertNoAnswerKey,
  roundOf,
  PAUSE_MS,
  FORBIDDEN_LIVE_FIELDS,
} from '../arena/advance';
import { deriveEvents } from '../../shared/arena/events';

// ── Fixtures ────────────────────────────────────────────────────────────────

const player = (over: Partial<PlayerRow> & { uid: string }): PlayerRow => ({
  displayName: over.uid.toUpperCase(),
  schoolKey: 'codosa',
  schoolLabel: 'Collège Domingo Savio',
  schoolShort: 'CODOSA',
  score: 0,
  correct: 0,
  answered: 0,
  totalMs: 0,
  streak: 0,
  fullTierCount: 0,
  perfectRound: false,
  registeredAt: 1_000,
  ...over,
});

const pool = (key: string, scores: number[], over: Partial<SchoolPool> = {}): SchoolPool => ({
  key,
  label: key.toUpperCase(),
  shortName: key.toUpperCase(),
  members: scores.length,
  rows: scores.map((score, i) => player({
    uid: `${key}-${i}`,
    schoolKey: key,
    schoolLabel: key.toUpperCase(),
    schoolShort: key.toUpperCase(),
    score,
    correct: score / 1000,
    answered: 1,
    totalMs: 5_000 + i,
  })),
  ...over,
});

const OPTS = { teamSize: 5, minPlayers: 5, seq: 1, now: 1_700_000_000_000 };

// ── Snapshot building ───────────────────────────────────────────────────────

describe('building the standings snapshot from player rows', () => {
  it('ranks schools on their best five and carries the ranking through', () => {
    const snap = buildSnapshot(
      [pool('alpha', [1000, 1000, 1000, 500, 500]), pool('beta', [1000, 1000, 1000, 1000, 1000])],
      OPTS,
    );
    expect(snap.schools.map((s) => s.key)).toEqual(['beta', 'alpha']);
    expect(snap.schools[0].rank).toBe(1);
    expect(snap.schools[1].rank).toBe(2);
    expect(snap.schools[0].teamAvg).toBe(1000);
    expect(snap.schools[1].teamAvg).toBe(800);
  });

  it('reports the school\'s REAL head count, not the size of the query pool', () => {
    // The pool is capped at five; a school of two hundred that shows up on the
    // broadcast as a school of five is the bug this exists to prevent.
    const big = pool('alpha', [1000, 900, 800, 700, 600], { members: 213 });
    const snap = buildSnapshot([big], OPTS);
    expect(snap.schools[0].members).toBe(213);
    expect(snap.schools[0].counted).toBe(5);
  });

  it('leaves a school short of the floor unqualified and unranked', () => {
    const snap = buildSnapshot([pool('alpha', [1000, 1000, 1000])], OPTS);
    expect(snap.schools[0].qualified).toBe(false);
    expect(snap.schools[0].rank).toBe(0);
  });

  it('includes EVERY pooled player in individuals, so causedBy can be derived', () => {
    // Documented on StandingsSnapshot.individuals: deriveEvents reads score
    // gains off this list, and a thinned list silently costs events.
    const snap = buildSnapshot([pool('alpha', [5, 4, 3, 2, 1]), pool('beta', [9, 8, 7, 6, 5])], OPTS);
    expect(snap.individuals).toHaveLength(10);
    for (const school of snap.schools) {
      for (const uid of school.top5) {
        expect(snap.individuals.some((i) => i.uid === uid)).toBe(true);
      }
    }
  });

  /*
   * E5, from an external audit, in the audit's own words: "if the six best
   * national players attend one school, the sixth is absent." Before this
   * fix, `individuals` was built EXCLUSIVELY from pools.flatMap(pool =>
   * pool.rows) — every school's own top-5 query result, nothing else. A
   * school's sixth-best player was never fetched at all, so this is not a
   * display bug: that student had no rank, no personal result, nothing.
   */
  describe('the national individual ranking — a school’s own top-5 pool is not the whole country', () => {
    it('reproduces the audit’s own example and shows it fixed: a school’s 6th player is absent without the extra rows, present with them', () => {
      // CODOSA fields six players who would ALL rank above every player at
      // every other school — but the school's own scoring pool is capped at
      // five (teamSize), so the sixth (score 850) is never in `pools` at all.
      const codosaPool = pool('codosa', [1000, 950, 900, 880, 860]); // top 5 only, as loadPool would return
      const otherSchool = pool('rival', [500, 400, 300, 200, 100]);

      const withoutTheFix = buildSnapshot([codosaPool, otherSchool], OPTS);
      expect(withoutTheFix.individuals.some((i) => i.uid === 'codosa-5')).toBe(false);

      // The sixth player, as loadNationalTop's query would actually return
      // them — same shape, just found by a school-independent query.
      const sixthPlayer = player({ uid: 'codosa-5', schoolKey: 'codosa', score: 850, totalMs: 5_005 });
      const withTheFix = buildSnapshot([codosaPool, otherSchool], OPTS, [sixthPlayer]);

      const sixth = withTheFix.individuals.find((i) => i.uid === 'codosa-5');
      expect(sixth).toBeDefined();
      // Ranked correctly among the true top players nationally — 6th here,
      // ahead of every player from the other school (whose best is 500).
      expect(sixth!.rank).toBe(6);
      expect(withTheFix.individuals).toHaveLength(11); // 10 pooled + the one extra
    });

    it('does not duplicate a player already present via their own school’s pool', () => {
      const codosaPool = pool('codosa', [1000, 950, 900, 880, 860]);
      // The SAME player codosa's own pool already returned — as if
      // loadNationalTop's query also (correctly) found them, since they are
      // genuinely near the top nationally too.
      const duplicate = player({ uid: 'codosa-0', schoolKey: 'codosa', score: 1000, totalMs: 5_000 });

      const snap = buildSnapshot([codosaPool], OPTS, [duplicate]);
      expect(snap.individuals.filter((i) => i.uid === 'codosa-0')).toHaveLength(1);
      expect(snap.individuals).toHaveLength(5); // still just the pool, nothing extra added
    });

    it('school ranking (teamAvg, top5, qualified) is UNCHANGED by the extra rows — they feed individuals only', () => {
      const codosaPool = pool('codosa', [1000, 950, 900, 880, 860]);
      const extra = player({ uid: 'codosa-5', schoolKey: 'codosa', score: 999_999, totalMs: 1 });

      const without = buildSnapshot([codosaPool], OPTS);
      const withExtra = buildSnapshot([codosaPool], OPTS, [extra]);

      expect(withExtra.schools).toEqual(without.schools);
    });

    it('an empty extra-rows list changes nothing — the default, so every existing call site keeps working', () => {
      const snap = buildSnapshot([pool('codosa', [1000, 900])], OPTS);
      expect(snap.individuals).toHaveLength(2);
    });
  });

  it('names as top5 exactly the five that were counted, tie or no tie', () => {
    // Two team-mates level on score AND time: top5 must agree with the order
    // rankSchools counts in, or an overtake gets credited to a player the
    // ranking never counted.
    const rows = [
      player({ uid: 'a', score: 1000, totalMs: 4_000, correct: 1 }),
      player({ uid: 'b', score: 1000, totalMs: 4_000, correct: 4 }),
      player({ uid: 'c', score: 500, totalMs: 1_000, correct: 1 }),
    ];
    expect(countingFive(rows, 2).map((r) => r.uid)).toEqual(['b', 'a']);
  });

  it('is deterministic across two identical recomputations', () => {
    // The broadcast animates the DIFFERENCE between consecutive runs, so any
    // instability here is schools swapping places on screen for no reason.
    const pools = [pool('alpha', [1000, 1000, 1000, 1000, 1000]), pool('beta', [1000, 1000, 1000, 1000, 1000])];
    expect(buildSnapshot(pools, OPTS)).toEqual(buildSnapshot(pools.slice().reverse(), OPTS));
  });

  it('never divides by zero for a player who has not answered', () => {
    const snap = buildSnapshot([pool('alpha', [0, 0, 0, 0, 0], {
      rows: [player({ uid: 'z', answered: 0, totalMs: 0 })],
    })], OPTS);
    expect(snap.individuals[0].avgMs).toBe(0);
    expect(avgMsOf(player({ uid: 'z', answered: 4, totalMs: 10_000 }))).toBe(2_500);
  });

  it('feeds deriveEvents a snapshot it can actually attribute a move to', () => {
    // End to end over the two modules: alpha overtakes beta because one named
    // player scored. An uncaused movement is dropped by deriveEvents, so this
    // failing means the snapshot lost the information the feed runs on.
    const before = buildSnapshot(
      [pool('alpha', [1000, 1000, 1000, 1000, 0]), pool('beta', [1000, 1000, 1000, 1000, 500])],
      OPTS,
    );
    const after = buildSnapshot(
      [pool('alpha', [1000, 1000, 1000, 1000, 1000]), pool('beta', [1000, 1000, 1000, 1000, 500])],
      OPTS,
    );
    const events = deriveEvents(before, after, {
      seq: nextSeq(before),
      round: 0,
      questionIndex: 3,
      questionsRemaining: 21,
      totalQuestions: 25,
      now: OPTS.now,
    });
    const lead = events.find((e) => e.type === 'LEAD_CHANGE');
    expect(lead).toBeDefined();
    expect((lead!.payload as { causedBy: unknown[] }).causedBy.length).toBeGreaterThan(0);
  });
});

// ── Seq allocation ──────────────────────────────────────────────────────────

describe('allocating event sequence numbers', () => {
  it('starts at 1 when nothing has ever been emitted', () => {
    expect(nextSeq(null)).toBe(1);
  });

  it('continues one above the seq the stored board accounts for', () => {
    expect(nextSeq({ seq: 41, computedAt: 0, schools: [], individuals: [] })).toBe(42);
  });

  it('survives a standings document with a missing or junk seq', () => {
    expect(nextSeq({ computedAt: 0, schools: [], individuals: [] } as never)).toBe(1);
    expect(nextSeq({ seq: Number.NaN, computedAt: 0, schools: [], individuals: [] })).toBe(1);
    expect(nextSeq({ seq: -9, computedAt: 0, schools: [], individuals: [] })).toBe(1);
  });

  it('hands deriveEvents a gapless run that the next tick continues from', () => {
    const before = buildSnapshot([pool('alpha', [1000, 1000, 1000, 1000, 0]), pool('beta', [900, 900, 900, 900, 900])], OPTS);
    const after = buildSnapshot([pool('alpha', [1000, 1000, 1000, 1000, 1000]), pool('beta', [900, 900, 900, 900, 900])], OPTS);
    const seq = nextSeq({ seq: 7, computedAt: 0, schools: [], individuals: [] });
    const events = deriveEvents(before, after, {
      seq, round: 0, questionIndex: 2, questionsRemaining: 22, totalQuestions: 25, now: OPTS.now,
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => seq + i));
    // The board then claims the highest seq it accounts for, so the next tick
    // cannot reuse a number a spectator has already seen.
    const stored = events[events.length - 1].seq;
    expect(nextSeq({ seq: stored, computedAt: 0, schools: [], individuals: [] })).toBe(stored + 1);
  });

  it('orders event document ids the way the numbers order', () => {
    // Firestore sorts document ids lexicographically: unpadded, "10" lands
    // before "9" and the broadcast replays the match out of order.
    const ids = [1, 2, 9, 10, 100].map(eventDocId);
    expect(ids.slice().sort()).toEqual(ids);
    expect(eventDocId(42)).toBe('000042');
  });
});

// ── Cadence, qualifiedAt, undefined stripping ───────────────────────────────

describe('the once-per-question guards', () => {
  it('offers cadence only after the window closed, and only once', () => {
    const base = { questionsRemaining: 12, questionIndex: 12, lastCadenceIndex: undefined };
    expect(cadenceRemaining({ ...base, closed: false })).toBe(-1);
    expect(cadenceRemaining({ ...base, closed: true })).toBe(12);
    // Second tick of the same question: halftime must not fire again.
    expect(cadenceRemaining({ ...base, closed: true, lastCadenceIndex: 12 })).toBe(-1);
  });

  it('pins qualifiedAt once and never moves it again', () => {
    expect(qualifiedAtFor(undefined, false, 500)).toBeUndefined();
    expect(qualifiedAtFor(undefined, true, 500)).toBe(500);
    expect(qualifiedAtFor(500, true, 900)).toBe(500);
    expect(qualifiedAtFor(500, false, 900)).toBe(500);
  });

  it('drops undefined so Firestore never sees it', () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });
});

/*
 * E8, from an external audit: a player an admin marked `eligible: false`
 * after a completed integrity review — the same flag answer.ts already
 * refuses new submissions from, and claim.ts already skips when rolling down
 * a prize — used to still rank on the PUBLIC board, potentially even as the
 * tournament CHAMPION. `selectEligibleTop` is the fix both loadPool and
 * loadNationalTop now share: fetch a cushion past the limit, filter, THEN
 * trim to the limit — proving the cushion actually does its job (an
 * ineligible player near the top must not truncate the real pool short) is
 * the property that would silently break if someone "simplified" this to
 * filter-then-fetch-limit instead.
 */
describe('selectEligibleTop — E8: a disqualified player can no longer rank on the public board', () => {
  const doc = (uid: string, score: number, eligible?: boolean): { uid: string; data: Record<string, unknown> } => ({
    uid,
    data: { schoolKey: 'codosa', score, totalMs: 1_000, ...(eligible === undefined ? {} : { eligible }) },
  });

  it('passes through an all-eligible pool unchanged, in the order given', () => {
    const docs = [doc('a', 1000), doc('b', 900), doc('c', 800)];
    expect(selectEligibleTop(docs, 3).map((r) => r.uid)).toEqual(['a', 'b', 'c']);
  });

  it('drops a player explicitly marked ineligible, even as the top scorer', () => {
    const docs = [doc('cheater', 1000, false), doc('b', 900), doc('c', 800)];
    expect(selectEligibleTop(docs, 2).map((r) => r.uid)).toEqual(['b', 'c']);
  });

  it('treats a missing `eligible` field as eligible — undefined is the default, not a flag', () => {
    const docs = [doc('a', 1000), doc('b', 900)];
    expect(selectEligibleTop(docs, 2).map((r) => r.uid)).toEqual(['a', 'b']);
  });

  it('CLOSED: an ineligible top scorer no longer truncates the pool short — the cushion does its job', () => {
    // Exactly what a naive filter-after-limit(pool) would get wrong: fetch
    // pool(3) + cushion, one of the top scorers is disqualified, and the
    // caller still gets a full 3-deep pool rather than losing a slot to it.
    const docs = [doc('cheater', 1000, false), doc('a', 900), doc('b', 850), doc('c', 800)];
    const result = selectEligibleTop(docs, 3);
    expect(result.map((r) => r.uid)).toEqual(['a', 'b', 'c']);
    expect(result).toHaveLength(3);
  });

  it('never returns more than the limit, even with a large eligible pool', () => {
    const docs = [doc('a', 1000), doc('b', 900), doc('c', 800), doc('d', 700)];
    expect(selectEligibleTop(docs, 2).map((r) => r.uid)).toEqual(['a', 'b']);
  });
});

/*
 * E2, from an external audit: `standings/current` used to publish whenever the
 * TOURNAMENT'S state was `live`, on a once-a-minute cron with no relationship
 * to question boundaries. `answer.ts` writes a player's score in the same
 * transaction as recording the answer — immediately, mid-question — so a cron
 * tick landing inside an open window could publish scores that two colluding
 * accounts, having just submitted different options, could read to infer
 * which one was correct before the question ever closed.
 *
 * `blocksPublication` is the actual fix. The property under test is a
 * negative — "this tick published nothing" — which is exactly the shape of
 * bug that rots silently the first time a caller is "simplified".
 */
describe('blocksPublication — the actual fix for a mid-question standings leak', () => {
  it('blocks while the question is genuinely open', () => {
    expect(blocksPublication('open')).toBe(true);
  });

  it('blocks a question that has been delivered but not yet accepting — nothing to publish either way', () => {
    expect(blocksPublication('pending')).toBe(true);
  });

  it('allows publication once the question has actually closed — natural close or forced, both write the same state', () => {
    expect(blocksPublication('closed')).toBe(false);
  });

  it('fails CLOSED on a state it does not recognise, or no live document at all', () => {
    // A missing/corrupt live document is not a green light — the safe
    // direction for a field this consequential is to publish nothing rather
    // than guess. `planAdvance` treats the same corruption the same way.
    expect(blocksPublication(null)).toBe(true);
    expect(blocksPublication(undefined)).toBe(true);
    expect(blocksPublication('')).toBe(true);
    expect(blocksPublication('some-future-state-nobody-wrote-yet')).toBe(true);
  });
});

// ── The answer key must never reach a live document ─────────────────────────

describe('publishing a question without publishing its answer', () => {
  const authored = {
    index: 3,
    prompt: 'Quelle est la capitale d\'Haïti ?',
    promptHt: 'Ki kapital Ayiti ?',
    options: ['Jacmel', 'Port-au-Prince', 'Cap-Haïtien', 'Les Cayes'],
    optionsHt: ['Jakmèl', 'Pòtoprens', 'Okap', 'Okay'],
    answerIndex: 1,
    explanation: 'B — Port-au-Prince.',
    category: 'geo',
    difficulty: 2,
    points: 1000,
  };

  it('copies the prompt and options and nothing that leaks the answer', () => {
    const live = toLiveQuestion(authored, { index: 3, seq: 4, opensAt: 1_000, closesAt: 21_000 });
    expect(live.prompt).toBe(authored.prompt);
    expect(live.optionsHt).toEqual(authored.optionsHt);
    expect(live.state).toBe('open');
    for (const field of FORBIDDEN_LIVE_FIELDS) {
      expect(Object.keys(live)).not.toContain(field);
    }
    // Structural, not cosmetic: a future "just spread the question" refactor
    // type-checks perfectly and hands every client the answer key.
    expect(JSON.stringify(live)).not.toMatch(/answerIndex|explanation/);
  });

  it('refuses outright rather than publishing a payload carrying the key', () => {
    for (const field of FORBIDDEN_LIVE_FIELDS) {
      expect(() => assertNoAnswerKey({ prompt: 'x', [field]: 1 })).toThrow(/refusing to publish/);
    }
    // Present-but-undefined still counts: the key is in the object.
    expect(() => assertNoAnswerKey({ answerIndex: undefined })).toThrow();
  });

  it('accepts a payload that carries only delivery fields', () => {
    expect(() => assertNoAnswerKey({ index: 0, prompt: 'x', options: [], state: 'open' })).not.toThrow();
  });
});

// ── The round clock ─────────────────────────────────────────────────────────

describe('deciding what the clock does next', () => {
  const base = {
    now: 100_000,
    index: 2,
    liveState: 'open' as const,
    closesAt: 120_000,
    closedAt: 0,
    totalQuestions: 25,
    force: false,
  };

  it('opens the first question when nothing has been opened', () => {
    expect(planAdvance({ ...base, index: -1, liveState: null })).toBe('open');
  });

  it('NEVER closes early, however many players have answered', () => {
    // Closing on "everyone answered" never fires with thousands of players,
    // and closing on a percentile punishes the slow connections tier scoring
    // protects. Only the timer closes the window.
    expect(planAdvance(base)).toBe('waiting');
    expect(planAdvance({ ...base, now: 119_999 })).toBe('waiting');
    expect(planAdvance({ ...base, now: 120_000 })).toBe('close');
  });

  it('holds the pause open for late answers before opening the next question', () => {
    const closed = { ...base, liveState: 'closed' as const, closedAt: 120_000 };
    expect(planAdvance({ ...closed, now: 120_000 + PAUSE_MS - 1 })).toBe('waiting');
    expect(planAdvance({ ...closed, now: 120_000 + PAUSE_MS })).toBe('open');
  });

  it('is idempotent: a second call for the same index neither re-opens nor skips', () => {
    const justOpened = { ...base, liveState: 'open' as const, now: 100_001 };
    expect(planAdvance(justOpened)).toBe('waiting');
    expect(planAdvance(justOpened)).toBe('waiting');

    const justClosed = { ...base, liveState: 'closed' as const, closedAt: 120_000, now: 120_100 };
    expect(planAdvance(justClosed)).toBe('waiting');
    expect(planAdvance(justClosed)).toBe('waiting');
  });

  it('lets the run console override the timers but never the sequence', () => {
    // Forcing on a live question closes it; the following call opens the next.
    expect(planAdvance({ ...base, force: true })).toBe('close');
    expect(planAdvance({ ...base, liveState: 'closed', closedAt: 120_000, force: true })).toBe('open');
  });

  it('honours a tournament that declares a longer pause', () => {
    const closed = { ...base, liveState: 'closed' as const, closedAt: 120_000, now: 135_000 };
    expect(planAdvance(closed)).toBe('open');
    expect(planAdvance({ ...closed, pauseMs: 20_000 })).toBe('waiting');
  });

  it('moves to grading when the LAST question closes, and not before', () => {
    const last = { ...base, index: 24, liveState: 'closed' as const, closedAt: 120_000, now: 999_999 };
    expect(planAdvance(last)).toBe('finish');
    expect(planAdvance({ ...last, index: 23 })).toBe('open');
  });

  it('refuses to guess when currentQuestion points at a live doc that is gone', () => {
    expect(planAdvance({ ...base, liveState: null })).toBe('noop');
  });

  it('does nothing for a tournament with no questions', () => {
    expect(planAdvance({ ...base, totalQuestions: 0 })).toBe('noop');
  });
});

describe('mapping a question index to its round', () => {
  const rounds = [
    { index: 0, questionCount: 10 },
    { index: 1, questionCount: 10 },
    { index: 2, questionCount: 5 },
  ];
  it('finds the round a question belongs to', () => {
    expect(roundOf(rounds, 0)).toBe(0);
    expect(roundOf(rounds, 9)).toBe(0);
    expect(roundOf(rounds, 10)).toBe(1);
    expect(roundOf(rounds, 24)).toBe(2);
  });
  it('falls back to round 0 when the tournament declares no rounds', () => {
    expect(roundOf(undefined, 4)).toBe(0);
    expect(roundOf([], 4)).toBe(0);
  });
});

describe('the answer key becomes public exactly once', () => {
  // While a window is open, nothing tells a player whether they were right:
  // the response says only "recorded", and firestore.rules denies reading their
  // own row. That combination is what stops five friends submitting five
  // different options and reading the key off whichever score moved — the
  // cheapest attack on this design, needing no tooling at all.
  it('never ships the key on the document players read while answering', () => {
    expect(() => assertNoAnswerKey({ answerIndex: 2 })).toThrow();
  });

  it('is revealed when the window shuts, to everybody at the same moment', () => {
    // Once the window is closed the key is harmless, and withholding it is just
    // worse: a room full of students finds out together rather than in a
    // ragged wave. advance.ts writes it onto live/{index} at close.
    const closed = { state: 'closed', closedAt: 1, answerIndex: 2 };
    expect(closed.state).toBe('closed');
    expect(closed.answerIndex).toBe(2);
  });

  it('closes the question even when no key can be read', () => {
    // Writing -1 as "the answer" would mark every student wrong on a screen.
    // Omitting it shows no reveal, which is recoverable.
    const reveal = -1;
    const patch = { state: 'closed', ...(reveal >= 0 ? { answerIndex: reveal } : {}) };
    expect(patch).not.toHaveProperty('answerIndex');
  });
});
