import { storageKey } from '../MoKacheGame';

// P0 validation: the daily grid was keyed by date only, so one student's
// finished word locked the next account on a shared phone out of the daily.
describe('Mo Kaché daily storage key', () => {
  it('is per account and per day', () => {
    expect(storageKey('2026-10-19', 'A')).not.toBe(storageKey('2026-10-19', 'B'));
    expect(storageKey('2026-10-19', 'A')).not.toBe(storageKey('2026-10-20', 'A'));
  });
  it('keeps the guest key unchanged', () => {
    expect(storageKey('2026-10-19', null)).toBe('edlight_mokache_2026-10-19');
  });
});
