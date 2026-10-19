/**
 * Class spaces, later extensions: class-vs-class fixtures on the tournament
 * engine, verified-class tournament grouping, teacher mastery analytics,
 * houses and account deletion. In-memory Firestore (helpers/fakeFirestore):
 * domain logic and integrity, not real contention.
 */
import { FakeDb } from './helpers/fakeFirestore';

const mockDb = new FakeDb();
const db = mockDb as any;
jest.mock('../_lib/firebaseAdmin', () => ({ isAdminConfigured: () => true, getDb: () => mockDb, verifyIdToken: async () => ({ uid: 'x' }) }));
jest.mock('../_lib/requireAuth', () => ({
  requireAuthDecoded: async (req: any, res: any) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) { res.status(401).json({ error: 'unauthorized' }); return null; }
    return { uid, name: `${uid} Lastname` };
  },
}));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }) }));
jest.mock('../_lib/explainGate', () => ({ examFetcher: () => async () => ({ exam_id: 'exam1', sections: [{ questions: [{ type: 'multiple_choice', question: '2+2?', options: { a: '4', b: '3' }, correct: 'a', points: 2 }] }] }) }));
jest.mock('../_lib/classCatalog', () => ({
  fetchCourseCatalog: async () => [{ id: 'math-ns4', name: 'Maths NS4', level: 'ns4', units: [
    { id: 'U1', title: 'Fonctions', lessons: [{ id: 'L1', title: 'Limites' }, { id: 'L2', title: 'Dérivées' }] },
    { id: 'U2', title: 'Suites', lessons: [{ id: 'L3', title: 'Récurrence' }] },
  ] }, { id: 'phys-ns1', name: 'Physique NS1', level: 'ns1', units: [{ id: 'P1', title: 'Forces', lessons: [{ id: 'P1L1', title: 'Poids' }] }] }],
}));

import { createClass, joinClass, mutateClass, readClass, eraseClassAccount, classHome } from '../_lib/classSpaces';
import { acceptFixture, closeFixture, fixtureOutcome, joinFixture, previewFixture, proposeFixture } from '../_lib/classFixtures';
import { classAnalytics, buildAnalytics } from '../_lib/classAnalytics';
import { classTeamKey } from '../tournois/_shared';
import { rankAverageTeams, rankTournamentTeams } from '../../shared/tournois/scoring';
import { validateTournamentInput } from '../../shared/tournois/config';
import { balanceHouses, keepAndFill, parseHouses, smallestHouse } from '../../shared/classHouses';
import { CLASS_CONSENT_VERSION, classWeek, firstName } from '../../shared/classes';
import createHandler from '../tournois/create';
import joinHandler from '../tournois/join';
import playHandler from '../tournois/play';
import tickHandler from '../tournois/tick';

let clock = Date.UTC(2026, 9, 20, 12);
jest.spyOn(Date, 'now').mockImplementation(() => clock);
const MIN = 60_000, HOUR = 60 * MIN;

function call(handler: (req: any, res: any) => Promise<void>, body: any, uid?: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    let status = 200;
    const res: any = { setHeader: () => res, status: (s: number) => { status = s; return res; }, json: (b: any) => { resolve({ status, body: b }); return res; } };
    handler({ method: 'POST', body, headers: uid ? { 'x-test-uid': uid } : {} }, res).catch((err) => resolve({ status: 500, body: { error: String(err) } }));
  });
}
const store = (p: string): any => mockDb.store.get(p);
const grant = (uid: string, active = true) => mockDb.store.set(`classTeachers/${uid}`, { active });

/** A class owned by `teacher`, with approved `students` (uid → display name). */
async function classWith(teacher: string, title: string, students: Record<string, string>, request = title.replace(/\W/g, '_')) {
  grant(teacher);
  const { id } = await createClass(db, teacher, { title, school: `Lycée ${title}`, grade: 'NS4', requestId: request }, clock);
  for (const [uid, name] of Object.entries(students)) {
    await joinClass(db, uid, name, store(`classes/${id}`).code, clock);
    await mutateClass(db, teacher, 'approve', { id, studentUid: uid }, clock);
  }
  return id;
}
const fixtureBody = (id: string, extra: Record<string, unknown> = {}) => ({
  id, requestId: 'fx1', categories: ['capitals'], questionCount: 5, secondsPerQuestion: 15, startsAt: clock + 10 * MIN, windowHours: 24, teamSize: 3, aggregate: 'average', ...extra,
});

