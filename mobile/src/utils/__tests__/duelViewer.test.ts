/**
 * P0 code validation (2026-10-19) — the received-duel card ignored who was
 * looking: the challenger could "relever" their own duel (server rejects with
 * self_challenge, shown as a connection error), and a third person saw the
 * real opponent's score under "Toi". A response lost after the server
 * recorded the score was reported as a failure with no way back.
 */
import { duelViewerRole, recoveredAcceptOutcome } from '../duels';

const base = {
  code: 'ABCDEFGH', challengerUid: 'A', challengerName: 'Ana', categoryId: 'c', questionIdxs: [], total: 10,
  challengerScore: 6, createdAt: 0, expiresAt: 0, status: 'open' as const, opponent: null as any,
};
const played = { ...base, status: 'played' as const, opponent: { uid: 'B', name: 'Ben', score: 8, playedAt: 1 } };

describe('duelViewerRole', () => {
  it('knows the challenger', () => expect(duelViewerRole(base, 'A')).toBe('challenger'));
  it('knows the opponent', () => expect(duelViewerRole(played, 'B')).toBe('opponent'));
  it('anyone else on an open duel may play', () => expect(duelViewerRole(base, 'C')).toBe('candidate'));
  it('anyone else on a played duel is a spectator', () => expect(duelViewerRole(played, 'C')).toBe('spectator'));
  it('signed out', () => expect(duelViewerRole(base, null)).toBe('candidate'));
});

describe('recoveredAcceptOutcome (already_played after a lost response)', () => {
  it('returns the recorded result when this student is the recorded opponent', () => {
    expect(recoveredAcceptOutcome(played, 'B')).toEqual({
      result: 'won', challengerScore: 6, opponentScore: 8, total: 10, xpAwarded: 0, recovered: true,
    });
  });
  it('does not claim someone else’s play', () => {
    expect(recoveredAcceptOutcome(played, 'C')).toBeNull();
    expect(recoveredAcceptOutcome(null, 'B')).toBeNull();
  });
});
