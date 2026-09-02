import {
  attributeChapterTest,
  applyChapterTestResult,
  chapterTestLessonMap,
} from '../../../shared/mastery';

// attributeChapterTest splits one chapter-test sitting back into per-lesson
// verdicts, and those verdicts are what promote a lesson to `mastered` — the
// top rung. Getting it wrong either hands out mastery for free or makes the
// rung unreachable, and neither shows up as an error anywhere.
describe('attributeChapterTest', () => {
  const MAP = { '1': 'lesson-a', '2': 'lesson-b' };

  it('passes a lesson only when every one of its questions was correct', () => {
    const items = [{ lessonNo: 1 }, { lessonNo: 1 }, { lessonNo: 2 }];
    expect(attributeChapterTest(items, { 0: true, 1: true, 2: true }, MAP)).toEqual({
      'lesson-a': true,
      'lesson-b': true,
    });
    // One miss on lesson 1 fails lesson 1 and lesson 1 only.
    expect(attributeChapterTest(items, { 0: true, 1: false, 2: true }, MAP)).toEqual({
      'lesson-a': false,
      'lesson-b': true,
    });
  });

  it('treats an unanswered question as not correct', () => {
    // Abandoning the test halfway must not promote the lessons never reached.
    const items = [{ lessonNo: 1 }, { lessonNo: 2 }];
    expect(attributeChapterTest(items, { 0: true }, MAP)).toEqual({
      'lesson-a': true,
      'lesson-b': false,
    });
    expect(attributeChapterTest(items, {}, MAP)).toEqual({
      'lesson-a': false,
      'lesson-b': false,
    });
  });

  it('keys outcomes by question index, so two questions never collapse into one', () => {
    // Both questions belong to lesson 1; each needs its own entry or a miss on
    // the second would be hidden by a hit on the first.
    const items = [{ lessonNo: 1 }, { lessonNo: 1 }];
    expect(attributeChapterTest(items, { 0: true, 1: true }, MAP)).toEqual({ 'lesson-a': true });
    expect(attributeChapterTest(items, { 0: true, 1: false }, MAP)).toEqual({ 'lesson-a': false });
  });

  it('does not credit a question that was only right after a wrong attempt', () => {
    // UnitQuiz gives several attempts and reveals the answer, so "eventually
    // correct" must not reach the top rung — its handleScore writes false on
    // the first wrong attempt and never lifts it. This pins the map that
    // produces, so mastery can't be brute-forced.
    const items = [{ lessonNo: 1 }, { lessonNo: 2 }];
    expect(attributeChapterTest(items, { 0: false, 1: true }, MAP)).toEqual({
      'lesson-a': false,
      'lesson-b': true,
    });
  });

  it('ignores questions with no lesson, or a lesson not in the course', () => {
    const items = [
      { lessonNo: 1 },
      { lessonNo: null },
      { lessonNo: '' },
      {},
      null,
      { lessonNo: 99 }, // bank row for an unpublished lesson
    ];
    // Every ignorable question was ANSWERED WRONG here: if any of them leaked
    // into a lesson bucket, lesson-a would come back false.
    expect(attributeChapterTest(items, { 0: true }, MAP)).toEqual({ 'lesson-a': true });
  });

  it('matches a numeric lessonNo against the string-keyed map', () => {
    // quizBank parses lesson_no to an int; the map is keyed by string.
    expect(attributeChapterTest([{ lessonNo: 2 }], { 0: true }, MAP)).toEqual({ 'lesson-b': true });
    expect(attributeChapterTest([{ lessonNo: '2' }], { 0: true }, MAP)).toEqual({ 'lesson-b': true });
  });

  it('returns an empty verdict when nothing is attributable, so no write happens', () => {
    expect(attributeChapterTest([], {}, MAP)).toEqual({});
    expect(attributeChapterTest([{ lessonNo: 7 }], { 0: true }, MAP)).toEqual({});
  });

  it('feeds applyChapterTestResult: a pass promotes, a miss never demotes', () => {
    const verdicts = attributeChapterTest(
      [{ lessonNo: 1 }, { lessonNo: 2 }],
      { 0: true, 1: false },
      MAP,
    );
    const at = 1_700_000_000_000;
    const passed = applyChapterTestResult({ bestPct: 100 }, verdicts['lesson-a'], at);
    expect(passed?.masteredAt).toBe(at);
    // The failed lesson keeps the rung it had — no write is worth making.
    expect(applyChapterTestResult({ bestPct: 100 }, verdicts['lesson-b'], at)).toBeNull();
  });
});

describe('chapterTestLessonMap', () => {
  it('maps lesson numbers to ids and skips the test lesson itself', () => {
    const lessons = [
      { id: 'a', lesson_no: 1, type: 'video' },
      { id: 'b', lesson_no: 2, type: 'video' },
      { id: 'test', lesson_no: 3, type: 'quiz' },
    ];
    expect(chapterTestLessonMap(lessons)).toEqual({ '1': 'a', '2': 'b' });
  });

  it('accepts a numeric-string lesson_no and drops unusable ones', () => {
    const lessons = [
      { id: 'a', lesson_no: '1' },
      { id: 'b', lesson_no: null },
      { id: 'c' },
      { id: 'd', lesson_no: 'intro' },
      { lesson_no: 5 }, // no id
    ];
    expect(chapterTestLessonMap(lessons)).toEqual({ '1': 'a' });
  });

  it('keeps the first of a duplicated lesson number', () => {
    // Bad data: crediting the later lesson would move mastery to the wrong one.
    expect(chapterTestLessonMap([{ id: 'a', lesson_no: 1 }, { id: 'b', lesson_no: 1 }])).toEqual({ '1': 'a' });
  });

  it('survives a missing or empty lesson list', () => {
    expect(chapterTestLessonMap(undefined as any)).toEqual({});
    expect(chapterTestLessonMap([])).toEqual({});
  });

  it('composes with attributeChapterTest end to end', () => {
    const lessons = [
      { id: 'les-1', lesson_no: 1, type: 'video' },
      { id: 'les-2', lesson_no: 2, type: 'video' },
      { id: 'les-test', lesson_no: 3, type: 'quiz' },
    ];
    const items = [{ lessonNo: 1 }, { lessonNo: 2 }, { lessonNo: 2 }];
    const verdicts = attributeChapterTest(items, { 0: true, 1: true, 2: false }, chapterTestLessonMap(lessons));
    expect(verdicts).toEqual({ 'les-1': true, 'les-2': false });
  });
});
