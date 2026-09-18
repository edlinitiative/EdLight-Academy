/**
 * The pre-show and round-rhythm arithmetic.
 *
 * The broadcast cannot be watched while it is being built — the stage is not
 * wired to a route yet — so every number a sequence computes was extracted into
 * `src/broadcast/rhythm.ts` and is proved here instead. The components above it
 * render; they do not calculate, and nothing in this file touches React.
 *
 * The cases that matter are the ones that only happen once, live, in front of a
 * room: the clock crossing zero, a school joining the board for the first time,
 * a round nobody answered correctly.
 */

import {
  ambientFact,
  closestRace,
  countdownParts,
  fillFraction,
  formatCountdown,
  formatSeconds,
  hairlineScale,
  introCardAge,
  introIndexAt,
  isOpeningQuestion,
  questionNumber,
  rankMovement,
  schoolHue,
  sweepCycle,
  topStreak,
  INTRO_CARD_MS,
  RESULT_MS,
} from '../../broadcast/rhythm';
import type { IndividualStanding, SchoolStanding, StandingsSnapshot } from '../../../shared/arena/events';

// ── Fixtures ────────────────────────────────────────────────────────────────

function school(over: Partial<SchoolStanding> & { key: string }): SchoolStanding {
  return {
    label: over.key.toUpperCase(),
    shortName: over.key.toUpperCase(),
    teamAvg: 0,
    counted: 5,
    members: 8,
    qualified: true,
    rank: 1,
    top5: [],
    ...over,
  };
}

function player(over: Partial<IndividualStanding> & { uid: string }): IndividualStanding {
  return {
    displayName: over.uid,
    schoolKey: 'a',
    schoolShort: 'AAA',
    score: 0,
    correct: 0,
    avgMs: 4000,
    rank: 1,
    ...over,
  };
}

// ── Sequence 1 · the countdown ──────────────────────────────────────────────

describe('countdownParts / formatCountdown', () => {
  it('splits a duration into hours, minutes and seconds', () => {
    const p = countdownParts((2 * 3600 + 5 * 60 + 9) * 1000);
    expect(p).toMatchObject({ hours: 2, minutes: 5, seconds: 9, done: false });
    expect(p.totalSeconds).toBe(2 * 3600 + 5 * 60 + 9);
  });

  it('floors rather than rounds, so the clock is never ahead of itself', () => {
    // 1999ms remaining is one whole second and change — showing "00:02" would
    // print a second that has already gone.
    expect(formatCountdown(1_999)).toBe('00:01');
  });

  it('clamps at zero once the start time has passed', () => {
    expect(formatCountdown(-45_000)).toBe('00:00');
    expect(countdownParts(-45_000).done).toBe(true);
  });

  it('treats a missing or non-finite duration as zero rather than printing NaN', () => {
    expect(formatCountdown(Number.NaN)).toBe('00:00');
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe('00:00');
  });

  it('pads to a fixed width so the figure never changes size on screen', () => {
    expect(formatCountdown(9 * 1000)).toBe('00:09');
    expect(formatCountdown(9 * 60 * 1000)).toBe('09:00');
    expect(formatCountdown(59 * 60 * 1000 + 59 * 1000)).toBe('59:59');
  });

  it('grows to H:MM:SS only once there is an hour to wait', () => {
    expect(formatCountdown(60 * 60 * 1000)).toBe('1:00:00');
    expect(formatCountdown(60 * 60 * 1000 - 1)).toBe('59:59');
  });

  it('marks done exactly at zero, not a second early', () => {
    expect(countdownParts(1).done).toBe(true); // 0 whole seconds left
    expect(countdownParts(1_000).done).toBe(false);
  });
});

// ── Sequence 2 · the cycling introductions ──────────────────────────────────

describe('introIndexAt', () => {
  it('advances one school per card period', () => {
    expect(introIndexAt(0, 4)).toBe(0);
    expect(introIndexAt(INTRO_CARD_MS - 1, 4)).toBe(0);
    expect(introIndexAt(INTRO_CARD_MS, 4)).toBe(1);
    expect(introIndexAt(2 * INTRO_CARD_MS, 4)).toBe(2);
  });

  it('wraps around the list forever — the pre-show outlasts every other scene', () => {
    expect(introIndexAt(4 * INTRO_CARD_MS, 4)).toBe(0);
    expect(introIndexAt(401 * INTRO_CARD_MS, 4)).toBe(1);
  });

  it('returns -1 when there is nothing to introduce', () => {
    expect(introIndexAt(9_000, 0)).toBe(-1);
    expect(introIndexAt(9_000, -3)).toBe(-1);
  });

  it('never returns a negative index for a clock that went backwards', () => {
    expect(introIndexAt(-5_000, 4)).toBe(0);
  });

  it('honours a custom period', () => {
    expect(introIndexAt(5_000, 10, 1_000)).toBe(5);
  });
});

