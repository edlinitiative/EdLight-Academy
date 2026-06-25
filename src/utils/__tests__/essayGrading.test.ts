import {
  countWords,
  analyzeWordCount,
  buildEssayRubric,
  buildGradingPrompt,
  normalizeGraderResponse,
  computeEssayScore,
  wordExpectation,
  type EssayRubric,
  type NormalizedGrade,
} from '../../../api/_lib/essayGrading';

describe('countWords / analyzeWordCount', () => {
  it('counts words ignoring extra whitespace', () => {
    expect(countWords('  one   two\nthree ')).toBe(3);
    expect(countWords('')).toBe(0);
    expect(countWords(null as unknown as string)).toBe(0);
  });

  it('classifies essay length against the expectation tiers', () => {
    const exp = wordExpectation('essay'); // submitMin 50, target 130, softMax 650
    expect(analyzeWordCount('', 'essay').status).toBe('empty');
    expect(analyzeWordCount('word '.repeat(exp.submitMin - 5), 'essay').status).toBe('too_short');
    expect(analyzeWordCount('word '.repeat(exp.submitMin + 10), 'essay').status).toBe('developing');
    expect(analyzeWordCount('word '.repeat(exp.developTarget + 10), 'essay').status).toBe('ok');
    expect(analyzeWordCount('word '.repeat(exp.softMax + 10), 'essay').status).toBe('long');
  });

  it('uses smaller thresholds for short_answer', () => {
    expect(analyzeWordCount('a b c', 'short_answer').status).toBe('too_short'); // < 5
    expect(analyzeWordCount('word '.repeat(30), 'short_answer').status).toBe('ok');
  });
});

describe('buildEssayRubric', () => {
  it('builds criteria from answer_parts and merges repeated labels', () => {
    const r = buildEssayRubric([
      { label: 'Thèse principale', answer: 'égalité', alternatives: ['equality'] },
      { label: 'Drawbacks', answer: 'limited jobs' },
      { label: 'Drawbacks', answer: 'fewer options' },
    ]);
    expect(r.hasContentRubric).toBe(true);
    expect(r.criteria).toHaveLength(2); // Drawbacks merged
    expect(r.criteria[0]).toMatchObject({ id: 1, label: 'Thèse principale' });
    expect(r.criteria[0].expected).toContain('égalité');
    expect(r.criteria[0].expected).toContain('equality'); // alternative folded in
    const drawbacks = r.criteria.find((c) => c.label === 'Drawbacks')!;
    expect(drawbacks.expected).toContain('limited jobs');
    expect(drawbacks.expected).toContain('fewer options');
  });

  it('drops boilerplate and passage-dependent placeholders', () => {
    const r = buildEssayRubric([
      { label: 'Matching pair 1', answer: 'x' },
      { label: 'Answer depends on the reading passage', answer: 'Depends' },
      { label: 'Point 2', answer: 'y' },
    ]);
    expect(r.hasContentRubric).toBe(false);
    expect(r.criteria).toHaveLength(0);
  });

  it('handles missing answer_parts', () => {
    expect(buildEssayRubric(undefined).hasContentRubric).toBe(false);
    expect(buildEssayRubric([]).criteria).toHaveLength(0);
  });
});

describe('buildGradingPrompt', () => {
  const rubric = buildEssayRubric([{ label: 'Thèse', answer: 'X' }, { label: 'Exemples', answer: 'Y' }]);
  const word = analyzeWordCount('word '.repeat(140), 'essay');

  it('lists every criterion and forbids the model from scoring', () => {
    const { system, user } = buildGradingPrompt({
      question: 'Are women equal to men?',
      answer: 'Yes, because...',
      modelAnswer: 'A model answer',
      rubric,
      word,
    });
    expect(system).toMatch(/minimum expectations/i);
    expect(system).toMatch(/Do NOT output any numeric score/i);
    expect(user).toContain('1. Thèse');
    expect(user).toContain('2. Exemples');
    expect(user).toContain("RÉPONSE DE L'ÉLÈVE");
  });
});

