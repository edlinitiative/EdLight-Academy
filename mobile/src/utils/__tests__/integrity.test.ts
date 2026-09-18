import { localFlags } from '../integrity';

// Every signal here is EVIDENCE, never enforcement — nothing in this module
// blocks a student or changes a score. A notification, an incoming call and a
// low-battery alert all look exactly like tabbing out to an AI, so the job is
// to tell a reviewer where to look, not to reach a verdict live on a stream.
describe('local integrity flags', () => {
  it('does not flag one glance at a notification', () => {
    // Flagging a single focus loss would flag most honest players, and a signal
    // that fires for everyone tells a reviewer nothing.
    expect(localFlags({ focusLosses: 1, awayMs: 1200 })).toEqual([]);
  });

  it('flags leaving repeatedly during one question', () => {
    expect(localFlags({ focusLosses: 2, awayMs: 500 })).toContain('focus-loss-repeated');
  });

  it('flags being away long enough to read the question elsewhere', () => {
    expect(localFlags({ focusLosses: 1, awayMs: 9_000 })).toContain('focus-loss-long');
  });

  it('reports both reasons when both are true', () => {
    expect(localFlags({ focusLosses: 3, awayMs: 20_000 })).toHaveLength(2);
  });

  it('returns reasons, never a verdict', () => {
    // The shape matters: a boolean here would invite a caller to act on it live.
    const flags = localFlags({ focusLosses: 5, awayMs: 60_000 });
    expect(Array.isArray(flags)).toBe(true);
    expect(flags.every((f) => typeof f === 'string')).toBe(true);
  });
});