describe('introCardAge', () => {
  it('reports milliseconds into the card on screen, so the cut can be swept', () => {
    expect(introCardAge(0)).toBe(0);
    expect(introCardAge(INTRO_CARD_MS + 250)).toBe(250);
    expect(introCardAge(7 * INTRO_CARD_MS + 2_999)).toBe(2_999);
  });
});

// ── Sequence 5 · the hairline fill ──────────────────────────────────────────

describe('fillFraction', () => {
  it('runs 0 to 1 across the duration and clamps at both ends', () => {
    expect(fillFraction(0, 1_000)).toBe(0);
    expect(fillFraction(500, 1_000)).toBe(0.5);
    expect(fillFraction(1_000, 1_000)).toBe(1);
    expect(fillFraction(9_999, 1_000)).toBe(1);
  });

  it('holds at zero through the delay, so the figure is read first', () => {
    expect(fillFraction(100, 1_000, { delayMs: 200 })).toBe(0);
    expect(fillFraction(700, 1_000, { delayMs: 200 })).toBe(0.5);
  });

  it('lands complete under reduced motion — the fraction is the information', () => {
    expect(fillFraction(0, RESULT_MS, { immediate: true })).toBe(1);
  });
});

describe('hairlineScale', () => {
  it('scales the completed fill to the share that answered correctly', () => {
    expect(hairlineScale(38, RESULT_MS, { immediate: true })).toBeCloseTo(0.38, 5);
  });

  it('is partway there partway through', () => {
    const half = hairlineScale(80, RESULT_MS / 2, {});
    expect(half).toBeCloseTo(0.4, 5);
  });

  it('clamps a percentage outside 0..100 rather than overshooting the rule', () => {
    expect(hairlineScale(140, RESULT_MS, { immediate: true })).toBe(1);
    expect(hairlineScale(-5, RESULT_MS, { immediate: true })).toBe(0);
  });

  it('draws nothing when nobody got it right', () => {
    expect(hairlineScale(0, RESULT_MS, { immediate: true })).toBe(0);
  });
});

describe('formatSeconds', () => {
  it('prints one decimal with a comma, French-first', () => {
    expect(formatSeconds(3_420)).toBe('3,4 s');
    expect(formatSeconds(12_000)).toBe('12,0 s');
  });

  it('treats a missing time as zero rather than printing NaN', () => {
    expect(formatSeconds(Number.NaN)).toBe('0,0 s');
    expect(formatSeconds(-1)).toBe('0,0 s');
  });
});

// ── Sequences 3 and 4 · which question ──────────────────────────────────────

describe('questionNumber / isOpeningQuestion', () => {
  it('shows a zero-based index one-based, as the room counts', () => {
    expect(questionNumber(0, 25)).toEqual({ shown: 1, total: 25 });
    expect(questionNumber(24, 25)).toEqual({ shown: 25, total: 25 });
  });

  it('never shows a number past the total', () => {
    expect(questionNumber(40, 25).shown).toBe(25);
  });

  it('still shows a number when the total is unknown', () => {
    expect(questionNumber(3, 0)).toEqual({ shown: 4, total: 0 });
  });

  it('gives the opening sequence to question one only', () => {
    expect(isOpeningQuestion(0)).toBe(true);
    expect(isOpeningQuestion(1)).toBe(false);
    expect(isOpeningQuestion(24)).toBe(false);
  });
});

// ── Sequence 16 · the held breath ───────────────────────────────────────────

describe('sweepCycle', () => {
  it('counts whole sweeps, one per second', () => {
    expect(sweepCycle(0)).toBe(0);
    expect(sweepCycle(999)).toBe(0);
    expect(sweepCycle(1_000)).toBe(1);
    expect(sweepCycle(37_400)).toBe(37);
  });
});

// ── The board · rank travel ─────────────────────────────────────────────────

describe('rankMovement', () => {
  it('reports a climb as positive and a fall as negative', () => {
    const moved = rankMovement(['a', 'b', 'c'], ['c', 'a', 'b']);
    expect(moved.get('c')).toBe(2);
    expect(moved.get('a')).toBe(-1);
    expect(moved.get('b')).toBe(-1);
  });

  it('omits rows that did not move, so nothing animates for nothing', () => {
    const moved = rankMovement(['a', 'b', 'c'], ['a', 'c', 'b']);
    expect(moved.has('a')).toBe(false);
    expect(moved.size).toBe(2);
  });

  it('omits a school that was not on the board before', () => {
    // A school that has only just qualified did not overtake anybody. Animating
    // it up from nowhere would tell the room it did.
    const moved = rankMovement(['a', 'b'], ['a', 'new', 'b']);
    expect(moved.has('new')).toBe(false);
    expect(moved.get('b')).toBe(-1);
  });

  it('is empty on the first render, when there is no previous order', () => {
    expect(rankMovement([], ['a', 'b']).size).toBe(0);
  });

  it('survives a school leaving the visible board', () => {
    const moved = rankMovement(['a', 'b', 'c'], ['b', 'c']);
    expect(moved.get('b')).toBe(1);
    expect(moved.get('c')).toBe(1);
    expect(moved.has('a')).toBe(false);
  });
});

