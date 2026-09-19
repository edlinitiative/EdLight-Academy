/**
 * Which open tournament the Home tab announces, without a renderer.
 *
 * `ArenaLobbyScreen` — the actual sign-up screen, fully built — had exactly
 * one link to it anywhere in the app: a button on the RESULTS screen of a
 * tournament that had already finished. `pickOpenTournament` is the logic
 * behind the fix, tested the same way `pickOnAir` is on the broadcast side:
 * get the ordering wrong and either nothing gets announced while a room is
 * filling, or last month's tournament outranks this month's.
 */
import { pickOpenTournament, type ArenaTournament } from '../../services/arenaService';

jest.mock('../../services/firebase', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  Timestamp: class {},
}));

const row = (id: string, state: ArenaTournament['state'], startsAt = 0): ArenaTournament => ({
  id, slug: id, title: id, state, startsAt, doorsAt: 0, rounds: [], questionCount: 25,
  teamSize: 5, minPlayers: 5, prizes: [], currentRound: null, currentQuestion: null,
  counts: { schools: 0, players: 0, qualifiedSchools: 0 },
});

describe('pickOpenTournament', () => {
  it('is silent when nothing is open for sign-up', () => {
    expect(pickOpenTournament([])).toBeNull();
    expect(pickOpenTournament([row('x', 'live')])).toBeNull();
    expect(pickOpenTournament([row('x', 'final')])).toBeNull();
    expect(pickOpenTournament([row('x', 'draft')])).toBeNull();
  });

  it('announces a tournament open for registration', () => {
    expect(pickOpenTournament([row('oct', 'registration')])?.id).toBe('oct');
  });

  it('prefers doors over registration — the room filling is more urgent', () => {
    const result = pickOpenTournament([row('sept', 'registration'), row('oct', 'doors')]);
    expect(result?.id).toBe('oct');
  });

  it('never announces a tournament already live or finished, even alongside an open one', () => {
    expect(pickOpenTournament([row('live-one', 'live'), row('next', 'registration')])?.id).toBe('next');
  });

  it('picks the soonest when two share a state', () => {
    const result = pickOpenTournament([
      row('later', 'registration', 9000),
      row('sooner', 'registration', 1000),
    ]);
    expect(result?.id).toBe('sooner');
  });
});
