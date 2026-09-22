/**
 * ExamCountdown — scoping and date arithmetic.
 *
 * Every case pins an explicit "today" rather than reading the clock: the whole
 * point of this logic is what happens at a boundary (the eve of an exam, the
 * day itself, the day after the last session of a year, and the day the list
 * runs out), and a test that uses `new Date()` silently stops testing those
 * the moment the calendar moves past them.
 *
 * EXAM_SESSIONS as committed:
 *   9e-2026   9e        2026-06-29      9e-2027   9e        2027-06-28
 *   bac1-2026 terminale 2026-07-06      bac1-2027 terminale 2027-07-05
 *   bac2-2026 terminale 2026-07-20      bac2-2027 terminale 2027-07-19
 * There is no `university` session at all — POSTBAC is a real "nothing to
 * show" case, not a hypothetical one.
 */

import { resolveExamCountdown, formatSessionDate } from '../ExamCountdown';

/** Local midnight, matching how examSchedule.ts reads its ISO dates. */
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('resolveExamCountdown — who sees a countdown', () => {
  it('gives an NS4 learner the Bac, not the 9ᵉ exam sitting a week earlier', () => {
    const info = resolveExamCountdown('NS4', on(2026, 6, 1));
    expect(info).not.toBeNull();
    expect(info.session.id).toBe('bac1-2026');
    expect(info.level).toBe('terminale');
  });

  it('gives a 9ᵉ learner the 9ᵉ A.F. exam', () => {
    const info = resolveExamCountdown('9e', on(2026, 6, 1));
    expect(info.session.id).toBe('9e-2026');
    expect(info.level).toBe('9e');
  });

  it('shows nothing to grades with no exam level', () => {
    for (const grade of ['7e', '8e', 'NS1', 'NS2', 'NS3']) {
      expect(resolveExamCountdown(grade, on(2026, 6, 1))).toBeNull();
    }
  });

  it('shows nothing when no grade is known — including the empty string', () => {
    expect(resolveExamCountdown(null, on(2026, 6, 1))).toBeNull();
    expect(resolveExamCountdown(undefined, on(2026, 6, 1))).toBeNull();
    expect(resolveExamCountdown('', on(2026, 6, 1))).toBeNull();
  });

  it('does not fall back to another level\'s exam for POSTBAC', () => {
    // gradeProfile maps POSTBAC to `universite`, which has no session. The
    // helper in examSchedule.ts would hand back the soonest session of ANY
    // level; showing a POSTBAC learner the 9ᵉ exam is exactly the guess this
    // card must not make.
    expect(resolveExamCountdown('POSTBAC', on(2026, 6, 1))).toBeNull();
  });

  it('treats an unrecognised grade as no grade rather than as the Bac', () => {
    // gradeProfile() defaults unknown grades to `baccalaureat`; that default
    // is right for a study plan and wrong for a countdown.
    expect(resolveExamCountdown('NS9', on(2026, 6, 1))).toBeNull();
    expect(resolveExamCountdown('rhetorique', on(2026, 6, 1))).toBeNull();
  });
});