/** Play one window attempt, answering `right` of five correctly. */
async function play(tid: string, uid: string, right: number) {
  const s = await call(playHandler, { action: 'start', tid }, uid);
  expect(s.status).toBe(200);
  const pool = store(`userTournaments/${tid}/questions/r0`)!.items;
  const order = store(`userTournaments/${tid}/attempts/0_${uid}`)!.order;
  for (let i = 0; i < 5; i += 1) {
    clock += 1000;
    const q = pool[order[i]];
    await call(playHandler, { action: 'answer', tid, round: 0, pos: i, choice: i < right ? q.answer : (q.answer + 1) % q.options.length }, uid);
  }
}

beforeEach(() => { mockDb.store.clear(); clock = Date.UTC(2026, 9, 20, 12); });

describe('class-vs-class fixtures', () => {
  it('needs an approved teacher on both sides and both acceptances; the code reveals only the class name', async () => {
    const a = await classWith('tA', 'NS4 A', { s1: 'Alice Dupont' });
    const b = await classWith('tB', 'NS4 B', { s2: 'Bruno Pierre' });
    await expect(proposeFixture(db, 's1', fixtureBody(a), clock)).rejects.toMatchObject({ code: 'teacher_required' });
    await expect(proposeFixture(db, 'tB', fixtureBody(a), clock)).rejects.toMatchObject({ code: 'forbidden' });
    const { code, id } = await proposeFixture(db, 'tA', fixtureBody(a), clock);
    // Idempotent per request id.
    expect((await proposeFixture(db, 'tA', fixtureBody(a), clock)).id).toBe(id);
    expect([...mockDb.store.keys()].filter((k) => k.startsWith('classFixtureCodes/'))).toHaveLength(1);
    // A student holding the code cannot preview or accept.
    await expect(previewFixture(db, 's2', code)).rejects.toMatchObject({ code: 'teacher_required' });
    const preview = await previewFixture(db, 'tB', code);
    expect(preview.home).toEqual({ title: 'NS4 A', school: 'Lycée NS4 A' });
    expect(JSON.stringify(preview)).not.toMatch(/Alice|s1|tA|"code"/);
    await expect(acceptFixture(db, 'tA', code, a, clock)).rejects.toMatchObject({ code: 'same_class' });
    await expect(acceptFixture(db, 'tA', code, b, clock)).rejects.toMatchObject({ code: 'forbidden' });
    // The proposer's grant must still stand at acceptance.
    grant('tA', false);
    await expect(acceptFixture(db, 'tB', code, b, clock)).rejects.toMatchObject({ code: 'teacher_required' });
    grant('tA');
    const out = await acceptFixture(db, 'tB', code, b, clock);
    const t = store(`userTournaments/${out.tid}`);
    expect(t).toMatchObject({ format: 'window', teamRule: 'class', teamAggregate: 'average', teamSize: 3, visibility: 'private', pin: '', classIds: [a, b], classTeacherUids: ['tA', 'tB'], creatorPlays: false });
    expect(store(`classFixtures/${id}`).state).toBe('accepted');
    expect(store(`classFixtureCodes/${code}`)).toBeUndefined();
    await expect(acceptFixture(db, 'tB', code, b, clock)).rejects.toMatchObject({ code: 'not_found' });
    // Both class boards list it.
    expect((await readClass(db, 's1', a, clock)).fixtures![0]).toMatchObject({ side: 'home', opponent: { title: 'NS4 B' }, phase: 'upcoming' });
    expect((await readClass(db, 's2', b, clock)).fixtures![0]).toMatchObject({ side: 'away', opponent: { title: 'NS4 A' } });
  });

  it('decline and cancel close only a waiting challenge; archiving withdraws it', async () => {
    const a = await classWith('tA', 'NS4 A', {});
    grant('tB');
    const first = await proposeFixture(db, 'tA', fixtureBody(a), clock);
    await closeFixture(db, 'tB', { code: first.code }, 'fixture-decline', clock);
    expect(store(`classFixtures/${first.id}`).state).toBe('declined');
    const second = await proposeFixture(db, 'tA', fixtureBody(a, { requestId: 'fx2' }), clock);
    await expect(closeFixture(db, 'tB', { fixtureId: second.id }, 'fixture-cancel', clock)).rejects.toMatchObject({ code: 'forbidden' });
    const third = await proposeFixture(db, 'tA', fixtureBody(a, { requestId: 'fx3' }), clock);
    await mutateClass(db, 'tA', 'archive', { id: a }, clock);
    expect(store(`classFixtures/${second.id}`).state).toBe('cancelled');
    expect(store(`classFixtureCodes/${third.code}`)).toBeUndefined();
  });

  it('runs on the engine: verified members only, first names only, server-scored, fair class result on both boards', async () => {
    // A small strong class against a large one: average of best 3 must not reward turnout.
    const a = await classWith('tA', 'NS4 A', { a1: 'Alice Dupont', a2: 'Anne Joseph', a3: 'Ariel Jean' });
    const big: Record<string, string> = {};
    for (let i = 1; i <= 8; i += 1) big[`b${i}`] = `Bruno${i} Pierre`;
    const b = await classWith('tB', 'NS4 B', big);
    const c = await classWith('tC', 'NS4 C', { c1: 'Carl Noel' });
    await joinClass(db, 'pending', 'Paul Pending', store(`classes/${a}`).code, clock);
    const { code } = await proposeFixture(db, 'tA', fixtureBody(a), clock);
    const { tid } = await acceptFixture(db, 'tB', code, b, clock);
    // Outsiders: another class, a pending requester, the teachers, a bare tid.
    await expect(joinFixture(db, 'c1', c, store(`userTournaments/${tid}`).classFixtureId, clock)).rejects.toMatchObject({ code: 'not_found' });
    await expect(joinFixture(db, 'pending', a, store(`userTournaments/${tid}`).classFixtureId, clock)).rejects.toMatchObject({ code: 'forbidden' });
    expect((await call(joinHandler, { tid }, 'c1')).body.error).toBe('pin_required');
    const fid = store(`userTournaments/${tid}`).classFixtureId;
    for (const uid of ['a1', 'a2', 'a3']) await joinFixture(db, uid, a, fid, clock);
    for (const uid of Object.keys(big)) await joinFixture(db, uid, b, fid, clock);
    const roster = mockDb.childrenOf(`userTournaments/${tid}/roster`).map(([, r]) => r);
    expect(roster.map((r) => r.displayName)).toEqual(expect.arrayContaining(['Alice', 'Bruno1']));
    expect(JSON.stringify(roster)).not.toMatch(/Dupont|Pierre/);
    expect(JSON.stringify(roster)).not.toContain(a); // the class id never reaches a client-readable doc
    expect(roster[0].classKey).toBe(classTeamKey(a));
    // A removed student cannot enter afterwards.
    await mutateClass(db, 'tB', 'remove', { id: b, studentUid: 'b8' }, clock);
    clock += 30 * MIN;
    for (const uid of ['a1', 'a2', 'a3']) await play(tid, uid, 4);
    for (const uid of Object.keys(big).slice(0, 7)) await play(tid, uid, uid === 'b1' ? 5 : 2);
    // Client-sent score fields are ignored: points come from the server-held key only.
    expect(store(`userTournaments/${tid}/players/a1`).points).toBe(4000);
    clock += 25 * HOUR;
    expect((await call(tickHandler, { tid })).body.state).toBe('finished');
    const teams = store(`userTournaments/${tid}/standings/current`).teams;
    expect(teams.find((x: any) => x.key === classTeamKey(a))).toMatchObject({ score: 4000, counted: 3, qualified: true });
    // B's best three: 5000, 2000, 2000 → 3000. Seven players do not help.
    expect(teams.find((x: any) => x.key === classTeamKey(b))).toMatchObject({ score: 3000, counted: 3 });
    const home = (await readClass(db, 'a1', a, clock)).fixtures![0];
    const away = (await readClass(db, 'tB', b, clock)).fixtures![0];
    expect(home).toMatchObject({ phase: 'final', outcome: 'win', joined: true, mine: { score: 4000 }, theirs: { score: 3000 } });
    expect(away).toMatchObject({ phase: 'final', outcome: 'loss' });
    expect(JSON.stringify(home)).not.toMatch(/"answer"|Pierre|Dupont/);
  });

  it('decides an outcome only between classes that reached their minimum', () => {
    const q = (score: number, qualified = true) => ({ score, counted: 3, members: 3, qualified, needed: 0 });
    expect(fixtureOutcome(q(10), q(5))).toBe('win');
    expect(fixtureOutcome(q(5), q(5))).toBe('draw');
    expect(fixtureOutcome(q(10, false), q(1))).toBe('loss');
    expect(fixtureOutcome(null, null)).toBe('none');
  });
});

