import { FakeDb } from './helpers/fakeFirestore';
import type { Firestore } from 'firebase-admin/firestore';
const mockDb = new FakeDb();
jest.mock('../_lib/firebaseAdmin', () => ({
  getDb: () => mockDb,
  isAdminConfigured: () => true,
}));
jest.mock('../_lib/rateLimit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, resetAt: 0 }),
}));
const mockExpoPush = jest.fn(async (..._args: unknown[]) => ({
  sent: 1,
  pruned: 0,
  failed: 0,
}));
const mockWebPush = jest.fn(async (..._args: unknown[]) => ({}));
jest.mock('../_lib/expoPush', () => ({
  sendExpoPushToUser: (...args: unknown[]) => mockExpoPush(...args),
}));
jest.mock('../_lib/push', () => ({
  isPushConfigured: () => true,
  sendPushToUser: (...args: unknown[]) => mockWebPush(...args),
}));
import { mutateCompetition } from '../_lib/competition';
import { readEvent } from '../competition';
import { joinTournament, recomputeStandings } from '../tournois/_shared';
const now = 1792340000000;
let sequence = 0;
const db = mockDb as unknown as Firestore;
const mutate = (
  uid: string,
  action: string,
  values: Record<string, unknown> = {},
  op = `operation_${++sequence}`,
) =>
  mutateCompetition(db, uid, uid, { action, operationId: op, ...values }, now);
