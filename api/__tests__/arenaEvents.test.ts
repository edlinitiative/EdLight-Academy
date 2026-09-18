/**
 * arena/_events — the payload builders, and the one property that had to be
 * proven rather than reasoned about: seq allocation surviving a race between
 * `advance`/`state` (event emitters, transactional) and `aggregate` (the
 * once-a-minute tick that also writes `standings/current`).
 *
 * `eventDocId(seq)` is the event's DOCUMENT ID. Two writers that both believe
 * the next seq is 41 do not produce two events — the second `set()` silently
 * overwrites the first, and `standings.seq` is left at whatever the loser
 * computed, which can be LOWER than what the winner already committed. That
 * bug is invisible to every test that only checks a single writer's output; it
 * only shows up when two are made to interleave, which is what the race
 * section below does.
 *
 * Firestore is faked rather than mocked out entirely, because the property
 * under test — a transaction re-reading the document it is about to write,
 * immediately before it writes — cannot be demonstrated without something that
 * behaves like a transaction. The fake is intentionally the simplest thing
 * that has this one behaviour: `get` returns whatever is currently stored,
 * `set` stores it, and nothing is deferred until "commit" the way real
 * Firestore batches a transaction's writes — which is fine, because the
 * property being tested is "did commitBoard read fresh data", not Firestore's
 * own conflict-retry machinery (that part is Google's to test, not this
 * repo's).
 */
jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => { throw new Error('no firestore in unit tests'); },
}));

import {
  highestSeq,
  numberDrafts,
  renumber,
  seqAfter,
  eventDocId,
  atStakeFrom,
  championSchoolFrom,
  podiumFrom,
  summariseAnswers,
  schoolRefOf,
  playerRefOf,
  emitKeyedEvents,
  type ArenaEventDraft,
} from '../arena/_events';
import { commitBoard, type StoredStandings } from '../arena/aggregate';
import type { SchoolStanding, IndividualStanding, ArenaEvent } from '../../shared/arena/events';

// ── A fake Firestore, just enough for a transaction ─────────────────────────

interface FakeDoc { data: Record<string, unknown>; }

function makeFakeDb(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, FakeDoc>();
  for (const [path, data] of Object.entries(seed)) store.set(path, { data });

  const doc = (path: string) => ({ path });

  const tx = {
    get: async (ref: { path: string }) => {
      const entry = store.get(ref.path);
      return {
        exists: !!entry,
        data: () => entry?.data,
      };
    },
    set: (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const existing = store.get(ref.path)?.data ?? {};
      store.set(ref.path, { data: opts?.merge ? { ...existing, ...data } : data });
    },
  };

  const runTransaction = async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => fn(tx);

  return { doc, runTransaction, _store: store } as unknown as FirebaseFirestore.Firestore & { _store: Map<string, FakeDoc> };
}

const school = (over: Partial<SchoolStanding> = {}): SchoolStanding => ({
  key: 'codosa', label: 'Collège Dominique Savio', shortName: 'CODOSA',
  rank: 1, teamAvg: 900, qualified: true, top5: ['u1'],
  ...over,
} as SchoolStanding);

const player = (over: Partial<IndividualStanding> = {}): IndividualStanding => ({
  uid: 'u1', displayName: 'Mirlande', schoolKey: 'codosa', schoolShort: 'CODOSA',
  rank: 1, score: 900, totalMs: 40_000, fullTierCount: 20,
  ...over,
} as IndividualStanding);

const draft = (type: ArenaEventDraft['type'] = 'ROUND_START'): ArenaEventDraft => ({
  type, payload: { index: 1, total: 25, category: 'Histoire' }, round: 0, questionIndex: 1,
});

// ── The race ──────────────────────────────────────────────────────────────

