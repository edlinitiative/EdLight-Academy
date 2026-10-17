// searchIndex reads the course cache and the exam index — stub both sources.
const mockCourses = [
  {
    id: 'chem-ns1', code: 'CHEM-NSI', name: 'Chimie NS1', subject: 'CHEM', level: 'NSI',
    modules: [{ id: 'CHEM-NSI-U1', title: 'Grandeurs et Mesures', lessons: [
      // The transformed catalog keys lessons on `id` — the shape that used to be skipped.
      { id: 'CHEM-NSI-U1-L1', title: 'Masse et Poids', type: 'video' },
      { id: 'CHEM-NSI-U1-L2', title: 'Volume et Mole', type: 'video' },
    ] }],
  },
  { id: 'math-ns1', code: 'MATH-NSI', name: 'Mathématiques NS1', subject: 'MATH', level: 'NSI', modules: [] },
];
let mockExams: any[] = [{ exam_id: 'e1', level: 'baccalaureat', subject: 'Chimie', year: 2023 }];
jest.mock('../dataService', () => ({
  getCachedCourses: jest.fn(async () => ({ data: mockCourses })),
  loadCoursesData: jest.fn(async () => mockCourses),
}));
jest.mock('../../utils/examCatalog', () => ({ fetchCatalogIndex: jest.fn(async () => mockExams) }));
jest.mock('../../data/games', () => ({ GAMES: [{ name: 'Mo Kaché', nameHt: 'Mo Kache' }] }));

import {
  getSearchIndex, rankResults, indexHealth, readableCourseMeta, rowContext, suggestFor, type SearchItem,
} from '../searchIndex';

it('indexes lessons (they were read from l.lessonId and never indexed)', async () => {
  const idx = await getSearchIndex('fr', { force: true });
  const lessons = idx.filter((i) => i.type === 'lesson');
  expect(lessons.map((l) => l.title)).toEqual(['Masse et Poids', 'Volume et Mole']);
  expect(lessons[0].nav).toMatchObject({ kind: 'lesson', courseId: 'chem-ns1', lessonId: 'CHEM-NSI-U1-L1' });
  expect(lessons[0].subtitle).toBe('Chimie NS1 · Grandeurs et Mesures');
});

it('puts an exact lesson title first, ahead of actions and generic matches', async () => {
  const idx = await getSearchIndex('fr', { force: true });
  const groups = rankResults(idx, 'masse et poids');
  expect(groups[0].key).toBe('best');
  expect(groups[0].rows[0]).toMatchObject({ type: 'lesson', title: 'Masse et Poids', exact: true });
  // Nothing in the best group is repeated below it.
  const below = groups.slice(1).flatMap((g) => g.rows.map((r) => r.key));
  expect(below).not.toContain(groups[0].rows[0].key);
});

it('keyword-only matches never count as best results', () => {
  const idx: SearchItem[] = [
    { type: 'action', title: 'Créer mon plan d’étude', keywords: 'chimie', nav: { kind: 'studyPlan' } },
    { type: 'lesson', title: 'Volume', keywords: 'chimie', subtitle: 'Chimie NS1', nav: { kind: 'lesson', courseId: 'c', lessonId: 'l' } },
  ];
  expect(rankResults(idx, 'chimie').some((g) => g.key === 'best')).toBe(false);
});

it('gives each row subject and class context', () => {
  expect(readableCourseMeta('CHEM · NSI', false)).toBe('Chimie · NS1');
  expect(readableCourseMeta('CHEM · NSI', true)).toBe('Chimi · NS1');
  expect(rowContext({ type: 'course', title: 'x', subtitle: 'MATH · NSIV', nav: { kind: 'course', courseId: 'm' } }, false)).toBe('Mathématiques · NS4');
});

it('reports a failed catalogue instead of caching "no courses"', async () => {
  expect(indexHealth([]).ok).toBe(false);
  mockExams = [];
  const idx = await getSearchIndex('ht', { force: true });
  expect(indexHealth(idx)).toMatchObject({ ok: false, missingExams: true, missingCourses: false });
  mockExams = [{ exam_id: 'e1', level: 'baccalaureat', subject: 'Chimie', year: 2023 }];
  // Not cached while unhealthy: the next call rebuilds and sees the exams.
  const again = await getSearchIndex('ht');
  expect(indexHealth(again).ok).toBe(true);
});

it('suggests real destinations when nothing matches every word', async () => {
  const idx = await getSearchIndex('fr', { force: true });
  expect(rankResults(idx, 'masse quantique')).toEqual([]);
  expect(suggestFor(idx, 'masse quantique').map((s) => s.title)).toEqual(['Masse et Poids']);
  expect(suggestFor(idx, 'zzz').map((s) => s.type)).toEqual(['course', 'course']);
});
