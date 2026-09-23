/**
 * The Tournois endpoints, end to end, against an in-memory Firestore.
 *
 * What these pin down is the integrity model, not the plumbing:
 *  - no response and no client-readable document carries a key before its reveal;
 *  - a tick is idempotent (a second tick at the same instant writes nothing);
 *  - a late tick walks through every reveal it skipped;
 *  - round corrections open only when the round closes;
 *  - a private room cannot be joined from a leaked id;
 *  - a knockout resolves one round at a time into a single winner.
 */

import { FakeDb } from './helpers/fakeFirestore';

const mockDb = new FakeDb();
const db = mockDb;

jest.mock('../_lib/firebaseAdmin', () => ({
  isAdminConfigured: () => true,
  getDb: () => mockDb,
  verifyIdToken: async () => ({ uid: 'x' }),
}));
jest.mock('../_lib/requireAuth', () => ({
  requireAuthDecoded: async (req: any, res: any) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    return { uid, name: req.headers['x-test-name'] || 'Élève' };
  },
}));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }),
}));

import createHandler from '../tournois/create';
import joinHandler from '../tournois/join';
import playHandler from '../tournois/play';
import tickHandler from '../tournois/tick';

let clock = Date.UTC(2026, 9, 1, 14, 0, 0);
jest.spyOn(Date, 'now').mockImplementation(() => clock);

function call(handler: (req: any, res: any) => Promise<void>, body: any, uid?: string, method = 'POST', headers: any = {}) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    let status = 200;
    const res: any = {
      setHeader: () => res,
      status: (s: number) => { status = s; return res; },
      json: (b: any) => { resolve({ status, body: b }); return res; },
    };
    const req: any = {
      method,
      body,
      headers: { ...(uid ? { 'x-test-uid': uid, 'x-test-name': `${uid} Lastname` } : {}), ...headers },
    };
    handler(req, res).catch((err) => resolve({ status: 500, body: { error: String(err) } }));
  });
}

const doc = (path: string) => db.store.get(path);
const MIN = 60_000;
const HOUR = 60 * MIN;

/** Anything a client can read must never hold an answer key before its reveal. */
function assertNoKeyIn(v: unknown) {
  const json = JSON.stringify(v ?? null);
  expect(json).not.toMatch(/"answer"\s*:/);
  expect(json).not.toMatch(/"explanation"\s*:/);
}

