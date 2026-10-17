import {
  decidePermissionAction, prePromptCopy, parseStudyReminder, formatHour, STUDY_REMINDER_HOURS,
  type NotificationAskReason,
} from '../notificationPermission';

describe('decidePermissionAction', () => {
  it('granted → nothing to ask', () => {
    expect(decidePermissionAction({ status: 'granted', canAskAgain: true }, { osPromptShown: false })).toBe('granted');
    expect(decidePermissionAction({ status: 'granted' }, { osPromptShown: true })).toBe('granted');
  });

  it('never asked → explanation first (pre-prompt), not the OS dialog', () => {
    expect(decidePermissionAction({ status: 'undetermined', canAskAgain: true }, { osPromptShown: false })).toBe('preprompt');
  });

  it('after a denial → settings path, never a re-prompt', () => {
    expect(decidePermissionAction({ status: 'denied', canAskAgain: false }, { osPromptShown: true })).toBe('settings');
    // iOS reports denied even when we did not show the dialog (refused in an older build).
    expect(decidePermissionAction({ status: 'denied', canAskAgain: false }, { osPromptShown: false })).toBe('settings');
    // Android 13 lets an app ask twice; our own flag still forbids the second dialog.
    expect(decidePermissionAction({ status: 'denied', canAskAgain: true }, { osPromptShown: true })).toBe('settings');
    expect(decidePermissionAction({ status: 'undetermined', canAskAgain: true }, { osPromptShown: true })).toBe('settings');
    expect(decidePermissionAction({ status: 'undetermined', canAskAgain: false }, { osPromptShown: false })).toBe('settings');
  });
});

describe('prePromptCopy', () => {
  const reasons: NotificationAskReason[] = ['study-reminder', 'arena-event', 'profile'];
  it('explains a reason-specific benefit in both languages, with no emoji', () => {
    for (const r of reasons) for (const ht of [false, true]) {
      const c = prePromptCopy(r, 'ask', ht);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(20);
      expect(`${c.title}${c.body}${c.confirm}${c.cancel}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(prePromptCopy('study-reminder', 'ask', false).body).not.toBe(prePromptCopy('arena-event', 'ask', false).body);
    expect(prePromptCopy('profile', 'ask', true).confirm).toBe('Aktive');
  });
  it('the settings mode offers "Ouvrir les réglages"', () => {
    expect(prePromptCopy('profile', 'settings', false).confirm).toBe('Ouvrir les réglages');
    expect(prePromptCopy('arena-event', 'settings', true).confirm).toBe('Louvri paramèt yo');
  });
});

describe('study reminder setting', () => {
  it('parses stored values', () => {
    expect(parseStudyReminder(null)).toBeUndefined();
    expect(parseStudyReminder('off')).toBeNull();
    expect(parseStudyReminder('19')).toBe(19);
    expect(parseStudyReminder('25')).toBeUndefined();
    expect(parseStudyReminder('7.5')).toBeUndefined();
    expect(parseStudyReminder('junk')).toBeUndefined();
  });
  it('formats hours per language', () => {
    expect(formatHour(19, false)).toBe('19h');
    expect(formatHour(6, true)).toBe('6è');
    expect(STUDY_REMINDER_HOURS.every((h) => h >= 0 && h <= 23)).toBe(true);
  });
});
