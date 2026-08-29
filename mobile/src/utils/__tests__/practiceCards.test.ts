import {
  parseOptions,
  resolveCorrectIndex,
  toPracticeCard,
  selectCards,
  buildChapterTest,
  chapterTestVerdicts,
  type PracticeCard,
} from '../practiceCards';

const row = (over: any = {}) => ({
  id: 'r1',
  subject_code: 'CHIM',
  unit_no: 1,
  lesson_no: 1,
  question: 'Quelle est la masse ?',
  options: '["A1","B1","C1"]',
  correct_answer: 'B',
  ...over,
});

describe('parseOptions', () => {
  it('accepts an array', () => {
    expect(parseOptions(['a', 'b'])).toEqual(['a', 'b']);
  });
  it('accepts a JSON string, which is how the live docs store it', () => {
    expect(parseOptions('["a","b"]')).toEqual(['a', 'b']);
  });
  it('degrades to empty on junk', () => {
    expect(parseOptions('not json')).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
    expect(parseOptions('')).toEqual([]);
  });
});

describe('resolveCorrectIndex', () => {
  const opts = ['zero', 'one', 'two'];
  it('reads a letter key', () => {
    expect(resolveCorrectIndex('A', opts)).toBe(0);
    expect(resolveCorrectIndex('c', opts)).toBe(2);
  });
  it('reads a 1-based number', () => {
    expect(resolveCorrectIndex('2', opts)).toBe(1);
  });
  it('falls back to matching the answer text', () => {
    expect(resolveCorrectIndex('two', opts)).toBe(2);
  });
  it('falls back to the first option rather than grading everything wrong', () => {
    expect(resolveCorrectIndex('Z', opts)).toBe(0);
    expect(resolveCorrectIndex('99', opts)).toBe(0);
    expect(resolveCorrectIndex(undefined, opts)).toBe(0);
  });
});

describe('toPracticeCard', () => {
  it('builds a card and keeps the lesson number', () => {
    const card = toPracticeCard(row(), 0)!;
    expect(card.correctIndex).toBe(1);
    expect(card.answer).toBe('B1');
    expect(card.lessonNo).toBe(1);
  });
  it('rejects rows with no question or too few options', () => {
    expect(toPracticeCard(row({ question: '' }), 0)).toBeNull();
    expect(toPracticeCard(row({ options: '["only"]' }), 0)).toBeNull();
  });
  it('reads the legacy Subchapter_Number spelling', () => {
    const card = toPracticeCard(row({ lesson_no: undefined, Subchapter_Number: '3' }), 0)!;
    expect(card.lessonNo).toBe(3);
  });
});

describe('selectCards', () => {
  const bank = [
    row({ id: 'a', lesson_no: 1 }),
    row({ id: 'b', lesson_no: 2 }),
    row({ id: 'c', unit_no: 2, lesson_no: 1 }),
    row({ id: 'd', subject_code: 'MATH' }),
  ];

  it('narrows to one subject and unit', () => {
    expect(selectCards(bank, 'CHIM', 1).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('narrows further to a lesson', () => {
    expect(selectCards(bank, 'CHIM', 1, 2).map((c) => c.id)).toEqual(['b']);
  });

  it('falls back to the whole chapter when a lesson has no questions', () => {
    expect(selectCards(bank, 'CHIM', 1, 9).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('returns nothing without a subject or unit', () => {
    expect(selectCards(bank, undefined, 1)).toEqual([]);
    expect(selectCards(bank, 'CHIM', null)).toEqual([]);
  });
});

describe('buildChapterTest', () => {
  const card = (id: string, lessonNo: number | null): PracticeCard => ({
    id, question: id, options: ['x', 'y'], correctIndex: 0, answer: 'x', lessonNo,
  });

  it('covers every lesson before doubling up on any of them', () => {
    const cards = [
      card('l1a', 1), card('l1b', 1), card('l1c', 1),
      card('l2a', 2), card('l2b', 2),
      card('l3a', 3),
    ];
    const picked = buildChapterTest(cards, 3).map((c) => c.lessonNo);
    expect(new Set(picked)).toEqual(new Set([1, 2, 3]));
  });

  it('keeps drawing once each lesson is covered', () => {
    const cards = [card('l1a', 1), card('l1b', 1), card('l2a', 2)];
    expect(buildChapterTest(cards, 3)).toHaveLength(3);
  });

  it('never returns more than the limit', () => {
    const cards = Array.from({ length: 40 }, (_, i) => card(`q${i}`, i % 5));
    expect(buildChapterTest(cards, 12)).toHaveLength(12);
  });

  it('stops when the bank is smaller than the limit instead of looping forever', () => {
    expect(buildChapterTest([card('a', 1)], 10)).toHaveLength(1);
  });

  it('handles empty input and a zero limit', () => {
    expect(buildChapterTest([], 5)).toEqual([]);
    expect(buildChapterTest([card('a', 1)], 0)).toEqual([]);
  });

  it('places untagged questions after the tagged ones', () => {
    const cards = [card('untagged', null), card('l1', 1)];
    expect(buildChapterTest(cards, 1)[0].id).toBe('l1');
  });
});

describe('chapterTestVerdicts', () => {
  const cards: PracticeCard[] = [
    { id: 'q1', question: '', options: [], correctIndex: 0, answer: '', lessonNo: 1 },
    { id: 'q2', question: '', options: [], correctIndex: 0, answer: '', lessonNo: 1 },
    { id: 'q3', question: '', options: [], correctIndex: 0, answer: '', lessonNo: 2 },
    { id: 'q4', question: '', options: [], correctIndex: 0, answer: '', lessonNo: null },
  ];
  const lessonIds = { 1: 'lessonOne', 2: 'lessonTwo' };

  it('proves a lesson only when every one of its questions was right', () => {
    const v = chapterTestVerdicts(cards, { q1: true, q2: false, q3: true }, lessonIds);
    expect(v).toEqual({ lessonOne: false, lessonTwo: true });
  });

  it('treats an unanswered question as wrong', () => {
    expect(chapterTestVerdicts(cards, {}, lessonIds).lessonOne).toBe(false);
  });

  it('ignores questions it cannot attribute to a lesson', () => {
    const v = chapterTestVerdicts(cards, { q1: true, q2: true, q3: true, q4: false }, lessonIds);
    expect(Object.keys(v).sort()).toEqual(['lessonOne', 'lessonTwo']);
  });

  it('skips lesson numbers with no matching lesson id', () => {
    expect(chapterTestVerdicts(cards, { q1: true, q2: true }, {})).toEqual({});
  });
});
