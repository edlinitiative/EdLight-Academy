import { normalize, scoreMatch, searchItems, SearchItem } from '../searchIndex';

describe('normalize', () => {
  it('strips diacritics and case', () => {
    expect(normalize('Mathématiques')).toBe('mathematiques');
    expect(normalize('Économie')).toBe('economie');
    expect(normalize('Kreyòl')).toBe('kreyol');
  });

  it('treats apostrophes as spaces', () => {
    expect(normalize("Plan d’étude")).toBe('plan d etude');
  });
});

describe('scoreMatch', () => {
  it('ranks prefix over word-start over substring', () => {
    const prefix = scoreMatch('math', 'Mathématiques NS1');
    const wordStart = scoreMatch('ns1', 'Mathématiques NS1');
    const substring = scoreMatch('thema', 'Mathématiques NS1');
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(0);
  });

  it('is accent-insensitive both ways', () => {
    expect(scoreMatch('mathematiques', 'Mathématiques')).toBeGreaterThan(0);
    expect(scoreMatch('économie', 'Economie NS4')).toBeGreaterThan(0);
  });

  it('requires every query word to match', () => {
    expect(scoreMatch('math ns1', 'Mathématiques NS1')).toBeGreaterThan(0);
    expect(scoreMatch('math ns9', 'Mathématiques NS1')).toBe(0);
  });

  it('returns 0 for empty inputs', () => {
    expect(scoreMatch('', 'x')).toBe(0);
    expect(scoreMatch('x', '')).toBe(0);
  });
});

describe('searchItems', () => {
  const items: SearchItem[] = [
    { type: 'course', title: 'Mathématiques NS1', to: '/courses/math-ns1' },
    { type: 'course', title: 'Chimie NS1', to: '/courses/chem-ns1' },
    { type: 'lesson', title: 'Les fractions', subtitle: 'Mathématiques NS1', to: '/courses/math-ns1?lesson=l1' },
    { type: 'exam', title: 'Mathématiques — Bac 2019', to: '/exams/baccalaureat/ex_1', keywords: 'examen egzamen' },
    { type: 'page', title: 'Jeux', to: '/jeux', keywords: 'jwet games' },
  ];

  it('finds by title, ranks title matches above subtitle matches', () => {
    const r = searchItems(items, 'math');
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r[0].title).toBe('Mathématiques NS1');
    // Lesson matches only via subtitle -> ranks below the direct title matches
    const lessonRank = r.findIndex((x) => x.type === 'lesson');
    expect(lessonRank).toBeGreaterThan(0);
  });

  it('matches Kreyòl keywords', () => {
    const r = searchItems(items, 'jwet');
    expect(r[0].to).toBe('/jeux');
    const e = searchItems(items, 'egzamen');
    expect(e[0].type).toBe('exam');
  });

  it('returns nothing for garbage and respects the limit', () => {
    expect(searchItems(items, 'zzzz')).toHaveLength(0);
    expect(searchItems(items, 'ns1', 1)).toHaveLength(1);
  });
});
