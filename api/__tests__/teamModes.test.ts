/**
 * Shared-answer (J12) and relay (J13) team play, end to end against the
 * in-memory Firestore: creation gating, frozen roles, authority races,
 * failover, relay ownership, expired turns, reconnect and scoring.
 */
import { FakeDb } from './helpers/fakeFirestore';
import type { Firestore } from 'firebase-admin/firestore';

const mockDb = new FakeDb();
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
  verifyIdToken: async () => ({ uid: 'x' }),
}));
jest.mock('../_lib/requireAuth', () => ({
  requireAuthDecoded: async (req: any, res: any) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    }
    return { uid, name: uid };
  },
}));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }),
}));
const mockExpoPush = jest.fn(async (..._args: unknown[]) => ({ sent: 1, pruned: 0, failed: 0 }));
jest.mock('../_lib/expoPush', () => ({
  sendExpoPushToUser: (...args: unknown[]) => mockExpoPush(...args),
}));
jest.mock('../_lib/push', () => ({
  isPushConfigured: () => false,
  sendPushToUser: async () => ({}),
}));

import { mutateCompetition } from '../_lib/competition';
import playHandler from '../tournois/play';
import tickHandler from '../tournois/tick';
import { ABSENT_MS } from '../../shared/teams/modes';

const db = mockDb as unknown as Firestore;
const T0 = 1792340000000;
let clock = T0;
jest.spyOn(Date, 'now').mockImplementation(() => clock);
let sequence = 0;
const MIN = 60_000;

const mutate = (uid: string, action: string, values: Record<string, unknown> = {}) =>
  mutateCompetition(db, uid, uid, { action, operationId: `op_${++sequence}`, ...values }, clock);
const doc = (path: string) => mockDb.store.get(path)!;

function call(handler: (req: any, res: any) => Promise<void>, body: any, uid?: string) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    let status = 200;
    const res: any = {
      setHeader: () => res,
      status: (s: number) => { status = s; return res; },
      json: (b: any) => { resolve({ status, body: b }); return res; },
    };
    const req: any = { method: 'POST', body, headers: uid ? { 'x-test-uid': uid } : {} };
    handler(req, res).catch((err) => resolve({ status: 500, body: { error: String(err) } }));
  });
}
const play = (uid: string, body: Record<string, unknown>, tid: string) => call(playHandler, { tid, ...body }, uid);

async function setup(gameMode: string, format: 'live' | 'window', questionCount = 5) {
  const startsAt = clock + 60 * MIN;
  const created = await mutate('host', 'event-save', {
    config: {
      title: 'Coupe équipes', description: '', format, visibility: 'public', teamRule: 'solo',
      categories: ['maths_eclair'], questionCount, secondsPerQuestion: 10, startsAt,
      windowHours: 1, maxPlayers: 30,
    },
    entryMode: 'named_team',
    gameMode,
    audience: 'public',
    delivery: 'online',
    registrationClosesAt: startsAt - 10 * MIN,
  });
  const eventId = String(created.eventId);
  await mutate('host', 'event-publish', { eventId, revision: 1 });
  const team = await mutate('a', 'team-create', { name: 'Les étoiles' });
  const teamId = String(team.teamId);
  for (const uid of ['b', 'c']) {
    const invite = await mutate('a', 'team-invite', { teamId, recipientUid: uid });
    await mutate(uid, 'invite-respond', { inviteId: invite.inviteId, accept: true });
  }
  await mutate('a', 'roster-save', { eventId, teamId, starters: ['a', 'b', 'c'] });
  for (const uid of ['b', 'c']) await mutate(uid, 'entry-confirm', { eventId, entryId: teamId });
  await mutate('a', 'entry-register', { eventId, entryId: teamId });
  return { eventId, teamId, startsAt };
}

const key = (tid: string, i: number) => doc(`userTournaments/${tid}/questions/live`).items[i].answer as number;
const wrong = (tid: string, i: number) => (key(tid, i) + 1) % doc(`userTournaments/${tid}/questions/live`).items[i].options.length;

beforeEach(() => {
  mockDb.store.clear();
  mockDb.serializeTransactions = false;
  mockExpoPush.mockClear();
  clock = T0;
  process.env.COMPETITION_CREATION_ENABLED = 'true';
  for (const uid of ['a', 'b', 'c', 'd', 'host']) mockDb.store.set(`users/${uid}`, { displayName: uid });
});
afterAll(() => {
  delete process.env.COMPETITION_CREATION_ENABLED;
});

