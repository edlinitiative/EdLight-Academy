/** Real transaction contention; skipped in ordinary unit runs, required by test:competition:emulator. */
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mutateCompetition } from '../_lib/competition';
const emulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
emulator('competition emulator transactions', () => {
  const projectId = 'demo-edlight-competition';
  const app = initializeApp({ projectId }, 'competition-emulator-tests');
  const db = getFirestore(app);
  const now = 1792340000000;
  let serial = 0;
  const mutate = (
    uid: string,
    action: string,
    input: Record<string, unknown>,
    operationId = `op${++serial}`,
  ) => mutateCompetition(db, uid, uid, { action, operationId, ...input }, now);
  beforeAll(async () => {
    process.env.COMPETITION_CREATION_ENABLED = 'true';
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: 'DELETE' },
    );
    await Promise.all(
      ['a', 'b', 'c', 'host'].map((uid) =>
        db.doc(`users/${uid}`).set({ displayName: uid }),
      ),
    );
  });
  afterAll(async () => {
    await db.terminate();
    await deleteApp(app);
    delete process.env.COMPETITION_CREATION_ENABLED;
  });
  it('one operation ID creates exactly one entity under concurrent retries', async () => {
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        mutate(
          'a',
          'team-create',
          { name: 'Concurrent team' },
          'same-operation',
        ),
      ),
    );
    expect(new Set(responses.map((r) => r.teamId)).size).toBe(1);
    expect((await db.collection('teams').get()).size).toBe(1);
  }, 30000);
  it('two overlapping teams racing for registration cannot double-enter any starter', async () => {
    const teams = [];
    for (let i = 0; i < 2; i++) {
      const team = await mutate('a', 'team-create', { name: `Team ${i}` });
      teams.push(String(team.teamId));
      for (const recipientUid of ['b', 'c']) {
        const invite = await mutate('a', 'team-invite', {
          teamId: team.teamId,
          recipientUid,
        });
        await mutate(recipientUid, 'invite-respond', {
          inviteId: invite.inviteId,
          accept: true,
        });
      }
    }
    const config = {
      title: 'Race',
      format: 'window',
      visibility: 'public',
      categories: ['maths_eclair'],
      questionCount: 5,
      secondsPerQuestion: 20,
      startsAt: now + 3600000,
      windowHours: 1,
      maxPlayers: 30,
    };
    const event = await mutate('host', 'event-save', {
      config,
      entryMode: 'named_team',
      audience: 'public',
      registrationClosesAt: now + 1800000,
    });
    await mutate('host', 'event-publish', {
      eventId: event.eventId,
      revision: 1,
    });
    for (const teamId of teams) {
      await mutate('a', 'roster-save', {
        eventId: event.eventId,
        teamId,
        starters: ['a', 'b', 'c'],
      });
      for (const member of ['b', 'c'])
        await mutate(member, 'entry-confirm', {
          eventId: event.eventId,
          entryId: teamId,
        });
    }
    const outcomes = await Promise.allSettled(
      teams.map((entryId) =>
        mutate('a', 'entry-register', { eventId: event.eventId, entryId }),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await db.doc(`competitionEvents/${event.eventId}`).get()).data()
        ?.entryCount,
    ).toBe(1);
    expect(
      (await db.doc(`userTournaments/${event.eventId}`).get()).data()
        ?.playerCount,
    ).toBe(3);
    const claims = await Promise.all(
      ['a', 'b', 'c'].map((uid) =>
        db.doc(`entryClaims/${event.eventId}_${uid}`).get(),
      ),
    );
    expect(new Set(claims.map((c) => c.data()?.entryId)).size).toBe(1);
  }, 30000);
});