const doc = (path: string) => mockDb.store.get(path)!;
const config = () => ({
  title: 'Coupe pilote',
  description: '',
  format: 'window',
  visibility: 'public',
  teamRule: 'solo',
  categories: ['maths_eclair'],
  questionCount: 5,
  secondsPerQuestion: 20,
  startsAt: now + 3600000,
  windowHours: 1,
  maxPlayers: 30,
});
async function createEvent(
  mode = 'named_team',
  more: Record<string, unknown> = {},
) {
  const created = await mutate('host', 'event-save', {
    config: config(),
    entryMode: mode,
    audience: 'public',
    delivery: 'online',
    registrationClosesAt: now + 1800000,
    ...more,
  });
  await mutate('host', 'event-publish', {
    eventId: created.eventId,
    revision: 1,
  });
  return String(created.eventId);
}
async function makeTeam() {
  const out = await mutate('a', 'team-create', { name: 'Les étoiles' });
  for (const uid of ['b', 'c']) {
    const invite = await mutate('a', 'team-invite', {
      teamId: out.teamId,
      recipientUid: uid,
    });
    await mutate(uid, 'invite-respond', {
      inviteId: invite.inviteId,
      accept: true,
    });
  }
  return String(out.teamId);
}
beforeEach(() => {
  mockDb.store.clear();
  mockExpoPush.mockClear();
  mockWebPush.mockClear();
  process.env.COMPETITION_CREATION_ENABLED = 'true';
  mockDb.store.set('schools/school', {
    key: 'school',
    name: 'School',
    commune: '',
    status: 'approved',
  });
  for (const uid of ['a', 'b', 'c', 'd', 'host'])
    mockDb.store.set(`users/${uid}`, { displayName: uid });
});
afterAll(() => {
  delete process.env.COMPETITION_CREATION_ENABLED;
});
it('atomically deduplicates a lost creation response and refuses conflicting reuse', async () => {
  const first = await mutate(
    'a',
    'team-create',
    { name: 'Étoiles' },
    'same-op',
  );
  expect(
    await mutate('a', 'team-create', { name: 'Étoiles' }, 'same-op'),
  ).toEqual(first);
  expect(mockDb.childrenOf('teams')).toHaveLength(1);
  await expect(
    mutate('a', 'team-create', { name: 'Changed' }, 'same-op'),
  ).rejects.toMatchObject({ code: 'operation_conflict' });
});
it('enforces invitation recipient, revocation, expiry and explicit acceptance', async () => {
  const team = await mutate('a', 'team-create', { name: 'Étoiles' });
  const invite = await mutate('a', 'team-invite', {
    teamId: team.teamId,
    recipientUid: 'b',
  });
  await expect(
    mutate('c', 'invite-respond', { inviteId: invite.inviteId, accept: true }),
  ).rejects.toMatchObject({ code: 'wrong_account' });
  expect(doc(`teams/${team.teamId}`).members).toEqual(['a']);
  await mutate('a', 'invite-revoke', { inviteId: invite.inviteId });
  await expect(
    mutate('b', 'invite-respond', { inviteId: invite.inviteId, accept: true }),
  ).rejects.toMatchObject({ code: 'invitation_revoked' });
  const next = await mutate('a', 'team-invite', {
    teamId: team.teamId,
    recipientUid: 'b',
  });
  doc(`teamInvites/${next.inviteId}`).expiresAt = now - 1;
  await expect(
    mutate('b', 'invite-respond', { inviteId: next.inviteId, accept: true }),
  ).rejects.toMatchObject({ code: 'invitation_expired' });
});
it('registers one immutable three-starter entry and rejects overlapping teams', async () => {
  const teamId = await makeTeam(),
    eventId = await createEvent();
  await mutate('a', 'roster-save', {
    eventId,
    teamId,
    starters: ['a', 'b', 'c'],
  });
  await expect(
    mutate('a', 'entry-register', { eventId, entryId: teamId }),
  ).rejects.toMatchObject({ code: 'roster_not_ready' });
  for (const uid of ['b', 'c'])
    await mutate(uid, 'entry-confirm', { eventId, entryId: teamId });
  const registered = await mutate('a', 'entry-register', {
    eventId,
    entryId: teamId,
  });
  expect(registered.ok).toBe(true);
  expect(doc(`userTournaments/${eventId}`).playerCount).toBe(3);
  expect(doc(`competitionEvents/${eventId}`).entryCount).toBe(1);
  await mutate('a', 'entry-register', { eventId, entryId: teamId });
  expect(doc(`userTournaments/${eventId}`).playerCount).toBe(3);
  await expect(
    mutate('a', 'roster-save', { eventId, teamId, starters: ['a', 'b', 'd'] }),
  ).rejects.toMatchObject({ code: 'roster_locked' });
  const another = await makeTeam();
  await mutate('a', 'roster-save', {
    eventId,
    teamId: another,
    starters: ['a', 'b', 'c'],
  });
  for (const uid of ['b', 'c'])
    await mutate(uid, 'entry-confirm', { eventId, entryId: another });
  await expect(
    mutate('a', 'entry-register', { eventId, entryId: another }),
  ).rejects.toMatchObject({ code: 'conflicting_entry' });
  await mutate('b', 'team-leave', { teamId });
  expect(
    doc(`competitionEvents/${eventId}/entries/${teamId}`).starters,
  ).toEqual(['a', 'b', 'c']);
});
it('legacy join cannot bypass managed entry and withdrawn seats can be registered again', async () => {
  const eventId = await createEvent('individual');
  expect(
    await joinTournament(
      db,
      eventId,
      { uid: 'a', displayName: 'a', school: null, grade: null },
      now,
    ),
  ).toEqual({ ok: false, error: 'managed_entry_required' });
  await mutate('a', 'roster-save', { eventId });
  await mutate('a', 'entry-register', { eventId, entryId: 'a' });
  await mutate('a', 'entry-withdraw', { eventId, entryId: 'a' });
  expect(mockDb.store.has(`entryClaims/${eventId}_a`)).toBe(false);
  expect(doc(`userTournaments/${eventId}`).playerCount).toBe(0);
  await mutate('a', 'roster-save', { eventId });
  await mutate('a', 'entry-register', { eventId, entryId: 'a' });
  expect(doc(`userTournaments/${eventId}`).playerCount).toBe(1);
});
it('postponing retains drafts but releases all seats for explicit reconfirmation', async () => {
  const teamId = await makeTeam(),
    eventId = await createEvent();
  await mutate('a', 'roster-save', {
    eventId,
    teamId,
    starters: ['a', 'b', 'c'],
  });
  for (const uid of ['b', 'c'])
    await mutate(uid, 'entry-confirm', { eventId, entryId: teamId });
  await mutate('a', 'entry-register', { eventId, entryId: teamId });
  await mutate('host', 'event-postpone', { eventId, startsAt: now + 7200000 });
  expect(doc(`competitionEvents/${eventId}/entries/${teamId}`)).toMatchObject({
    state: 'draft',
    confirmed: [],
    lockedAt: null,
  });
  expect(doc(`userTournaments/${eventId}`).playerCount).toBe(0);
  expect(mockDb.store.has(`entryClaims/${eventId}_a`)).toBe(false);
});
it('school selection alone cannot authorize an event entry or physical host', async () => {
  mockDb.store.set('schoolMemberships/school_host', {uid:'host',schoolKey:'school',status:'approved'});
  const eventId = await createEvent('individual', { schoolKey: 'school' });
  await mutate('a', 'roster-save', { eventId });
  await expect(
    mutate('a', 'entry-register', { eventId, entryId: 'a' }),
  ).rejects.toMatchObject({ code: 'membership_pending' });
  await expect(
    mutate('a', 'event-save', {
      config: config(),
      delivery: 'physical',
      schoolKey: 'school',
      registrationClosesAt: now + 1800000,
    }),
  ).rejects.toMatchObject({ code: 'verified_host_required' });
});
it('does not expose private attendance or venue through a public preview', async () => {
  const eventId = await createEvent('individual');
  doc(`competitionEvents/${eventId}`).venue = 'PRIVATE VENUE';
  const preview = await readEvent(db, eventId, null);
  expect(preview.event.venue).toBe('');
  expect(preview.entries).toEqual([]);
  expect(preview.role).toBe('viewer');
});
it('does not assign a named-team champion to the top individual', async () => {
  const teamId = await makeTeam(),
    eventId = await createEvent();
  await mutate('a', 'roster-save', {
    eventId,
    teamId,
    starters: ['a', 'b', 'c'],
  });
  for (const uid of ['b', 'c'])
    await mutate(uid, 'entry-confirm', { eventId, entryId: teamId });
  await mutate('a', 'entry-register', { eventId, entryId: teamId });
  doc(`userTournaments/${eventId}/players/a`).points = 100;
  doc(`userTournaments/${eventId}/players/a`).answered = 1;
  doc(`userTournaments/${eventId}`).state = 'finished';
  await recomputeStandings(db, eventId, now + 7200000);
  expect(doc(`userTournaments/${eventId}`).winner).toBeNull();
  expect(doc(`userTournaments/${eventId}`).winningEntrants).toEqual([
    { id: teamId, label: 'Les étoiles' },
  ]);
  expect(
    doc(`userTournaments/${eventId}/standings/current`).namedTeams[0].missing,
  ).toBe(2);
});
it('creation rollback blocks new entities while an existing roster remains usable', async () => {
  const eventId = await createEvent('individual');
  process.env.COMPETITION_CREATION_ENABLED = 'false';
  await expect(
    mutate('a', 'team-create', { name: 'New team' }),
  ).rejects.toMatchObject({ code: 'pilot_not_enabled' });
  await mutate('a', 'roster-save', { eventId });
  await mutate('a', 'entry-register', { eventId, entryId: 'a' });
  expect(doc(`userTournaments/${eventId}/roster/a`)).toBeDefined();
});
it('keeps check-in private and requires scoped host authority', async () => {
  mockDb.store.set('schoolRoles/school_host', {
    uid: 'host',
    schoolKey: 'school',
    role: 'host',
    status: 'approved',
  });
  mockDb.store.set('schoolMemberships/school_a', {
    uid: 'a',
    schoolKey: 'school',
    status: 'approved',
  });
  const eventId = await createEvent('individual', {
    schoolKey: 'school',
    delivery: 'physical',
    venue: 'Restricted venue',
  });
  await mutate('a', 'roster-save', { eventId });
  await mutate('a', 'entry-register', { eventId, entryId: 'a' });
  await expect(
    mutate('b', 'checkin', { eventId, recipientUid: 'a' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await mutate('host', 'event-cohost', {
    eventId,
    recipientUid: 'd',
    role: 'checkin',
  });
  await mutate('d', 'checkin', { eventId, recipientUid: 'a' });
  expect(doc(`competitionEvents/${eventId}/attendance/a`).checkedInBy).toBe(
    'd',
  );
  expect((await readEvent(db, eventId, 'b')).event.venue).toBe('');
  expect((await readEvent(db, eventId, 'a')).event.venue).toBe(
    'Restricted venue',
  );
  await mutate('host', 'event-cohost', {
    eventId,
    recipientUid: 'd',
    role: 'remove',
  });
  await expect(
    mutate('d', 'checkin', { eventId, recipientUid: 'a' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
it('recruitment requires school approval and explicit member request, not a captain adding strangers', async () => {
  for (const uid of ['a', 'b'])
    mockDb.store.set(`schoolMemberships/school_${uid}`, {
      uid,
      schoolKey: 'school',
      status: 'approved',
    });
  const team = await mutate('a', 'team-create', {
    name: 'School team',
    schoolKey: 'school',
    visibility: 'school',
  });
  await expect(
    mutate('c', 'recruitment-request', { teamId: team.teamId }),
  ).rejects.toMatchObject({ code: 'membership_pending' });
  await expect(
    mutate('a', 'recruitment-review', {
      teamId: team.teamId,
      recipientUid: 'b',
      approve: true,
    }),
  ).rejects.toMatchObject({ code: 'request_unavailable' });
  await mutate('b', 'recruitment-request', { teamId: team.teamId });
  expect(doc(`teams/${team.teamId}`).members).toEqual(['a']);
  await mutate('a', 'recruitment-review', {
    teamId: team.teamId,
    recipientUid: 'b',
    approve: true,
  });
  expect(doc(`teams/${team.teamId}`).members).toEqual(['a', 'b']);
});
it('following is independent of registration, capacity and attendee claims', async () => {
  const eventId = await createEvent('individual');
  await mutate('a', 'event-follow', { eventId, follow: true });
  expect(doc(`competitionEvents/${eventId}`).entryCount).toBe(0);
  expect(mockDb.store.has(`entryClaims/${eventId}_a`)).toBe(false);
  expect((await readEvent(db, eventId, 'a')).following).toBe(true);
  await mutate('a', 'event-follow', { eventId, follow: false });
  expect((await readEvent(db, eventId, 'a')).following).toBe(false);
});
it('external result disputes block confirmation and league points; corrections rebuild versioned standings', async () => {
  const all = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (const uid of all) {
    mockDb.store.set(`users/${uid}`, { displayName: uid });
    mockDb.store.set(`schoolMemberships/school_${uid}`, {
      uid,
      schoolKey: 'school',
      status: 'approved',
    });
  }
  mockDb.store.set('schoolRoles/school_host', {
    uid: 'host',
    schoolKey: 'school',
    role: 'host',
    status: 'approved',
  });
  const teamIds: string[] = [];
  for (const members of [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]) {
    const team = await mutate(members[0], 'team-create', {
      name: `Équipe ${members[0]}`,
      schoolKey: 'school',
    });
    teamIds.push(String(team.teamId));
    for (const member of members.slice(1)) {
      const invite = await mutate(members[0], 'team-invite', {
        teamId: team.teamId,
        recipientUid: member,
      });
      await mutate(member, 'invite-respond', {
        inviteId: invite.inviteId,
        accept: true,
      });
    }
  }
  const league = await mutate('host', 'league-create', {
    title: 'Saison pilote',
    schoolKey: 'school',
    sourcePolicy:'external_100_points_v1',
    public: true,
  });
  for (let i = 0; i < 2; i++) {
    await mutate('host', 'league-invite', {
      leagueId: league.leagueId,
      teamId: teamIds[i],
    });
    await mutate(i === 0 ? 'a' : 'd', 'league-consent', {
      leagueId: league.leagueId,
      teamId: teamIds[i],
    });
    await mutate('host', 'league-enroll', {
      leagueId: league.leagueId,
      teamId: teamIds[i],
      revision: i + 1,
    });
  }
  await mutate('host', 'league-start', {
    leagueId: league.leagueId,
    revision: 3,
    startsAt: now + 3600000,
    intervalHours: 168,
  });
  const draft = await mutate('host', 'event-save', {
    config: config(),
    entryMode: 'named_team',
    audience: 'public',
    registrationClosesAt: now + 1800000,
    schoolKey: 'school',
    delivery: 'external',
    externalUrl: 'https://example.org/register',
  });
  const eventId = String(draft.eventId);
  await mutate('host', 'fixture-link', {
    leagueId: league.leagueId,
    revision: 4,
    fixtureId: doc(`leagues/${league.leagueId}`).fixtures[0].id,
    eventId,
  });
  await mutate('host', 'event-publish', { eventId, revision: 1 });
  for (let i = 0; i < 2; i++) {
    const members = i === 0 ? ['a', 'b', 'c'] : ['d', 'e', 'f'];
    await mutate(members[0], 'roster-save', {
      eventId,
      teamId: teamIds[i],
      starters: members,
    });
    for (const member of members.slice(1))
      await mutate(member, 'entry-confirm', { eventId, entryId: teamIds[i] });
    await mutate(members[0], 'entry-register', {
      eventId,
      entryId: teamIds[i],
    });
  }
  await mutate('host', 'event-report-result', {
    eventId,
    revision: 0,
    rows: [
      { entryId: teamIds[0], score: 20 },
      { entryId: teamIds[1], score: 10 },
    ],
  });
  await mutate('a', 'event-dispute', {
    eventId,
    reason: 'Le score doit être vérifié.',
  });
  await expect(
    mutate('host', 'event-confirm-result', { eventId, revision: 1 }),
  ).rejects.toMatchObject({ code: 'unresolved_disputes' });
  const dispute = mockDb.childrenOf(
    `competitionEvents/${eventId}/disputes`,
  )[0][1];
  await mutate('host', 'dispute-resolve', {
    eventId,
    disputeId: dispute.id,
    resolution: 'Le relevé externe confirme les scores.',
  });
  await mutate('host', 'event-confirm-result', { eventId, revision: 1 });
  const fixture = doc(`leagues/${league.leagueId}`).fixtures[0];
  await mutate('host', 'fixture-update', {
    leagueId: league.leagueId,
    revision: doc(`leagues/${league.leagueId}`).revision,
    fixtureId: fixture.id,
    status: 'final',
    eventId,
    reason: 'Résultat confirmé de la rencontre.',
  });
  expect(
    doc(`leagues/${league.leagueId}/standings/current`).table.find(
      (r: any) => r.id === teamIds[0],
    ).points,
  ).toBe(3);
  await mutate('host', 'fixture-update', {
    leagueId: league.leagueId,
    revision: doc(`leagues/${league.leagueId}`).revision,
    fixtureId: fixture.id,
    status: 'disputed',
    reason: 'Nouveau relevé à examiner.',
  });
  expect(
    doc(`leagues/${league.leagueId}/standings/current`).table.every(
      (r: any) => r.points === 0,
    ),
  ).toBe(true);
  await mutate('host', 'event-report-result', {
    eventId,
    revision: 2,
    rows: [
      { entryId: teamIds[0], score: 5 },
      { entryId: teamIds[1], score: 10 },
    ],
  });
  await mutate('host', 'event-confirm-result', { eventId, revision: 3 });
  await mutate('host', 'fixture-update', {
    leagueId: league.leagueId,
    revision: doc(`leagues/${league.leagueId}`).revision,
    fixtureId: fixture.id,
    status: 'final',
    eventId,
    reason: 'Correction du résultat externe confirmé.',
  });
  const table = doc(`leagues/${league.leagueId}/standings/current`).table;
  expect(table.find((r: any) => r.id === teamIds[0]).points).toBe(0);
  expect(table.find((r: any) => r.id === teamIds[1]).points).toBe(3);
  await mutate('host', 'league-close', {
    leagueId: league.leagueId,
    revision: doc(`leagues/${league.leagueId}`).revision,
  });
  await mutate('host', 'league-reopen', {
    leagueId: league.leagueId,
    revision: doc(`leagues/${league.leagueId}`).revision,
    reason: 'Correction après clôture, sous contrôle.',
  });
  expect(doc(`leagues/${league.leagueId}/standings/current`).final).toBe(false);
});

const pushedTo = () =>
  mockExpoPush.mock.calls.map((call) => call[0] as string).sort();
const inboxOf = (uid: string) =>
  mockDb.childrenOf(`users/${uid}/competitionInbox`).map(([, d]) => d);
it('writes typed, unread inbox records and pushes invitations in the recipient language', async () => {
  mockDb.store.set('users/b', { displayName: 'b', prefs: { language: 'ht' } });
  const team = await mutate('a', 'team-create', { name: 'Étoiles' });
  expect(doc(`users/a/competitionInbox/team_${team.teamId}`)).toMatchObject({
    action: 'created',
    targetKind: 'team',
    read: true,
  });
  expect(mockExpoPush).not.toHaveBeenCalled();
  const invite = await mutate('a', 'team-invite', {
    teamId: team.teamId,
    recipientUid: 'b',
  });
  expect(doc(`users/b/competitionInbox/invite_${invite.inviteId}`)).toEqual({
    id: `invite_${invite.inviteId}`,
    kind: 'invite',
    targetKind: 'invite',
    targetId: invite.inviteId,
    action: 'invited',
    title: 'Étoiles',
    read: false,
    updatedAt: now,
  });
  expect(mockExpoPush).toHaveBeenCalledTimes(1);
  const [to, message] = mockExpoPush.mock.calls[0] as [string, any];
  expect(to).toBe('b');
  expect(message.body).toBe('Yo envite w antre nan ekip sa a.');
  expect(message.data).toEqual({
    type: 'competition',
    action: 'invited',
    targetKind: 'invite',
    targetId: invite.inviteId,
    path: `/arena/invitations/${invite.inviteId}`,
  });
  expect((mockWebPush.mock.calls[0] as [string, any])[1].url).toBe(
    `/arena/invitations/${invite.inviteId}`,
  );
  await mutate('b', 'invite-respond', {
    inviteId: invite.inviteId,
    accept: false,
  });
  expect(doc(`users/a/competitionInbox/team_${team.teamId}`)).toMatchObject({
    action: 'invite_declined',
    read: false,
  });
  const next = await mutate('a', 'team-invite', {
    teamId: team.teamId,
    recipientUid: 'c',
  });
  await mutate('a', 'invite-revoke', { inviteId: next.inviteId });
  expect(doc(`users/c/competitionInbox/invite_${next.inviteId}`).action).toBe(
    'invite_revoked',
  );
});
it('never re-sends a push when a stored receipt is replayed', async () => {
  const team = await mutate('a', 'team-create', { name: 'Étoiles' });
  const values = { teamId: team.teamId, recipientUid: 'b' };
  const first = await mutate('a', 'team-invite', values, 'invite-op');
  expect(await mutate('a', 'team-invite', values, 'invite-op')).toEqual(first);
  expect(pushedTo()).toEqual(['b']);
});
it('push failures and opt-outs never fail or undo the mutation', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockExpoPush.mockRejectedValueOnce(new Error('expo down'));
  mockWebPush.mockRejectedValueOnce(new Error('vapid down'));
  const team = await mutate('a', 'team-create', { name: 'Étoiles' });
  const invite = await mutate('a', 'team-invite', {
    teamId: team.teamId,
    recipientUid: 'b',
  });
  expect(invite.ok).toBe(true);
  expect(doc(`teamInvites/${invite.inviteId}`).status).toBe('pending');
  mockDb.store.set('users/c/settings/notifications', {
    competitionUpdates: false,
  });
  await mutate('a', 'team-invite', { teamId: team.teamId, recipientUid: 'c' });
  expect(pushedTo()).toEqual(['b']);
  expect(inboxOf('c')).toHaveLength(1);
  warn.mockRestore();
});
it('reaches followers on announce, postpone and cancel; starters get the typed change', async () => {
  const teamId = await makeTeam(),
    eventId = await createEvent();
  await mutate('a', 'roster-save', {
    eventId,
    teamId,
    starters: ['a', 'b', 'c'],
  });
  expect(doc(`users/b/competitionInbox/entry_${eventId}_${teamId}`).action).toBe(
    'confirm_requested',
  );
  await mutate('b', 'entry-confirm', { eventId, entryId: teamId });
  expect(doc(`users/a/competitionInbox/entry_${eventId}_${teamId}`).action).toBe(
    'starter_confirmed',
  );
  await mutate('c', 'entry-confirm', { eventId, entryId: teamId });
  expect(doc(`users/a/competitionInbox/entry_${eventId}_${teamId}`).action).toBe(
    'roster_ready',
  );
  await mutate('a', 'entry-register', { eventId, entryId: teamId });
  await mutate('d', 'event-follow', { eventId, follow: true });
  expect(doc(`users/d/competitionInbox/follow_${eventId}`).action).toBe(
    'following',
  );
  mockExpoPush.mockClear();
  await mutate('host', 'event-announce', { eventId, message: 'Salle 4.' });
  expect(doc(`users/d/competitionInbox/follow_${eventId}`)).toMatchObject({
    action: 'announcement',
    read: false,
  });
  expect(pushedTo()).toEqual(['a', 'b', 'c', 'd']);
  // The announcement text itself never travels in the push.
  expect(JSON.stringify(mockExpoPush.mock.calls)).not.toContain('Salle 4.');
  await mutate('host', 'event-postpone', { eventId, startsAt: now + 7200000 });
  expect(doc(`users/b/competitionInbox/entry_${eventId}_${teamId}`).action).toBe(
    'reconfirm_needed',
  );
  expect(doc(`users/d/competitionInbox/follow_${eventId}`).action).toBe(
    'postponed',
  );
  mockExpoPush.mockClear();
  await mutate('host', 'event-cancel', { eventId });
  for (const uid of ['a', 'b', 'c'])
    expect(
      doc(`users/${uid}/competitionInbox/entry_${eventId}_${teamId}`).action,
    ).toBe('cancelled');
  expect(doc(`users/d/competitionInbox/follow_${eventId}`).action).toBe(
    'cancelled',
  );
  expect(pushedTo()).toEqual(['a', 'b', 'c', 'd']);
  await mutate('d', 'event-follow', { eventId, follow: false });
  expect(mockDb.store.has(`competitionEvents/${eventId}/followers/d`)).toBe(
    false,
  );
});
it('co-host changes reach the co-host only, and mark-read touches only the caller', async () => {
  const eventId = await createEvent('individual');
  await mutate('a', 'roster-save', { eventId });
  await mutate('a', 'entry-register', { eventId, entryId: 'a' });
  mockExpoPush.mockClear();
  await mutate('host', 'event-cohost', {
    eventId,
    recipientUid: 'd',
    role: 'manage',
  });
  expect(pushedTo()).toEqual(['d']);
  expect(doc(`users/d/competitionInbox/event_${eventId}`).action).toBe(
    'cohost_granted',
  );
  expect(doc(`users/a/competitionInbox/entry_${eventId}_a`).action).toBe(
    'registered',
  );
  await mutate('d', 'inbox-read', {
    ids: [`event_${eventId}`, 'missing_item'],
  });
  expect(doc(`users/d/competitionInbox/event_${eventId}`).read).toBe(true);
  expect(mockDb.store.has('users/d/competitionInbox/missing_item')).toBe(false);
  await expect(
    mutate('d', 'inbox-read', { ids: ['../x'] }),
  ).rejects.toMatchObject({ code: 'invalid_id' });
});
it('co-host grants respect blocks and repeated grants do not re-push', async () => {
  const eventId = await createEvent('individual');
  mockExpoPush.mockClear();
  await mutate('host', 'event-cohost', { eventId, recipientUid: 'd', role: 'manage' });
  await mutate('host', 'event-cohost', { eventId, recipientUid: 'd', role: 'manage' });
  expect(pushedTo()).toEqual(['d']);
  mockDb.store.set('competitionBlocks/c_host', { uid: 'c', blockedUid: 'host' });
  await expect(
    mutate('host', 'event-cohost', { eventId, recipientUid: 'c', role: 'checkin' }),
  ).rejects.toMatchObject({ code: 'invitation_unavailable' });
  await expect(
    mutate('host', 'event-cohost', { eventId, recipientUid: 'ghost', role: 'checkin' }),
  ).rejects.toMatchObject({ code: 'recipient_not_found' });
});
it('followers who lost access are pruned instead of notified, and can always unfollow', async () => {
  const eventId = await createEvent('individual');
  mockDb.store.set(`competitionEvents/${eventId}/followers/z`, { uid: 'z', createdAt: now });
  mockDb.store.set(`users/z/competitionFollows/${eventId}`, { eventId, createdAt: now });
  const e = doc(`competitionEvents/${eventId}`);
  mockDb.store.set(`competitionEvents/${eventId}`, { ...e, audience: 'private' });
  mockExpoPush.mockClear();
  await mutate('host', 'event-announce', { eventId, message: 'Salle 4.' });
  expect(pushedTo()).not.toContain('z');
  expect(mockDb.store.has(`competitionEvents/${eventId}/followers/z`)).toBe(false);
  expect(mockDb.store.has(`users/z/competitionFollows/${eventId}`)).toBe(false);
  await expect(mutate('z', 'event-follow', { eventId, follow: false })).resolves.toMatchObject({ ok: true });
});
it('membership review notifies the reviewed student; results release without scores', async () => {
  mockDb.store.set('schoolRoles/school_host', {
    uid: 'host',
    schoolKey: 'school',
    role: 'host',
    status: 'approved',
  });
  await mutate('a', 'membership-request', { schoolKey: 'school' });
  const hostInbox = inboxOf('host');
  expect(hostInbox).toHaveLength(1);
  expect(hostInbox[0]).toMatchObject({
    action: 'membership_requested',
    targetKind: 'school',
    targetId: 'school',
  });
  mockExpoPush.mockClear();
  await mutate('host', 'membership-review', {
    schoolKey: 'school',
    recipientUid: 'a',
    approve: true,
  });
  expect(pushedTo()).toEqual(['a']);
  expect(inboxOf('a')[0]).toMatchObject({ action: 'membership_approved' });
});