describe('creation and capability gating', () => {
  const base = () => ({
    config: {
      title: 'Coupe', description: '', format: 'live', visibility: 'public', teamRule: 'solo',
      categories: ['maths_eclair'], questionCount: 5, secondsPerQuestion: 10, startsAt: clock + 60 * MIN,
      windowHours: 1, maxPlayers: 30,
    },
    entryMode: 'named_team',
    audience: 'public',
    delivery: 'online',
    registrationClosesAt: clock + 30 * MIN,
  });
  it('accepts shared/relay only for named teams in live or window, and never coerces an unknown mode', async () => {
    await expect(mutate('host', 'event-save', { ...base(), entryMode: 'individual', gameMode: 'shared' }))
      .rejects.toMatchObject({ code: 'team_mode_requires_teams' });
    await expect(mutate('host', 'event-save', { ...base(), gameMode: 'banana' }))
      .rejects.toMatchObject({ code: 'unsupported_mode' });
    await expect(mutate('host', 'event-save', { ...base(), config: { ...base().config, format: 'rounds', roundHours: 1, roundCount: 2 }, gameMode: 'relay' }))
      .rejects.toMatchObject({ code: 'unsupported_mode' });
    process.env.COMPETITION_CREATION_ENABLED = 'false';
    await expect(mutate('host', 'event-save', { ...base(), gameMode: 'shared' }))
      .rejects.toMatchObject({ code: 'pilot_not_enabled' });
  });
  it('leaves independent events and their engine docs exactly as before', async () => {
    const out = await mutate('host', 'event-save', base());
    await mutate('host', 'event-publish', { eventId: out.eventId, revision: 1 });
    expect(doc(`competitionEvents/${out.eventId}`).gameMode).toBeUndefined();
    expect(doc(`userTournaments/${out.eventId}`).gameMode).toBeUndefined();
    const r = await play('a', { action: 'team-state' }, String(out.eventId));
    expect(r.body.error).toBe('not_team_mode');
  });
  it('refuses a mode this build does not know on the engine doc', async () => {
    const { eventId } = await setup('shared', 'live');
    mockDb.store.set(`userTournaments/${eventId}`, { ...doc(`userTournaments/${eventId}`), gameMode: 'future' });
    expect((await play('a', { action: 'live-answer', index: 0, choice: 0 }, eventId)).body.error).toBe('unsupported_mode');
  });
});

