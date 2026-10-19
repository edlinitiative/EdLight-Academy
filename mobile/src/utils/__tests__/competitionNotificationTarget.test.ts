import { competitionNotificationTarget } from '../../navigation/competitionContinuity';

it('opens the workspace for a typed competition reference', () => {
  expect(
    competitionNotificationTarget({ type: 'competition', action: 'invited', targetKind: 'invite', targetId: 'inv1', path: '/arena/invitations/inv1' }),
  ).toEqual({ screen: 'CompetitionWorkspace', params: { kind: 'invite', id: 'inv1' } });
  expect(
    competitionNotificationTarget({ type: 'competition', targetKind: 'event', targetId: 'evt_1' }),
  ).toEqual({ screen: 'CompetitionWorkspace', params: { kind: 'event', id: 'evt_1' } });
  expect(
    competitionNotificationTarget({ type: 'competition', targetKind: 'school', targetId: 'lycee alexandre petion' }),
  ).toEqual({ screen: 'CompetitionWorkspace', params: { kind: 'school', id: 'lycee alexandre petion' } });
});

it('falls back to an internal /arena workspace path only', () => {
  expect(
    competitionNotificationTarget({ type: 'competition', path: '/arena/ligues/league1' }),
  ).toEqual({ screen: 'CompetitionWorkspace', params: { kind: 'league', id: 'league1' } });
  expect(competitionNotificationTarget({ type: 'competition', path: 'https://evil.example/arena/ligues/x' })).toBeNull();
  expect(competitionNotificationTarget({ type: 'competition', path: '/arena/jouer/t1' })).toBeNull();
  expect(competitionNotificationTarget({ type: 'competition', path: '/arena/competitions' })).toBeNull();
});

it('rejects malformed or foreign payloads', () => {
  expect(competitionNotificationTarget(undefined)).toBeNull();
  expect(competitionNotificationTarget({ type: 'duel-result', targetKind: 'event', targetId: 'e1' })).toBeNull();
  expect(competitionNotificationTarget({ type: 'competition', targetKind: 'admin', targetId: 'x' })).toBeNull();
  expect(competitionNotificationTarget({ type: 'competition', targetKind: 'event', targetId: '../../etc' })).toBeNull();
});
