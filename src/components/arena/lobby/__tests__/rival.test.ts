import fs from 'fs';
import path from 'path';
import { pickRival, schoolLadder, DUEL_WIN_XP, DUEL_TIE_XP, DUEL_TTL_DAYS, type WeeklyEntry } from '../rival';

const e = (id: string, xp: number, school: string | null = null): Omit<WeeklyEntry, 'rank'> => ({ id, xp, school, displayName: id });
const board = (...rows: Omit<WeeklyEntry, 'rank'>[]): WeeklyEntry[] => rows.map((r, i) => ({ ...r, rank: i + 1 }));

describe('pickRival', () => {
  const B = board(
    e('ana', 900, 'Lycée Pétion'),
    e('bob', 800, 'Collège Saint-Pierre'),
    e('cara', 700, 'Lycée Pétion'),
    e('dan', 650, 'Collège Saint-Pierre'),
    e('me', 600, 'Lycée Pétion'),
    e('eve', 500, 'Lycée Pétion'),
  );

  it('picks the closest student AHEAD from my own school, with the real gap', () => {
    const r = pickRival({ entries: B, uid: 'me', myXp: 600, myRank: 5, school: 'Lycée Pétion', pageSize: 50 });
    expect(r).toEqual({ status: 'rival', entry: B[2], scope: 'school', gap: 100 });
  });

  it('matches the school whatever the case/accents spacing', () => {
    const r = pickRival({ entries: B, uid: 'me', myXp: 600, myRank: 5, school: '  lycée pétion ', pageSize: 50 });
    expect(r.status === 'rival' && r.entry.id).toBe('cara');
  });

  it('falls back to the closest student nationally when nobody from my school is ahead', () => {
    const r = pickRival({ entries: B, uid: 'dan', myXp: 650, myRank: 4, school: 'Collège Saint-Pierre', pageSize: 50 });
    // bob (Saint-Pierre) is ahead → school rival, not cara who is closer nationally
    expect(r.status === 'rival' && [r.entry.id, r.scope]).toEqual(['bob', 'school']);
    const solo = pickRival({ entries: B, uid: 'dan', myXp: 650, myRank: 4, school: 'Institution X', pageSize: 50 });
    expect(solo).toEqual({ status: 'rival', entry: B[2], scope: 'national', gap: 50 });
    const noSchool = pickRival({ entries: B, uid: 'eve', myXp: 500, myRank: 6, school: null, pageSize: 50 });
    expect(noSchool.status === 'rival' && [noSchool.entry.id, noSchool.scope, noSchool.gap]).toEqual(['me', 'national', 100]);
  });

  it('never picks someone below me, nor me', () => {
    const r = pickRival({ entries: B, uid: 'ana', myXp: 900, myRank: 1, school: 'Lycée Pétion', pageSize: 50 });
    expect(r).toEqual({ status: 'leader' });
  });

  it('a tie ahead of me is a rival with a zero gap', () => {
    const T = board(e('x', 300, 'A'), e('me', 300, 'A'));
    expect(pickRival({ entries: T, uid: 'me', myXp: 300, myRank: 2, school: 'A', pageSize: 50 }))
      .toEqual({ status: 'rival', entry: T[0], scope: 'school', gap: 0 });
  });

  it('invents nobody when I am below a FULL page (who is just ahead is unknown)', () => {
    const full = board(...Array.from({ length: 50 }, (_, i) => e(`p${i}`, 1000 - i, 'Lycée Pétion')));
    expect(pickRival({ entries: full, uid: 'me', myXp: 10, myRank: 80, school: 'Lycée Pétion', pageSize: 50 })).toEqual({ status: 'unknown' });
    // …and no weekly entry at all on a full page: still unknown
    expect(pickRival({ entries: full, uid: 'me', myXp: 0, myRank: null, school: 'Lycée Pétion', pageSize: 50 })).toEqual({ status: 'unknown' });
  });

  it('right below a full page, the last row is just ahead', () => {
    const full = board(...Array.from({ length: 50 }, (_, i) => e(`p${i}`, 1000 - i, i === 10 ? 'Mine' : 'Other')));
    const r = pickRival({ entries: full, uid: 'me', myXp: 900, myRank: 51, school: 'Mine', pageSize: 50 });
    expect(r.status === 'rival' && [r.entry.id, r.scope, r.gap]).toEqual(['p10', 'school', 90]);
  });

  it('with the whole board in hand and no entry of mine, the lowest schoolmate is just ahead', () => {
    const r = pickRival({ entries: B, uid: 'new', myXp: 0, myRank: null, school: 'Collège Saint-Pierre', pageSize: 50 });
    expect(r.status === 'rival' && [r.entry.id, r.gap]).toEqual(['dan', 650]);
  });

  it('an empty board or a guest has no rival', () => {
    expect(pickRival({ entries: [], uid: 'me', myXp: 0, myRank: null, school: 'A', pageSize: 50 })).toEqual({ status: 'unknown' });
    expect(pickRival({ entries: B, uid: null, myXp: 0, myRank: null, school: null, pageSize: 50 })).toEqual({ status: 'unknown' });
  });
});

describe('schoolLadder', () => {
  it('keeps board order and only my school', () => {
    const B = board(e('a', 9, 'X'), e('b', 8, 'Y'), e('c', 7, 'x'));
    expect(schoolLadder(B, 'X').map((r) => r.id)).toEqual(['a', 'c']);
    expect(schoolLadder(B, null)).toEqual([]);
  });
});

describe('duel stakes shown in the lobby', () => {
  const root = path.resolve(__dirname, '../../../../..');
  it('match what the server pays (api/challenges)', () => {
    const accept = fs.readFileSync(path.join(root, 'api/challenges/accept.ts'), 'utf8');
    const create = fs.readFileSync(path.join(root, 'api/challenges/create.ts'), 'utf8');
    expect(Number(/const WIN_XP = (\d+)/.exec(accept)?.[1])).toBe(DUEL_WIN_XP);
    expect(Number(/const TIE_XP = (\d+)/.exec(accept)?.[1])).toBe(DUEL_TIE_XP);
    expect(/const TTL_MS = (\d+) \* 24 \* 60 \* 60 \* 1000/.exec(create)?.[1]).toBe(String(DUEL_TTL_DAYS));
  });
});