describe('shared answer (J12)', () => {
  it('stamps the versioned policy, keeps old clients out and freezes the planned roles at the start', async () => {
    const { eventId, teamId, startsAt } = await setup('shared', 'live');
    expect(doc(`userTournaments/${eventId}`)).toMatchObject({ gameMode: 'shared', teamPolicy: 'shared-authority-v1' });
    expect(doc(`competitionEvents/${eventId}/entries/${teamId}`).policyVersion).toBe('shared-authority-v1');
    await expect(mutate('b', 'team-roles', { eventId, entryId: teamId, submitter: 'b', deputy: 'c' }))
      .rejects.toMatchObject({ code: 'captain_required' });
    await expect(mutate('a', 'team-roles', { eventId, entryId: teamId, submitter: 'b', deputy: 'b' }))
      .rejects.toMatchObject({ code: 'invalid_roles' });
    const set = await mutate('a', 'team-roles', { eventId, entryId: teamId, submitter: 'b', deputy: 'c' });
    expect(set.rolesVersion).toBe(1);
    expect(doc('users/b/competitionInbox/' + `entry_${eventId}_${teamId}`).action).toBe('team_roles_set');
    await mutate('c', 'team-roles-confirm', { eventId, entryId: teamId, rolesVersion: 1 });
    expect(doc(`competitionEvents/${eventId}/entries/${teamId}`).dutiesConfirmed).toEqual(['a', 'c']);

    const before = await play('c', { action: 'team-state' }, eventId);
    expect(before.body).toMatchObject({ started: false, holderUid: 'b', deputyUid: 'c' });
    expect(mockDb.store.has(`userTournaments/${eventId}/teamControl/${teamId}`)).toBe(false);

    clock = startsAt + 500;
    await call(tickHandler, { tid: eventId });
    expect((await play('b', { action: 'live-answer', index: 0, choice: 0 }, eventId)).body.error).toBe('team_client_required');
    const state = await play('a', { action: 'team-state' }, eventId);
    expect(state.body).toMatchObject({ started: true, holderUid: 'b', authorityVersion: 1 });
    expect(JSON.stringify(state.body)).not.toMatch(/"answer"\s*:\s*\d/);
    await expect(mutate('a', 'team-roles', { eventId, entryId: teamId, submitter: 'a', deputy: 'c' }))
      .rejects.toMatchObject({ code: 'roles_locked' });
  });

  it('accepts one answer per question; an old holder can neither submit after a transfer nor overwrite', async () => {
    const { eventId, teamId, startsAt } = await setup('shared', 'live');
    clock = startsAt + 500;
    await call(tickHandler, { tid: eventId });
    // Holder defaults to the captain (a), deputy b.
    expect((await play('b', { action: 'team-live-answer', index: 0, choice: 0, version: 1 }, eventId)).body.error)
      .toBe('not_authority_holder');
    const first = await play('a', { action: 'team-live-answer', index: 0, choice: key(eventId, 0), version: 1 }, eventId);
    expect(first.body).toMatchObject({ ok: true, recorded: true, duplicate: false });
    expect(JSON.stringify(first.body)).not.toMatch(/correct|points/);
    // Lost response retried: idempotent.
    expect((await play('a', { action: 'team-live-answer', index: 0, choice: key(eventId, 0), version: 1 }, eventId)).body.duplicate).toBe(true);
    // Transfer, then the old device's late request on question 0 cannot replace the answer.
    const moved = await play('a', { action: 'team-transfer', to: 'c', version: 1 }, eventId);
    expect(moved.body).toMatchObject({ holderUid: 'c', authorityVersion: 2 });
    expect(doc(`users/c/competitionInbox/team_${eventId}`).action).toBe('authority_received');
    expect((await play('c', { action: 'team-live-answer', index: 0, choice: wrong(eventId, 0), version: 2 }, eventId)).body.error)
      .toBe('team_answer_exists');
    // Retried transfer after a lost response is a success, not a conflict.
    expect((await play('a', { action: 'team-transfer', to: 'c', version: 1 }, eventId)).status).toBe(200);
    expect(doc(`userTournaments/${eventId}/teamControl/${teamId}`).authorityVersion).toBe(2);

    clock = startsAt + 18_500 + 500; // question 1 open
    await call(tickHandler, { tid: eventId });
    expect((await play('a', { action: 'team-live-answer', index: 1, choice: 0, version: 1 }, eventId)).body.error).toBe('authority_stale');
    expect((await play('a', { action: 'team-live-answer', index: 1, choice: 0, version: 2 }, eventId)).body.error).toBe('not_authority_holder');
    expect((await play('c', { action: 'team-live-answer', index: 1, choice: key(eventId, 1), version: 2 }, eventId)).body.recorded).toBe(true);
    expect(doc(`userTournaments/${eventId}/teamAnswers/1_${teamId}`).uid).toBe('c');
  });

  it('a racing transfer and old/new submissions accept at most one answer, in any commit order', async () => {
    for (const order of [0, 1, 2]) {
      mockDb.store.clear();
      for (const uid of ['a', 'b', 'c', 'host']) mockDb.store.set(`users/${uid}`, { displayName: uid });
      clock = T0;
      const { eventId, teamId, startsAt } = await setup('shared', 'live');
      clock = startsAt + 500;
      await call(tickHandler, { tid: eventId });
      mockDb.serializeTransactions = true;
      const reqs = [
        () => play('a', { action: 'team-live-answer', index: 0, choice: key(eventId, 0), version: 1 }, eventId),
        () => play('a', { action: 'team-transfer', to: 'b', version: 1 }, eventId),
        () => play('b', { action: 'team-live-answer', index: 0, choice: wrong(eventId, 0), version: 2 }, eventId),
      ];
      const rotated = [...reqs.slice(order), ...reqs.slice(0, order)];
      const results = await Promise.all(rotated.map((r) => r()));
      mockDb.serializeTransactions = false;
      const accepted = results.filter((r) => r.body.recorded === true && r.body.duplicate === false);
      expect(accepted.length).toBeLessThanOrEqual(1);
      const answers = mockDb.childrenOf(`userTournaments/${eventId}/teamAnswers`);
      expect(answers.length).toBeLessThanOrEqual(1);
      expect(answers.length).toBe(accepted.length);
      expect(doc(`userTournaments/${eventId}/teamControl/${teamId}`).authorityVersion).toBe(2);
    }
  });

  it('fails over only after the server sees the holder absent: deputy first, then any starter', async () => {
    const { eventId, startsAt } = await setup('shared', 'live');
    clock = startsAt + 500;
    await call(tickHandler, { tid: eventId });
    await play('a', { action: 'team-state' }, eventId); // holder present at startsAt+500
    clock += ABSENT_MS - 1000;
    expect((await play('b', { action: 'team-claim', version: 1 }, eventId)).body.error).toBe('holder_present');
    clock += 1500;
    expect((await play('c', { action: 'team-claim', version: 1 }, eventId)).body.error).toBe('holder_present');
    const claimed = await play('b', { action: 'team-claim', version: 1 }, eventId);
    expect(claimed.body).toMatchObject({ holderUid: 'b', deputyUid: 'a', authorityVersion: 2 });
    // The device that lost authority (reconnecting on question 1) is refused and learns the new version.
    clock = startsAt + 18_500;
    await call(tickHandler, { tid: eventId });
    expect((await play('a', { action: 'team-live-answer', index: 1, choice: 0, version: 1 }, eventId)).body.error).toBe('authority_stale');
    const recovered = await play('a', { action: 'team-state' }, eventId);
    expect(recovered.body).toMatchObject({ holderUid: 'b', authorityVersion: 2 });
    expect(recovered.body.claimableAt).toBeGreaterThan(clock);
  });

  it('scores the team from its own answers, reveals team counts and opens the team review at the end', async () => {
    const { eventId, teamId, startsAt } = await setup('shared', 'live');
    clock = startsAt + 500;
    await call(tickHandler, { tid: eventId });
    await play('a', { action: 'team-live-answer', index: 0, choice: key(eventId, 0), version: 1 }, eventId);
    clock = startsAt + 11_000;
    await call(tickHandler, { tid: eventId });
    expect(doc(`userTournaments/${eventId}/live/state`).reveal.answered).toBe(1);
    clock = startsAt + 10 * 18_000;
    await call(tickHandler, { tid: eventId });
    const board = doc(`userTournaments/${eventId}/standings/current`);
    expect(board.rows).toEqual([]);
    expect(board.namedTeams[0]).toMatchObject({ id: teamId, gameMode: 'shared', points: 1000, correct: 1, missed: 4, contributions: [] });
    expect(doc(`userTournaments/${eventId}`).winningEntrants).toEqual([{ id: teamId, label: 'Les étoiles' }]);
    const review = await play('c', { action: 'review' }, eventId);
    expect(review.body.items[0]).toMatchObject({ choice: key(eventId, 0), by: 'a' });
  });

  it('window: only the holder starts and answers; a transfer keeps the same question and deadline', async () => {
    const { eventId, teamId, startsAt } = await setup('shared', 'window');
    clock = startsAt + MIN;
    expect((await play('b', { action: 'team-start', version: 1 }, eventId)).body.error).toBe('not_authority_holder');
    const started = await play('a', { action: 'team-start', version: 1 }, eventId);
    const q0 = started.body.window;
    expect(q0).toMatchObject({ pos: 0, begun: true });
    expect(q0.question).toBeTruthy();
    const mate = await play('b', { action: 'team-state' }, eventId);
    expect(mate.body.window.question).toEqual(q0.question);
    clock += 2000;
    await play('a', { action: 'team-transfer', to: 'b', version: 1 }, eventId);
    const after = await play('b', { action: 'team-state' }, eventId);
    expect(after.body.window).toMatchObject({ pos: 0, deadline: q0.deadline });
    expect((await play('a', { action: 'team-answer', round: 0, pos: 0, choice: 0, version: 1 }, eventId)).body.error).toBe('authority_stale');
    const ans = await play('b', { action: 'team-answer', round: 0, pos: 0, choice: 1, version: 2 }, eventId);
    expect(ans.body).toMatchObject({ recorded: true });
    expect(ans.body.window.pos).toBe(1);
    expect(doc(`userTournaments/${eventId}/teamAttempts/0_${teamId}`).answeredBy[0]).toBe('b');
  });
});

