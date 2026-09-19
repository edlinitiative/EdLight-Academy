/**
 * The broadcast map's input.
 *
 * Most of these tests are really one test, asked five ways: a school's location
 * is either stated by a person or it is unknown, and "unknown" has to survive
 * all the way to the screen. The product already shipped the other answer once
 * — school addresses inferred from applicants' home addresses — and it split
 * one real school into two.
 */

import {
  selectMapPlaces,
  type MapPlayerInput,
  type MapSchoolInput,
} from '../../../shared/arena/mapPlaces';

const school = (over: Partial<MapSchoolInput> = {}): MapSchoolInput => ({
  key: 'college dominique savio',
  label: 'CODOSA',
  commune: null,
  players: 5,
  qualified: true,
  ...over,
});

const player = (over: Partial<MapPlayerInput> = {}): MapPlayerInput => ({
  uid: 'u1',
  city: null,
  department: null,
  ...over,
});

describe('a school with no stated location', () => {
  it('is not placed on the map, and is counted', () => {
    const out = selectMapPlaces({ schools: [school({ commune: null })], players: [] });

    expect(out.places).toHaveLength(0);
    expect(out.schoolsTotal).toBe(1);
    expect(out.schoolsWithoutLocation).toBe(1);
  });

  it('treats an empty string exactly like a missing one', () => {
    // `School.commune` is typed as a plain string and the seed leaves it '', so
    // '' reaches here far more often than null does. A '' that slipped through
    // as a location would put every unlocated school on one nameless pin.
    const out = selectMapPlaces({
      schools: [school({ commune: '' }), school({ key: 'b', commune: '   ' })],
      players: [],
    });

    expect(out.places).toHaveLength(0);
    expect(out.schoolsWithoutLocation).toBe(2);
  });

  it('is NOT given the commune its players live in, however unanimous they are', () => {
    // The whole rule, as a test. Forty players in Delmas do not move a school
    // to Delmas: students board, move, and cross communes to get to school.
    const players = Array.from({ length: 40 }, (_, i) => player({
      uid: `u${i}`,
      city: 'Delmas',
      department: 'Ouest',
    }));

    const out = selectMapPlaces({ schools: [school({ commune: null })], players });

    expect(out.schoolsWithoutLocation).toBe(1);
    expect(out.places.filter((p) => p.kind === 'school')).toHaveLength(0);
    // The players are on the map. The school is not. That is the honest picture.
    expect(out.places.map((p) => [p.kind, p.name, p.value])).toEqual([['player', 'Delmas', 40]]);
  });
});

describe('a school somebody has located', () => {
  it('becomes one pin carrying its short name and player count', () => {
    const out = selectMapPlaces({
      schools: [school({ commune: 'Pétion-Ville', players: 7, qualified: true })],
      players: [],
    });

    expect(out.places).toEqual([{
      name: 'Pétion-Ville',
      kind: 'school',
      id: 'school:college dominique savio',
      label: 'CODOSA',
      value: 7,
      active: true,
    }]);
    expect(out.schoolsWithoutLocation).toBe(0);
  });

  it('is inactive when it has not qualified, so the map can dim it', () => {
    const out = selectMapPlaces({
      schools: [school({ commune: 'Jacmel', qualified: false })],
      players: [],
    });

    expect(out.places[0].active).toBe(false);
  });

  it('keeps two schools in the same commune as two pins', () => {
    const out = selectMapPlaces({
      schools: [
        school({ key: 'a', label: 'A', commune: 'Cap-Haïtien', players: 9 }),
        school({ key: 'b', label: 'B', commune: 'Cap-Haïtien', players: 3 }),
      ],
      players: [],
    });

    expect(out.places.map((p) => p.id)).toEqual(['school:a', 'school:b']);
    expect(out.places.every((p) => p.name === 'Cap-Haïtien')).toBe(true);
  });
});

describe('players', () => {
  it('are counted per place rather than pinned one by one', () => {
    // Privacy, not tidiness. Most of this audience is under 18 and the stage is
    // a public stream: a pin per uid broadcasts which commune a named child
    // lives in. A count says the same thing about the country and nothing about
    // any one student.
    const out = selectMapPlaces({
      schools: [],
      players: [
        player({ uid: 'a', city: 'Gonaïves', department: 'Artibonite' }),
        player({ uid: 'b', city: 'Gonaïves', department: 'Artibonite' }),
        player({ uid: 'c', city: 'Jacmel', department: 'Sud-Est' }),
      ],
    });

    expect(out.places).toEqual([
      { name: 'Gonaïves', kind: 'player', id: 'players:Gonaïves', value: 2, active: false },
      { name: 'Jacmel', kind: 'player', id: 'players:Jacmel', value: 1, active: false },
    ]);
    expect(out.playersTotal).toBe(3);
  });

  it('falls back to the département when there is no ville', () => {
    // The Diaspora entry has no ville list at all, so this is the only
    // placement a student abroad will ever have.
    const out = selectMapPlaces({
      schools: [],
      players: [player({ city: null, department: 'Diaspora / Étranger' })],
    });

    expect(out.places.map((p) => p.name)).toEqual(['Diaspora / Étranger']);
  });

  it('counts a player with no geography at all instead of placing them anywhere', () => {
    const out = selectMapPlaces({
      schools: [],
      players: [player({ uid: 'a', city: 'Hinche' }), player({ uid: 'b' })],
    });

    expect(out.places).toHaveLength(1);
    expect(out.playersWithoutLocation).toBe(1);
    expect(out.playersTotal).toBe(2);
  });

  it('marks a place active when anyone answering is in it', () => {
    const out = selectMapPlaces({
      schools: [],
      players: [
        player({ uid: 'a', city: 'Delmas', active: false }),
        player({ uid: 'b', city: 'Delmas', active: true }),
      ],
    });

    expect(out.places[0]).toMatchObject({ name: 'Delmas', value: 2, active: true });
  });
});

describe('the order the stage redraws in', () => {
  it('is deterministic and independent of the order rows arrive in', () => {
    // The board re-renders every tick off a fresh query. Pins that reshuffle
    // because a Map iterated differently look like a broken map on camera.
    const schools = [
      school({ key: 'a', label: 'A', commune: 'Hinche', players: 3 }),
      school({ key: 'b', label: 'B', commune: 'Limbé', players: 8 }),
    ];
    const players = [
      player({ uid: '1', city: 'Hinche' }),
      player({ uid: '2', city: 'Limbé' }),
      player({ uid: '3', city: 'Limbé' }),
    ];

    const forward = selectMapPlaces({ schools, players });
    const backward = selectMapPlaces({
      schools: [...schools].reverse(),
      players: [...players].reverse(),
    });

    expect(forward.places).toEqual(backward.places);
    // Schools first (busiest first), then player counts (largest first).
    expect(forward.places.map((p) => p.id)).toEqual([
      'school:b', 'school:a', 'players:Limbé', 'players:Hinche',
    ]);
  });

  it('holds an empty tournament without inventing anything', () => {
    expect(selectMapPlaces({ schools: [], players: [] })).toEqual({
      places: [],
      schoolsTotal: 0,
      schoolsWithoutLocation: 0,
      playersTotal: 0,
      playersWithoutLocation: 0,
    });
  });
});
