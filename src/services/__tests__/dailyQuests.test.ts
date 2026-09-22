import { todayStr } from '../streakService';
import {
  dayKey,
  dayBounds,
  msUntilDayEnd,
  splitCountdown,
  countResolvedToday,
  countDue,
  countLessonsAdvancedToday,
  countInDay,
  questSeed,
  selectQuestIds,
  questProgress,
  buildDailyQuests,
  unclaimedQuests,
  claimedXp,
  remainingXp,
  QUEST_ORDER,
  QUEST_XP,
  MAX_DAILY_QUESTS,
  MAX_QUEST_XP_PER_DAY,
  REVIEW_QUEST_TARGET,
  LESSON_QUEST_TARGET,
  type QuestId,
  type QuestObservations,
} from '../dailyQuests';

/**
 * Everything here runs on a FIXED clock. The whole point of the quest service
 * is that a given (date, student) always produces the same set, so a test that
 * asked the real clock would only be able to prove it twice in a row.
 */
const DAY = '2026-09-22';
const NOON = new Date(2026, 8, 22, 12, 0, 0).getTime();       // 22 Sept, midday
const MORNING = new Date(2026, 8, 22, 7, 30, 0).getTime();
const LATE = new Date(2026, 8, 22, 23, 59, 30).getTime();
const YESTERDAY_EVE = new Date(2026, 8, 21, 23, 59, 59).getTime();

function obs(over: Partial<QuestObservations> = {}): QuestObservations {
  return {
    day: DAY,
    uid: 'student-a',
    review: {},
    mastery: {},
    quizAttemptTimes: [],
    examAttemptTimes: [],
    dailyChallengeDone: false,
    examLevel: null,
    claimed: [],
    ...over,
  };
}

// ── The day boundary ────────────────────────────────────────────────────────

