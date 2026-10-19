import { FakeDb } from './helpers/fakeFirestore';
import type { Firestore } from 'firebase-admin/firestore';
const mockDb = new FakeDb();
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
}));
import { mutateCompetition } from '../_lib/competition';
import {
  deletedAccountTombstone,
  eraseCompetitionAccount,
} from '../_lib/competitionAccountDeletion';
import { recomputeStandings } from '../tournois/_shared';
import { DELETED_ACCOUNT_NAME } from '../../shared/competition/deletedAccount';

const now = 1792340000000;
const later = now + 3 * 3600000; // after every event below has started
let sequence = 0;
const db = mockDb as unknown as Firestore;
const mutate = (uid: string, action: string, values: Record<string, unknown> = {}) =>
  mutateCompetition(db, uid, uid, { action, operationId: `op_${++sequence}`, ...values }, now);
const erase = (uid: string, at = now) => eraseCompetitionAccount(db, uid, at);
const doc = (path: string) => mockDb.store.get(path);
const tombA = deletedAccountTombstone('a');
const snapshot = () => JSON.stringify([...mockDb.store.entries()].sort());

const config = (format = 'window') => ({
  title: 'Coupe pilote',
  description: '',
  format,
  visibility: 'public',
  teamRule: 'solo',
  categories: ['maths_eclair'],
  questionCount: 5,
  secondsPerQuestion: 20,
  startsAt: now + 3600000,
  windowHours: 1,
  maxPlayers: 30,
});
async function draftEvent(owner: string, mode = 'individual') {
  const created = await mutate(owner, 'event-save', {
    config: config(),
    entryMode: mode,
    audience: 'public',
    delivery: 'online',
    registrationClosesAt: now + 1800000,
  });
  return String(created.eventId);
}
async function publishedEvent(owner: string, mode = 'individual') {
  const eventId = await draftEvent(owner, mode);
  await mutate(owner, 'event-publish', { eventId, revision: 1 });
  return eventId;
}
async function team(captain: string, members: string[], name = 'Les étoiles') {
  const out = await mutate(captain, 'team-create', { name });
  for (const uid of members) {
    const invite = await mutate(captain, 'team-invite', { teamId: out.teamId, recipientUid: uid });
    await mutate(uid, 'invite-respond', { inviteId: invite.inviteId, accept: true });
  }
  return String(out.teamId);
}
async function registerIndividual(eventId: string, uid: string) {
  await mutate(uid, 'roster-save', { eventId });
  await mutate(uid, 'entry-register', { eventId, entryId: uid });
}
async function registerTeam(eventId: string, teamId: string, captain: string, starters: string[]) {
  await mutate(captain, 'roster-save', { eventId, teamId, starters });
  for (const uid of starters) await mutate(uid, 'entry-confirm', { eventId, entryId: teamId });
  await mutate(captain, 'entry-register', { eventId, entryId: teamId });
}
const scores = (rows: Array<Record<string, unknown>>) =>
  rows.map(({ points, correct, answered, rank, totalMs }) => ({ points, correct, answered, rank, totalMs }));

beforeEach(() => {
  mockDb.store.clear();
  process.env.COMPETITION_CREATION_ENABLED = 'true';
  for (const uid of ['a', 'b', 'c', 'd', 'host', 'cohost'])
    mockDb.store.set(`users/${uid}`, { displayName: uid });
});
afterAll(() => {
  delete process.env.COMPETITION_CREATION_ENABLED;
});

it('hands a captain’s team to the longest-standing remaining member', async () => {
  const teamId = await team('a', ['b', 'c']);
  const { warnings } = await erase('a');
  expect(warnings).toEqual([]);
  expect(doc(`teams/${teamId}`)).toMatchObject({ captainUid: 'b', members: ['b', 'c'] });
  expect(doc(`users/b/competitionInbox/team_${teamId}`)).toBeTruthy();
});

it('deletes a team left empty, and its pending invitations, when nothing locked names it', async () => {
  const teamId = await team('a', []);
  const sent = await mutate('a', 'team-invite', { teamId, recipientUid: 'd' });
  const other = await team('b', []);
  const received = await mutate('b', 'team-invite', { teamId: other, recipientUid: 'a' });
  await erase('a');
  expect(doc(`teams/${teamId}`)).toBeUndefined();
  expect(doc(`teamInvites/${sent.inviteId}`)).toBeUndefined();
  expect(doc(`users/d/competitionInbox/invite_${sent.inviteId}`)).toBeUndefined();
  expect(doc(`teamInvites/${received.inviteId}`)).toBeUndefined();
  expect(doc(`teams/${other}`)).toMatchObject({ captainUid: 'b', members: ['b'] });
});

