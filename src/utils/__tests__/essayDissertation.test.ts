/**
 * Dissertation rubric profile (api/_lib/essayGrading.ts) and its selection by
 * POST /api/grade-essay. French and philosophy essays are marked on the Bac's
 * structure (introduction + problématique, plan, argumentation + examples,
 * conclusion) plus the language axis; everything else is unchanged.
 */
jest.mock('../../../api/_lib/requireAuth', () => ({ requireAuth: jest.fn() }));
jest.mock('../../../api/_lib/rateLimit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('../../../api/_lib/llm', () => {
  class LLMError extends Error {
    status: number;
    provider: string;
    constructor(message: string, status = 0, provider = '') {
      super(message);
      this.status = status;
      this.provider = provider;
    }
  }
  return {
    LLMError,
    chatJSON: jest.fn(),
    resolveLLMConfig: jest.fn(() => ({ provider: 'gemini', label: 'gemini (test)', apiKey: 'k', baseUrl: '', model: 'm' })),
  };
});

import handler from '../../../api/grade-essay';
import {
  analyzeWordCount,
  buildEssayRubric,
  buildGradingPrompt,
  computeEssayScore,
  DISSERTATION_CRITERIA,
  normalizeGraderResponse,
  selectRubricProfile,
} from '../../../api/_lib/essayGrading';
import { requireAuth } from '../../../api/_lib/requireAuth';
import { checkRateLimit } from '../../../api/_lib/rateLimit';
import { chatJSON, LLMError } from '../../../api/_lib/llm';

const chatJSONMock = chatJSON as jest.Mock;

function makeRes() {
  const res: any = { statusCode: 0, headers: {}, body: undefined };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; return res; };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
}

const LONG_ESSAY = Array.from({ length: 160 }, (_, i) => `mot${i}`).join(' ');

beforeEach(() => {
  (requireAuth as jest.Mock).mockResolvedValue('uid-1');
  (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true, remaining: 19, resetAt: Date.now() + 3600_000 });
  chatJSONMock.mockResolvedValue({
    criteria: [{ id: 1, level: 2 }, { id: 2, level: 1 }, { id: 3, level: 2 }, { id: 4, level: 1 }],
    task_response: 2, organization: 1, language: 1,
    strengths: ['Bonne problématique'], improvements: ['Ajoute des exemples'], feedback: 'Bien.',
  });
});

describe('selectRubricProfile', () => {
  it('marks French and philosophy essays as dissertations', () => {
    expect(selectRubricProfile({ subject: 'Français', type: 'essay' })).toBe('dissertation');
    expect(selectRubricProfile({ subject: 'Philosophie', type: 'essay' })).toBe('dissertation');
    expect(selectRubricProfile({ subject: 'philosophie (esthétique)', type: 'essay' })).toBe('dissertation');
  });

  it('recognises a dissertation statement in any subject', () => {
    expect(selectRubricProfile({ subject: 'Histoire-Géo', type: 'essay', question: 'Sujet de dissertation : la Révolution haïtienne.' })).toBe('dissertation');
  });

  it('never applies to short answers or other subjects', () => {
    expect(selectRubricProfile({ subject: 'Français', type: 'short_answer' })).toBe('standard');
    expect(selectRubricProfile({ subject: 'SVT', type: 'essay', question: 'Expliquez la photosynthèse.' })).toBe('standard');
    expect(selectRubricProfile({})).toBe('standard');
  });
});