describe('the day boundary agrees with the streak', () => {
  it('produces the same key streakService.todayStr does, right now', () => {
    expect(dayKey()).toBe(todayStr());
  });

  it('still agrees one second before local midnight — the case that matters', () => {
    // A streak fed at 23:59:30 counts for today. If quests rolled over on any
    // other boundary (UTC, say) the two would contradict each other exactly here.
    jest.useFakeTimers().setSystemTime(LATE);
    try {
      expect(dayKey()).toBe(todayStr());
      expect(dayKey(LATE)).toBe(DAY);
    } finally {
      jest.useRealTimers();
    }
  });

  it('agrees one second after local midnight, on the new day', () => {
    const justAfter = new Date(2026, 8, 23, 0, 0, 1).getTime();
    jest.useFakeTimers().setSystemTime(justAfter);
    try {
      expect(dayKey()).toBe(todayStr());
      expect(dayKey()).toBe('2026-09-23');
    } finally {
      jest.useRealTimers();
    }
  });

  it('pads month and day to two digits, like todayStr', () => {
    expect(dayKey(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
  });

  it('bounds a day from local midnight to the next local midnight', () => {
    const { start, end } = dayBounds(DAY);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getDate()).toBe(22);
    expect(new Date(end).getDate()).toBe(23);
    expect(new Date(end).getHours()).toBe(0);
    // Yesterday's last second is outside, today's last second is inside.
    expect(YESTERDAY_EVE < start).toBe(true);
    expect(LATE < end).toBe(true);
  });

  it('counts down to that same midnight and never goes negative', () => {
    expect(msUntilDayEnd(DAY, NOON)).toBe(12 * 60 * 60 * 1000);
    expect(splitCountdown(msUntilDayEnd(DAY, NOON))).toEqual({ hours: 12, minutes: 0 });
    expect(splitCountdown(msUntilDayEnd(DAY, LATE))).toEqual({ hours: 0, minutes: 0 });
    expect(msUntilDayEnd(DAY, new Date(2026, 8, 25))).toBe(0);
  });

  it('rounds the countdown down, so it never promises a minute that is gone', () => {
    // 6 h 42 m 59 s left reads as 06h 42m, not 06h 43m.
    const at = dayBounds(DAY).end - (6 * 3600 + 42 * 60 + 59) * 1000;
    expect(splitCountdown(msUntilDayEnd(DAY, at))).toEqual({ hours: 6, minutes: 42 });
  });
});

// ── Counting from the records the app already writes ────────────────────────

describe('countResolvedToday', () => {
  it('counts a question missed yesterday and put right today', () => {
    const review = { q1: { missedAt: YESTERDAY_EVE, correctAt: MORNING } };
    expect(countResolvedToday(review, DAY)).toBe(1);
  });

  it('ignores a question resolved yesterday', () => {
    const review = { q1: { missedAt: YESTERDAY_EVE - 1000, correctAt: YESTERDAY_EVE } };
    expect(countResolvedToday(review, DAY)).toBe(0);
  });

  it('ignores one answered right this morning and missed again this afternoon', () => {
    // utils/review.isDue says that question is due again, so it is not resolved.
    const review = { q1: { correctAt: MORNING, missedAt: NOON } };
    expect(countResolvedToday(review, DAY)).toBe(0);
  });

  it('ignores entries with no correctAt at all', () => {
    expect(countResolvedToday({ q1: { missedAt: MORNING } }, DAY)).toBe(0);
  });

  it('survives an empty or absent map', () => {
    expect(countResolvedToday({}, DAY)).toBe(0);
    expect(countResolvedToday(undefined as any, DAY)).toBe(0);
  });
});

describe('countDue', () => {
  it('matches utils/review.isDue: missed more recently than answered right', () => {
    const review = {
      due1: { missedAt: NOON },
      due2: { missedAt: NOON, correctAt: MORNING },
      resolved: { missedAt: MORNING, correctAt: NOON },
      untouched: {},
    };
    expect(countDue(review)).toBe(2);
  });
});

describe('countLessonsAdvancedToday', () => {
  it('counts a promotion stamped today', () => {
    expect(countLessonsAdvancedToday({ 'MATH-NSI-U1-L1': { levelUpAt: MORNING } }, DAY)).toBe(1);
  });

  it('counts a chapter-test mastery stamped today', () => {
    expect(countLessonsAdvancedToday({ a: { masteredAt: NOON } }, DAY)).toBe(1);
  });

  it('counts a lesson once even when both stamps are today', () => {
    expect(countLessonsAdvancedToday({ a: { levelUpAt: MORNING, masteredAt: NOON } }, DAY)).toBe(1);
  });

  it('takes the later stamp, so an old levelUpAt never hides today mastery', () => {
    expect(
      countLessonsAdvancedToday({ a: { levelUpAt: YESTERDAY_EVE, masteredAt: NOON } }, DAY),
    ).toBe(1);
  });

  it('ignores lessons that only carry a bestPct or a completed flag', () => {
    expect(countLessonsAdvancedToday({ a: { bestPct: 100, completed: true } }, DAY)).toBe(0);
  });

  it('ignores yesterday promotions', () => {
    expect(countLessonsAdvancedToday({ a: { levelUpAt: YESTERDAY_EVE } }, DAY)).toBe(0);
  });
});

describe('countInDay', () => {
  it('keeps only the stamps inside the local day', () => {
    expect(countInDay([YESTERDAY_EVE, MORNING, NOON, LATE], DAY)).toBe(3);
  });

  it('excludes the next midnight exactly (half-open window)', () => {
    expect(countInDay([dayBounds(DAY).end], DAY)).toBe(0);
    expect(countInDay([dayBounds(DAY).start], DAY)).toBe(1);
  });

  it('shrugs off a missing list and non-numeric rows', () => {
    expect(countInDay(undefined as any, DAY)).toBe(0);
    expect(countInDay([NaN, null as any, NOON], DAY)).toBe(1);
  });
});

// ── Selection: deterministic in (date, student) ─────────────────────────────

describe('selectQuestIds', () => {
  it('returns the same set every time for one student on one day', () => {
    const o = obs({ examLevel: 'baccalaureat' });
    const first = selectQuestIds(o);
    for (let i = 0; i < 25; i++) expect(selectQuestIds(o)).toEqual(first);
  });

  it('never returns more than MAX_DAILY_QUESTS', () => {
    const picked = selectQuestIds(
      obs({ examLevel: 'baccalaureat', review: { q1: { missedAt: MORNING } } }),
    );
    expect(picked.length).toBe(MAX_DAILY_QUESTS);
  });

  it('always returns at least two quests, even for a brand-new account', () => {
    expect(selectQuestIds(obs()).length).toBeGreaterThanOrEqual(2);
  });

  it('gives different students different sets on the same day', () => {
    const base = { examLevel: 'baccalaureat' as string | null };
    const sets = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((uid) => selectQuestIds(obs({ ...base, uid })).join(',')),
    );
    expect(sets.size).toBeGreaterThan(1);
  });

  it('rotates across days for one student', () => {
    const days = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'];
    const sets = new Set(
      days.map((day) =>
        selectQuestIds(obs({ day, examLevel: 'baccalaureat', review: { q: { missedAt: 1 } } })).join(','),
      ),
    );
    expect(sets.size).toBeGreaterThan(1);
  });

  it('always displays in canonical order, whatever the rotation picked', () => {
    for (const uid of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const picked = selectQuestIds(obs({ uid, examLevel: '9eme_af' }));
      const ranks = picked.map((id) => QUEST_ORDER.indexOf(id));
      expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    }
  });

  it('leads with the review quest whenever questions are owed', () => {
    const picked = selectQuestIds(obs({ review: { q1: { missedAt: MORNING } } }));
    expect(picked[0]).toBe('review');
  });

  it('offers no review quest when nothing is owed and nothing was resolved', () => {
    expect(selectQuestIds(obs())).not.toContain('review');
  });

  it('offers no exam quest to a grade that sits no official paper', () => {
    for (const uid of ['a', 'b', 'c', 'd', 'e', 'f']) {
      expect(selectQuestIds(obs({ uid, examLevel: null }))).not.toContain('exam-paper');
    }
  });

  it('can offer the exam quest to a grade that does', () => {
    const anyoneGetsIt = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].some((uid) =>
      selectQuestIds(obs({ uid, examLevel: 'baccalaureat' })).includes('exam-paper'),
    );
    expect(anyoneGetsIt).toBe(true);
  });

  it('keeps the review quest after the last owed question is resolved', () => {
    // The trap: availability keyed on the due count alone would delete the
    // card at the exact moment the student finished it.
    const before = obs({ review: { q1: { missedAt: MORNING } } });
    expect(selectQuestIds(before)).toContain('review');
    const after = obs({ review: { q1: { missedAt: MORNING, correctAt: NOON } } });
    expect(countDue(after.review)).toBe(0);
    expect(selectQuestIds(after)).toContain('review');
    expect(selectQuestIds(after)).toEqual(selectQuestIds(before));
  });

  it('keeps a quest that has already been paid, whatever the records now say', () => {
    const picked = selectQuestIds(obs({ examLevel: null, claimed: ['exam-paper'] }));
    expect(picked).toContain('exam-paper');
  });

  it('ignores a claimed id it does not recognise', () => {
    const picked = selectQuestIds(obs({ claimed: ['forum-help' as QuestId] }));
    expect(picked).not.toContain('forum-help' as QuestId);
    expect(picked).toEqual(selectQuestIds(obs()));
  });
});

