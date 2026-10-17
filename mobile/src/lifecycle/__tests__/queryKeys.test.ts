import { queryKeys, isStudentScopedKey, keyBelongsTo, STUDENT_SCOPED_ROOTS } from '../queryKeys';

describe('queryKeys', () => {
  it('puts the uid in every student key', () => {
    for (const make of Object.values(queryKeys)) {
      const key = make('A');
      expect(key[1]).toBe('A');
      expect(STUDENT_SCOPED_ROOTS.has(String(key[0]))).toBe(true);
    }
  });

  it('streak key differs between students (the original leak)', () => {
    expect(queryKeys.streak('A')).not.toEqual(queryKeys.streak('B'));
    expect(queryKeys.streak(undefined)).toEqual(['global-streak', null]);
  });

  it('every root is produced by a builder (no orphan roots)', () => {
    const roots = new Set(Object.values(queryKeys).map((m) => String(m('x')[0])));
    expect(roots).toEqual(new Set(STUDENT_SCOPED_ROOTS));
  });
});

describe('keyBelongsTo', () => {
  it('public keys belong to everyone, including guests', () => {
    expect(isStudentScopedKey(['leaderboard-weekly', '2026-W42', 25])).toBe(false);
    expect(keyBelongsTo(['leaderboard-weekly', '2026-W42', 25], null)).toBe(true);
    expect(keyBelongsTo(['coursesData'], 'A')).toBe(true);
  });

  it('student keys belong only to the uid they name', () => {
    expect(keyBelongsTo(queryKeys.streak('A'), 'A')).toBe(true);
    expect(keyBelongsTo(queryKeys.streak('A'), 'B')).toBe(false);
    expect(keyBelongsTo(queryKeys.streak('A'), null)).toBe(false);
    expect(keyBelongsTo(queryKeys.streak(null), null)).toBe(false);
  });

  it('a legacy uid-less key (pre-fix persisted cache) belongs to nobody', () => {
    expect(keyBelongsTo(['global-streak'], 'A')).toBe(false);
  });

  it('rejects malformed keys', () => {
    expect(keyBelongsTo(null, 'A')).toBe(false);
    expect(keyBelongsTo(undefined, 'A')).toBe(false);
  });
});