describe('team scoring fairness', () => {
  const row = (uid: string, classKey: string, points: number, answered = 5) => ({ uid, displayName: uid, classKey, classLabel: classKey, points, correct: 0, answered, totalMs: 0 });
  it('average of best N: turnout beyond N earns nothing, a short class still qualifies, joined-but-absent players are not counted', () => {
    const rows = [row('s1', 'small', 4000), row('s2', 'small', 4000), ...Array.from({ length: 30 }, (_, i) => row(`b${i}`, 'big', 3000)), row('ghost', 'small', 0, 0)];
    const [first, second] = rankAverageTeams('class', 5, rows);
    // Two players are below the minimum of three for N=5: ranked after every qualified class.
    expect(first).toMatchObject({ key: 'big', teamXp: 3000, counted: 5, qualified: true, rank: 1 });
    expect(second).toMatchObject({ key: 'small', teamXp: 4000, counted: 2, members: 3, qualified: false, needed: 1, rank: 0 });
    const three = rankAverageTeams('class', 5, [...rows, row('s3', 'small', 3500)]);
    expect(three[0]).toMatchObject({ key: 'small', rank: 1, teamXp: 3833, qualified: true });
  });
  it('sum of best N stays the Arène rule and is the default', () => {
    const rows = [row('s1', 'small', 4000), row('s2', 'small', 4000), ...Array.from({ length: 6 }, (_, i) => row(`b${i}`, 'big', 1000))];
    const [top] = rankTournamentTeams('class', 3, rows);
    expect(top).toMatchObject({ key: 'big', teamXp: 3000, qualified: true });
    expect(rankTournamentTeams('class', 3, rows).find((x) => x.key === 'small')?.qualified).toBe(false);
  });
  it('the aggregate option is validated and only stored when chosen', () => {
    const base = { title: 'Défi', format: 'window', teamRule: 'class', teamSize: 3, visibility: 'private', categories: ['capitals'], questionCount: 5, secondsPerQuestion: 15, startsAt: clock + 5 * MIN, windowHours: 2 };
    const sum = validateTournamentInput(base, clock, ['capitals']);
    expect(sum.ok && 'teamAggregate' in sum.config).toBe(false);
    const avg = validateTournamentInput({ ...base, teamAggregate: 'average' }, clock, ['capitals']);
    expect(avg.ok && avg.config.teamAggregate).toBe('average');
    expect(validateTournamentInput({ ...base, teamAggregate: 'median' }, clock, ['capitals'])).toMatchObject({ ok: false, errors: ['teamAggregate'] });
  });
});

