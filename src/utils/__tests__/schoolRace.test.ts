import { schoolRace, raceEnds, RACE_BOTTOM_MIN_SCHOOLS, type GroupRanking } from '../../../shared/leaderboardAgg';

const g = (key: string, members: number, xps: number[]): GroupRanking => ({
  key, label: key.toUpperCase(), members, totalXp: xps.reduce((a, b) => a + b, 0), avgXp: 0, rank: 0,
  topMembers: xps.map((xp, i) => ({ uid: `${key}${i}`, displayName: `${key}${i}`, xp })),
});

describe('schoolRace', () => {
  it('places every school, qualified ones first, without changing the official rank', () => {
    const race = schoolRace([g('a', 3, [900, 800, 700]), g('b', 5, [10, 10, 10, 10, 10]), g('c', 1, [5000])]);
    expect(race.map((s) => s.key)).toEqual(['b', 'c', 'a']);
    expect(race.map((s) => s.place)).toEqual([1, 2, 3]);
    expect(race.map((s) => s.rank)).toEqual([1, 0, 0]);
    expect(race.find((s) => s.key === 'a')!.needed).toBe(2);
  });

  it('shows a bottom list only when it cannot overlap the podium', () => {
    const few = schoolRace(Array.from({ length: RACE_BOTTOM_MIN_SCHOOLS - 1 }, (_, i) => g(`s${i}`, 1, [100 - i])));
    expect(raceEnds(few).bottom).toEqual([]);
    const many = schoolRace(Array.from({ length: 8 }, (_, i) => g(`s${i}`, 1, [100 - i])));
    const { top, bottom } = raceEnds(many);
    expect(top.map((s) => s.place)).toEqual([1, 2, 3]);
    expect(bottom.map((s) => s.place)).toEqual([6, 7, 8]);
  });
});
