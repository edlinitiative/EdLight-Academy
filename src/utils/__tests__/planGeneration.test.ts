/**
 * Unit tests for api/_lib/planGeneration.ts — the study-plan generation core
 * extracted from api/generate-plan.ts.
 *
 * `_lib/llm` is fully mocked: the core must consult resolveLLMConfig() to
 * decide fallback vs. AI, route the AI path through chatJSON() (provider
 * agnostic — NOT a direct OpenAI fetch), and normalize whatever the model
 * returns into the GeneratedPlan shape.
 */

jest.mock('../../../api/_lib/llm', () => {
  class LLMError extends Error {
    status: number;
    provider: string;
    constructor(message: string, status = 0, provider = '') {
      super(message);
      this.name = 'LLMError';
      this.status = status;
      this.provider = provider;
    }
  }
  return {
    LLMError,
    chatJSON: jest.fn(),
    resolveLLMConfig: jest.fn(),
  };
});

import { buildFallbackPlan, generatePlanCore, PlanRequest } from '../../../api/_lib/planGeneration';
import { chatJSON, resolveLLMConfig, LLMError } from '../../../api/_lib/llm';

const chatJSONMock = chatJSON as jest.Mock;
const resolveLLMConfigMock = resolveLLMConfig as jest.Mock;

const GEMINI_CONFIG = {
  provider: 'gemini',
  label: 'gemini (gemini-2.5-flash)',
  apiKey: 'AIza-test',
  baseUrl: '',
  model: 'gemini-2.5-flash',
};

function makeRequest(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    track: 'SVT',
    subjects: ['Mathématiques', 'Physique'],
    performance: {
      Physique: { avgScore: 45, attempts: 3 },
      Mathématiques: { pct: 82, attempts: 5 },
    },
    examCount: 20,
    dailyMinutes: 90,
    weeks: 8,
    ...overrides,
  };
}

const validModelPlan = {
  title: 'En route vers le Bac !',
  description: 'Un plan sur 8 semaines centré sur la physique.',
  weeklyGoals: 8,
  dailyTargetMinutes: 90,
  tips: ['Révisez chaque jour.', 'Commencez par la physique.'],
  schedule: [
    { week: 1, day: 1, type: 'video', subject: 'Physique', focusArea: 'Optique', examDifficulty: 2, rationale: 'Base faible' },
  ],
};

beforeEach(() => {
  resolveLLMConfigMock.mockReturnValue(GEMINI_CONFIG);
  chatJSONMock.mockResolvedValue(validModelPlan);
});

describe('buildFallbackPlan', () => {
  it('builds a French fallback plan from the request (empty schedule, 5 tips)', () => {
    const plan = buildFallbackPlan(makeRequest({ track: 'SMP', weeks: 6, dailyMinutes: 60 }));

    expect(plan.title).toBe("Plan d'étude — SMP");
    expect(plan.description).toContain('SMP');
    expect(plan.description).toContain('6 semaines');
    expect(plan.weeklyGoals).toBe(6);
    expect(plan.dailyTargetMinutes).toBe(60);
    expect(plan.tips).toHaveLength(5);
    expect(plan.tips[0]).toBe('Commencez par les matières où vous avez le plus de difficulté.');
    expect(plan.schedule).toEqual([]);
  });

  it('sanitizes the track before interpolating it', () => {
    const plan = buildFallbackPlan(makeRequest({ track: 'SVT<script>{}' }));
    expect(plan.title).toBe("Plan d'étude — SVTscript");
  });
});

