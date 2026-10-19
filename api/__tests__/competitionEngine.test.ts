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