describe('verified-class tournament grouping', () => {
  it('groups by approved class membership, never by a self-declared level', async () => {
    const a = await classWith('tA', 'NS3 A', { s1: 'Alice Dupont', s2: 'Anne Joseph' });
    const b = await classWith('tB', 'NS3 B', { s3: 'Bruno Pierre' });
    await joinClass(db, 'waiting', 'Will', store(`classes/${b}`).code, clock);
    const created = await call(createHandler, { title: 'Classes de NS3', format: 'window', teamRule: 'class', teamSize: 3, visibility: 'unlisted', categories: ['capitals'], questionCount: 5, secondsPerQuestion: 15, startsAt: clock + 5 * MIN, windowHours: 2, creatorPlays: false }, 'organiser');
    expect(created.status).toBe(200);
    const tid = created.body.tid;
    expect((await call(joinHandler, { tid, grade: 'NS3' }, 'nobody')).body.error).toBe('class_required');
    expect((await call(joinHandler, { tid }, 'waiting')).body.error).toBe('class_required');
    for (const uid of ['s1', 's2', 's3']) expect((await call(joinHandler, { tid, grade: 'NS1' }, uid)).body.ok).toBe(true);
    expect(store(`userTournaments/${tid}/roster/s1`)).toMatchObject({ classKey: classTeamKey(a), classLabel: 'NS3 A · Lycée NS3 A' });
    expect(store(`userTournaments/${tid}/players/s3`).classId).toBe(b);
    clock += 10 * MIN;
    await play(tid, 's1', 3); await play(tid, 's2', 1); await play(tid, 's3', 5);
    clock += 3 * HOUR;
    await call(tickHandler, { tid });
    const teams = store(`userTournaments/${tid}/standings/current`).teams;
    expect(teams.map((x: any) => x.label).sort()).toEqual(['NS3 A · Lycée NS3 A', 'NS3 B · Lycée NS3 B']);
    expect(teams.find((x: any) => x.key === classTeamKey(a))).toMatchObject({ score: 4000, members: 2 });
  });
  it('a student who left their class can no longer join under it', async () => {
    const a = await classWith('tA', 'NS3 A', { s1: 'Alice' });
    const created = await call(createHandler, { title: 'Classes', format: 'window', teamRule: 'class', teamSize: 3, visibility: 'unlisted', categories: ['capitals'], questionCount: 5, secondsPerQuestion: 15, startsAt: clock + 5 * MIN, windowHours: 2, creatorPlays: false }, 'organiser');
    await mutateClass(db, 's1', 'leave', { id: a }, clock);
    expect((await call(joinHandler, { tid: created.body.tid, classId: a }, 's1')).body.error).toBe('class_required');
  });
});