describe('normalizeGraderResponse', () => {
  const rubric: EssayRubric = buildEssayRubric([{ label: 'A', answer: '1' }, { label: 'B', answer: '2' }]);

  it('aligns criteria by id and clamps levels to 0..2', () => {
    const g = normalizeGraderResponse({
      criteria: [
        { id: 2, level: 5, comment: 'good', evidence: 'quote' },
        { id: 1, level: -3, comment: 'missing' },
      ],
      task_response: 1.7,
      organization: 'oops',
      language: 2,
      strengths: ['s1', '', 's2'],
      improvements: ['i1'],
      feedback: '  bravo  ',
    }, rubric);
    expect(g.criteria).toHaveLength(2);
    expect(g.criteria[0]).toMatchObject({ id: 1, label: 'A', level: 0 }); // -3 → 0
    expect(g.criteria[1]).toMatchObject({ id: 2, label: 'B', level: 2 }); // 5 → 2
    expect(g.taskResponse).toBe(2); // 1.7 → round → 2
    expect(g.organization).toBe(0); // NaN → 0
    expect(g.strengths).toEqual(['s1', 's2']);
    expect(g.feedback).toBe('bravo');
  });

  it('defaults gracefully on garbage input', () => {
    const g = normalizeGraderResponse(null, rubric);
    expect(g.criteria.every((c) => c.level === 0)).toBe(true);
    expect(g.strengths).toEqual([]);
    expect(g.feedback).toBe('');
  });
});

describe('computeEssayScore', () => {
  const rubric = buildEssayRubric([{ label: 'A', answer: '1' }, { label: 'B', answer: '2' }, { label: 'C', answer: '3' }]);
  const okWord = analyzeWordCount('word '.repeat(200), 'essay');

  const grade = (overrides: Partial<NormalizedGrade> = {}): NormalizedGrade => ({
    criteria: [
      { id: 1, label: 'A', level: 2, evidence: '', comment: '' },
      { id: 2, label: 'B', level: 2, evidence: '', comment: '' },
      { id: 3, label: 'C', level: 2, evidence: '', comment: '' },
    ],
    taskResponse: 2,
    organization: 2,
    language: 2,
    strengths: [],
    improvements: [],
    feedback: '',
    ...overrides,
  });

  it('awards full marks when every axis is maxed and length is adequate', () => {
    const s = computeEssayScore({ grade: grade(), rubric, word: okWord, points: 20 });
    expect(s.ratio).toBe(1);
    expect(s.awarded).toBe(20);
    expect(s.isCorrect).toBe(true);
    expect(s.capped).toBe(false);
  });

  it('is deterministic (same input → same score)', () => {
    const a = computeEssayScore({ grade: grade(), rubric, word: okWord, points: 20 });
    const b = computeEssayScore({ grade: grade(), rubric, word: okWord, points: 20 });
    expect(a).toEqual(b);
  });

  it('gives proportional partial credit on content', () => {
    const partial = grade({
      criteria: [
        { id: 1, label: 'A', level: 2, evidence: '', comment: '' },
        { id: 2, label: 'B', level: 0, evidence: '', comment: '' },
        { id: 3, label: 'C', level: 0, evidence: '', comment: '' },
      ],
      taskResponse: 1, organization: 1, language: 1,
    });
    const s = computeEssayScore({ grade: partial, rubric, word: okWord, points: 20 });
    expect(s.ratio).toBeGreaterThan(0);
    expect(s.ratio).toBeLessThan(0.6);
    expect(s.contentRatio).toBeCloseTo(2 / 6, 3);
  });

  it('caps a too-short answer at 0.35 regardless of quality', () => {
    const shortWord = analyzeWordCount('word '.repeat(20), 'essay'); // < submitMin 50
    const s = computeEssayScore({ grade: grade(), rubric, word: shortWord, points: 20 });
    expect(s.ratio).toBeLessThanOrEqual(0.35);
    expect(s.capped).toBe(true);
  });

  it('caps a developing-length answer at 0.8', () => {
    const devWord = analyzeWordCount('word '.repeat(70), 'essay'); // 50..130
    const s = computeEssayScore({ grade: grade(), rubric, word: devWord, points: 20 });
    expect(s.ratio).toBeLessThanOrEqual(0.8);
    expect(s.capped).toBe(true);
  });

  it('scores essays without a content rubric from the competency axes', () => {
    const empty = buildEssayRubric([]);
    const g = grade({ criteria: [] });
    const s = computeEssayScore({ grade: g, rubric: empty, word: okWord, points: 10 });
    expect(s.ratio).toBe(1); // all axes maxed
    const weak = computeEssayScore({
      grade: grade({ criteria: [], taskResponse: 0, organization: 1, language: 1 }),
      rubric: empty, word: okWord, points: 10,
    });
    expect(weak.ratio).toBeLessThan(0.6);
  });

  it('formats the score string as x/10 for the front-end contract', () => {
    const s = computeEssayScore({ grade: grade(), rubric, word: okWord, points: 20 });
    expect(s.score).toMatch(/^\d+(\.\d)?\/10$/);
  });
});