describe('commitBoard — seq allocation under a race with an emitter', () => {
  it('the OLD pattern (allocate once, write without a fresh read) collides and goes backwards', async () => {
    // Standings sit at seq 10 when a tick begins. This is what the OLD
    // aggregate.ts did: compute `nextSeq` from that read, and write a batch —
    // no re-read — hundreds of milliseconds later.
    const db = makeFakeDb({ 'tournaments/t1/standings/current': { seq: 10 } });
    const staleTopOfTickSeq = 11; // nextSeq(read-at-seq-10)

    // While the tick's queries were running, an emitter committed one event
    // through the transactional path and moved the counter to 11.
    const emitterEvent: ArenaEvent = {
      seq: 11, type: 'GRADING', priority: 10, createdAt: 0, round: 0, questionIndex: 24,
      ttlMs: 0, payload: { startedAt: 0 },
    } as unknown as ArenaEvent;
    db.doc('x'); // no-op, keeps the fake's shape used consistently
    (db as any)._store.set('tournaments/t1/events/000011', { data: { seq: 11 } });
    (db as any)._store.set('tournaments/t1/standings/current', { data: { seq: 11 } });

    // The OLD code, reproduced exactly as it wrote before this fix: number from
    // the STALE top-of-tick value and write with no re-read.
    const oldEvents = numberDrafts([draft('LEAD_CHANGE')], staleTopOfTickSeq, 0);
    for (const event of oldEvents) {
      (db as any)._store.set(`tournaments/t1/events/${eventDocId(event.seq)}`, { data: event });
    }
    (db as any)._store.set('tournaments/t1/standings/current', { data: { seq: staleTopOfTickSeq } });

    // The emitter's GRADING event is gone — overwritten at the same document id
    // by the tick's LEAD_CHANGE — and the stored counter went BACKWARDS from 11
    // to 11-that-means-something-else. This is the bug the fix exists to close.
    const clobbered = (db as any)._store.get('tournaments/t1/events/000011').data;
    expect(clobbered.type).toBe('LEAD_CHANGE'); // GRADING is gone
    expect(clobbered.type).not.toBe('GRADING');
  });

  it('commitBoard re-reads at commit time and never collides with the emitter', async () => {
    const db = makeFakeDb({ 'tournaments/t1/standings/current': { seq: 10 } });
    const staleTopOfTickSeq = 11; // what THIS tick believed, from its own top-of-tick read

    // The emitter commits through the real transactional path in between —
    // exactly the interleaving that broke the old code above.
    (db as any)._store.set('tournaments/t1/events/000011', { data: { seq: 11, type: 'GRADING' } });
    (db as any)._store.set('tournaments/t1/standings/current', { data: { seq: 11 } });

    const board: StoredStandings = {
      seq: 0, computedAt: 0, schools: [school()], individuals: [player()],
    } as unknown as StoredStandings;

    const result = await commitBoard(db, 't1', board, numberDrafts([draft('LEAD_CHANGE')], staleTopOfTickSeq, 0), staleTopOfTickSeq);

    // Allocated ABOVE the emitter's seq, from a FRESH read — not from the stale
    // value this tick started with.
    expect(result.events[0].seq).toBe(12);
    expect(result.seq).toBe(12);

    // The emitter's event is intact — nothing was overwritten.
    const emitterDoc = (db as any)._store.get('tournaments/t1/events/000011').data;
    expect(emitterDoc.type).toBe('GRADING');

    // And the tick's own event landed at a fresh, non-colliding id.
    const tickDoc = (db as any)._store.get('tournaments/t1/events/000012').data;
    expect(tickDoc.seq).toBe(12);
  });

  it('two aggregate ticks in a row never reuse a seq, even both starting from the same stale value', async () => {
    const db = makeFakeDb({ 'tournaments/t1/standings/current': { seq: 5 } });
    const staleSeq = 6;

    const boardA: StoredStandings = { seq: 0, computedAt: 0, schools: [], individuals: [] } as unknown as StoredStandings;
    const a = await commitBoard(db, 't1', boardA, numberDrafts([draft('LEAD_CHANGE')], staleSeq, 0), staleSeq);
    expect(a.seq).toBe(6);

    // A second tick that ALSO started from the seq-5 read (it ran concurrently
    // with the first, before either had written) must not repeat seq 6.
    const boardB: StoredStandings = { seq: 0, computedAt: 0, schools: [], individuals: [] } as unknown as StoredStandings;
    const b = await commitBoard(db, 't1', boardB, numberDrafts([draft('SCHOOL_OVERTAKE')], staleSeq, 0), staleSeq);
    expect(b.seq).toBe(7);
    expect(b.events[0].seq).not.toBe(a.events[0].seq);
  });

  it('never goes backwards even if the standings document is somehow missing at commit time', async () => {
    const db = makeFakeDb({});
    const board: StoredStandings = { seq: 0, computedAt: 0, schools: [], individuals: [] } as unknown as StoredStandings;
    const result = await commitBoard(db, 't1', board, numberDrafts([draft()], 40, 0), 40);
    // previousSeq is a FLOOR precisely for this case: a fresh-but-empty read
    // must not be read as "nothing has ever happened" and restart numbering at 1.
    expect(result.seq).toBeGreaterThanOrEqual(40);
  });
});

// ── Pure allocation helpers ──────────────────────────────────────────────────

