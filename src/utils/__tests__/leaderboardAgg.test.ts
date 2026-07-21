import { aggregateBy, membersOf, groupForUid, normalizeName } from '../../../shared/leaderboardAgg';

const ENTRIES = [
  { uid: 'a', displayName: 'Ana', xp: 500, school: 'Lycée Toussaint', city: 'Port-au-Prince' },
  { uid: 'b', displayName: 'Bo', xp: 300, school: 'lycee toussaint', city: 'port-au-prince' }, // same school/city, diff casing+accents
  { uid: 'c', displayName: 'Cy', xp: 900, school: 'Collège Saint-Louis', city: 'Cap-Haïtien' },
  { uid: 'd', displayName: 'Di', xp: 100, school: 'Lycée Toussaint', city: 'Port-au-Prince' },
  { uid: 'e', displayName: '', xp: 9999, school: 'Lycée Toussaint', city: 'Port-au-Prince' }, // no alias → skipped
  { uid: 'f', displayName: 'Fé', xp: 200, school: '', city: 'Jacmel' }, // blank school → skipped in school agg
];

describe('normalizeName', () => {
  it('folds accents, case, and whitespace', () => {
    expect(normalizeName('  Port-au-Prince ')).toBe('port-au-prince');
    expect(normalizeName('Lycée  Toussaint')).toBe('lycee toussaint');
    expect(normalizeName('Cap-Haïtien')).toBe('cap-haitien');
  });
  it('handles undefined/blank', () => {
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('   ')).toBe('');
  });
});

describe('aggregateBy(school)', () => {
  const schools = aggregateBy(ENTRIES, 'school');

  it('groups accent/case variants together and ranks by total XP', () => {
    expect(schools.map((s) => s.label)).toEqual(['Lycée Toussaint', 'Collège Saint-Louis']);
    expect(schools[0].totalXp).toBe(900); // 500 + 300 + 100 (alias-less 9999 excluded)
    expect(schools[1].totalXp).toBe(900); // Cy
  });

  it('breaks a total-XP tie by member count', () => {
    // Both 900 XP, but Toussaint has 3 members vs 1 → ranks first.
    expect(schools[0].label).toBe('Lycée Toussaint');
    expect(schools[0].members).toBe(3);
    expect(schools[1].members).toBe(1);
  });

  it('computes member count and average, excluding hidden entries', () => {
    expect(schools[0].members).toBe(3);
    expect(schools[0].avgXp).toBe(300); // 900 / 3
    expect(schools[0].rank).toBe(1);
  });

  it('uses the most common original spelling as the label', () => {
    // "Lycée Toussaint" appears twice (Ana, Di) vs "lycee toussaint" once (Bo).
    expect(schools[0].label).toBe('Lycée Toussaint');
  });

  it('caps topMembers and sorts them XP desc', () => {
    expect(schools[0].topMembers.map((m) => m.displayName)).toEqual(['Ana', 'Bo', 'Di']);
  });
});

describe('aggregateBy(city)', () => {
  it('ranks cities and skips blank-city entries only where blank', () => {
    const cities = aggregateBy(ENTRIES, 'city');
    const labels = cities.map((c) => c.label);
    expect(labels).toContain('Port-au-Prince');
    expect(labels).toContain('Cap-Haïtien');
    expect(labels).toContain('Jacmel'); // Fé has a city even though no school
    const pap = cities.find((c) => c.label === 'Port-au-Prince')!;
    expect(pap.totalXp).toBe(900);
    expect(pap.members).toBe(3);
  });
});

describe('membersOf', () => {
  it('returns a group\'s members ranked XP desc (accent-insensitive key)', () => {
    const m = membersOf(ENTRIES, 'school', 'lycée toussaint');
    expect(m.map((x) => x.displayName)).toEqual(['Ana', 'Bo', 'Di']);
    expect(m[0].xp).toBe(500);
  });
});

describe('groupForUid', () => {
  it('finds the ranked group a user belongs to', () => {
    const schools = aggregateBy(ENTRIES, 'school');
    const g = groupForUid(schools, ENTRIES, 'school', 'b');
    expect(g?.label).toBe('Lycée Toussaint');
    expect(g?.rank).toBe(1);
  });
  it('returns null when the user has no group', () => {
    const schools = aggregateBy(ENTRIES, 'school');
    expect(groupForUid(schools, ENTRIES, 'school', 'f')).toBeNull(); // Fé has no school
  });
});
