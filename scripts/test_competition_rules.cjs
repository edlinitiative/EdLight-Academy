/* Run only against a demo project in the local Firestore emulator. */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const requireTools = process.env.COMPETITION_TEST_TOOLS
  ? createRequire(path.join(process.env.COMPETITION_TEST_TOOLS, 'package.json'))
  : require;
const { initializeTestEnvironment, assertFails, assertSucceeds } = requireTools(
  '@firebase/rules-unit-testing',
);
const { doc, setDoc, getDoc } = requireTools('firebase/firestore');
(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error('Refusing to run without FIRESTORE_EMULATOR_HOST');
  const projectId = 'demo-edlight-competition';
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync(
        path.join(__dirname, '../firestore.rules'),
        'utf8',
      ),
    },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const [key, value] of Object.entries({
        'competitionEvents/public': {
          ownerUid: 'host',
          audience: 'public',
          cohosts: {},
          schoolKey: null,
        },
        'competitionEvents/school': {
          ownerUid: 'host',
          audience: 'school',
          cohosts: { checkin: 'checkin' },
          schoolKey: 'lycee test',
        },
        'schoolMemberships/lycee test_member': {
          uid: 'member',
          status: 'approved',
        },
        'userTournaments/public': {
          visibility: 'public',
          schemaVersion: 2,
          competitionEventId: 'public',
          creatorUid: 'host',
        },
        'userTournaments/school': {
          visibility: 'private',
          schemaVersion: 2,
          competitionEventId: 'school',
          creatorUid: 'host',
        },
        'userTournaments/school/live/state': {
          phase: 'question',
          question: { q: 'Question', options: ['A', 'B'] },
        },
        'userTournaments/school/roster/entrant': {
          uid: 'entrant',
          displayName: 'Participant',
        },
        'userTournaments/school/questions/live': { items: [{ answer: 1 }] },
        'userTournaments/school/players/entrant': { points: 100 },
        'userTournaments/school/teamControl/team': {
          holderUid: 'entrant',
          authorityVersion: 1,
          slots: ['entrant'],
        },
        'userTournaments/school/teamAnswers/0_team': { uid: 'entrant', choice: 1 },
        'userTournaments/school/teamAttempts/0_team': { answeredBy: ['entrant'] },
        'userTournaments/legacy': { visibility: 'private', creatorUid: 'host' },
        'users/member/competitionInbox/invite': {
          kind: 'invite',
          targetId: 'secret',
        },
        'teamInvites/secret': { recipientUid: 'member' },
        'competitionEvents/school/attendance/entrant': {
          uid: 'entrant',
          checkedInAt: 100,
        },
        'entryClaims/school_entrant': { entryId: 'team' },
      }))
        await setDoc(doc(db, key), value);
    });
    const guest = env.unauthenticatedContext().firestore();
    const outsider = env.authenticatedContext('outsider').firestore();
    const member = env.authenticatedContext('member').firestore();
    const entrant = env.authenticatedContext('entrant').firestore();
    const hostDb = env.authenticatedContext('host').firestore();
    await assertSucceeds(getDoc(doc(guest, 'userTournaments/public')));
    await assertFails(getDoc(doc(guest, 'userTournaments/school')));
    await assertFails(getDoc(doc(outsider, 'userTournaments/school')));
    await assertSucceeds(getDoc(doc(member, 'userTournaments/school')));
    await assertSucceeds(
      getDoc(doc(member, 'userTournaments/school/live/state')),
    );
    await assertSucceeds(getDoc(doc(entrant, 'userTournaments/school')));
    await assertSucceeds(getDoc(doc(hostDb, 'userTournaments/legacy')));
    await assertFails(getDoc(doc(outsider, 'userTournaments/legacy')));
    await assertSucceeds(
      getDoc(doc(member, 'users/member/competitionInbox/invite')),
    );
    await assertFails(
      getDoc(doc(outsider, 'users/member/competitionInbox/invite')),
    );
    for (const key of [
      'teamInvites/secret',
      'entryClaims/school_entrant',
      'competitionEvents/school',
      'competitionEvents/school/attendance/entrant',
      'userTournaments/school/questions/live',
      'userTournaments/school/players/entrant',
      'userTournaments/school/teamControl/team',
      'userTournaments/school/teamAnswers/0_team',
      'userTournaments/school/teamAttempts/0_team',
    ]) {
      await assertFails(getDoc(doc(member, key)));
      await assertFails(getDoc(doc(hostDb, key)));
    }
    // Team-mode authority and answers are server-only even for the team's own starter.
    for (const key of ['classes/private', 'classes/private/weeks/2026-10-19', 'classes/private/state/completions', 'classAccounts/entrant', 'classTeachers/entrant', 'classCodes/ABC234',
      'progressShares/abc', 'ambassadors/entrant', 'ambassadorRecruits/entrant', 'ambassadorRewards/entrant_2026-10',
      'ambassadorAudit/1_abc', 'ambassadorApplications/app1_approve']) {
      for (const db of [guest, member, hostDb, entrant]) {
        await assertFails(getDoc(doc(db, key)));
        await assertFails(setDoc(doc(db, key), { memberUids: ['entrant'], active: true }));
      }
    }
    for (const key of [
      'userTournaments/school/teamControl/team',
      'userTournaments/school/teamAnswers/0_team',
      'userTournaments/school/teamAttempts/0_team',
    ]) {
      await assertFails(getDoc(doc(entrant, key)));
      await assertFails(setDoc(doc(entrant, key), { holderUid: 'entrant', authorityVersion: 99 }));
    }
    await assertFails(
      setDoc(doc(member, 'schoolMemberships/lycee test_member'), {
        status: 'approved',
      }),
    );
    await assertFails(
      setDoc(doc(member, 'schoolRoles/lycee test_member'), {
        role: 'host',
        status: 'approved',
      }),
    );
    await assertFails(
      setDoc(doc(member, 'teams/fake'), { captainUid: 'member' }),
    );
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(doc(context.firestore(), 'schoolMemberships/lycee test_member'), {
        uid: 'member',
        status: 'revoked',
      }),
    );
    await assertFails(getDoc(doc(member, 'userTournaments/school')));
    console.log(
      'Competition rules: public/private/school/legacy, account isolation, protected answers/attendance/team authority, privilege writes and revocation passed.',
    );
  } finally {
    await env.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
