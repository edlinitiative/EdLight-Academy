import { boardRows, recordPlayAlong, tallyPlayAlong, type BoardSchool } from '../arenaWatch';

const s = (key: string, rank: number, qualified = true): BoardSchool => ({
  key, label: key.toUpperCase(), shortName: key, teamAvg: 1000 - rank, rank, qualified,
});

describe('boardRows', () => {
  const schools = [s('c', 3), s('a', 1), s('b', 2), s('z', 0, false), s('d', 4)];

  it('ranks qualified schools only, by rank', () => {
    expect(boardRows(schools, null, 3).map((r) => r.school.key)).toEqual(['a', 'b', 'c']);
  });

  it('marks the followed school in place', () => {
    const rows = boardRows(schools, 'b', 3);
    expect(rows.find((r) => r.school.key === 'b')).toMatchObject({ followed: true, pinned: false });
  });

  it('pins a followed school outside the top rows, ranked or not', () => {
    expect(boardRows(schools, 'd', 2).map((r) => [r.school.key, r.pinned])).toEqual([['a', false], ['b', false], ['d', true]]);
    expect(boardRows(schools, 'z', 2).at(-1)).toMatchObject({ followed: true, pinned: true });
  });

  it('ignores a followed key that is not on the board', () => {
    expect(boardRows(schools, 'nope', 2)).toHaveLength(2);
  });
});

describe('answer along (local only)', () => {
  it('records one choice per open question', () => {
    let a = recordPlayAlong({}, 0, 2, true);
    a = recordPlayAlong(a, 0, 3, true); // second tap ignored
    a = recordPlayAlong(a, 1, 1, false); // closed: ignored
    expect(a).toEqual({ 0: 2 });
  });

  it('tallies only revealed questions', () => {
    const answers = { 0: 2, 1: 1, 2: 0 };
    expect(tallyPlayAlong(answers, { 0: 2, 1: 3 })).toEqual({ answered: 2, correct: 1 });
    expect(tallyPlayAlong(answers, {})).toEqual({ answered: 0, correct: 0 });
  });
});