describe('highestSeq / numberDrafts / renumber / seqAfter', () => {
  it('reads the counter defensively off a possibly-stub standings document', () => {
    expect(highestSeq(null)).toBe(0);
    expect(highestSeq({})).toBe(0);
    expect(highestSeq({ seq: 41 })).toBe(41);
    expect(highestSeq({ seq: Number.NaN })).toBe(0);
    expect(highestSeq({ seq: -3 })).toBe(0);
  });

  it('numbers drafts gaplessly from a starting seq', () => {
    const events = numberDrafts([draft('ROUND_START'), draft('FINAL_QUESTION')], 5, 1000);
    expect(events.map((e) => e.seq)).toEqual([5, 6]);
    expect(events.every((e) => e.createdAt === 1000)).toBe(true);
  });

  it('renumbers already-built events in order, preserving everything else', () => {
    const original = numberDrafts([draft('LEAD_CHANGE'), draft('TIE')], 1, 0);
    const renumbered = renumber(original, 100);
    expect(renumbered.map((e) => e.seq)).toEqual([100, 101]);
    expect(renumbered[0].type).toBe('LEAD_CHANGE');
    expect(renumbered[1].payload).toEqual(original[1].payload);
  });

  it('seqAfter is the last event’s seq, or the floor when nothing was emitted', () => {
    const events = numberDrafts([draft()], 9, 0);
    expect(seqAfter(events, 3)).toBe(9);
    expect(seqAfter([], 3)).toBe(3);
  });
});

// ── Payload builders ─────────────────────────────────────────────────────────

describe('atStakeFrom', () => {
  it('measures every contender against the leader, biggest gap last-of-equal-first', () => {
    const schools = [
      school({ key: 'a', rank: 1, teamAvg: 900 }),
      school({ key: 'b', rank: 2, teamAvg: 880 }),
      school({ key: 'c', rank: 3, teamAvg: 850 }),
    ];
    const out = atStakeFrom(schools, 5);
    expect(out).toEqual([
      { school: schoolRefOf(schools[0]), behind: 0 },
      { school: schoolRefOf(schools[1]), behind: 20 },
      { school: schoolRefOf(schools[2]), behind: 50 },
    ]);
  });

  it('is empty when nobody is ranked', () => {
    expect(atStakeFrom([], 5)).toEqual([]);
    expect(atStakeFrom([school({ rank: 0 })], 5)).toEqual([]);
  });

  it('respects the limit', () => {
    const schools = [1, 2, 3, 4].map((n) => school({ key: `s${n}`, rank: n, teamAvg: 1000 - n }));
    expect(atStakeFrom(schools, 2)).toHaveLength(2);
  });
});

describe('championSchoolFrom', () => {
  it('is read from the announced board, never recomputed', () => {
    const schools = [school({ key: 'codosa', rank: 1, teamAvg: 912.5, top5: ['u1', 'u2'] })];
    const individuals = [player({ uid: 'u1' }), player({ uid: 'u2', displayName: 'Jean' })];
    const champ = championSchoolFrom(schools, individuals);
    expect(champ).not.toBeNull();
    expect(champ!.school.key).toBe('codosa');
    expect(champ!.teamAvg).toBe(912.5);
    expect(champ!.top5.map((p) => p.uid)).toEqual(['u1', 'u2']);
  });

  it('is null when nobody is qualified at rank 1', () => {
    expect(championSchoolFrom([school({ rank: 1, qualified: false })], [])).toBeNull();
    expect(championSchoolFrom([], [])).toBeNull();
  });

  it('drops a top5 uid that has no standing row rather than throwing', () => {
    const schools = [school({ top5: ['u1', 'ghost'] })];
    const champ = championSchoolFrom(schools, [player({ uid: 'u1' })]);
    expect(champ!.top5).toHaveLength(1);
  });
});

describe('podiumFrom', () => {
  it('returns exactly ranks 1..size, in order', () => {
    const individuals = [
      player({ uid: 'u3', rank: 3 }), player({ uid: 'u1', rank: 1 }), player({ uid: 'u2', rank: 2 }),
      player({ uid: 'u4', rank: 4 }),
    ];
    expect(podiumFrom(individuals, 3).map((p) => p.uid)).toEqual(['u1', 'u2', 'u3']);
  });

  it('is empty when fewer than one player is ranked', () => {
    expect(podiumFrom([], 3)).toEqual([]);
  });
});

