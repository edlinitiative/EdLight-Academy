import { splitPodium } from '../podium';
import { rankTeams, type GroupRanking } from '../../../../../shared/leaderboardAgg';

const group = (key: string, members: number, xpEach: number): GroupRanking => ({
  key, label: key.toUpperCase(), members,
  topMembers: Array.from({ length: Math.min(members, 5) }, (_, i) => ({ uid: `${key}${i}`, displayName: `${key}${i}`, xp: xpEach })),
} as unknown as GroupRanking);

describe('splitPodium — placements are earned (audit W4)', () => {
  it('never lifts an unqualified school onto the podium when fewer than three qualified', () => {
    // The prod shape the audit saw: leaders with 3/5 and 1/5, one qualified school.
    const standings = rankTeams([group('a', 3, 900), group('b', 1, 2000), group('q', 5, 100), group('c', 2, 50)]);
    const s = splitPodium(standings);
    expect(s.podium).toEqual([]);
    expect(s.ranked.map((x) => x.key)).toEqual(['q']);
    expect(s.ranked[0].rank).toBe(1);
    expect(s.rest.map((x) => x.key)).toEqual(['q']);
    // Forming: every short school, closest to five first, none numbered.
    expect(s.forming.map((x) => x.key)).toEqual(['a', 'c', 'b']);
    expect(s.forming.every((x) => !x.qualified && x.rank === 0)).toBe(true);
  });

  it('with no qualified school there is no ranking at all, only the formation list', () => {
    const s = splitPodium(rankTeams([group('a', 3, 900), group('b', 4, 10)]));
    expect(s.ranked).toEqual([]);
    expect(s.podium).toEqual([]);
    expect(s.forming.map((x) => x.key)).toEqual(['b', 'a']);
  });

  it('three or more qualified: the podium is the top three by official rank, the rest follow', () => {
    const s = splitPodium(rankTeams([
      group('a', 5, 100), group('b', 6, 300), group('c', 5, 200), group('d', 7, 50), group('e', 2, 9999),
    ]));
    expect(s.podium.map((x) => x.key)).toEqual(['b', 'c', 'a']);
    expect(s.podium.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(s.rest.map((x) => x.key)).toEqual(['d']);
    // A short school with the most XP is still not placed.
    expect(s.forming.map((x) => x.key)).toEqual(['e']);
    expect([...s.podium, ...s.rest].some((x) => x.key === 'e')).toBe(false);
  });

  it('caps both lists', () => {
    const many = Array.from({ length: 12 }, (_, i) => group(`s${i}`, 5, 100 + i));
    const short = Array.from({ length: 9 }, (_, i) => group(`f${i}`, 1 + (i % 4), 10));
    const s = splitPodium(rankTeams([...many, ...short]), { maxRanked: 8, maxForming: 6 });
    expect(s.ranked).toHaveLength(8);
    expect(s.forming).toHaveLength(6);
  });
});
