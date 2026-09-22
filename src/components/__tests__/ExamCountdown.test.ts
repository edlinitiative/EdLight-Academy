/**
 * ExamCountdown — scoping and date arithmetic.
 *
 * Every case pins an explicit "today" rather than reading the clock: the whole
 * point of this logic is what happens at a boundary (the eve of an exam, the
 * day itself, the day after the last session of a year, and the day the list
 * runs out), and a test that uses `new Date()` silently stops testing those
 * the moment the calendar moves past them.
 *
 * EXAM_SESSIONS as committed — note each session spans several DAYS, and stays
 * current until the last of them:
 *   9e-2026   9e        2026-06-29 → 07-02   (confirmed)
 *   ns4-2026  terminale 2026-07-13 → 07-16   (confirmed)
 *   9e-2027   9e        2027-06-28 → 07-01   (estimated)
 *   ns4-2027  terminale 2027-07-12 → 07-15   (estimated)
 * The Bac is ONE session: students on the Nouveau Secondaire sit a single
 * end-of-NS4 exam, not the two-part Bac the first version of this file
 * modelled. There is no `university` session at all — POSTBAC is a real
 * "nothing to show" case, not a hypothetical one.
 */

import { resolveExamCountdown, formatSessionDate } from '../ExamCountdown';

/** Local midnight, matching how examSchedule.ts reads its ISO dates. */
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('resolveExamCountdown — who sees a countdown', () => {
  it('gives an NS4 learner the Bac, not the 9ᵉ exam sitting a fortnight earlier', () => {
    const info = resolveExamCountdown('NS4', on(2026, 6, 1));
    expect(info).not.toBeNull();
    expect(info.session.id).toBe('ns4-2026');
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

  it('stays on a session that has started but not finished', () => {
    // The 2026 9ᵉ exam runs 29 June – 2 July. On 30 June a student is sitting
    // it; filtering on the start date alone used to skip them to next year's.
    const info = resolveExamCountdown('9e', on(2026, 6, 30));
    expect(info.session.id).toBe('9e-2026');
    expect(info.days).toBe(0);
    expect(info.phase).toBe('today');
  });

  it('rolls to the next session once one is fully past, not to a negative count', () => {
    // 3 July 2026: the last day of the 9ᵉ window was yesterday.
    const info = resolveExamCountdown('9e', on(2026, 7, 3));
    expect(info.session.id).toBe('9e-2027');
    expect(info.days).toBeGreaterThan(0);
  });

  it('crosses the year boundary rather than counting backwards', () => {
    // 17 July 2026: the 2026 Bac window closed yesterday.
    const info = resolveExamCountdown('NS4', on(2026, 7, 17));
    expect(info.session.id).toBe('ns4-2027');
    expect(info.session.dateISO).toBe('2027-07-12');
    expect(info.phase).toBe('upcoming');
    expect(info.days).toBe(360);
  });

  it('reads "today" across every day of the Bac window, then moves on', () => {
    for (const day of [13, 14, 15, 16]) {
      const info = resolveExamCountdown('NS4', on(2026, 7, day));
      expect(info.session.id).toBe('ns4-2026');
      expect(info.phase).toBe('today');
    }
    expect(resolveExamCountdown('NS4', on(2026, 7, 12)).phase).toBe('tomorrow');
    expect(resolveExamCountdown('NS4', on(2026, 7, 17)).session.id).toBe('ns4-2027');
  });

  it('only hedges a date the MENFP has not published', () => {
    // The flag is what the card keys its "date indicative" caveat on, so the
    // caveat disappears by itself when real dates are entered.
    expect(resolveExamCountdown('NS4', on(2026, 6, 1)).session.confirmed).toBe(true);
    expect(resolveExamCountdown('NS4', on(2026, 7, 17)).session.confirmed).toBe(false);
  });

  it('never reports a negative number of days, whatever the date', () => {
    const dates = [
      on(2025, 1, 1), on(2026, 6, 29), on(2026, 6, 30), on(2026, 7, 2),
      on(2026, 7, 13), on(2026, 7, 16), on(2026, 7, 17), on(2027, 7, 15),
    ];
    for (const from of dates) {
      for (const grade of ['9e', 'NS4']) {
        const info = resolveExamCountdown(grade, from);
        if (info) expect(info.days).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('renders nothing once the list runs out instead of crashing', () => {
    // The committed list ends with the 2027 Bac window closing on 15 July.
    // The day after, there is simply nothing true left to say.
    expect(resolveExamCountdown('NS4', on(2027, 7, 16))).toBeNull();
    expect(resolveExamCountdown('9e', on(2027, 7, 2))).toBeNull();
    expect(resolveExamCountdown('NS4', on(2030, 1, 1))).toBeNull();
  });

  it('holds up across a leap day', () => {
    // 2028 is a leap year, but the boundary that matters is 29 Feb 2028 being
    // past the end of the list — no session, no count.
    expect(resolveExamCountdown('NS4', on(2028, 2, 29))).toBeNull();
    // And within range, a span containing 29 Feb 2028 is not applicable; the
    // 2027 spans are the ones the list covers.
    expect(resolveExamCountdown('NS4', on(2027, 1, 1)).days).toBe(192);
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
