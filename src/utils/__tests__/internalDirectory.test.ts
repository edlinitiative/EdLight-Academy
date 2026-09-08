/**
 * Tests for api/_lib/internalDirectory.ts — the ranking behind
 * GET /api/internal/top-performers and the matching behind
 * GET /api/internal/students/lookup.
 *
 * Everything under test is pure: no Firestore, no network. The endpoints do the
 * I/O and delegate every decision here, so this is where the licence-awarding
 * rules are actually pinned down.
 */
import {
  clampLimit,
  countryHintFor,
  emailKey,
  emptyEvidence,
  examWasSat,
  isNameUsable,
  isOptedOutOfRanking,
  matchStudents,
  MAX_LIMIT,
  MAX_LOOKUP_RESULTS,
  nameSortKey,
  parseSince,
  phoneKey,
  profileUrlFor,
  rankPerformers,
  scoreLearning,
  toPerson,
  type DirectoryRow,
  type LearningEvidence,
} from '../../../api/_lib/internalDirectory';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 1); // 2026-09-01

function evidence(partial: Partial<LearningEvidence> = {}): LearningEvidence {
  return { ...emptyEvidence(), ...partial };
}

function row(over: Partial<DirectoryRow> = {}): DirectoryRow {
  return {
    id: 'uid-1',
    fullName: 'Wideline Étienne',
    email: 'wideline@mail.ht',
    lastSeenMs: NOW,
    department: 'Ouest',
    optedOut: false,
    evidence: emptyEvidence(),
    ...over,
  };
}

/** A sat exam paper: mostly answered, so it counts. */
function satExam(percentage: number, atMs: number | null = NOW) {
  return { percentage, answered: 20, unanswered: 5, atMs };
}

// ─── scoreLearning ──────────────────────────────────────────────────────────

describe('scoreLearning — lessons', () => {
  it('scores each mastery level on the platform’s own points, over ten', () => {
    expect(
      scoreLearning(evidence({ masteryLessons: { 'MATH-NSIV-U3-L1': { masteredAt: NOW } } })),
    ).toEqual({ score: 10, completedCount: 1 });

    expect(
      scoreLearning(evidence({ masteryLessons: { 'MATH-NSIV-U3-L1': { bestPct: 100 } } })),
    ).toEqual({ score: 8, completedCount: 1 });

    expect(
      scoreLearning(evidence({ masteryLessons: { 'MATH-NSIV-U3-L1': { bestPct: 70 } } })),
    ).toEqual({ score: 5, completedCount: 1 });
  });

  it('ignores lessons below familiar — activity is not learning', () => {
    // `seen` is what a watched video or an attempted-but-failed exercise earns.
    expect(
      scoreLearning(
        evidence({
          masteryLessons: {
            watched: { completed: true },
            tried: { bestPct: 69 },
            zero: { bestPct: 0 },
          },
        }),
      ),
    ).toEqual({ score: 0, completedCount: 0 });
  });

  it('folds quiz attempts onto the same lesson key instead of double-paying', () => {
    // The mastery ledger and the immutable quizAttempts log both recorded the
    // same lesson. It is ONE lesson learned, credited at the better score.
    const both = scoreLearning(
      evidence({
        masteryLessons: { 'MATH-NSIV-U3-L1': { bestPct: 70 } },
        quizBestPct: { 'MATH-NSIV-U3-L1': 100 },
      }),
    );
    expect(both).toEqual({ score: 8, completedCount: 1 });
  });

  it('credits a lesson known only from the quiz log', () => {
    expect(scoreLearning(evidence({ quizBestPct: { 'CHEM-NSI-U1-L2': 80 } }))).toEqual({
      score: 5,
      completedCount: 1,
    });
  });

  it('cannot be farmed by repetition — only the best attempt is ever loaded', () => {
    // The loader max'es attempts per lesson, so twenty repeats of one lesson
    // arrive as one number. Twenty DIFFERENT lessons is what scores twenty.
    const oneLesson = scoreLearning(evidence({ quizBestPct: { A: 100 } }));
    const manyLessons = scoreLearning(
      evidence({ quizBestPct: { A: 100, B: 100, C: 100 } }),
    );
    expect(oneLesson.score).toBe(8);
    expect(manyLessons.score).toBe(24);
  });
});