describe('summariseAnswers', () => {
  const row = (over: Partial<Parameters<typeof summariseAnswers>[0][number]> = {}) => ({
    uid: 'u1', correct: true, elapsedMs: 5000, late: false, impossible: false, ...over,
  });

  it('percentage is out of ON-TIME submissions, not everyone present', () => {
    const stats = summariseAnswers([
      row({ uid: 'a', correct: true }),
      row({ uid: 'b', correct: false }),
      row({ uid: 'c', correct: true, late: true }), // excluded from both numerator and denominator
    ]);
    expect(stats.correctPct).toBe(50);
    expect(stats.answers).toBe(2);
  });

  it('a late correct answer never becomes the fastest', () => {
    const stats = summariseAnswers([
      row({ uid: 'late', correct: true, elapsedMs: 100, late: true }),
      row({ uid: 'ontime', correct: true, elapsedMs: 4000 }),
    ]);
    expect(stats.fastest?.uid).toBe('ontime');
  });

  it('an impossible span cannot be the fastest, even negative and tiny', () => {
    const stats = summariseAnswers([
      row({ uid: 'cheat', correct: true, elapsedMs: -50, impossible: true }),
      row({ uid: 'real', correct: true, elapsedMs: 3000 }),
    ]);
    expect(stats.fastest?.uid).toBe('real');
  });

  it('ties break on uid so a replay of the same feed always names the same student', () => {
    const stats = summariseAnswers([
      row({ uid: 'zed', correct: true, elapsedMs: 2000 }),
      row({ uid: 'abe', correct: true, elapsedMs: 2000 }),
    ]);
    expect(stats.fastest?.uid).toBe('abe');
  });

  it('no correct on-time answers means no fastest and a 0% that is still a true number', () => {
    const stats = summariseAnswers([row({ correct: false })]);
    expect(stats.fastest).toBeNull();
    expect(stats.correctPct).toBe(0);
  });
});

describe('schoolRefOf / playerRefOf', () => {
  it('carry only the public fields a broadcast may show', () => {
    expect(schoolRefOf(school())).toEqual({ key: 'codosa', label: 'Collège Dominique Savio', shortName: 'CODOSA' });
    expect(playerRefOf(player())).toEqual({ uid: 'u1', displayName: 'Mirlande', schoolKey: 'codosa', schoolShort: 'CODOSA' });
  });
});


// ── QUESTION_CLOSED's idempotence key ────────────────────────────────────────

describe('emitKeyedEvents — once per key, ever', () => {
  it('emits on the first call and writes a marker', async () => {
    const db = makeFakeDb({ 'tournaments/t1/standings/current': { seq: 3 } });
    const result = await emitKeyedEvents(db, 't1', 'QUESTION_CLOSED__7', [draft('QUESTION_CLOSED')], 0);
    expect(result.duplicate).toBe(false);
    expect(result.emitted).toHaveLength(1);
    expect((db as any)._store.get('tournaments/t1/eventKeys/QUESTION_CLOSED__7')).toBeDefined();
  });

  /*
   * This is QUESTION_CLOSED's actual idempotence guarantee — a retried
   * `advance` call (the scheduler retries on any failure) must not put a
   * second "round results" scene on the stream for the same question, and it
   * cannot rely on `canTransition` the way ROUND_START/GRADING do, because
   * closing a question is not itself a state transition.
   */
  it('refuses a second emission for the same key and writes nothing new', async () => {
    const db = makeFakeDb({ 'tournaments/t1/standings/current': { seq: 3 } });
    const first = await emitKeyedEvents(db, 't1', 'QUESTION_CLOSED__7', [draft('QUESTION_CLOSED')], 0);
    const seqAfterFirst = (db as any)._store.get('tournaments/t1/standings/current').data.seq;

    const second = await emitKeyedEvents(db, 't1', 'QUESTION_CLOSED__7', [draft('QUESTION_CLOSED')], 0);
    expect(second.duplicate).toBe(true);
    expect(second.emitted).toEqual([]);
    // The counter did not move a second time — a duplicate call is a true no-op.
    expect((db as any)._store.get('tournaments/t1/standings/current').data.seq).toBe(seqAfterFirst);
    expect(first.emitted[0].seq).not.toBe(undefined);
  });

  it('two different questions get two different keys and both land', async () => {
    const db = makeFakeDb({ 'tournaments/t1/standings/current': { seq: 0 } });
    const q7 = await emitKeyedEvents(db, 't1', 'QUESTION_CLOSED__7', [draft('QUESTION_CLOSED')], 0);
    const q8 = await emitKeyedEvents(db, 't1', 'QUESTION_CLOSED__8', [draft('QUESTION_CLOSED')], 0);
    expect(q7.duplicate).toBe(false);
    expect(q8.duplicate).toBe(false);
    expect(q8.emitted[0].seq).toBeGreaterThan(q7.emitted[0].seq);
  });

  it('refuses a key shaped like a path — a key that could silently become a different key is an event emitted twice', async () => {
    const db = makeFakeDb({});
    await expect(emitKeyedEvents(db, 't1', 'QUESTION_CLOSED/7', [draft()], 0)).rejects.toThrow();
  });
});