describe('relay (J13)', () => {
  it('live: only the slot owner answers, an expired turn is a zero, and the order is frozen', async () => {
    const { eventId, teamId, startsAt } = await setup('relay', 'live', 6);
    await expect(mutate('a', 'team-roles', { eventId, entryId: teamId, slots: ['c', 'a'] }))
      .rejects.toMatchObject({ code: 'invalid_roles' });
    await mutate('a', 'team-roles', { eventId, entryId: teamId, slots: ['c', 'a', 'b'] });
    clock = startsAt + 500;
    await call(tickHandler, { tid: eventId });
    expect((await play('a', { action: 'team-live-answer', index: 0, choice: 0 }, eventId)).body.error).toBe('not_your_turn');
    expect((await play('c', { action: 'team-live-answer', index: 0, choice: key(eventId, 0) }, eventId)).body.recorded).toBe(true);
    const st = await play('b', { action: 'team-state' }, eventId);
    expect(st.body.live).toMatchObject({ index: 0, owner: 'c', answer: { uid: 'c' } });
    // Question 1 (a) expires unanswered; question 2 (b) answered wrongly; a late answer to q1 is refused.
    clock = startsAt + 18_000 * 2 + 500;
    await call(tickHandler, { tid: eventId });
    expect((await play('a', { action: 'team-live-answer', index: 1, choice: 0 }, eventId)).body.error).toBe('answers_closed');
    await play('b', { action: 'team-live-answer', index: 2, choice: wrong(eventId, 2) }, eventId);
    clock = startsAt + 6 * 18_000;
    await call(tickHandler, { tid: eventId });
    const row = doc(`userTournaments/${eventId}/standings/current`).namedTeams[0];
    expect(row).toMatchObject({ gameMode: 'relay', points: 1000, missed: 4 });
    expect(row.contributions).toEqual([
      expect.objectContaining({ uid: 'c', points: 1000, answered: 1, missed: 1 }),
      expect.objectContaining({ uid: 'a', points: 0, answered: 0, missed: 2 }),
      expect.objectContaining({ uid: 'b', points: 0, answered: 1, missed: 1 }),
    ]);
  });

  it('window: legs open in order, an unstarted leg is forfeited at its deadline, and a vanished player cannot hold the team up', async () => {
    const { eventId, teamId, startsAt } = await setup('relay', 'window', 6);
    clock = startsAt + MIN;
    // Anyone looking first creates the attempt; leg 1 is timed from the window opening.
    const look = await play('b', { action: 'team-state' }, eventId);
    expect(look.body.window.legs.map((l: any) => [l.owner, l.start, l.end])).toEqual([['a', 0, 2], ['b', 2, 4], ['c', 4, 6]]);
    expect(look.body.window.legs[0].startBy).toBe(startsAt + 15 * MIN);
    expect((await play('b', { action: 'team-start' }, eventId)).body.error).toBe('not_your_turn');
    const go = await play('a', { action: 'team-start' }, eventId);
    expect(go.body.window.question).toBeTruthy();
    // Teammates follow progress without the hidden question.
    const mate = await play('c', { action: 'team-state' }, eventId);
    expect(mate.body.window).toMatchObject({ pos: 0, question: null });
    expect((await play('b', { action: 'team-answer', round: 0, pos: 0, choice: 0 }, eventId)).body.error).toBe('not_your_turn');
    clock += 2000;
    const a0 = await play('a', { action: 'team-answer', round: 0, pos: 0, choice: 0 }, eventId);
    expect(a0.body.recorded).toBe(true);
    // Retried answer: no duplicate turn, no reorder.
    const again = await play('a', { action: 'team-answer', round: 0, pos: 0, choice: 0 }, eventId);
    expect(again.body).toMatchObject({ duplicate: true });
    expect(again.body.window.pos).toBe(1);
    clock += 2000;
    await play('a', { action: 'team-answer', round: 0, pos: 1, choice: 1 }, eventId);
    const attempt = doc(`userTournaments/${eventId}/teamAttempts/0_${teamId}`);
    expect(attempt.legs[1].openedAt).toBe(clock);
    expect(doc(`users/b/competitionInbox/team_${eventId}`).action).toBe('relay_turn');
    expect(mockExpoPush).toHaveBeenCalledWith('b', expect.objectContaining({ data: expect.objectContaining({ action: 'relay_turn' }) }));
    // b never starts: forfeited after 15 minutes; c's leg opens at that instant.
    const legOpen = clock;
    clock = legOpen + 15 * MIN + 1000;
    expect((await play('b', { action: 'team-start' }, eventId)).body.error).toBe('not_your_turn');
    // A refused request writes nothing; the next look records the derived forfeit.
    expect((await play('c', { action: 'team-state' }, eventId)).body.window.legs[2].startBy).toBe(legOpen + 30 * MIN);
    const after = doc(`userTournaments/${eventId}/teamAttempts/0_${teamId}`);
    expect(after.legs[1]).toMatchObject({ forfeited: true, endedAt: legOpen + 15 * MIN });
    expect(after.legs[2].openedAt).toBe(legOpen + 15 * MIN);
    // c starts, answers once, backgrounds; reconnect resumes at the same position with server time.
    await play('c', { action: 'team-start' }, eventId);
    clock += 1000;
    await play('c', { action: 'team-answer', round: 0, pos: 4, choice: 0 }, eventId);
    const resumed = await play('c', { action: 'team-state' }, eventId);
    expect(resumed.body.window).toMatchObject({ pos: 5, deadline: clock + 10_000 });
    // c vanishes: after the leg's hard end the relay is over.
    clock += 60_000;
    const end = await play('a', { action: 'team-state' }, eventId);
    expect(end.body.window.done).toBe(true);
    clock = startsAt + 61 * MIN;
    await call(tickHandler, { tid: eventId });
    const row = doc(`userTournaments/${eventId}/standings/current`).namedTeams[0];
    expect(row.gameMode).toBe('relay');
    expect(row.contributions.map((c: any) => [c.uid, c.answered, c.missed])).toEqual([['a', 2, 0], ['b', 0, 2], ['c', 1, 1]]);
  });
});