describe('scoreLearning — exams', () => {
  it('scores a sat paper on its percentage, over ten', () => {
    expect(scoreLearning(evidence({ exams: [satExam(56)] }))).toEqual({
      score: 5.6,
      completedCount: 1,
    });
  });

  it('ignores a paper that was opened and abandoned', () => {
    // Live data holds papers with 128 of 141 questions unanswered; they are
    // graded, so they look finished, and they are not.
    const abandoned = { percentage: 3, answered: 13, unanswered: 128, atMs: NOW };
    expect(examWasSat(abandoned)).toBe(false);
    expect(scoreLearning(evidence({ exams: [abandoned] }))).toEqual({
      score: 0,
      completedCount: 0,
    });
  });

  it('counts a paper answered at exactly the halfway line', () => {
    expect(examWasSat({ percentage: 9, answered: 10, unanswered: 10, atMs: NOW })).toBe(true);
  });

  it('ignores a summary with no numeric percentage or no questions', () => {
    expect(examWasSat({ percentage: NaN, answered: 10, unanswered: 0, atMs: null })).toBe(false);
    expect(examWasSat({ percentage: 50, answered: 0, unanswered: 0, atMs: null })).toBe(false);
  });

  it('adds lessons and exams on one scale', () => {
    expect(
      scoreLearning(
        evidence({
          masteryLessons: { A: { masteredAt: NOW }, B: { bestPct: 70 } },
          exams: [satExam(56), satExam(41)],
        }),
      ),
    ).toEqual({ score: 24.7, completedCount: 4 });
  });

  it('is empty for a learner with no evidence at all', () => {
    expect(scoreLearning(emptyEvidence())).toEqual({ score: 0, completedCount: 0 });
  });
});

// ─── rankPerformers ─────────────────────────────────────────────────────────