describe('questSeed', () => {
  it('is stable for a (day, uid) pair and differs across both axes', () => {
    expect(questSeed(DAY, 'x')).toBe(questSeed(DAY, 'x'));
    expect(questSeed(DAY, 'x')).not.toBe(questSeed(DAY, 'y'));
    expect(questSeed(DAY, 'x')).not.toBe(questSeed('2026-09-23', 'x'));
  });
});

// ── Progress ────────────────────────────────────────────────────────────────

describe('questProgress', () => {
  it('asks for at most REVIEW_QUEST_TARGET, and never more than is owed', () => {
    const one = obs({ review: { q1: { missedAt: MORNING } } });
    expect(questProgress('review', one).target).toBe(1);

    const many = obs({
      review: Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [`q${i}`, { missedAt: MORNING }]),
      ),
    });
    expect(questProgress('review', many).target).toBe(REVIEW_QUEST_TARGET);
  });

  it('counts review progress from resolutions stamped today', () => {
    const o = obs({
      review: {
        a: { missedAt: YESTERDAY_EVE, correctAt: MORNING },
        b: { missedAt: YESTERDAY_EVE, correctAt: NOON },
        c: { missedAt: MORNING },
      },
    });
    expect(questProgress('review', o)).toEqual({ done: 2, target: 3 });
  });

  it('counts lesson progress from mastery stamps', () => {
    const o = obs({ mastery: { a: { levelUpAt: MORNING }, b: { masteredAt: NOON }, c: {} } });
    expect(questProgress('lessons', o)).toEqual({ done: 2, target: LESSON_QUEST_TARGET });
  });

  it('counts a unit quiz from the immutable attempt log', () => {
    expect(questProgress('unit-quiz', obs({ quizAttemptTimes: [NOON] }))).toEqual({ done: 1, target: 1 });
    expect(questProgress('unit-quiz', obs({ quizAttemptTimes: [YESTERDAY_EVE] })).done).toBe(0);
  });

  it('counts the daily challenge from the gamification profile', () => {
    expect(questProgress('daily-challenge', obs({ dailyChallengeDone: true }))).toEqual({ done: 1, target: 1 });
    expect(questProgress('daily-challenge', obs()).done).toBe(0);
  });

  it('counts an exam paper from a copy saved today', () => {
    expect(questProgress('exam-paper', obs({ examAttemptTimes: [MORNING] })).done).toBe(1);
    expect(questProgress('exam-paper', obs({ examAttemptTimes: [YESTERDAY_EVE] })).done).toBe(0);
  });
});