describe('account deletion', () => {
  it('pseudonymizes roles, frozen control and team answers without touching points', async () => {
    process.env.ACCOUNT_DELETION_SALT = 'test-secret';
    const { eraseCompetitionAccount } = await import('../_lib/competitionAccountDeletion');
    const { eventId, teamId, startsAt } = await setup('shared', 'live');
    await mutate('a', 'team-roles', { eventId, entryId: teamId, submitter: 'b', deputy: 'c' });
    await mutate('b', 'team-roles-confirm', { eventId, entryId: teamId, rolesVersion: 1 });
    // More records than any single scan page, stored ahead of this team's own.
    for (let i = 0; i < 450; i += 1) {
      mockDb.store.set(`userTournaments/${eventId}/teamControl/filler${i}`, { starters: ['x', 'y', 'z'], holderUid: 'x' });
      mockDb.store.set(`userTournaments/${eventId}/teamAttempts/0_filler${i}`, { answeredBy: ['x'] });
    }
    mockDb.store.set(`userTournaments/${eventId}/teamAttempts/0_${teamId}`, {
      uid: teamId, answeredBy: ['b', null], legs: [{ owner: 'b', start: 0, end: 1 }],
    });
    clock = startsAt + 500;
    await call(tickHandler, { tid: eventId });
    await play('b', { action: 'team-live-answer', index: 0, choice: key(eventId, 0), version: 1 }, eventId);
    await play('b', { action: 'team-transfer', to: 'c', version: 1 }, eventId);
    const points = doc(`userTournaments/${eventId}/teamAnswers/0_${teamId}`).points;
    const out = await eraseCompetitionAccount(db, 'b', clock);
    expect(out.warnings).toEqual([]);
    for (const p of [
      `competitionEvents/${eventId}/entries/${teamId}`,
      `userTournaments/${eventId}/teamControl/${teamId}`,
      `userTournaments/${eventId}/teamAnswers/0_${teamId}`,
      `userTournaments/${eventId}/teamAttempts/0_${teamId}`,
    ])
      expect(JSON.stringify(doc(p))).not.toMatch(/"b"/);
    expect(doc(`userTournaments/${eventId}/teamControl/filler449`).holderUid).toBe('x');
    expect(doc(`userTournaments/${eventId}/teamAnswers/0_${teamId}`).points).toBe(points);
    expect(doc(`userTournaments/${eventId}/teamControl/${teamId}`).holderUid).toBe('c');
    expect(doc(`competitionEvents/${eventId}/entries/${teamId}`).roles.submitter).toMatch(/^deleted_/);
    delete process.env.ACCOUNT_DELETION_SALT;
  });
});