it('keeps an emptied team that has a locked entry, retired and pseudonymized', async () => {
  const eventId = await publishedEvent('host', 'named_team');
  const teamId = await team('a', ['b', 'c']);
  await registerTeam(eventId, teamId, 'a', ['a', 'b', 'c']);
  // b and c later left the team; the locked roster still names all three.
  mockDb.store.get(`teams/${teamId}`)!.members = ['a'];
  await erase('a', later);
  expect(doc(`teams/${teamId}`)).toMatchObject({
    members: [],
    captainUid: tombA,
    visibility: 'private',
    inactive: true,
  });
  expect(doc(`competitionEvents/${eventId}/entries/${teamId}`)).toMatchObject({
    state: 'registered',
    captainUid: tombA,
    starters: [tombA, 'b', 'c'],
    label: 'Les étoiles',
  });
});

it('deletes a draft event the user owns, with its subcollections', async () => {
  const eventId = await draftEvent('a');
  mockDb.store.set(`competitionEvents/${eventId}/announcements/x`, { message: 'hi' });
  await erase('a');
  expect(doc(`competitionEvents/${eventId}`)).toBeUndefined();
  expect(doc(`competitionEvents/${eventId}/announcements/x`)).toBeUndefined();
});

it('cancels an owned published event with registrants instead of deleting it', async () => {
  const eventId = await publishedEvent('a');
  await registerIndividual(eventId, 'b');
  await erase('a');
  const e = doc(`competitionEvents/${eventId}`)!;
  expect(e).toMatchObject({ state: 'cancelled', ownerUid: tombA, hostName: DELETED_ACCOUNT_NAME });
  expect(doc(`competitionEvents/${eventId}/entries/b`)).toMatchObject({ state: 'registered', captainUid: 'b' });
  expect(doc(`userTournaments/${eventId}`)).toMatchObject({ state: 'cancelled', creatorUid: tombA });
  expect(doc(`competitionDirectory/${eventId}`)).toMatchObject({ state: 'cancelled', hostName: DELETED_ACCOUNT_NAME });
  const audit = mockDb.childrenOf(`competitionEvents/${eventId}/audit`).map(([, d]) => d);
  expect(audit).toEqual([expect.objectContaining({ action: 'event-cancel', actorUid: tombA })]);
});

it('promotes a managing co-host instead of cancelling', async () => {
  const eventId = await publishedEvent('a');
  await mutate('a', 'event-cohost', { eventId, recipientUid: 'cohost', role: 'manage' });
  await erase('a');
  expect(doc(`competitionEvents/${eventId}`)).toMatchObject({
    state: 'published',
    ownerUid: 'cohost',
    hostName: 'cohost',
    cohosts: {},
  });
  expect(doc(`userTournaments/${eventId}`)).toMatchObject({ creatorUid: 'cohost', creatorName: 'cohost' });
});

it('withdraws a pending individual registration through the engine and releases the seat', async () => {
  const eventId = await publishedEvent('host');
  await registerIndividual(eventId, 'a');
  expect(doc(`userTournaments/${eventId}`)!.playerCount).toBe(1);
  await erase('a');
  expect(doc(`competitionEvents/${eventId}/entries/a`)).toMatchObject({
    state: 'withdrawn',
    captainUid: tombA,
    starters: [tombA],
    label: DELETED_ACCOUNT_NAME,
  });
  expect(doc(`competitionEvents/${eventId}`)!.entryCount).toBe(0);
  expect(doc(`entryClaims/${eventId}_a`)).toBeUndefined();
  expect(doc(`userTournaments/${eventId}/players/a`)).toBeUndefined();
  expect(mockDb.childrenOf('competitionMutations').some(([, d]) => d.uid === 'a')).toBe(false);
});

it('pseudonymizes a started event without changing a single score, and clears dispute text', async () => {
  const eventId = await publishedEvent('host');
  await registerIndividual(eventId, 'a');
  await registerIndividual(eventId, 'b');
  await mutate('a', 'event-dispute', { eventId, reason: 'Mon nom est Jean Dupont' });
  const t = `userTournaments/${eventId}`;
  Object.assign(mockDb.store.get(`${t}/players/a`)!, { points: 70, correct: 4, answered: 5, totalMs: 9000 });
  Object.assign(mockDb.store.get(`${t}/players/b`)!, { points: 40, correct: 2, answered: 5, totalMs: 7000 });
  await recomputeStandings(db, eventId, later);
  const before = doc(`${t}/standings/current`)!;
  const playerBefore = doc(`${t}/players/a`)!;
  await erase('a', later);

  const board = doc(`${t}/standings/current`)!;
  expect(scores(board.rows)).toEqual(scores(before.rows));
  expect(board.rows[0]).toMatchObject({ uid: tombA, displayName: DELETED_ACCOUNT_NAME, points: 70 });
  expect(doc(`${t}/players/a`)).toEqual({ ...playerBefore, uid: tombA, displayName: DELETED_ACCOUNT_NAME });
  expect(doc(`${t}/roster/a`)).toMatchObject({ uid: tombA, displayName: DELETED_ACCOUNT_NAME });
  // A later rebuild from players/* reproduces the same board.
  await recomputeStandings(db, eventId, later + 1);
  expect(scores(doc(`${t}/standings/current`)!.rows)).toEqual(scores(before.rows));

  expect(doc(`competitionEvents/${eventId}/entries/a`)).toMatchObject({
    state: 'registered',
    captainUid: tombA,
    starters: [tombA],
    confirmed: [tombA],
    label: DELETED_ACCOUNT_NAME,
  });
  const [dispute] = mockDb.childrenOf(`competitionEvents/${eventId}/disputes`).map(([, d]) => d);
  expect(dispute).toMatchObject({ uid: tombA, reason: '', redacted: true, state: 'open' });
  expect(doc(`entryClaims/${eventId}_a`)).toBeUndefined();
  expect(doc(`competitionEvents/${eventId}/entries/b`)).toMatchObject({ captainUid: 'b', starters: ['b'] });
  // Outside the user tree the raw uid survives only as the individual entry's id (a result key, kept by policy).
  const rest = JSON.stringify(
    [...mockDb.store.entries()]
      .filter(([p]) => p !== 'users/a' && !p.startsWith('users/a/'))
      .map(([, d]) => d),
  );
  expect(rest.replace(/"id":"a"/g, '')).not.toMatch(/"a"/);
});

