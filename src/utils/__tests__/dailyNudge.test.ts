/**
 * Tests for api/_lib/dailyNudge.ts — the pure scheduling/eligibility logic
 * behind the 6am Haiti daily nudge cron.
 *
 * Everything here is pure: no Firestore, no network. The cron endpoint does the
 * I/O and delegates every decision to these helpers.
 */

import {
  haitiDateKey,
  haitiHour,
  isNudgeHour,
  previousDateKey,
  classifyNudge,
  nudgeCopy,
  alreadyNudgedToday,
} from '../../../api/_lib/dailyNudge';

describe('haitiHour / haitiDateKey', () => {
  it('converts a UTC instant to Haiti local time during summer (UTC-4)', () => {
    // 2026-08-18T10:00Z === 06:00 in Port-au-Prince (EDT, UTC-4)
    const d = new Date('2026-08-18T10:00:00Z');
    expect(haitiHour(d)).toBe(6);
    expect(haitiDateKey(d)).toBe('2026-08-18');
  });

  it('converts during winter (UTC-5), where 6am local is 11:00Z', () => {
    const d = new Date('2026-01-15T11:00:00Z');
    expect(haitiHour(d)).toBe(6);
    expect(haitiDateKey(d)).toBe('2026-01-15');
  });

  it('uses the Haiti calendar day, not the UTC one, late at night', () => {
    // 01:30Z on the 19th is still 21:30 on the 18th in Haiti.
    const d = new Date('2026-08-19T01:30:00Z');
    expect(haitiDateKey(d)).toBe('2026-08-18');
    expect(haitiHour(d)).toBe(21);
  });
});

describe('isNudgeHour', () => {
  it('is true only at 6am Haiti time', () => {
    expect(isNudgeHour(new Date('2026-08-18T10:00:00Z'))).toBe(true); // 06 local
    expect(isNudgeHour(new Date('2026-08-18T11:00:00Z'))).toBe(false); // 07 local
    expect(isNudgeHour(new Date('2026-08-18T09:00:00Z'))).toBe(false); // 05 local
  });

  it('still fires at 6am local after the DST shift', () => {
    expect(isNudgeHour(new Date('2026-01-15T11:00:00Z'))).toBe(true); // 06 local, UTC-5
    expect(isNudgeHour(new Date('2026-01-15T10:00:00Z'))).toBe(false); // 05 local
  });
});

describe('previousDateKey', () => {
  it('steps back one day', () => {
    expect(previousDateKey('2026-08-18')).toBe('2026-08-17');
  });
  it('handles month and year boundaries', () => {
    expect(previousDateKey('2026-08-01')).toBe('2026-07-31');
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });
  it('handles a leap day', () => {
    expect(previousDateKey('2028-03-01')).toBe('2028-02-29');
  });
});

describe('classifyNudge', () => {
  const today = '2026-08-18';

  it('flags a streak at risk when they played yesterday but not today', () => {
    expect(classifyNudge({ lastPlayedDate: '2026-08-17', today })).toBe('streak-at-risk');
  });

  it('sends nothing when they already played today', () => {
    expect(classifyNudge({ lastPlayedDate: today, today })).toBeNull();
  });

  it('falls back to the plain daily nudge when the last play is older', () => {
    expect(classifyNudge({ lastPlayedDate: '2026-08-10', today })).toBe('daily');
  });

  it('sends the daily nudge to someone who has never played', () => {
    expect(classifyNudge({ lastPlayedDate: null, today })).toBe('daily');
    expect(classifyNudge({ lastPlayedDate: undefined, today })).toBe('daily');
  });

  it('ignores a malformed lastPlayedDate rather than throwing', () => {
    expect(classifyNudge({ lastPlayedDate: 'not-a-date', today })).toBe('daily');
  });

  it('never treats a future date as at-risk', () => {
    expect(classifyNudge({ lastPlayedDate: '2026-08-20', today })).toBeNull();
  });
});

describe('nudgeCopy', () => {
  it('returns French copy by default and Creole when asked', () => {
    const fr = nudgeCopy('daily', 'fr');
    const ht = nudgeCopy('daily', 'ht');
    expect(fr.title).toMatch(/\S/);
    expect(ht.title).toMatch(/\S/);
    expect(ht.title).not.toBe(fr.title);
    expect(ht.message).not.toBe(fr.message);
  });

  it('uses distinct copy for a streak at risk', () => {
    expect(nudgeCopy('streak-at-risk', 'fr').title).not.toBe(nudgeCopy('daily', 'fr').title);
    expect(nudgeCopy('streak-at-risk', 'ht').title).not.toBe(nudgeCopy('daily', 'ht').title);
  });

  it('never promises a streak number, since the server does not know it', () => {
    for (const lang of ['fr', 'ht'] as const) {
      const c = nudgeCopy('streak-at-risk', lang);
      expect(`${c.title} ${c.message}`).not.toMatch(/\d/);
    }
  });

  it('personalises with a first name when one is available', () => {
    expect(nudgeCopy('daily', 'fr', 'Sandra').message).toContain('Sandra');
    // A blank or placeholder name must not leak into the copy.
    expect(nudgeCopy('daily', 'fr', '').message).not.toMatch(/\s,|,\s*$/);
  });
});

describe('alreadyNudgedToday', () => {
  const today = '2026-08-18';

  it('is false when there is no stamp', () => {
    expect(alreadyNudgedToday(undefined, today)).toBe(false);
    expect(alreadyNudgedToday(null, today)).toBe(false);
  });

  it('is true for a stamp from the same Haiti day', () => {
    // 10:00Z on the 18th is 06:00 local the same day.
    expect(alreadyNudgedToday('2026-08-18T10:00:00Z', today)).toBe(true);
  });

  it('is false for yesterday’s stamp', () => {
    expect(alreadyNudgedToday('2026-08-17T10:00:00Z', today)).toBe(false);
  });

  it('treats a garbage stamp as not-yet-sent rather than blocking forever', () => {
    expect(alreadyNudgedToday('garbage', today)).toBe(false);
  });
});
