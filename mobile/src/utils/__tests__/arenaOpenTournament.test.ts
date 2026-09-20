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
import { pickOpenTournament, pickActiveTournament, type ArenaTournament } from '../../services/arenaService';

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

/**
 * CLOSED: ArenaAnnounceCard used to self-hide the instant a tournament left
 * `doors`, removing the only way back for a student who registered, left the
 * screen, and returned mid-event. `pickActiveTournament` is the query behind
 * the fix — deliberately a DIFFERENT state set than pickOpenTournament's,
 * because "can I sign up" and "is there somewhere I could get back to" are
 * different questions with different answers once a tournament has started.
 */
describe('pickActiveTournament', () => {
  it('is silent when nothing is in progress', () => {
    expect(pickActiveTournament([])).toBeNull();
    expect(pickActiveTournament([row('x', 'registration')])).toBeNull();
    expect(pickActiveTournament([row('x', 'doors')])).toBeNull();
    expect(pickActiveTournament([row('x', 'final')])).toBeNull();
    expect(pickActiveTournament([row('x', 'draft')])).toBeNull();
    expect(pickActiveTournament([row('x', 'void')])).toBeNull();
  });

  it('finds a tournament that is live', () => {
    expect(pickActiveTournament([row('tonight', 'live')])?.id).toBe('tonight');
  });

  it('finds one being graded, and one awaiting review', () => {
    expect(pickActiveTournament([row('g', 'grading')])?.id).toBe('g');
    expect(pickActiveTournament([row('p', 'provisional')])?.id).toBe('p');
  });

  it('prefers a live question over grading over provisional — furthest along is most urgent', () => {
    expect(pickActiveTournament([row('prov', 'provisional'), row('live', 'live')])?.id).toBe('live');
    expect(pickActiveTournament([row('prov', 'provisional'), row('grad', 'grading')])?.id).toBe('grad');
  });

  it('never returns a tournament still open for sign-up, even alongside an active one', () => {
    // Two events at once should not happen in practice, but if it did, this
    // hook's whole point is re-entry into what has already started.
    const result = pickActiveTournament([row('open', 'registration'), row('running', 'live')]);
    expect(result?.id).toBe('running');
  });
});