describe('live tournament', () => {
  let tid = '';
  let pin = '';
  let startsAt = 0;

  it('creates with a server draw and a PIN; the creator plays', async () => {
    startsAt = clock + 5 * MIN;
    const r = await call(createHandler, {
      title: 'Défi NS3', format: 'live', teamRule: 'solo', visibility: 'public',
      categories: ['maths_eclair', 'sciences'], questionCount: 5, secondsPerQuestion: 10, startsAt,
    }, 'alice');
    expect(r.status).toBe(200);
    tid = r.body.tid;
    pin = r.body.pin;
    expect(pin).toMatch(/^\d{6}$/);
    expect(doc(`tournamentPins/${pin}`)).toEqual({ tid, createdAt: clock });
    expect(doc(`userTournaments/${tid}/questions/live`)!.items).toHaveLength(5);
    expect(doc(`userTournaments/${tid}/roster/alice`)!.displayName).toBe('alice');
    expect(doc(`userTournaments/${tid}`)!.playerCount).toBe(1);
    // The tournament doc a spectator reads carries no key.
    assertNoKeyIn(doc(`userTournaments/${tid}`));
    assertNoKeyIn(doc(`userTournaments/${tid}/live/state`));
  });

  it('joins by PIN, once', async () => {
    const a = await call(joinHandler, { pin }, 'bob');
    expect(a.body).toEqual({ ok: true, tid, already: false });
    const b = await call(joinHandler, { pin }, 'bob');
    expect(b.body.already).toBe(true);
    expect(doc(`userTournaments/${tid}`)!.playerCount).toBe(2);
    expect(doc(`users/bob/myTournaments/${tid}`)!.role).toBe('player');
  });

  it('a tick before the start does nothing', async () => {
    const r = await call(tickHandler, { tid });
    expect(r.body.steps).toBe(0);
    expect(doc(`userTournaments/${tid}/live/state`)!.phase).toBe('lobby');
  });

  it('opens question 1 for everyone — without its key — and a second tick is a noop', async () => {
    clock = startsAt + 1_000;
    const r = await call(tickHandler, { tid });
    expect(r.body.steps).toBe(1);
    const live = doc(`userTournaments/${tid}/live/state`)!;
    expect(live.phase).toBe('question');
    expect(live.index).toBe(0);
    expect(live.question.options.length).toBeGreaterThanOrEqual(2);
    expect(live.reveal).toBeNull();
    assertNoKeyIn(live);
    const before = JSON.stringify(doc(`userTournaments/${tid}/live/state`));
    const again = await call(tickHandler, { tid });
    expect(again.body.steps).toBe(0);
    expect(JSON.stringify(doc(`userTournaments/${tid}/live/state`))).toBe(before);
  });

  it('records answers and says nothing about them', async () => {
    const key = doc(`userTournaments/${tid}/questions/live`)!.items[0].answer;
    const wrong = (key + 1) % doc(`userTournaments/${tid}/questions/live`)!.items[0].options.length;
    clock = startsAt + 2_000;
    const a = await call(playHandler, { action: 'live-answer', tid, index: 0, choice: key, clientShownAt: startsAt }, 'alice');
    clock += 1_100; // the "N/M ont validé" count refreshes at most once a second
    const b = await call(playHandler, { action: 'live-answer', tid, index: 0, choice: wrong }, 'bob');
    expect(a.body).toEqual({ ok: true, recorded: true, duplicate: false });
    expect(b.body).toEqual({ ok: true, recorded: true, duplicate: false });
    assertNoKeyIn(a.body);
    // A second answer to the same question is a duplicate, not a change of mind.
    const again = await call(playHandler, { action: 'live-answer', tid, index: 0, choice: wrong }, 'alice');
    expect(again.body.duplicate).toBe(true);
    expect(doc(`userTournaments/${tid}/answers/0_alice`)!.choice).toBe(key);
    // A spectator who never joined cannot answer.
    const carol = await call(playHandler, { action: 'live-answer', tid, index: 0, choice: key }, 'carol');
    expect(carol.status).toBe(403);
    expect(doc(`userTournaments/${tid}/live/progress`)!.answered).toBe(2);
  });

  it('refuses an answer to a question that is not open', async () => {
    const r = await call(playHandler, { action: 'live-answer', tid, index: 1, choice: 0 }, 'alice');
    expect(r.status).toBe(409);
  });

  it('reveals the key, the counts and the standings when the question closes', async () => {
    clock = startsAt + 10_000 + 100;
    const r = await call(tickHandler, { tid });
    expect(r.body.steps).toBe(1);
    const live = doc(`userTournaments/${tid}/live/state`)!;
    expect(live.phase).toBe('reveal');
    expect(live.reveal.index).toBe(0);
    expect(live.reveal.answered).toBe(2);
    expect(live.reveal.correct).toBe(1);
    const st = doc(`userTournaments/${tid}/standings/current`)!;
    expect(st.rows[0]).toMatchObject({ uid: 'alice', points: 1000, rank: 1 });
    expect(st.rows[1]).toMatchObject({ uid: 'bob', points: 0, rank: 2 });
  });

  it('a late answer inside the grace is recorded and scores nothing', async () => {
    const r = await call(playHandler, { action: 'live-answer', tid, index: 0, choice: 0 }, 'dan');
    expect(r.status).toBe(403); // dan never joined
    await call(joinHandler, { tid }, 'dan');
    const key = doc(`userTournaments/${tid}/questions/live`)!.items[0].answer;
    const late = await call(playHandler, { action: 'live-answer', tid, index: 0, choice: key }, 'dan');
    expect(late.body.recorded).toBe(true);
    expect(doc(`userTournaments/${tid}/answers/0_dan`)).toMatchObject({ late: true, points: 0, correct: false });
  });

  it('a tick long after the end walks through every skipped reveal and finishes', async () => {
    clock = startsAt + 10 * MIN;
    const r = await call(tickHandler, { tid });
    expect(r.body.state).toBe('finished');
    const t = doc(`userTournaments/${tid}`)!;
    expect(t.state).toBe('finished');
    expect(t.nextDeadlineAt).toBeNull();
    expect(t.winner).toEqual({ uid: 'alice', displayName: 'alice' });
    expect(doc(`userTournaments/${tid}/standings/current`)!.final).toBe(true);
    const again = await call(tickHandler, { tid });
    expect(again.body.steps).toBe(0);
  });

  it('opens the full correction sheet after the end', async () => {
    const r = await call(playHandler, { action: 'review', tid }, 'bob');
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(5);
    expect(typeof r.body.items[0].answer).toBe('number');
  });
});

