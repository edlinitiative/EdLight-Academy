/**
 * Tests for buildPlanIcs — study-plan → iCalendar (.ics) export.
 *
 * Real task shape (see studyPlanService.buildTasksFromExams): the scheduling
 * date is `nextReviewMs` (ms epoch, midnight local). Tasks without it are
 * skipped.
 */

import { buildPlanIcs } from '../planIcs';

/** ms epoch for a local calendar date (matches how nextReviewMs is produced). */
function localDayMs(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getTime();
}

const basePlan = {
  title: 'Plan Bac SMP',
  dailyTargetMinutes: 90,
  tasks: [
    {
      type: 'exam',
      examId: 'bac-chimie-2019-smp',
      subject: 'Chimie',
      examTitle: 'Bac Chimie 2019',
      nextReviewMs: localDayMs(2026, 7, 15),
    },
    {
      type: 'exam',
      examId: 'bac-physique-2020-smp',
      subject: 'Physique',
      examTitle: 'Bac Physique 2020',
      nextReviewMs: localDayMs(2026, 7, 16),
    },
    {
      // Undated task — must be skipped
      type: 'exam',
      examId: 'bac-maths-2018-smp',
      subject: 'Mathématiques',
      examTitle: 'Bac Maths 2018',
      nextReviewMs: null,
    },
  ],
};

function lines(ics: string): string[] {
  return ics.split('\r\n');
}

describe('buildPlanIcs', () => {
  test('produces a valid VCALENDAR envelope', () => {
    const ics = buildPlanIcs(basePlan);
    const ls = lines(ics);
    expect(ls[0]).toBe('BEGIN:VCALENDAR');
    expect(ls).toContain('VERSION:2.0');
    expect(ls.some((l) => l.startsWith('PRODID:'))).toBe(true);
    // Ends with END:VCALENDAR followed by a trailing CRLF
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  test('uses CRLF line endings exclusively', () => {
    const ics = buildPlanIcs(basePlan);
    expect(ics).toContain('\r\n');
    // No bare LF (every \n must be preceded by \r)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\r');
  });

  test('emits one all-day VEVENT per dated task and skips undated tasks', () => {
    const ics = buildPlanIcs(basePlan);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
    expect(ics).not.toContain('bac-maths-2018-smp');
  });

  test('formats DTSTART as all-day VALUE=DATE with YYYYMMDD', () => {
    const ics = buildPlanIcs(basePlan);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260715');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260716');
    // All-day events: DTEND is the (exclusive) next day
    expect(ics).toContain('DTEND;VALUE=DATE:20260716');
    expect(ics).toContain('DTEND;VALUE=DATE:20260717');
  });

  test('SUMMARY follows "EdLight · {subject}: {examTitle}"', () => {
    const ics = buildPlanIcs(basePlan);
    expect(ics).toContain('SUMMARY:EdLight · Chimie: Bac Chimie 2019');
  });

  test('DESCRIPTION points at /study-plan', () => {
    const ics = buildPlanIcs(basePlan);
    const descLine = lines(ics).find((l) => l.startsWith('DESCRIPTION:'));
    expect(descLine).toBeDefined();
    expect(ics).toContain('/study-plan');
  });

  test('UIDs are stable across builds and derived from the task id', () => {
    const first = buildPlanIcs(basePlan);
    const second = buildPlanIcs(basePlan);
    const uids = (ics: string) => lines(ics).filter((l) => l.startsWith('UID:'));
    expect(uids(first)).toEqual(uids(second));
    expect(uids(first)).toHaveLength(2);
    expect(uids(first)[0]).toContain('bac-chimie-2019-smp');
    // UIDs are unique within the calendar
    expect(new Set(uids(first)).size).toBe(2);
  });

  test('escapes commas, semicolons, and newlines in text values (RFC 5545)', () => {
    const ics = buildPlanIcs({
      title: 'Plan; A, B',
      tasks: [
        {
          examId: 'x1',
          subject: 'Chimie',
          examTitle: 'Acides, bases; sels\net oxydes',
          nextReviewMs: localDayMs(2026, 7, 20),
        },
      ],
    });
    expect(ics).toContain('SUMMARY:EdLight · Chimie: Acides\\, bases\\; sels\\net oxydes');
  });

  test('folds lines longer than 75 octets with CRLF + space', () => {
    const ics = buildPlanIcs({
      title: 'Plan',
      tasks: [
        {
          examId: 'long-1',
          subject: 'Physique',
          examTitle:
            'Un intitulé extrêmement long pour vérifier le repliement des lignes conformément à la RFC 5545 section 3.1',
          nextReviewMs: localDayMs(2026, 7, 21),
        },
      ],
    });
    expect(ics).toContain('\r\n '); // continuation line
    for (const line of lines(ics)) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  test('falls back to taskId and unit/video titles for non-exam tasks', () => {
    const ics = buildPlanIcs({
      title: 'Plan',
      tasks: [
        {
          type: 'practice',
          taskId: 'practice-CHEM-NSI-U3',
          subject: 'Chimie',
          unitTitle: 'Les solutions',
          nextReviewMs: localDayMs(2026, 7, 22),
        },
      ],
    });
    expect(ics).toContain('SUMMARY:EdLight · Chimie: Les solutions');
    expect(lines(ics).find((l) => l.startsWith('UID:'))).toContain('practice-CHEM-NSI-U3');
  });

  test('returns a valid empty calendar when no task is dated', () => {
    const ics = buildPlanIcs({ title: 'Plan', tasks: [{ examId: 'a', subject: 'X', examTitle: 'T' }] });
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
