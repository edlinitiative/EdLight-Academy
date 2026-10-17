import {
  startTimer,
  remainingMs,
  secondsLeft,
  isExpired,
  pauseTimer,
  resumeTimer,
  onBackground,
  onForeground,
} from '../deadlineTimer';

const T0 = 1_700_000_000_000;

describe('deadline math', () => {
  it('derives remaining time from the clock, not from ticks', () => {
    const t = startTimer(15_000, 'pause', T0);
    expect(remainingMs(t, T0)).toBe(15_000);
    // However many interval callbacks were skipped, the answer is the same.
    expect(remainingMs(t, T0 + 6_400)).toBe(8_600);
    expect(secondsLeft(t, T0 + 6_400)).toBe(9);
    expect(secondsLeft(t, T0 + 14_999)).toBe(1);
    expect(isExpired(t, T0 + 15_000)).toBe(true);
    expect(remainingMs(t, T0 + 99_000)).toBe(0);
  });

  it('pause freezes and resume restores exactly what was left', () => {
    let t = startTimer(15_000, 'pause', T0);
    t = pauseTimer(t, T0 + 5_000);
    expect(remainingMs(t, T0 + 60_000)).toBe(10_000);
    t = resumeTimer(t, T0 + 60_000);
    expect(remainingMs(t, T0 + 63_000)).toBe(7_000);
    // Idempotent.
    expect(pauseTimer(pauseTimer(t, T0 + 64_000), T0 + 90_000).pausedRemaining).toBe(6_000);
    expect(resumeTimer(t, T0)).toBe(t);
  });
});

describe('background policy', () => {
  it("solo practice ('pause'): backgrounding stops the clock; resume shows the remaining time", () => {
    let t = startTimer(15_000, 'pause', T0);
    t = onBackground(t, T0 + 4_000); // phone call at 11 s left
    // Five minutes later the student comes back.
    t = onForeground(t, T0 + 304_000);
    expect(secondsLeft(t, T0 + 304_000)).toBe(11);
    expect(isExpired(t, T0 + 314_000)).toBe(false);
    expect(isExpired(t, T0 + 315_000)).toBe(true);
  });

  it("scored duel ('run'): the deadline keeps running in the background", () => {
    let t = startTimer(15_000, 'run', T0);
    t = onBackground(t, T0 + 4_000);
    expect(t.pausedRemaining).toBeNull();
    t = onForeground(t, T0 + 30_000);
    expect(isExpired(t, T0 + 30_000)).toBe(true);
    // A short trip away costs exactly the time spent away.
    let u = startTimer(15_000, 'run', T0);
    u = onBackground(u, T0 + 2_000);
    u = onForeground(u, T0 + 7_000);
    expect(secondsLeft(u, T0 + 7_000)).toBe(8);
  });

  it('a 0-length or negative duration is expired immediately', () => {
    expect(isExpired(startTimer(0, 'pause', T0), T0)).toBe(true);
    expect(remainingMs(startTimer(-5, 'run', T0), T0)).toBe(0);
  });
});
