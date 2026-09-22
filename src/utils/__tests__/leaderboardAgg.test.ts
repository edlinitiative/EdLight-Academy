import { aggregateBy, membersOf, groupForUid, normalizeName, rankTeams, teamStandingFor } from '../../../shared/leaderboardAgg';

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
    expect(normalizeName('  Port-au-Prince ')).toBe('port au prince');
    expect(normalizeName('Lycée  Toussaint')).toBe('lycee toussaint');
    expect(normalizeName('Cap-Haïtien')).toBe('cap haitien');
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

// ── Team scoring: a school's best five ─────────────────────────────────────
describe('rankTeams — a school is scored on its best five', () => {
  const group = (label: string, xps: number[], members = xps.length) => ({
    key: normalizeName(label),   // real groups are keyed the way aggregateBy keys them
    label,
    totalXp: xps.reduce((a, b) => a + b, 0),
    members,
    avgXp: members ? Math.round(xps.reduce((a, b) => a + b, 0) / members) : 0,
    rank: 0,
    topMembers: xps.map((xp, i) => ({ uid: `${label}${i}`, displayName: `E${i}`, xp })),
  });

  it('does not let the biggest school win on turnout alone', () => {
    // Twelve students averaging 40 lose to five averaging 100. Ranking on the
    // total would hand it to the big school every week and teach every smaller
    // school there is no point turning up.
    const big = group('Grand Collège', Array(12).fill(40));       // total 480
    const small = group('Petit Lycée', [100, 100, 100, 100, 100]); // total 500
    const [first] = rankTeams([big, small]);
    expect(first.label).toBe('Petit Lycée');
    expect(first.teamXp).toBe(500);
  });

  it('does not let one strong student carry a school', () => {
    const star = group('Une Star', [900, 10, 10]);   // 3 members — short
    const team = group('Vraie Équipe', [80, 80, 80, 80, 80]);
    const ranked = rankTeams([star, team]);
    expect(ranked[0].label).toBe('Vraie Équipe');
    expect(ranked[0].rank).toBe(1);
    // The school with three players is not in the running at all.
    expect(ranked[1].qualified).toBe(false);
    expect(ranked[1].rank).toBe(0);
  });

  it('never punishes a school for bringing more students', () => {
    const five = group('École A', [50, 50, 50, 50, 50]);
    const fifty = group('École B', [50, 50, 50, 50, 50, ...Array(45).fill(1)]);
    const ranked = rankTeams([five, fifty]);
    expect(ranked.map((s) => s.teamXp)).toEqual([250, 250]);
    // Tied on the best five — the school that brought more people edges it.
    expect(ranked[0].label).toBe('École B');
  });

  it('says how many more players a school needs', () => {
    // The recruiting message: actionable tonight, unlike a points gap.
    const short = group('Presque', [30, 30, 30]);
    const [s] = rankTeams([short]);
    expect(s.needed).toBe(2);
    expect(s.qualified).toBe(false);
  });

  it('counts a short school on what it has, so progress is visible', () => {
    const [s] = rankTeams([group('Deux', [70, 30])]);
    expect(s.counted).toBe(2);
    expect(s.teamXp).toBe(100);
  });

  it('finds a school by its unnormalised name', () => {
    const standings = rankTeams([group('Lycée Toussaint', [10, 10, 10, 10, 10])]);
    expect(teamStandingFor(standings, 'LYCÉE  TOUSSAINT')?.rank).toBe(1);
    expect(teamStandingFor(standings, null)).toBeNull();
  });
});

describe('normalizeName — ligatures', () => {
  it('groups Cœur with Coeur', () => {
    // NFD does not decompose a ligature, so these two spellings of one school
    // were ranked as two schools.
    // Keys are only ever compared, both sides normalised, never shown — so
    // hyphens now fold too (see the punctuation test below).
    expect(normalizeName('Sacré-Cœur')).toBe(normalizeName('Sacre-Coeur'));
    expect(normalizeName('Sœurs Salésiennes')).toBe('soeurs salesiennes');
  });
});

describe('normalizeName — punctuation fold', () => {
  it('groups a hyphenated and an unhyphenated spelling of one school', () => {
    expect(normalizeName('Institution Saint-Louis de Gonzague'))
      .toBe(normalizeName('INSTITUTION SAINT LOUIS DE GONZAGUE'));
    expect(normalizeName("Collège l’Étoile")).toBe(normalizeName("College l'Etoile"));
  });
});
