import {
  deriveSignals,
  abilityFromAttempts,
  velocityFromAttempts,
  dueReviews,
  detectStall,
  MIN_ATTEMPTS_FOR_SIGNALS,
  DEFAULT_CHALLENGE_BAND,
  type AttemptEvent,
  type ReviewStateEntry,
} from '../adaptiveEngine';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // fixed epoch so tests are deterministic

/** Build an attempt `daysAgo` before NOW. */
function attempt(
  subject: string,
  quizId: string,
  percentage: number,
  daysAgo: number,
  timeSpent = 60,
): AttemptEvent {
  return { subject, quizId, percentage, timeSpent, attemptedAtMs: NOW - daysAgo * DAY };
}

/** A healthy log of N attempts, one per day, all strong scores. */
function healthyLog(n = MIN_ATTEMPTS_FOR_SIGNALS + 2): AttemptEvent[] {
  return Array.from({ length: n }, (_, i) => attempt('Maths', `q${i}`, 85, n - i));
}

describe('abilityFromAttempts', () => {
  it('weights the most recent attempt most (EWMA)', () => {
    const rising = [
      attempt('Maths', 'q1', 40, 5),
      attempt('Maths', 'q2', 60, 4),
      attempt('Maths', 'q3', 90, 1),
    ];
    const falling = [
      attempt('Maths', 'q1', 90, 5),
      attempt('Maths', 'q2', 60, 4),
      attempt('Maths', 'q3', 40, 1),
    ];
    expect(abilityFromAttempts(rising).Maths).toBeGreaterThan(abilityFromAttempts(falling).Maths);
  });

  it('keeps subjects independent', () => {
    const a = abilityFromAttempts([
      attempt('Maths', 'q1', 90, 2),
      attempt('Physique', 'q2', 30, 1),
    ]);
    expect(a.Maths).toBeGreaterThan(a.Physique);
  });

  it('clamps out-of-range and NaN percentages', () => {
    const a = abilityFromAttempts([
      attempt('Maths', 'q1', 150, 2),
      attempt('Maths', 'q2', Number.NaN as unknown as number, 1),
    ]);
    expect(a.Maths).toBeGreaterThanOrEqual(0);
    expect(a.Maths).toBeLessThanOrEqual(100);
  });
});

describe('velocityFromAttempts', () => {
  it('is negative for a declining subject', () => {
    const declining = Array.from({ length: 6 }, (_, i) => attempt('Maths', `q${i}`, 90 - i * 10, 6 - i));
    expect(velocityFromAttempts(declining).Maths).toBeLessThan(0);
  });

  it('is ~zero for flat scores', () => {
    const flat = Array.from({ length: 6 }, (_, i) => attempt('Maths', `q${i}`, 70, 6 - i));
    expect(Math.abs(velocityFromAttempts(flat).Maths)).toBeLessThan(1);
  });

  it('does not divide by zero when all attempts share a timestamp', () => {
    const same = [attempt('Maths', 'q1', 50, 1), attempt('Maths', 'q2', 90, 1)];
    expect(velocityFromAttempts(same).Maths).toBe(0);
  });
});

describe('dueReviews', () => {
  const state: ReviewStateEntry[] = [
    { key: 'Maths|trig', subject: 'Maths', interval: 3, ease: 2.5, repetitions: 2, nextReviewMs: NOW - 5 * DAY, coefficient: 4 },
    { key: 'Philo|intro', subject: 'Philo', interval: 1, ease: 2.5, repetitions: 1, nextReviewMs: NOW - 1 * DAY, coefficient: 1 },
    { key: 'Future', subject: 'Maths', interval: 6, ease: 2.5, repetitions: 3, nextReviewMs: NOW + 2 * DAY, coefficient: 4 },
  ];

  it('returns only overdue items', () => {
    const due = dueReviews(state, NOW);
    expect(due.map((d) => d.key)).not.toContain('Future');
    expect(due).toHaveLength(2);
  });

  it('prioritizes most-overdue × coefficient first', () => {
    const due = dueReviews(state, NOW);
    expect(due[0].key).toBe('Maths|trig'); // 5d overdue × coeff 4 beats 1d × 1
  });

  it('is empty for no state (Slice 1 default)', () => {
    expect(dueReviews([], NOW)).toEqual([]);
    expect(dueReviews(undefined as unknown as ReviewStateEntry[], NOW)).toEqual([]);
  });
});