describe('membership drift in class tournaments', () => {
  const newTournament = async () => (await call(createHandler, { title: 'Classes', format: 'window', teamRule: 'class', teamSize: 3, visibility: 'unlisted', categories: ['capitals'], questionCount: 5, secondsPerQuestion: 15, startsAt: clock + 5 * MIN, windowHours: 4, creatorPlays: false }, 'organiser')).body.tid;
  it('a removed student keeps their own points but stops counting for the class and cannot play on', async () => {
    const a = await classWith('tA', 'NS3 A', { s1: 'Alice', s2: 'Anne' });
    const b = await classWith('tB', 'NS3 B', { s3: 'Bruno', s4: 'Berto' });
    const tid = await newTournament();
    for (const uid of ['s1', 's2', 's3', 's4']) await call(joinHandler, { tid }, uid);
    clock += 10 * MIN;
    await play(tid, 's3', 5);
    // s4 starts, then is removed mid-attempt.
    expect((await call(playHandler, { action: 'start', tid }, 's4')).status).toBe(200);
    await mutateClass(db, 'tB', 'remove', { id: b, studentUid: 's4' }, clock);
    expect((await call(playHandler, { action: 'answer', tid, round: 0, pos: 0, choice: 0 }, 's4')).body.error).toBe('class_required');
    expect((await call(playHandler, { action: 'start', tid }, 's4')).body.error).toBe('class_required');
    expect(store(`userTournaments/${tid}/players/s4`)).toMatchObject({ classKey: null, classDetached: true });
    // s3 leaves after playing: standings rebuild without them in B, their points untouched.
    await mutateClass(db, 's3', 'leave', { id: b }, clock);
    const st = store(`userTournaments/${tid}/standings/current`);
    expect(st.teams.find((x: any) => x.key === classTeamKey(b))).toBeUndefined();
    expect(st.rows.find((r: any) => r.uid === 's3').points).toBe(5000);
    expect(store(`userTournaments/${tid}/players/s3`).points).toBe(5000);
    // A student who left before playing is refused too.
    await mutateClass(db, 's2', 'leave', { id: a }, clock);
    expect((await call(playHandler, { action: 'start', tid }, 's2')).body.error).toBe('class_required');
    await play(tid, 's1', 3);
  });
  it('standings re-check membership even without a detach (archived class, edited record)', async () => {
    const a = await classWith('tA', 'NS3 A', { s1: 'Alice' });
    const b = await classWith('tB', 'NS3 B', { s3: 'Bruno' });
    const tid = await newTournament();
    for (const uid of ['s1', 's3']) await call(joinHandler, { tid }, uid);
    clock += 10 * MIN;
    await play(tid, 's1', 2); await play(tid, 's3', 4);
    await mutateClass(db, 'tB', 'archive', { id: b }, clock);
    // Membership vanished without the detach path (e.g. an interrupted request).
    const ca = store(`classes/${a}`); delete ca.members.s1; mockDb.store.set(`classes/${a}`, ca);
    clock += 5 * HOUR;
    await call(tickHandler, { tid });
    const st = store(`userTournaments/${tid}/standings/current`);
    expect(st.final).toBe(true);
    expect(st.teams).toEqual([]);
    expect(st.rows.map((r: any) => [r.uid, r.points])).toEqual([['s3', 4000], ['s1', 2000]]);
  });
  it('account deletion of a student detaches them from the class group', async () => {
    const a = await classWith('tA', 'NS3 A', { s1: 'Alice', s2: 'Anne' });
    const tid = await newTournament();
    for (const uid of ['s1', 's2']) await call(joinHandler, { tid }, uid);
    await eraseClassAccount(db, 's1');
    expect(store(`userTournaments/${tid}/roster/s1`)).toMatchObject({ classKey: null, classLabel: null });
    expect(store(`userTournaments/${tid}/roster/s2`).classKey).toBe(classTeamKey(a));
  });
});