it('keeps named-team results identical when a starter is pseudonymized mid-event', async () => {
  const eventId = await publishedEvent('host', 'named_team');
  const teamId = await team('a', ['b', 'c']);
  await registerTeam(eventId, teamId, 'a', ['a', 'b', 'c']);
  const t = `userTournaments/${eventId}`;
  for (const [uid, points] of [['a', 50], ['b', 30], ['c', 10]] as const)
    Object.assign(mockDb.store.get(`${t}/players/${uid}`)!, { points, correct: 2, answered: 5 });
  await recomputeStandings(db, eventId, later);
  const before = doc(`${t}/standings/current`)!.namedTeams;
  await erase('a', later);
  await recomputeStandings(db, eventId, later + 1);
  const after = doc(`${t}/standings/current`)!.namedTeams;
  expect(after.map((r: any) => [r.id, r.points, r.rank, r.totalMs])).toEqual(
    before.map((r: any) => [r.id, r.points, r.rank, r.totalMs]),
  );
  expect(after[0].starters).toEqual([tombA, 'b', 'c']);
  expect(doc(`teams/${teamId}`)).toMatchObject({ captainUid: 'b', members: ['b', 'c'] });
  expect(doc(`competitionEvents/${eventId}/entries/${teamId}`)).toMatchObject({ captainUid: 'b', state: 'registered' });
});

it('deletes personal school, block and receipt records and tombstones review stamps', async () => {
  mockDb.store.set('schools/school', { key: 'school', name: 'School', commune: '', status: 'approved' });
  await mutate('a', 'membership-request', { schoolKey: 'school' });
  mockDb.store.set('schoolRoles/school_a', { uid: 'a', schoolKey: 'school', status: 'approved', role: 'host' });
  await mutate('a', 'membership-review', { schoolKey: 'school', recipientUid: 'b', approve: true });
  await mutate('a', 'block-inviter', { recipientUid: 'd' });
  await mutate('d', 'block-inviter', { recipientUid: 'a' });
  await mutate('a', 'report-content', { kind: 'team', targetId: 'x', reason: 'Contenu offensant' });
  // The follower reverse index written beside users/{uid}/competitionFollows.
  mockDb.store.set('users/a/competitionFollows/ev1', { eventId: 'ev1', createdAt: now });
  mockDb.store.set('competitionEvents/ev1/followers/a', { uid: 'a', createdAt: now });
  mockDb.store.set('competitionEvents/ev1/followers/b', { uid: 'b', createdAt: now });
  await erase('a');
  expect(doc('competitionEvents/ev1/followers/a')).toBeUndefined();
  expect(doc('competitionEvents/ev1/followers/b')).toBeTruthy();
  expect(doc('schoolMemberships/school_a')).toBeUndefined();
  expect(doc('schoolRoles/school_a')).toBeUndefined();
  expect(doc('schoolMemberships/school_b')).toMatchObject({ status: 'approved', reviewedBy: tombA });
  expect(mockDb.childrenOf('competitionBlocks')).toEqual([]);
  expect(mockDb.childrenOf('competitionMutations').filter(([, d]) => d.uid === 'a')).toEqual([]);
  expect(mockDb.childrenOf('competitionReports').map(([, d]) => d.uid)).toEqual([tombA]);
});

it('is idempotent: a rerun changes nothing', async () => {
  const eventId = await publishedEvent('host');
  await registerIndividual(eventId, 'a');
  await mutate('a', 'event-dispute', { eventId, reason: 'Question ambiguë' });
  const teamId = await team('a', ['b']);
  await mutate('a', 'team-invite', { teamId, recipientUid: 'c' });
  await publishedEvent('a');
  await erase('a', later);
  const first = snapshot();
  const { warnings } = await erase('a', later + 60000);
  expect(warnings).toEqual([]);
  expect(snapshot()).toEqual(first);
});