describe('detectStall', () => {
  it('returns null below the minimum-attempts floor', () => {
    const few = [attempt('Maths', 'q1', 20, 2), attempt('Maths', 'q1', 20, 1)];
    expect(detectStall(few, { now: NOW })).toBeNull();
  });

  it('returns null for a healthy learner', () => {
    expect(detectStall(healthyLog(), { now: NOW })).toBeNull();
  });

  it('flags repeat-fail on the same quiz (switch-topic)', () => {
    const log = [
      ...healthyLog(MIN_ATTEMPTS_FOR_SIGNALS),
      attempt('Maths', 'stuck', 30, 3),
      attempt('Maths', 'stuck', 20, 2),
      attempt('Maths', 'stuck', 40, 1),
    ];
    const stall = detectStall(log, { now: NOW });
    expect(stall?.trigger).toBe('repeat-fail');
    expect(stall?.intervention).toBe('switch-topic');
    expect(stall?.quizId).toBe('stuck');
  });

  it('flags a declining subject (warm-up)', () => {
    const declining = Array.from({ length: MIN_ATTEMPTS_FOR_SIGNALS + 2 }, (_, i) =>
      attempt('Physique', `q${i}`, 95 - i * 6, MIN_ATTEMPTS_FOR_SIGNALS + 2 - i),
    );
    const stall = detectStall(declining, { now: NOW });
    expect(stall?.trigger).toBe('decline');
    expect(stall?.subject).toBe('Physique');
  });

  it('flags inactivity for a gone-quiet learner (reengage)', () => {
    // All attempts ≥ 5 days ago, none recent.
    const stale = Array.from({ length: MIN_ATTEMPTS_FOR_SIGNALS + 2 }, (_, i) =>
      attempt('Maths', `q${i}`, 80, 20 - i),
    );
    const stall = detectStall(stale, { now: NOW });
    expect(stall?.trigger).toBe('inactivity');
  });

  it('protects an at-risk streak only when data is sufficient', () => {
    // Last activity yesterday, healthy scores, streak of 6.
    const log = Array.from({ length: MIN_ATTEMPTS_FOR_SIGNALS + 2 }, (_, i) =>
      attempt('Maths', `q${i}`, 85, MIN_ATTEMPTS_FOR_SIGNALS + 3 - i),
    );
    const stall = detectStall(log, { now: NOW, currentStreak: 6 });
    expect(stall?.trigger).toBe('streak-at-risk');
  });
});

describe('deriveSignals', () => {
  it('holds all stall nudges until the attempts floor is cleared', () => {
    const few = [attempt('Maths', 'stuck', 10, 3), attempt('Maths', 'stuck', 10, 2), attempt('Maths', 'stuck', 10, 1)];
    const sig = deriveSignals(few, { now: NOW });
    expect(sig.hasEnoughData).toBe(false);
    expect(sig.stall).toBeNull(); // even though repeat-fail pattern exists
  });

  it('assembles the full signal object for an established learner', () => {
    const sig = deriveSignals(healthyLog(), {
      now: NOW,
      reviewState: [{ key: 'Maths|trig', subject: 'Maths', interval: 3, ease: 2.5, repetitions: 2, nextReviewMs: NOW - 2 * DAY, coefficient: 4 }],
    });
    expect(sig.hasEnoughData).toBe(true);
    expect(sig.ability.Maths).toBeGreaterThan(0);
    expect(sig.reviewQueue).toHaveLength(1);
    expect(sig.challengeBand).toEqual(DEFAULT_CHALLENGE_BAND);
    expect(sig.updatedAtMs).toBe(NOW);
  });

  it('is safe on empty input', () => {
    const sig = deriveSignals([], { now: NOW });
    expect(sig.totalAttempts).toBe(0);
    expect(sig.stall).toBeNull();
    expect(sig.reviewQueue).toEqual([]);
  });
});
