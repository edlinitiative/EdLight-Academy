import { progressTotals, hasEvidence, railCourses, railMeta, arenaTile, goalPercent } from '../homeLayout';

const t = (fr: string) => fr;
const course = (id: string, level = 'NSI', extra: any = {}) => ({
  id, level, name: `Cours ${id}`,
  modules: [{ title: 'U1', lessons: [{ id: `${id}-1` }, { id: `${id}-2` }, { id: `${id}-3` }] }],
  ...extra,
});

describe('progressTotals', () => {
  it('sums each fact independently across courses', () => {
    const p = progressTotals([
      { summary: { total: 10, completed: 3, practised: 2, mastered: 1 } },
      { summary: { total: 5, completed: 1, practised: 0, mastered: 0 } },
    ]);
    expect(p).toEqual({ completed: 4, practised: 2, mastered: 1 });
    expect(hasEvidence(p)).toBe(true);
  });
  it('no rows → zeros and no evidence (the card hides the numerals)', () => {
    expect(hasEvidence(progressTotals([]))).toBe(false);
  });
});

describe('railCourses', () => {
  const courses = [
    course('a', 'NSI'), course('b', 'NSI'), course('c', 'NSII'), course('d', 'NSIII'),
    course('e', 'NSI', { comingSoon: true }),
  ];
  it('enrolled first, then worked-in, then the rest of the class; never coming-soon', () => {
    const rows = railCourses({
      courses, enrolledIds: ['c'], mastery: { 'd-1': { bestPct: 60 } }, grade: 'NS1',
    });
    expect(rows.map((r) => r.course.id)).toEqual(['c', 'd', 'a', 'b']);
  });
  it('without a class shows only enrolled / worked courses (no guessed level)', () => {
    const rows = railCourses({ courses, enrolledIds: [], mastery: {}, grade: null });
    expect(rows).toEqual([]);
  });
  it('caps the rail', () => {
    const many = Array.from({ length: 10 }, (_, i) => course(`m${i}`, 'NSI'));
    expect(railCourses({ courses: many, enrolledIds: [], mastery: {}, grade: 'NS1', limit: 4 })).toHaveLength(4);
  });
  it('tolerates a missing catalogue', () => {
    expect(railCourses({ courses: undefined, enrolledIds: ['x'], mastery: {}, grade: 'NS1' })).toEqual([]);
  });
});

describe('railMeta', () => {
  it('states real counts only', () => {
    expect(railMeta({ total: 24, completed: 4, practised: 0, mastered: 0 }, t)).toBe('4/24 leçons');
    expect(railMeta({ total: 24, completed: 0, practised: 0, mastered: 0 }, t)).toBe('24 leçons');
    expect(railMeta({ total: 1, completed: 0, practised: 0, mastered: 0 }, t)).toBe('1 leçon');
    expect(railMeta({ total: 0, completed: 0, practised: 0, mastered: 0 }, t)).toBeNull();
  });
});

describe('arenaTile', () => {
  const now = Date.UTC(2026, 9, 17);
  const base: any = { id: 'T1', title: 'Championnat', startsAt: now + 86_400_000, state: 'registration' };
  const fmt = () => '18 octobre';
  it('honest empty state: no invented date, opens the hub', () => {
    const r = arenaTile({ open: null, active: null, myRegistration: null, now, t, formatDate: fmt });
    expect(r.line).toBe('Aucun championnat prévu');
    expect(r.target).toEqual({ screen: 'ArenaHub' });
  });
  it('open for sign-up with a future date', () => {
    const r = arenaTile({ open: base, active: null, myRegistration: null, now, t, formatDate: fmt });
    expect(r.line).toBe('Championnat le 18 octobre');
    expect(r.target).toEqual({ screen: 'ArenaLobby', tournamentId: 'T1' });
  });
  it('never prints a start date already behind us', () => {
    const r = arenaTile({ open: { ...base, startsAt: now - 1 }, active: null, myRegistration: null, now, t, formatDate: fmt });
    expect(r.line).toBe('Inscriptions ouvertes');
  });
  it('doors open is live', () => {
    const r = arenaTile({ open: { ...base, state: 'doors' }, active: null, myRegistration: null, now, t, formatDate: fmt });
    expect(r.live).toBe(true);
  });
  it('registered student mid-event goes back to the live room; provisional to results', () => {
    const reg: any = { uid: 'u', tid: 'T1' };
    expect(arenaTile({ open: null, active: { ...base, state: 'live' }, myRegistration: reg, now, t, formatDate: fmt }).target)
      .toEqual({ screen: 'ArenaLive', tournamentId: 'T1' });
    expect(arenaTile({ open: null, active: { ...base, state: 'provisional' }, myRegistration: reg, now, t, formatDate: fmt }).target)
      .toEqual({ screen: 'ArenaResult', tournamentId: 'T1' });
  });
  it('an active event the student is not registered in is not a re-entry', () => {
    const r = arenaTile({ open: null, active: { ...base, state: 'live' }, myRegistration: null, now, t, formatDate: fmt });
    expect(r.target).toEqual({ screen: 'ArenaHub' });
  });
});

describe('goalPercent', () => {
  it('clamps and never divides by zero', () => {
    expect(goalPercent(3, 5)).toBe(60);
    expect(goalPercent(9, 5)).toBe(100);
    expect(goalPercent(1, 0)).toBe(0);
  });
});