describe('dissertation rubric', () => {
  it('adds the four structural criteria after the authored content points', () => {
    const rubric = buildEssayRubric([{ label: 'Thèse', answer: 'La liberté est une conquête' }], 'dissertation');
    expect(rubric.profile).toBe('dissertation');
    expect(rubric.criteria.map((c) => c.label)).toEqual(['Thèse', ...DISSERTATION_CRITERIA.map((c) => c.label)]);
    expect(rubric.criteria.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives a key-less dissertation a real rubric instead of three generic axes', () => {
    expect(buildEssayRubric([], 'standard').hasContentRubric).toBe(false);
    const rubric = buildEssayRubric([], 'dissertation');
    expect(rubric.hasContentRubric).toBe(true);
    expect(rubric.criteria).toHaveLength(4);
  });

  it('does not duplicate a structural criterion the author already wrote', () => {
    const rubric = buildEssayRubric([{ label: 'Conclusion', answer: 'Répondre à la problématique' }], 'dissertation');
    expect(rubric.criteria.filter((c) => c.label === 'Conclusion')).toHaveLength(1);
  });

  it('tells the grader it is marking a Bac dissertation', () => {
    const rubric = buildEssayRubric([], 'dissertation');
    const { system, user } = buildGradingPrompt({
      question: 'La liberté a-t-elle des limites ?', answer: LONG_ESSAY, subject: 'Philosophie',
      rubric, word: analyzeWordCount(LONG_ESSAY, 'essay'),
    });
    expect(system).toContain('DISSERTATION');
    expect(system).toContain('problématique');
    expect(user).toContain('Introduction et problématique');
    expect(user).toContain('EXERCICE: dissertation');
  });

  it('keeps the standard prompt unchanged for other essays', () => {
    const rubric = buildEssayRubric([{ label: 'A', answer: '1' }]);
    const { system, user } = buildGradingPrompt({ question: 'Q', answer: LONG_ESSAY, rubric, word: analyzeWordCount(LONG_ESSAY, 'essay') });
    expect(system).not.toContain('DISSERTATION');
    expect(user).not.toContain('EXERCICE: dissertation');
  });

  it('scores structure: no problématique and no plan cannot reach full marks', () => {
    const rubric = buildEssayRubric([], 'dissertation');
    const word = analyzeWordCount(LONG_ESSAY, 'essay');
    const weak = normalizeGraderResponse({
      criteria: [{ id: 1, level: 0 }, { id: 2, level: 0 }, { id: 3, level: 2 }, { id: 4, level: 1 }],
      task_response: 2, organization: 2, language: 2,
    }, rubric);
    const strong = normalizeGraderResponse({
      criteria: [1, 2, 3, 4].map((id) => ({ id, level: 2 })),
      task_response: 2, organization: 2, language: 2,
    }, rubric);
    expect(computeEssayScore({ grade: weak, rubric, word, points: 20 }).ratio).toBeLessThan(0.7);
    expect(computeEssayScore({ grade: strong, rubric, word, points: 20 }).ratio).toBe(1);
  });
});

describe('POST /api/grade-essay rubric selection', () => {
  it('grades a French essay with the dissertation rubric and says so', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { question: 'Dissertez sur le roman.', answer: LONG_ESSAY, subject: 'Français', type: 'essay' } } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.graded).toBe(true);
    expect(res.body.rubricProfile).toBe('dissertation');
    expect(res.body.criteria.map((c: any) => c.label)).toEqual(DISSERTATION_CRITERIA.map((c) => c.label));
    const { user } = chatJSONMock.mock.calls[0][0];
    expect(user).toContain('Argumentation et exemples');
  });

  it('keeps the standard rubric for a science essay', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: {
      question: 'Expliquez la photosynthèse.', answer: LONG_ESSAY, subject: 'SVT', type: 'essay',
      answerParts: [{ label: 'Chlorophylle', answer: 'capte la lumière' }],
    } } as any, res);

    expect(res.body.rubricProfile).toBe('standard');
    expect(res.body.criteria.map((c: any) => c.label)).toEqual(['Chlorophylle']);
  });

  it('answers graded:false (never a score) when the provider fails', async () => {
    chatJSONMock.mockRejectedValue(new LLMError('boom', 503, 'gemini'));
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { question: 'Q', answer: LONG_ESSAY, subject: 'Français' } } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.graded).toBe(false);
    expect(res.body.score).toBe('N/A');
    expect(res.body.wordStatus).not.toBe('too_short');
  });
});