describe('schoolHue', () => {
  it('is deterministic — a school keeps its lane colour all night', () => {
    expect(schoolHue('codosa')).toBe(schoolHue('codosa'));
  });

  it('is always a legal hue', () => {
    for (const key of ['codosa', 'sldg', '', 'x', 'école-nationale-de-jacmel']) {
      const h = schoolHue(key);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(Number.isInteger(h)).toBe(true);
    }
  });

  it('separates two different schools', () => {
    expect(schoolHue('codosa')).not.toBe(schoolHue('sldg'));
  });
});

// ── The board · the ambient callout ─────────────────────────────────────────

describe('closestRace', () => {
  it('finds the tightest adjacent gap, not the gap at the top', () => {
    const race = closestRace([
      school({ key: 'a', rank: 1, teamAvg: 100 }),
      school({ key: 'b', rank: 2, teamAvg: 80 }),
      school({ key: 'c', rank: 3, teamAvg: 78 }),
    ]);
    expect(race?.ahead.key).toBe('b');
    expect(race?.behind.key).toBe('c');
    expect(race?.gap).toBe(2);
  });

  it('ignores schools that cannot compete yet', () => {
    // rank 0 means "not qualified". Two unqualified schools two points apart
    // are not a race being decided.
    const race = closestRace([
      school({ key: 'a', rank: 1, teamAvg: 100 }),
      school({ key: 'b', rank: 2, teamAvg: 60 }),
      school({ key: 'x', rank: 0, qualified: false, teamAvg: 59 }),
    ]);
    expect(race?.ahead.key).toBe('a');
    expect(race?.behind.key).toBe('b');
    expect(race?.gap).toBe(40);
  });

  it('returns null when there is no race', () => {
    expect(closestRace([])).toBeNull();
    expect(closestRace([school({ key: 'a', rank: 1 })])).toBeNull();
    expect(closestRace(null)).toBeNull();
  });

  it('reads the board by rank even when the array is out of order', () => {
    const race = closestRace([
      school({ key: 'c', rank: 3, teamAvg: 10 }),
      school({ key: 'a', rank: 1, teamAvg: 40 }),
      school({ key: 'b', rank: 2, teamAvg: 38 }),
    ]);
    expect(race?.ahead.key).toBe('a');
    expect(race?.gap).toBe(2);
  });
});

describe('topStreak', () => {
  it('picks the longest live run', () => {
    const best = topStreak([
      player({ uid: 'p1', streak: 4 }),
      player({ uid: 'p2', streak: 7 }),
      player({ uid: 'p3', streak: 5 }),
    ]);
    expect(best?.uid).toBe('p2');
  });

  it('ignores runs too short to be a story', () => {
    expect(topStreak([player({ uid: 'p1', streak: 2 })])).toBeNull();
    expect(topStreak([player({ uid: 'p1' })])).toBeNull();
    expect(topStreak([])).toBeNull();
  });
});

describe('ambientFact', () => {
  const snap = (over: Partial<StandingsSnapshot>): StandingsSnapshot => ({
    seq: 1, computedAt: 0, schools: [], individuals: [], ...over,
  });

  it('prefers a tight race — it is what a commentator would say next', () => {
    const fact = ambientFact(snap({
      schools: [
        school({ key: 'a', rank: 1, teamAvg: 62 }),
        school({ key: 'b', rank: 2, teamAvg: 59 }),
      ],
      individuals: [player({ uid: 'p1', streak: 9 })],
    }));
    expect(fact?.kind).toBe('race');
  });

  it('falls back to a streak when the race is not close', () => {
    const fact = ambientFact(snap({
      schools: [
        school({ key: 'a', rank: 1, teamAvg: 200 }),
        school({ key: 'b', rank: 2, teamAvg: 20 }),
      ],
      individuals: [player({ uid: 'p1', streak: 9 })],
    }));
    expect(fact).toEqual({ kind: 'streak', player: expect.objectContaining({ uid: 'p1' }) });
  });

  it('falls back to a loose race when nobody is on a streak', () => {
    const fact = ambientFact(snap({
      schools: [
        school({ key: 'a', rank: 1, teamAvg: 200 }),
        school({ key: 'b', rank: 2, teamAvg: 20 }),
      ],
    }));
    expect(fact?.kind).toBe('race');
  });

  it('says nothing rather than inventing something', () => {
    // The whole point of the callout is that it is TRUE. With one school and
    // no streaks there is no true thing to say, so the board stays quiet.
    expect(ambientFact(snap({ schools: [school({ key: 'a', rank: 1 })] }))).toBeNull();
    expect(ambientFact(null)).toBeNull();
    expect(ambientFact(undefined)).toBeNull();
  });
});