describe('generatePlanCore', () => {
  it('falls back without calling the model when no provider is configured', async () => {
    resolveLLMConfigMock.mockReturnValue(null);
    const reqData = makeRequest();

    const { plan, source } = await generatePlanCore(reqData);

    expect(source).toBe('fallback');
    expect(plan).toEqual(buildFallbackPlan(reqData));
    expect(chatJSONMock).not.toHaveBeenCalled();
  });

  it('sends the original prompt through chatJSON (weak/strong lines, performance, constraints)', async () => {
    await generatePlanCore(makeRequest());

    expect(chatJSONMock).toHaveBeenCalledTimes(1);
    const params = chatJSONMock.mock.calls[0][0];

    expect(params.config).toBe(GEMINI_CONFIG);
    expect(params.system).toContain('study plan advisor for Haitian Baccalauréat students');
    expect(params.system).toContain('The student\'s track (filière) is "SVT".');

    expect(params.user).toContain('Create a 8-week study plan for a SVT student.');
    expect(params.user).toContain('- Physique: avg 45% (3 attempts)');
    expect(params.user).toContain('- Mathématiques: avg 82% (5 attempts)');
    expect(params.user).toContain('Weak subjects: Physique');
    expect(params.user).toContain('Strong subjects: Mathématiques');
    expect(params.user).toContain('Daily study time: 90 minutes');
    expect(params.user).toContain('Subjects to cover: Mathématiques, Physique');
    expect(params.user).toContain('Total exams to schedule: 20');
    expect(params.user).toContain('"weeklyGoals": 8');
    expect(params.user).toContain('"dailyTargetMinutes": 90');
  });

  it('notes first-time students and "none identified yet" when there is no performance data', async () => {
    await generatePlanCore(makeRequest({ performance: {}, subjects: [] }));

    const params = chatJSONMock.mock.calls[0][0];
    expect(params.user).toContain('No prior data — first-time student.');
    expect(params.user).toContain('Weak subjects: none identified yet');
    expect(params.user).toContain('Strong subjects: none identified yet');
    expect(params.user).toContain('Subjects to cover: all Bac subjects');
  });

  it('returns the model plan with source "ai" on success', async () => {
    const { plan, source } = await generatePlanCore(makeRequest());

    expect(source).toBe('ai');
    expect(plan).toEqual(validModelPlan);
  });

  it('normalizes a messy model response into the GeneratedPlan shape', async () => {
    chatJSONMock.mockResolvedValue({
      title: '  Plan intensif  ',
      description: 42, // not a string
      weeklyGoals: 'not-a-number',
      dailyTargetMinutes: -5,
      tips: ['Bon conseil.', '', null, 7],
      schedule: [{ week: 1, day: 1 }, 'garbage', null],
    });

    const { plan, source } = await generatePlanCore(makeRequest({ weeks: 8, dailyMinutes: 90 }));

    expect(source).toBe('ai');
    expect(plan.title).toBe('Plan intensif');
    expect(typeof plan.description).toBe('string');
    expect(plan.weeklyGoals).toBe(8); // falls back to requested weeks
    expect(plan.dailyTargetMinutes).toBe(90); // falls back to requested minutes
    expect(plan.tips).toEqual(['Bon conseil.', '7']);
    expect(plan.schedule).toEqual([{ week: 1, day: 1 }]);
  });

  it('falls back when the model response has no title', async () => {
    chatJSONMock.mockResolvedValue({ description: 'sans titre', schedule: [] });
    const reqData = makeRequest();

    const { plan, source } = await generatePlanCore(reqData);

    expect(source).toBe('fallback');
    expect(plan).toEqual(buildFallbackPlan(reqData));
  });

  it('falls back when the model response is not an object', async () => {
    chatJSONMock.mockResolvedValue(['not', 'a', 'plan']);

    const { source } = await generatePlanCore(makeRequest());
    expect(source).toBe('fallback');
  });

  it('falls back when chatJSON throws (never propagates the error)', async () => {
    chatJSONMock.mockRejectedValue(new LLMError('Gemini 500: boom', 500, 'gemini'));
    const reqData = makeRequest();

    const { plan, source } = await generatePlanCore(reqData);

    expect(source).toBe('fallback');
    expect(plan).toEqual(buildFallbackPlan(reqData));
  });
});