describe('rankPerformers', () => {
  it('orders by score descending and numbers ranks from 1', () => {
    const performers = rankPerformers([
      row({ id: 'low', evidence: evidence({ exams: [satExam(30)] }) }),
      row({ id: 'high', evidence: evidence({ masteryLessons: { A: { masteredAt: NOW } } }) }),
      row({ id: 'mid', evidence: evidence({ masteryLessons: { A: { bestPct: 70 } } }) }),
    ]);
    expect(performers.map((p) => [p.id, p.rank, p.score])).toEqual([
      ['high', 1, 10],
      ['mid', 2, 5],
      ['low', 3, 3],
    ]);
  });

  it('excludes learners with no verified learning, however active', () => {
    // The top XP holder in the live data has no completed coursework. A licence
    // meant to reward learning must not reach them through this endpoint.
    const performers = rankPerformers([
      row({ id: 'grinder', evidence: emptyEvidence() }),
      row({ id: 'learner', evidence: evidence({ exams: [satExam(56)] }) }),
    ]);
    expect(performers.map((p) => p.id)).toEqual(['learner']);
  });

  it('returns fewer rows than asked rather than padding the list', () => {
    const performers = rankPerformers(
      [row({ id: 'only', evidence: evidence({ exams: [satExam(56)] }) })],
      { limit: 50 },
    );
    expect(performers).toHaveLength(1);
  });

  it('honours the opt-out even though this list is private', () => {
    const performers = rankPerformers([
      row({ id: 'hidden', optedOut: true, evidence: evidence({ masteryLessons: { A: { masteredAt: NOW } } }) }),
      row({ id: 'visible', evidence: evidence({ exams: [satExam(20)] }) }),
    ]);
    expect(performers.map((p) => p.id)).toEqual(['visible']);
  });

  it('caps the limit and defaults a bad one', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ id: `u${i}`, evidence: evidence({ exams: [satExam(50 - i)] }) }),
    );
    expect(rankPerformers(rows, { limit: 2 })).toHaveLength(2);
    expect(rankPerformers(rows, { limit: 0 })).toHaveLength(5);
    expect(clampLimit(10_000)).toBe(MAX_LIMIT);
    expect(clampLimit('abc')).toBe(25);
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit(-3)).toBe(25);
    expect(clampLimit('7')).toBe(7);
  });

  it('filters on last activity when `since` is given, without rescoring', () => {
    const rows = [
      row({ id: 'recent', lastSeenMs: NOW, evidence: evidence({ exams: [satExam(20)] }) }),
      row({ id: 'stale', lastSeenMs: NOW - 400 * DAY, evidence: evidence({ masteryLessons: { A: { masteredAt: NOW } } }) }),
      row({ id: 'unknown', lastSeenMs: null, evidence: evidence({ exams: [satExam(90)] }) }),
    ];
    const since = rankPerformers(rows, { sinceMs: NOW - 30 * DAY });
    expect(since.map((p) => p.id)).toEqual(['recent']);
    // The stale learner's score is unchanged when no window is applied.
    expect(rankPerformers(rows).find((p) => p.id === 'stale')?.score).toBe(10);
  });

  it('breaks ties deterministically: completions, then recency, then id', () => {
    // Both score 10: one mastered lesson vs two familiar lessons.
    const byCompletions = rankPerformers([
      row({ id: 'one-mastered', evidence: evidence({ masteryLessons: { A: { masteredAt: NOW } } }) }),
      row({ id: 'two-familiar', evidence: evidence({ masteryLessons: { A: { bestPct: 70 }, B: { bestPct: 70 } } }) }),
    ]);
    expect(byCompletions.map((p) => p.id)).toEqual(['two-familiar', 'one-mastered']);

    const identical = () => evidence({ exams: [satExam(50)] });
    const byRecency = rankPerformers([
      row({ id: 'older', lastSeenMs: NOW - DAY, evidence: identical() }),
      row({ id: 'newer', lastSeenMs: NOW, evidence: identical() }),
    ]);
    expect(byRecency.map((p) => p.id)).toEqual(['newer', 'older']);

    const byId = rankPerformers([
      row({ id: 'b', lastSeenMs: NOW, evidence: identical() }),
      row({ id: 'a', lastSeenMs: NOW, evidence: identical() }),
    ]);
    expect(byId.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('returns exactly the contract fields, and nothing else', () => {
    const [performer] = rankPerformers([row({ evidence: evidence({ exams: [satExam(56)] }) })]);
    expect(Object.keys(performer).sort()).toEqual(
      [
        'completedCount', 'countryHint', 'email', 'id', 'lastActiveAt',
        'name', 'phone', 'profileUrl', 'rank', 'score',
      ].sort(),
    );
    expect(performer.lastActiveAt).toBe('2026-09-01T00:00:00.000Z');
    expect(performer.phone).toBeNull();
  });

  it('survives absent and malformed rows', () => {
    expect(rankPerformers([])).toEqual([]);
    expect(
      rankPerformers([
        { id: '', optedOut: false, evidence: emptyEvidence() } as DirectoryRow,
        row({ id: 'ok', evidence: evidence({ exams: [satExam(50)] }) }),
      ]).map((p) => p.id),
    ).toEqual(['ok']);
  });
});

// ─── toPerson ───────────────────────────────────────────────────────────────

describe('toPerson', () => {
  it('nulls blank identity fields rather than emitting empty strings', () => {
    const person = toPerson(row({ fullName: '  ', email: '', lastSeenMs: 0 }), null);
    expect(person.name).toBeNull();
    expect(person.email).toBeNull();
    expect(person.lastActiveAt).toBeNull();
    expect(person.completedCount).toBeNull();
  });

  it('points at the admin-gated learner page on the canonical origin', () => {
    expect(profileUrlFor('abc123')).toBe('https://academy.edlight.org/admin/users/abc123');
    expect(profileUrlFor('')).toBeNull();
  });
});

// ─── countryHint ────────────────────────────────────────────────────────────

describe('countryHintFor', () => {
  it('reads HT from a département chosen off the fixed picklist', () => {
    expect(countryHintFor('Ouest')).toBe('HT');
    expect(countryHintFor("Grand'Anse")).toBe('HT');
    expect(countryHintFor('Nord-Ouest')).toBe('HT');
    expect(countryHintFor('sud-est')).toBe('HT');
  });

  it('returns null for the diaspora option, which names no country', () => {
    expect(countryHintFor('Diaspora / Étranger')).toBeNull();
    expect(countryHintFor('diaspora')).toBeNull();
  });

  it('returns null rather than guessing when nothing was declared', () => {
    expect(countryHintFor(null)).toBeNull();
    expect(countryHintFor(undefined)).toBeNull();
    expect(countryHintFor('   ')).toBeNull();
    // A city is never used: the live data has "New York" next to three
    // spellings of Port-au-Prince, so a city guess invents Haitians.
    expect(countryHintFor('New York')).toBeNull();
    expect(countryHintFor('Port-au-Prince')).toBeNull();
  });
});

// ─── Opt-out ────────────────────────────────────────────────────────────────

describe('isOptedOutOfRanking', () => {
  it('honours the explicit hidden flag', () => {
    expect(isOptedOutOfRanking({ entryExists: true, entryHidden: true, optedIn: true })).toBe(true);
  });

  it('treats optedIn=false as a revocation only once someone has been on the board', () => {
    expect(isOptedOutOfRanking({ entryExists: true, entryHidden: null, optedIn: false })).toBe(true);
    // `false` is also the never-touched default of defaultTriviaProfile() on
    // web. Without a board entry it is silence, not a choice, and treating it
    // as one would drop ~85 of the 118 live learners.
    expect(isOptedOutOfRanking({ entryExists: false, entryHidden: null, optedIn: false })).toBe(false);
  });

  it('keeps everyone who never expressed a preference', () => {
    expect(isOptedOutOfRanking({ entryExists: false, entryHidden: null, optedIn: null })).toBe(false);
    expect(isOptedOutOfRanking({ entryExists: true, entryHidden: false, optedIn: true })).toBe(false);
  });
});

// ─── Identity keys (must stay byte-identical to apply's) ────────────────────

describe('identity keys mirror the admissions platform', () => {
  it('emailKey lowercases, trims and rejects placeholders', () => {
    expect(emailKey('  Wideline@Mail.HT ')).toBe('wideline@mail.ht');
    expect(emailKey('none@none.com')).toBe('');
    // Placeholder DOMAINS are rejected too — including example.org, which is
    // why no fixture in this file uses one.
    expect(emailKey('real.person@example.org')).toBe('');
    expect(emailKey('nomail@gmail.com')).toBe('');
    expect(emailKey('not-an-email')).toBe('');
    expect(emailKey(null)).toBe('');
  });

  it('nameSortKey folds accents, punctuation, order and initials', () => {
    expect(nameSortKey('Wideline Étienne')).toBe(nameSortKey('etienne wideline'));
    expect(nameSortKey('Jean-Baptiste Pierre')).toBe(nameSortKey('Pierre Jean Baptiste'));
    expect(nameSortKey('Jean B. Pierre')).toBe(nameSortKey('Jean Pierre'));
    expect(nameSortKey('Mme Marie Claire')).toBe('claire marie');
  });

  it('isNameUsable rejects a name too common to match on', () => {
    expect(isNameUsable('Pierre')).toBe(false);
    expect(isNameUsable('Jean Pierre')).toBe(true);
    expect(isNameUsable('')).toBe(false);
  });

  it('phoneKey keeps the last 8 digits of a Haitian number', () => {
    expect(phoneKey('+509 3712 3456')).toBe('37123456');
    expect(phoneKey('509-37123456')).toBe('37123456');
    expect(phoneKey('37123456')).toBe('37123456');
    expect(phoneKey('123')).toBe('');
  });
});

// ─── matchStudents ──────────────────────────────────────────────────────────

describe('matchStudents', () => {
  const roster = [
    row({ id: 'a', fullName: 'Wideline Étienne', email: 'wideline@mail.ht' }),
    row({ id: 'b', fullName: 'Jean Baptiste Pierre', email: 'jbp@mail.ht' }),
    row({ id: 'c', fullName: 'Pierre', email: 'solo@mail.ht' }),
  ];

  it('matches on email', () => {
    expect(matchStudents(roster, { emailKey: 'jbp@mail.ht' }).map((r) => r.id)).toEqual(['b']);
  });

  it('matches on a reordered name', () => {
    expect(
      matchStudents(roster, { nameSortKey: nameSortKey('Pierre Jean Baptiste') }).map((r) => r.id),
    ).toEqual(['b']);
  });

  it('unions the supplied keys instead of intersecting them', () => {
    expect(
      matchStudents(roster, {
        emailKey: 'wideline@mail.ht',
        nameSortKey: nameSortKey('Jean Baptiste Pierre'),
      }).map((r) => r.id),
    ).toEqual(['a', 'b']);
  });

  it('never matches on a one-word name', () => {
    expect(matchStudents(roster, { nameSortKey: 'pierre' })).toEqual([]);
  });

  it('returns nothing when no key is supplied — never the whole roster', () => {
    expect(matchStudents(roster, {})).toEqual([]);
    expect(matchStudents(roster, { emailKey: '', nameSortKey: '  ', phoneKey: '' })).toEqual([]);
  });

  it('never matches a blank stored field against a blank key', () => {
    const blanks = [row({ id: 'x', fullName: null, email: null })];
    expect(matchStudents(blanks, { emailKey: 'someone@mail.ht' })).toEqual([]);
  });

  it('caps the answer so the endpoint cannot be used to harvest', () => {
    const many = Array.from({ length: MAX_LOOKUP_RESULTS + 10 }, (_, i) =>
      row({ id: `u${i}`, email: 'same@mail.ht' }),
    );
    expect(matchStudents(many, { emailKey: 'same@mail.ht' })).toHaveLength(MAX_LOOKUP_RESULTS);
  });
});

// ─── parseSince ─────────────────────────────────────────────────────────────

describe('parseSince', () => {
  it('accepts an ISO-8601 instant', () => {
    expect(parseSince('2026-06-01T00:00:00.000Z')).toBe(Date.UTC(2026, 5, 1));
    expect(parseSince('2026-06-01')).toBe(Date.UTC(2026, 5, 1));
  });

  it('returns null for junk instead of throwing or defaulting to 1970', () => {
    expect(parseSince('last tuesday')).toBeNull();
    expect(parseSince('')).toBeNull();
    expect(parseSince(undefined)).toBeNull();
    expect(parseSince(['2026-06-01'])).toBeNull();
  });
});