describe('window tournament', () => {
  let tid = '';
  let startsAt = 0;

  it('creates a pool three times the attempt, and serves each player their own order', async () => {
    clock = Date.UTC(2026, 9, 2, 8, 0, 0);
    startsAt = clock + 3 * MIN;
    const r = await call(createHandler, {
      title: 'Semaine des capitales', format: 'window', teamRule: 'school', teamSize: 3, visibility: 'unlisted',
      categories: ['capitals'], questionCount: 5, secondsPerQuestion: 15, startsAt, windowHours: 24,
      school: 'Lycée Pétion',
    }, 'alice');
    expect(r.status).toBe(200);
    tid = r.body.tid;
    expect(doc(`userTournaments/${tid}/questions/r0`)!.items).toHaveLength(15);
    const noSchool = await call(joinHandler, { tid }, 'bob');
    expect(noSchool.body.error).toBe('school_required');
    await call(joinHandler, { tid, school: 'Collège Canado' }, 'bob');
  });

  it('refuses a start before the window opens', async () => {
    const r = await call(playHandler, { action: 'start', tid }, 'alice');
    expect(r.status).toBe(409);
  });

  it('plays a round: every response is key-free, and the correction waits for the close', async () => {
    clock = startsAt + HOUR;
    let step = (await call(playHandler, { action: 'start', tid }, 'alice')).body;
    expect(step.pos).toBe(0);
    expect(step.count).toBe(5);
    assertNoKeyIn(step);
    const pool = doc(`userTournaments/${tid}/questions/r0`)!.items;
    const order = doc(`userTournaments/${tid}/attempts/0_alice`)!.order;
    for (let i = 0; i < 5; i += 1) {
      clock += 2_000;
      step = (await call(playHandler, { action: 'answer', tid, round: 0, pos: i, choice: pool[order[i]].answer }, 'alice')).body;
      assertNoKeyIn(step);
    }
    expect(step.done).toBe(true);
    const review = await call(playHandler, { action: 'review', tid, round: 0 }, 'alice');
    expect(review.status).toBe(409);
    expect(doc(`userTournaments/${tid}/players/alice`)!.points).toBe(5000);
  });

  it('closes a question left open past its time as unanswered', async () => {
    let step = (await call(playHandler, { action: 'start', tid }, 'bob')).body;
    expect(step.pos).toBe(0);
    clock += 60_000; // walked away
    step = (await call(playHandler, { action: 'start', tid }, 'bob')).body;
    expect(step.pos).toBe(1);
    expect(doc(`userTournaments/${tid}/attempts/0_bob`)!.choices[0]).toBe(-1);
  });

  it('finishes at the close, ranks schools on their best N, and opens the corrections', async () => {
    clock = startsAt + 25 * HOUR;
    const r = await call(tickHandler, { tid });
    expect(r.body.state).toBe('finished');
    const st = doc(`userTournaments/${tid}/standings/current`)!;
    expect(st.rows[0].uid).toBe('alice');
    expect(st.teams.map((x: any) => x.label)).toEqual(expect.arrayContaining(['Lycée Pétion', 'Collège Canado']));
    const review = await call(playHandler, { action: 'review', tid, round: 0 }, 'alice');
    expect(review.status).toBe(200);
    expect(review.body.items.every((i: any) => i.points === 1000)).toBe(true);
  });
});

describe('private tournament', () => {
  it('cannot be joined from its id alone — only with its PIN', async () => {
    clock = Date.UTC(2026, 9, 3, 8, 0, 0);
    const r = await call(createHandler, {
      title: 'Classe de NS2', format: 'rounds', teamRule: 'grade', visibility: 'private',
      categories: ['sciences'], questionCount: 5, secondsPerQuestion: 20, startsAt: clock + 10 * MIN,
      roundCount: 3, roundHours: 24, creatorPlays: false,
    }, 'teacher');
    expect(r.status).toBe(200);
    const { tid, pin } = r.body;
    expect(doc(`userTournaments/${tid}`)!.playerCount).toBe(0);
    const byId = await call(joinHandler, { tid, grade: 'NS2' }, 'eve');
    expect(byId.status).toBe(403);
    const noGrade = await call(joinHandler, { pin }, 'eve');
    expect(noGrade.body.error).toBe('grade_required');
    const byPin = await call(joinHandler, { pin, grade: 'NS2' }, 'eve');
    expect(byPin.body.ok).toBe(true);
    // Three rounds, three separate pools.
    expect(doc(`userTournaments/${tid}/questions/r2`)!.items.length).toBeGreaterThanOrEqual(5);
    // Cancel: creator only, before the start; the PIN is freed.
    expect((await call(createHandler, { action: 'cancel', tid }, 'eve')).status).toBe(403);
    expect((await call(createHandler, { action: 'cancel', tid }, 'teacher')).body.ok).toBe(true);
    expect(doc(`tournamentPins/${pin}`)).toBeUndefined();
  });
});

