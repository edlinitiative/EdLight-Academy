import {
  decideEveningReminder,
  buildRetentionNotification,
  parseHHMM,
  WEEKDAYS,
  EveningReminderInput,
} from '../reminderRules';

const GRACE = 2 * 60 * 60 * 1000; // 2h, matching the scheduler's STUDY_GRACE_MS

// Wednesday 15 Jan 2025, built with numeric args so it stays in local time.
function makeInput(overrides: Partial<EveningReminderInput> = {}): EveningReminderInput {
  const now = new Date(2025, 0, 15, 19, 0); // Wed 19:00 (1h after target)
  const target = new Date(2025, 0, 15, 18, 0); // Wed 18:00
  return {
    now,
    target,
    graceMs: GRACE,
    reminderDays: ['wednesday'],
    weekday: WEEKDAYS[now.getDay()], // 'wednesday'
    streakDays: 0,
    streakActiveToday: true,
    engaged: true,
    dailyCompletedToday: true,
    ...overrides,
  };
}

describe('parseHHMM', () => {
  it('parses a valid HH:MM string', () => {
    expect(parseHHMM('07:30')).toEqual([7, 30]);
    expect(parseHHMM('18:00')).toEqual([18, 0]);
  });

  it('falls back to defaults for missing or malformed values', () => {
    expect(parseHHMM(undefined)).toEqual([18, 0]);
    expect(parseHHMM('')).toEqual([18, 0]);
    expect(parseHHMM('not-a-time', 9, 15)).toEqual([9, 15]);
  });
});

describe('decideEveningReminder', () => {
  it('returns none before the evening window', () => {
    const early = new Date(2025, 0, 15, 17, 59); // 1 min before target
    expect(decideEveningReminder(makeInput({ now: early }))).toBe('none');
  });

  it('fires a streak nudge when an active streak has not been extended today', () => {
    const kind = decideEveningReminder(
      makeInput({ streakDays: 5, streakActiveToday: false, reminderDays: [] }),
    );
    expect(kind).toBe('streak'); // even on a non-reminder day
  });

  it('does not fire a streak nudge when the streak is already safe today', () => {
    const kind = decideEveningReminder(
      makeInput({ streakDays: 5, streakActiveToday: true, dailyCompletedToday: true }),
    );
    expect(kind).toBe('study'); // falls through to the generic nudge
  });

  it('prioritises the streak nudge over the daily challenge', () => {
    const kind = decideEveningReminder(
      makeInput({ streakDays: 3, streakActiveToday: false, dailyCompletedToday: false }),
    );
    expect(kind).toBe('streak');
  });

  it('fires a daily-challenge nudge for engaged users who have not played today', () => {
    const kind = decideEveningReminder(
      makeInput({ engaged: true, dailyCompletedToday: false, reminderDays: [] }),
    );
    expect(kind).toBe('daily'); // any day, no reminder-day requirement
  });

  it('does not nudge disengaged users about the daily challenge', () => {
    const kind = decideEveningReminder(
      makeInput({ engaged: false, dailyCompletedToday: false, reminderDays: [] }),
    );
    expect(kind).toBe('none');
  });

  it('fires the generic study nudge on a reminder day within the grace window', () => {
    const kind = decideEveningReminder(makeInput()); // all activity done, Wed, 1h after
    expect(kind).toBe('study');
  });

  it('skips the generic study nudge outside the grace window', () => {
    const late = new Date(2025, 0, 15, 20, 30); // 2.5h after target > 2h grace
    expect(decideEveningReminder(makeInput({ now: late }))).toBe('none');
  });

  it('skips the generic study nudge on a non-reminder day', () => {
    expect(decideEveningReminder(makeInput({ reminderDays: ['monday'] }))).toBe('none');
  });
});

describe('buildRetentionNotification', () => {
  it('builds a bilingual streak nudge that includes the streak length', () => {
    const fr = buildRetentionNotification('streak', 'fr', 7);
    expect(fr.title).toContain('7');
    expect(fr.tag).toBe('streak-risk-nudge');
    expect(fr.url).toBe('/dashboard');

    const ht = buildRetentionNotification('streak', 'ht', 7);
    expect(ht.title).toContain('7');
    expect(ht.title).not.toBe(fr.title); // Creole copy differs from French
  });

  it('builds a daily-challenge nudge that deep-links to the games hub', () => {
    const note = buildRetentionNotification('daily', 'fr');
    expect(note.tag).toBe('daily-challenge-nudge');
    expect(note.url).toBe('/jeux'); // trivia hub was renamed Jeux
  });

  it('builds the generic study fallback', () => {
    const note = buildRetentionNotification('study', 'ht');
    expect(note.tag).toBe('daily-study-nudge');
    expect(note.url).toBe('/dashboard');
  });
});
