import {
  chapterCards, chapterMeta, formatMinutes, isGeneratedLessonBlurb, joinNames,
  lessonMinutes, positionInChapter, rowState, subjectRank,
} from '../courseOutline';

const course = {
  id: 'test-course',
  modules: [
    {
      id: 'u1', title: 'Grandeurs et mesures',
      lessons: [
        { id: 'a', type: 'video', videoUrl: 'https://www.youtube-nocookie.com/embed/6oKYUnJMdOw', duration: 12 },
        { id: 'b', type: 'video', videoUrl: 'https://www.youtube-nocookie.com/embed/zRagWxcWpJM', duration: 16 },
        { id: 'c', type: 'video', videoUrl: null, duration: null },
      ],
    },
    { id: 'u2', title: 'Vide', lessons: [] },
    { id: 'u3', title: 'Atome', lessons: [{ id: 'd', type: 'quiz', videoUrl: null, duration: 0 }] },
  ],
};

describe('courseOutline', () => {
  it('builds one card per chapter with lessons, real durations only', () => {
    const cards = chapterCards(course, { a: { completed: true } } as any);
    expect(cards.map((c) => c.index)).toEqual([0, 2]);
    expect(cards[0]).toMatchObject({ lessonCount: 3, minutes: 28, done: 1, pct: 33, started: true });
    expect(cards[0].thumbs[0]).toBe('https://i.ytimg.com/vi/6oKYUnJMdOw/sd2.jpg');
    expect(cards[0].thumbs[cards[0].thumbs.length - 1]).toContain('mqdefault');
    expect(cards[1]).toMatchObject({ minutes: null, done: 0, started: false, thumbs: [] });
  });

  it('chapter 1 leads with the hand-picked course cover', () => {
    const cards = chapterCards({ ...course, id: 'math-ns1' }, {} as any);
    expect(cards[0].thumbs[0]).toBe('https://i.ytimg.com/vi/eLmxna326QM/sddefault.jpg');
    expect(cards[0].thumbs[1]).toContain('/sd2.jpg');
    expect(cards[1].thumbs).toEqual([]);
  });

  it('formats minutes and chapter meta honestly', () => {
    expect(formatMinutes(52)).toBe('52 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(125)).toBe('2 h 05');
    expect(formatMinutes(null)).toBeNull();
    expect(lessonMinutes({ duration: 0 })).toBeNull();
    expect(chapterMeta({ lessonCount: 5, minutes: 52 }, false)).toBe('5 leçons · 52 min');
    expect(chapterMeta({ lessonCount: 1, minutes: null }, false)).toBe('1 leçon');
    expect(chapterMeta({ lessonCount: 5, minutes: null }, true)).toBe('5 leson');
  });

  it('locates a lesson inside its chapter', () => {
    expect(positionInChapter(course, 'b')).toEqual({ n: 2, of: 3 });
    expect(positionInChapter(course, 'zz')).toBeNull();
  });

  it('row state: current wins, then completion evidence', () => {
    const m = { a: { completed: true } } as any;
    expect(rowState('a', 'a', m)).toBe('current');
    expect(rowState('a', 'b', m)).toBe('done');
    expect(rowState('c', null, m)).toBe('todo');
  });

  it('hides the generated lesson blurb, keeps real objectives', () => {
    expect(isGeneratedLessonBlurb('Leçon « Masse et Poids » du cours de Chimie NS1 (EdLight) — chapitre 1')).toBe(true);
    expect(isGeneratedLessonBlurb('')).toBe(true);
    expect(isGeneratedLessonBlurb('Distinguer la masse du poids.')).toBe(false);
  });

  it('orders shelves and joins names', () => {
    expect(subjectRank('MATH')).toBeLessThan(subjectRank('ECON'));
    expect(subjectRank('ECON')).toBeLessThan(subjectRank('SVT'));
    expect(subjectRank('XYZ')).toBeGreaterThan(subjectRank('EN'));
    expect(joinNames(['Physique', 'SVT'], false)).toBe('Physique et SVT');
    expect(joinNames(['Fizik', 'SVT', 'Fizik'], true)).toBe('Fizik ak SVT');
    expect(joinNames(['A', 'B', 'C'], false)).toBe('A, B et C');
  });
});
