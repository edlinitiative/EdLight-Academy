/**
 * The web/app URL contract, without a navigator.
 *
 * The bug this guards: `arena/:tournamentId` used to parse `championnat` and
 * `demo` as tournament ids, opening a lobby for an event that does not exist.
 */
import {
  resolveAppPath,
  stateForTarget,
  isValidTournamentId,
  isReservedArenaSegment,
  normalizeDuelCode,
  pathSegments,
  RESERVED_ARENA_SEGMENTS,
} from '../../navigation/arenaLinks';

describe('reserved Arena segments', () => {
  it.each(['championnat', 'demo', 'histoire', 'studio', 'jouer', 'reclamation', 'autorisation'])(
    '%s is reserved and never a tournament id',
    (seg) => {
      expect(isReservedArenaSegment(seg)).toBe(true);
      expect(isReservedArenaSegment(seg.toUpperCase())).toBe(true);
      expect(isValidTournamentId(seg)).toBe(false);
    },
  );

  it('reserves the four web pages the brief names', () => {
    for (const s of ['championnat', 'demo', 'histoire', 'studio']) {
      expect(RESERVED_ARENA_SEGMENTS).toContain(s);
    }
  });
});

describe('tournament id shape', () => {
  it('accepts the server shape', () => {
    expect(isValidTournamentId('arena-2026-10')).toBe(true);
    expect(isValidTournamentId('A1_b')).toBe(true);
    expect(isValidTournamentId('x'.repeat(64))).toBe(true);
  });
  it('rejects anything the server would reject', () => {
    expect(isValidTournamentId('')).toBe(false);
    expect(isValidTournamentId('-leading')).toBe(false);
    expect(isValidTournamentId('has space')).toBe(false);
    expect(isValidTournamentId('a/b')).toBe(false);
    expect(isValidTournamentId('x'.repeat(65))).toBe(false);
    expect(isValidTournamentId(undefined)).toBe(false);
  });
});

describe('resolveAppPath', () => {
  it('maps the hub and its sections', () => {
    expect(resolveAppPath('arena')).toEqual({ screen: 'ArenaHub' });
    expect(resolveAppPath('/arena/')).toEqual({ screen: 'ArenaHub' });
    expect(resolveAppPath('arena/championnat')).toEqual({ screen: 'ArenaHub', params: { section: 'championnat' } });
    expect(resolveAppPath('arena/jouer')).toEqual({ screen: 'ArenaHub' });
  });

  it('sends the web demo to the hub demo explainer, never a real live event', () => {
    expect(resolveAppPath('arena/demo')).toEqual({ screen: 'ArenaHub', params: { section: 'demo' } });
    expect(resolveAppPath('arena/DEMO?ref=x')).toEqual({ screen: 'ArenaHub', params: { section: 'demo' } });
  });

  it('opens Mode Histoire natively (ported from the web), never as a tournament', () => {
    expect(resolveAppPath('arena/histoire')).toEqual({ screen: 'ArenaStory' });
    expect(resolveAppPath('https://academy.edlight.org/arena/HISTOIRE?c=2')).toEqual({ screen: 'ArenaStory' });
    expect(stateForTarget({ screen: 'ArenaStory' })).toEqual({ routes: [{ name: 'Main' }, { name: 'ArenaStory' }] });
  });

  it('never parses a web-only page as a tournament', () => {
    expect(resolveAppPath('arena/studio/x')).toEqual({ screen: 'ArenaHub' });
    expect(resolveAppPath('arena/studio')).toEqual({ screen: 'ArenaHub' });
    expect(resolveAppPath('arena/reclamation?tid=abc')).toEqual({ screen: 'ArenaHub' });
  });

  it('opens a lobby only for a valid id', () => {
    expect(resolveAppPath('arena/oct-2026')).toEqual({ screen: 'ArenaLobby', params: { tournamentId: 'oct-2026' } });
    expect(resolveAppPath('arena/jouer/oct-2026')).toEqual({ screen: 'ArenaLobby', params: { tournamentId: 'oct-2026' } });
    expect(resolveAppPath('arena/bad%20id')).toEqual({ screen: 'ArenaHub' });
    expect(resolveAppPath('arena/jouer/demo')).toEqual({ screen: 'ArenaHub' });
    expect(resolveAppPath('arena/oct-2026/extra')).toEqual({ screen: 'ArenaHub' });
  });

  it('accepts full URLs on both prefixes', () => {
    expect(resolveAppPath('https://academy.edlight.org/arena/demo')).toEqual({ screen: 'ArenaHub', params: { section: 'demo' } });
    expect(resolveAppPath('edlight://arena/oct-2026')).toEqual({ screen: 'ArenaLobby', params: { tournamentId: 'oct-2026' } });
  });

  it('validates duel codes and falls back to the Jeux tab', () => {
    expect(resolveAppPath('defi/ABCD2345')).toEqual({ screen: 'Defi', params: { code: 'ABCD2345' } });
    expect(resolveAppPath('defi/abcd2345')).toEqual({ screen: 'Defi', params: { code: 'ABCD2345' } });
    expect(resolveAppPath('defi/short')).toEqual({ screen: 'Main', params: { screen: 'Trivia' } });
    expect(resolveAppPath('defi')).toEqual({ screen: 'Main', params: { screen: 'Trivia' } });
  });

  it('leaves other paths to the default parser', () => {
    expect(resolveAppPath('courses')).toBeNull();
    expect(resolveAppPath('')).toBeNull();
    expect(resolveAppPath('arenas')).toBeNull();
  });
});