describe('resolveExamCountdown — the day arithmetic', () => {
  it('counts whole days to the session', () => {
    const info = resolveExamCountdown('9e', on(2026, 6, 1));
    expect(info.days).toBe(28); // 1 June → 29 June
    expect(info.phase).toBe('upcoming');
  });

  it('says "today", not J-0, on the day of the exam', () => {
    const info = resolveExamCountdown('9e', on(2026, 6, 29));
    expect(info.days).toBe(0);
    expect(info.phase).toBe('today');
    expect(info.session.id).toBe('9e-2026');
  });

  it('says "tomorrow" on the eve', () => {
    const info = resolveExamCountdown('9e', on(2026, 6, 28));
    expect(info.days).toBe(1);
    expect(info.phase).toBe('tomorrow');
  });

  it('is unaffected by the time of day — an exam today stays today at 23:59', () => {
    const lateOnExamDay = new Date(2026, 5, 29, 23, 59, 59);
    const info = resolveExamCountdown('9e', lateOnExamDay);
    expect(info.days).toBe(0);
    expect(info.phase).toBe('today');
  });

  it('rolls to the next session once one is past, not to a negative count', () => {
    // 30 June 2026: the 9ᵉ exam was yesterday.
    const info = resolveExamCountdown('9e', on(2026, 6, 30));
    expect(info.session.id).toBe('9e-2027');
    expect(info.days).toBeGreaterThan(0);
  });

  it('crosses the year boundary rather than counting backwards', () => {
    // 21 July 2026: both 2026 Bac sessions are behind us.
    const info = resolveExamCountdown('NS4', on(2026, 7, 21));
    expect(info.session.id).toBe('bac1-2027');
    expect(info.session.dateISO).toBe('2027-07-05');
    expect(info.days).toBe(349);
    expect(info.phase).toBe('upcoming');
  });

  it('advances through the two Bac sessions in order', () => {
    expect(resolveExamCountdown('NS4', on(2026, 7, 6)).phase).toBe('today');
    expect(resolveExamCountdown('NS4', on(2026, 7, 7)).session.id).toBe('bac2-2026');
    expect(resolveExamCountdown('NS4', on(2026, 7, 20)).phase).toBe('today');
  });

  it('never reports a negative number of days, whatever the date', () => {
    const dates = [
      on(2025, 1, 1), on(2026, 6, 29), on(2026, 6, 30),
      on(2026, 7, 20), on(2026, 7, 21), on(2027, 7, 19),
    ];
    for (const from of dates) {
      for (const grade of ['9e', 'NS4']) {
        const info = resolveExamCountdown(grade, from);
        if (info) expect(info.days).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('renders nothing once the list runs out instead of crashing', () => {
    // The committed list ends at 20 July 2027. The day after the last session
    // there is simply nothing true left to say.
    expect(resolveExamCountdown('NS4', on(2027, 7, 20))).toBeNull();
    expect(resolveExamCountdown('9e', on(2027, 6, 29))).toBeNull();
    expect(resolveExamCountdown('NS4', on(2030, 1, 1))).toBeNull();
  });

  it('holds up across a leap day', () => {
    // 2028 is a leap year, but the boundary that matters is 29 Feb 2028 being
    // past the end of the list — no session, no count.
    expect(resolveExamCountdown('NS4', on(2028, 2, 29))).toBeNull();
    // And within range, a span containing 29 Feb 2028 is not applicable; the
    // 2027 spans are the ones the list covers.
    expect(resolveExamCountdown('NS4', on(2027, 1, 1)).days).toBe(185);
  });
});

describe('formatSessionDate', () => {
  it('writes the date in French and in Kreyòl', () => {
    expect(formatSessionDate('2026-06-29', false)).toBe('29 juin 2026');
    expect(formatSessionDate('2026-06-29', true)).toBe('29 jen 2026');
    expect(formatSessionDate('2026-07-06', false)).toBe('6 juillet 2026');
    expect(formatSessionDate('2026-07-06', true)).toBe('6 jiyè 2026');
  });

  it('returns null rather than "NaN undefined NaN" on bad input', () => {
    expect(formatSessionDate('', false)).toBeNull();
    expect(formatSessionDate('not-a-date', false)).toBeNull();
    expect(formatSessionDate('2026-13-01', false)).toBeNull();
    expect(formatSessionDate(null as unknown as string, false)).toBeNull();
  });

  it('covers every month in both languages', () => {
    for (let m = 1; m <= 12; m += 1) {
      const iso = `2026-${String(m).padStart(2, '0')}-15`;
      expect(formatSessionDate(iso, false)).toMatch(/^15 \S+ 2026$/);
      expect(formatSessionDate(iso, true)).toMatch(/^15 \S+ 2026$/);
    }
  });
});
