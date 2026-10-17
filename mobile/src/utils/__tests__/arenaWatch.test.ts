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

import {
  FOLLOW_NONE, parseFollowPref, serializeFollowPref, resolveFollowKey, toggleFollowPref, type FollowPref,
} from '../arenaWatch';

describe('follow preference (M4)', () => {
  const own = 'own';
  // What survives an app relaunch: write, then read back.
  const relaunch = (p: FollowPref) => parseFollowPref(serializeFollowPref(p));

  it('defaults to the own school when nothing was chosen', () => {
    const p = parseFollowPref(null);
    expect(p).toEqual({ kind: 'default' });
    expect(resolveFollowKey(p, own)).toBe(own);
    expect(resolveFollowKey(p, null)).toBeNull();
  });

  it('choosing a school follows it, and it survives a relaunch', () => {
    const p = toggleFollowPref({ kind: 'default' }, own, 'b');
    expect(resolveFollowKey(p, own)).toBe('b');
    expect(resolveFollowKey(relaunch(p), own)).toBe('b');
  });

  it('switching from one chosen school to another', () => {
    const p = toggleFollowPref({ kind: 'school', key: 'b' }, own, 'c');
    expect(resolveFollowKey(p, own)).toBe('c');
  });

  it('clearing the DEFAULT school stays cleared — it does not fall back to it', () => {
    const p = toggleFollowPref({ kind: 'default' }, own, own);
    expect(p).toEqual({ kind: 'none' });
    expect(resolveFollowKey(p, own)).toBeNull();
    expect(serializeFollowPref(p)).toBe(FOLLOW_NONE);
    expect(resolveFollowKey(relaunch(p), own)).toBeNull();
  });

  it('clearing a chosen school stays cleared after a relaunch', () => {
    const p = toggleFollowPref({ kind: 'school', key: 'b' }, own, 'b');
    expect(resolveFollowKey(relaunch(p), own)).toBeNull();
  });

  it('following again after clearing', () => {
    const p = toggleFollowPref({ kind: 'none' }, own, own);
    expect(resolveFollowKey(p, own)).toBe(own);
    expect(resolveFollowKey(relaunch(p), own)).toBe(own);
  });

  it('the default is stored as no value at all', () => {
    expect(serializeFollowPref({ kind: 'default' })).toBeNull();
    expect(parseFollowPref('')).toEqual({ kind: 'default' });
  });
});