describe('stateForTarget', () => {
  it('keeps Main underneath so back lands in the app', () => {
    expect(stateForTarget({ screen: 'ArenaHub' })).toEqual({ routes: [{ name: 'Main' }, { name: 'ArenaHub' }] });
    expect(stateForTarget({ screen: 'ArenaLobby', params: { tournamentId: 't1' } }).routes[1])
      .toEqual({ name: 'ArenaLobby', params: { tournamentId: 't1' } });
  });
  it('opens the Jeux tab for a bad duel code', () => {
    expect(stateForTarget({ screen: 'Main', params: { screen: 'Trivia' } }))
      .toEqual({ routes: [{ name: 'Main', state: { routes: [{ name: 'Trivia' }] } }] });
  });
});

describe('helpers', () => {
  it('strips hosts, queries and fragments', () => {
    expect(pathSegments('https://www.academy.edlight.org/arena/demo?x=1#y')).toEqual(['arena', 'demo']);
  });
  it('normalises duel codes', () => {
    expect(normalizeDuelCode(' abcd2345 ')).toBe('ABCD2345');
    expect(normalizeDuelCode('ABCD1234')).toBeNull(); // 1 is not in the alphabet
  });
});

describe('source-aware competition destinations', () => {
  it.each(['evenements', 'equipes', 'invitations', 'ligues', 'ecoles', 'competitions'])('never treats %s as an official event id', (segment) => {
    expect(isValidTournamentId(segment)).toBe(false);
    expect(resolveAppPath(`/arena/${segment}`)?.screen).not.toBe('ArenaLobby');
  });
  it('preserves the user-tournament source and private PIN intent', () => {
    expect(resolveAppPath('/tournois/same-id')).toEqual({ screen:'Tournois', params:{tournamentId:'same-id'} });
    expect(resolveAppPath('/arena/jouer/same-id')).toEqual({ screen:'ArenaLobby', params:{tournamentId:'same-id'} });
    expect(resolveAppPath('https://academy.edlight.org/tournois/rejoindre?pin=123456')).toEqual({screen:'Tournois',params:{pin:'123456'}});
    expect(resolveAppPath('/tournois/rejoindre?pin=1234567')).toEqual({screen:'Tournois',params:{}});
  });
  it.each([['evenements','event'], ['equipes','team'], ['invitations','invite'], ['ligues','league']])('opens %s without changing engine', (segment, kind) => {
    expect(resolveAppPath(`/arena/${segment}/valid-id`)).toEqual({screen:'CompetitionWorkspace',params:{kind,id:'valid-id'}});
    expect(resolveAppPath(`/arena/${segment}/bad%2Fid`)?.screen).toBe('ArenaHub');
  });
});