describe('teacher mastery analytics', () => {
  it('aggregates per chapter and per lesson from the shared mastery doc, with no answers, scores or non-consenting students', async () => {
    const id = await classWith('tA', 'NS4 A', { s1: 'Alice Dupont', s2: 'Bruno Pierre', s3: 'Carl Noel' });
    // s3 joined under the earlier disclosure.
    const c = store(`classes/${id}`); c.members.s3.consent = 1; mockDb.store.set(`classes/${id}`, c);
    mockDb.store.set('users/s1/mastery/lessons', { lessons: { L1: { masteredAt: 1 }, L2: { masteredAt: 2 }, L3: { bestPct: 40 } }, answers: { q1: 'SECRET-ANSWER' }, transcript: 'SANDRA-CHAT' });
    mockDb.store.set('users/s2/mastery/lessons', { lessons: { L1: { bestPct: 100 }, L2: { completed: true } } });
    mockDb.store.set('users/s3/mastery/lessons', { lessons: { L1: { masteredAt: 1 } } });
    await mutateClass(db, 'tA', 'assign', { id, requestId: 'as1', title: 'Maths', examId: 'exam1', level: 'terminale', dueAt: clock + 86400000 }, clock);
    const aid = store(`classes/${id}`).assignments[0].id;
    mockDb.store.set(`classes/${id}/state/completions`, { byUid: { s1: { [aid]: { late: false, objectiveScore: 90 } }, s2: { [aid]: { late: true, objectiveScore: 10 } } } });
    await expect(classAnalytics(db, 's1', id, 'math-ns4')).rejects.toMatchObject({ code: 'forbidden' });
    const out = await classAnalytics(db, 'tA', id, undefined);
    expect(out.courseId).toBe('math-ns4'); // NS4 class → the NS4 course by default
    expect(out).toMatchObject({ shared: 2, notShared: 1 });
    const [fonctions, suites] = out.chapters;
    expect(fonctions.counts).toEqual({ none: 0, seen: 1, familiar: 0, proficient: 0, mastered: 1 });
    expect(fonctions.percent.mastered).toBe(50);
    expect(fonctions.lessonRows[0].counts).toEqual({ none: 0, seen: 0, familiar: 0, proficient: 1, mastered: 1 });
    expect(suites.counts).toEqual({ none: 1, seen: 1, familiar: 0, proficient: 0, mastered: 0 });
    expect(out.weakest[0]).toBe('U2');
    expect(out.students.map((s) => s.uid)).toEqual(['s2', 's1']);
    expect(out.students.find((s) => s.uid === 's1')!.levels).toEqual({ U1: 'mastered', U2: 'seen' });
    expect(out.assignments[0]).toMatchObject({ completed: 2, onTime: 1, late: 1, rate: 67 });
    const json = JSON.stringify(out);
    for (const leak of ['SECRET-ANSWER', 'SANDRA-CHAT', 'bestPct', 'masteredAt', 'objectiveScore', 's3']) expect(json).not.toContain(leak);
    // Re-accepting the current disclosure brings the student in.
    await mutateClass(db, 's3', 'share-mastery', { id }, clock);
    expect((await classAnalytics(db, 'tA', id, 'math-ns4')).shared).toBe(3);
    expect(store(`classes/${id}`).members.s3.consent).toBe(CLASS_CONSENT_VERSION);
  });
  it('handles an empty class and a course choice', () => {
    const c: any = { members: {}, assignments: [], grade: '' };
    const out = buildAnalytics(c, null, [], {}, {});
    expect(out).toMatchObject({ shared: 0, notShared: 0, chapters: [], weakest: [] });
  });
});