describe('knockout bracket', () => {
  let tid = '';
  let startsAt = 0;
  const play = async (uid: string, correctCount: number) => {
    const s = await call(playHandler, { action: 'start', tid }, uid);
    expect(s.status).toBe(200);
    const round = s.body.round;
    const pool = doc(`userTournaments/${tid}/questions/r${round}`)!.items;
    const order = doc(`userTournaments/${tid}/attempts/${round}_${uid}`)!.order;
    for (let i = 0; i < 5; i += 1) {
      clock += 1_000;
      const q = pool[order[i]];
      const choice = i < correctCount ? q.answer : (q.answer + 1) % q.options.length;
      await call(playHandler, { action: 'answer', tid, round, pos: i, choice }, uid);
    }
  };

  it('seeds by join order and gives the bye to the top seed', async () => {
    clock = Date.UTC(2026, 9, 4, 8, 0, 0);
    startsAt = clock + 5 * MIN;
    const r = await call(createHandler, {
      title: 'Coupe du lycée', format: 'bracket', visibility: 'public', categories: ['flags', 'capitals'],
      questionCount: 5, secondsPerQuestion: 10, startsAt, roundHours: 2, maxPlayers: 8,
    }, 'p1');
    tid = r.body.tid;
    await call(joinHandler, { tid }, 'p2');
    await call(joinHandler, { tid }, 'p3');
    clock = startsAt + 1_000;
    await call(tickHandler, { tid });
    const t = doc(`userTournaments/${tid}`)!;
    expect(t.state).toBe('running');
    expect(t.bracketRounds).toBe(2);
    expect(t.schedule.rounds).toHaveLength(2);
    const m0 = doc(`userTournaments/${tid}/matches/r0m0`)!;
    const m1 = doc(`userTournaments/${tid}/matches/r0m1`)!;
    expect(m0.status).toBe('bye');
    expect(m0.winnerUid).toBe('p1');
    expect([m1.a.uid, m1.b.uid].sort()).toEqual(['p2', 'p3']);
    // Late joins are refused once the bracket is drawn.
    expect((await call(joinHandler, { tid }, 'p4')).status).toBe(409);
    // The player with the bye does not play this round.
    expect((await call(playHandler, { action: 'start', tid }, 'p1')).status).toBe(403);
  });

  it('resolves round 1 on the score, pairs the winner into the final, and crowns a champion', async () => {
    await play('p2', 2);
    await play('p3', 4);
    clock = startsAt + 2 * HOUR + 1_000;
    await call(tickHandler, { tid });
    expect(doc(`userTournaments/${tid}/matches/r0m1`)!.winnerUid).toBe('p3');
    const final = doc(`userTournaments/${tid}/matches/r1m0`)!;
    expect([final.a.uid, final.b.uid]).toEqual(['p1', 'p3']);
    await play('p1', 1);
    await play('p3', 5);
    clock = startsAt + 4 * HOUR + 1_000;
    await call(tickHandler, { tid });
    const t = doc(`userTournaments/${tid}`)!;
    expect(t.state).toBe('finished');
    expect(t.winner.uid).toBe('p3');
    expect((await call(tickHandler, { tid })).body.steps).toBe(0);
  });
});

describe('cron sweep', () => {
  it('refuses without the secret, and advances overdue rooms with it', async () => {
    process.env.CRON_SECRET = 'test-secret';
    expect((await call(tickHandler, undefined, undefined, 'GET')).status).toBe(401);
    clock = Date.UTC(2026, 9, 5, 8, 0, 0);
    const r = await call(createHandler, {
      title: 'Nuit des drapeaux', format: 'live', visibility: 'public', categories: ['flags'],
      questionCount: 5, secondsPerQuestion: 10, startsAt: clock + 3 * MIN,
    }, 'zoe');
    clock += 3 * MIN + 500;
    const sweep = await call(tickHandler, undefined, undefined, 'GET', { authorization: 'Bearer test-secret' });
    expect(r.status).toBe(200);
    expect(sweep.body.advanced).toBeGreaterThanOrEqual(1);
    expect(doc(`userTournaments/${r.body.tid}/live/state`)!.phase).toBe('question');
  });
});