// ── The whole set ───────────────────────────────────────────────────────────

describe('buildDailyQuests', () => {
  it('clamps a reported count to the target, so no bar overshoots', () => {
    const o = obs({ mastery: { a: { levelUpAt: 1 }, b: {}, c: {} } as any });
    const many = obs({
      mastery: {
        a: { levelUpAt: MORNING },
        b: { levelUpAt: MORNING },
        c: { levelUpAt: NOON },
        d: { levelUpAt: NOON },
      },
    });
    const quest = buildDailyQuests(many).find((q) => q.id === 'lessons');
    expect(quest.done).toBe(quest.target);
    expect(quest.complete).toBe(true);
    expect(buildDailyQuests(o).find((q) => q.id === 'lessons')?.done).toBe(0);
  });

  it('marks nothing complete for a student who has done nothing today', () => {
    expect(buildDailyQuests(obs()).every((q) => !q.complete)).toBe(true);
  });

  it('reports a finished-but-unpaid quest as claimable exactly once', () => {
    const o = obs({ dailyChallengeDone: true, uid: 'zz' });
    const quests = buildDailyQuests(o);
    const pending = unclaimedQuests(quests);
    const daily = quests.find((q) => q.id === 'daily-challenge');
    if (daily) {
      expect(daily.complete).toBe(true);
      expect(daily.claimed).toBe(false);
      expect(pending.map((q) => q.id)).toContain('daily-challenge');
    }
    // Once paid, it stops being claimable but stays complete.
    const paid = buildDailyQuests({ ...o, claimed: ['daily-challenge'] });
    const after = paid.find((q) => q.id === 'daily-challenge');
    expect(after.claimed).toBe(true);
    expect(after.complete).toBe(true);
    expect(unclaimedQuests(paid).map((q) => q.id)).not.toContain('daily-challenge');
  });

  it('keeps a paid quest complete even if the record behind it moves back', () => {
    // Resolved this morning, missed again this evening: due once more, but we
    // already said it was done and we already paid for it.
    const o = obs({
      review: { q1: { correctAt: MORNING, missedAt: LATE } },
      claimed: ['review'],
    });
    const quest = buildDailyQuests(o).find((q) => q.id === 'review');
    expect(quest.complete).toBe(true);
    expect(quest.claimed).toBe(true);
  });

  it('adds up the banked and the remaining XP', () => {
    const o = obs({ uid: 'q-money', examLevel: null, claimed: [] });
    const quests = buildDailyQuests(o);
    expect(claimedXp(quests)).toBe(0);
    expect(remainingXp(quests)).toBe(quests.reduce((n, q) => n + q.xp, 0));

    const paidOne = buildDailyQuests({ ...o, claimed: [quests[0].id] });
    expect(claimedXp(paidOne)).toBe(quests[0].xp);
    expect(claimedXp(paidOne) + remainingXp(paidOne)).toBe(remainingXp(quests));
  });

  it('carries a tone and an XP amount for every quest it ships', () => {
    for (const quest of buildDailyQuests(obs({ examLevel: 'baccalaureat', review: { q: { missedAt: 1 } } }))) {
      expect(QUEST_ORDER).toContain(quest.id);
      expect(quest.xp).toBe(QUEST_XP[quest.id]);
      expect(quest.tone.length).toBeGreaterThan(0);
      expect(quest.target).toBeGreaterThan(0);
    }
  });
});

describe('the XP budget stays modest', () => {
  it('cannot pay more than MAX_QUEST_XP_PER_DAY, whatever the day picks', () => {
    // 60 XP against 50 for one arcade round (computeGameXp caps at 40 + 10) and
    // 100 for the first level. Checked over every set the selector can produce.
    const richest = [...QUEST_ORDER]
      .sort((a, b) => QUEST_XP[b] - QUEST_XP[a])
      .slice(0, MAX_DAILY_QUESTS)
      .reduce((n, id) => n + QUEST_XP[id], 0);
    expect(richest).toBeLessThanOrEqual(MAX_QUEST_XP_PER_DAY);

    for (const uid of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      for (const day of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']) {
        const quests = buildDailyQuests(
          obs({ uid, day, examLevel: 'baccalaureat', review: { q: { missedAt: 1 } } }),
        );
        expect(remainingXp(quests)).toBeLessThanOrEqual(MAX_QUEST_XP_PER_DAY);
      }
    }
  });

  it('pays the daily challenge least, because it already pays its own bonus', () => {
    expect(QUEST_XP['daily-challenge']).toBeLessThan(QUEST_XP.review);
    expect(QUEST_XP['daily-challenge']).toBeLessThan(QUEST_XP.lessons);
  });
});