describe('houses', () => {
  it('validates names and colours', () => {
    expect(parseHouses([{ name: ' Toussaint ', color: 'azure' }, { name: 'Dessalines', color: 'rose' }]).map((h) => h.id)).toEqual(['h1', 'h2']);
    expect(() => parseHouses([{ name: 'Seule', color: 'azure' }])).toThrow();
    expect(() => parseHouses([{ name: 'A', color: 'azure' }, { name: 'B', color: 'azure' }])).toThrow();
    expect(() => parseHouses(Array.from({ length: 7 }, (_, i) => ({ name: `H${i}`, color: 'azure' })))).toThrow();
    expect(() => parseHouses([{ name: 'A', color: 'azure' }, { name: '', color: 'rose' }])).toThrow();
  });
  it('balances headcount within one and spreads the strongest (snake draft)', () => {
    const uids = Array.from({ length: 11 }, (_, i) => `u${i}`);
    const strength = Object.fromEntries(uids.map((u, i) => [u, 100 - i]));
    const split = balanceHouses(uids, ['h1', 'h2', 'h3'], strength);
    const counts = ['h1', 'h2', 'h3'].map((h) => Object.values(split).filter((x) => x === h).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect([split.u0, split.u1, split.u2, split.u3, split.u4, split.u5]).toEqual(['h1', 'h2', 'h3', 'h3', 'h2', 'h1']);
    expect(smallestHouse(['h1', 'h2'], { a: 'h1' }, ['a'])).toBe('h2');
    expect(keepAndFill(['a', 'b', 'c'], ['h1', 'h2'], { a: 'h2', b: 'gone' })).toEqual({ a: 'h2', b: 'h1', c: 'h1' });
  });
  it('teacher splits the class; new members fill the smallest house; the weekly board shows house totals; students see their house', async () => {
    const id = await classWith('tA', 'NS4 A', { s1: 'Alice', s2: 'Bruno', s3: 'Carl', s4: 'Dina' });
    mockDb.store.set(`classes/${id}/weeks/${classWeek(clock)}`, { xp: { s1: 100, s2: 80, s3: 60, s4: 40 }, completed: {} });
    await expect(mutateClass(db, 's1', 'houses-set', { id, houses: [] }, clock)).rejects.toMatchObject({ code: 'forbidden' });
    await mutateClass(db, 'tA', 'houses-set', { id, houses: [{ name: 'Toussaint', color: 'azure' }, { name: 'Dessalines', color: 'rose' }], mode: 'auto' }, clock);
    expect(store(`classes/${id}`).houseOf).toEqual({ s1: 'h1', s2: 'h2', s3: 'h2', s4: 'h1' });
    await joinClass(db, 's5', 'Eva', store(`classes/${id}`).code, clock);
    await mutateClass(db, 'tA', 'approve', { id, studentUid: 's5' }, clock);
    expect(store(`classes/${id}`).houseOf.s5).toBe('h1');
    await mutateClass(db, 'tA', 'house-move', { id, studentUid: 's5', houseId: 'h2' }, clock);
    await expect(mutateClass(db, 'tA', 'house-move', { id, studentUid: 's5', houseId: 'h9' }, clock)).rejects.toMatchObject({ code: 'not_found' });
    const student = await readClass(db, 's2', id, clock);
    expect(student.myHouse).toBe('h2');
    expect(student.houses!.map((h) => [h.name, h.xp, h.members, h.rank])).toEqual([['Toussaint', 140, 2, 1], ['Dessalines', 140, 3, 1]]);
    // Classmates see first names only; the teacher sees the stored name.
    await mutateClass(db, 'tA', 'remove', { id, studentUid: 's5' }, clock);
    expect(store(`classes/${id}`).houseOf.s5).toBeUndefined();
    await mutateClass(db, 'tA', 'houses-clear', { id }, clock);
    expect((await readClass(db, 's2', id, clock)).houses).toEqual([]);
  });
  it('classmates see first names; the teacher sees the stored name', async () => {
    const id = await classWith('tA', 'NS4 A', { s1: 'Alice Dupont', s2: 'Bruno Pierre' });
    const student = await readClass(db, 's1', id, clock);
    expect(student.members.map((m) => m.name).sort()).toEqual(['Alice Dupont', 'Bruno']);
    expect((await readClass(db, 'tA', id, clock)).members.map((m) => m.name).sort()).toEqual(['Alice Dupont', 'Bruno Pierre']);
    expect(firstName('  ')).toBe('Élève');
  });
});

describe('account deletion', () => {
  it('erases a student from houses and a teacher from fixtures, keeping played results under a neutral name', async () => {
    const a = await classWith('tA', 'NS4 A', { s1: 'Alice' });
    const b = await classWith('tB', 'NS4 B', { s2: 'Bruno' });
    await mutateClass(db, 'tA', 'houses-set', { id: a, houses: [{ name: 'Un', color: 'azure' }, { name: 'Deux', color: 'rose' }] }, clock);
    const played = await proposeFixture(db, 'tA', fixtureBody(a), clock);
    const { tid } = await acceptFixture(db, 'tB', played.code, b, clock);
    const waiting = await proposeFixture(db, 'tA', fixtureBody(a, { requestId: 'fx2' }), clock);
    await eraseClassAccount(db, 's1');
    expect(store(`classes/${a}`).houseOf).toEqual({});
    await eraseClassAccount(db, 'tA');
    expect(store(`classes/${a}`)).toBeUndefined();
    expect(store(`classFixtures/${waiting.id}`)).toBeUndefined();
    expect(store(`classFixtureCodes/${waiting.code}`)).toBeUndefined();
    expect(store(`classFixtures/${played.id}`).home).toEqual({ classId: a, title: 'Classe supprimée', school: '', teacherUid: '' });
    expect(store(`userTournaments/${tid}`).classTeacherUids).toEqual(['tB']);
    expect(JSON.stringify([...mockDb.store.entries()].filter(([k]) => k.startsWith('class')))).not.toMatch(/"tA"|NS4 A/);
    expect((await readClass(db, 's2', b, clock)).fixtures![0].opponent).toEqual({ title: 'Classe supprimée', school: '' });
    expect((await classHome(db, 's2')).classes).toHaveLength(1);
  });
});
