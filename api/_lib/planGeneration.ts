/**
 * api/_lib/planGeneration.ts — study-plan generation core.
 *
 * Extracted from api/generate-plan.ts so the Sandra tool loop
 * (`save_study_plan`) and the POST /api/generate-plan endpoint share one
 * implementation. The original endpoint fetched OpenAI directly with
 * OPENAI_API_KEY / edlight_chatgpt_api — both dead — so it ALWAYS fell back
 * to the static plan. This core routes through the provider-agnostic
 * `chatJSON()` client instead (production pins LLM_PROVIDER=gemini) and only
 * falls back when no provider is configured or the model call/parse fails.
 *
 * The prompt text and the French fallback plan are kept verbatim from the
 * original endpoint. The model's `schedule[]` is a list of
 * { week, day, type, subject, focusArea, examDifficulty, rationale } that the
 * caller maps to actual exam IDs from the catalog.
 */

import { chatJSON, resolveLLMConfig } from './llm';

export interface PlanRequest {
  track: string;
  subjects: string[];
  performance: Record<string, { avgScore?: number; pct?: number; attempts?: number }>;
  examCount: number;
  dailyMinutes: number;
  weeks: number;
}

export interface GeneratedPlan {
  title: string;
  description: string;
  weeklyGoals: number;
  dailyTargetMinutes: number;
  tips: string[];
  schedule: Array<Record<string, unknown>>;
}

const sanitize = (s: string): string =>
  String(s)
    .replace(/[^a-zA-Z0-9\s\-'àèìòùâêîôûäëïöüéÉÈÊëçÇ&]/g, '')
    .slice(0, 200);

/** Static French plan used whenever the model path is unavailable. */
export function buildFallbackPlan(reqData: PlanRequest): GeneratedPlan {
  const safeTrack = sanitize(reqData.track);
  const isPrefac = safeTrack === 'PREFAC';
  return {
    title: isPrefac ? "Plan d'étude — Concours d'admission" : `Plan d'étude — ${safeTrack}`,
    description: isPrefac
      ? `Plan personnalisé pour les concours d'admission à l'université sur ${reqData.weeks} semaines.`
      : `Plan personnalisé pour la filière ${safeTrack} sur ${reqData.weeks} semaines.`,
    weeklyGoals: reqData.weeks,
    dailyTargetMinutes: reqData.dailyMinutes,
    tips: [
      'Commencez par les matières où vous avez le plus de difficulté.',
      'Révisez les matières à fort coefficient en priorité.',
      'Alternez entre examens, exercices pratiques et vidéos pour varier.',
      'Pratiquez au moins un examen ou exercice par jour.',
      'Utilisez les indices (hints) avant de regarder les corrections.',
    ],
    schedule: [],
  };
}

/** Prompt kept verbatim from the original api/generate-plan.ts. */
function buildPlanPrompt(reqData: PlanRequest): { system: string; user: string } {
  const { subjects, performance, examCount, dailyMinutes, weeks } = reqData;
  const safeTrack = sanitize(reqData.track);

  const perfLines = Object.entries(performance)
    .map(([subj, data]) => {
      const pct = data?.avgScore ?? data?.pct ?? '?';
      const attempts = data?.attempts ?? 0;
      return `  - ${subj}: avg ${pct}% (${attempts} attempts)`;
    })
    .join('\n');

  // Préfac plans prep university-entrance concours, not the Bac.
  const isPrefac = safeTrack === 'PREFAC';
  const subjectList = subjects.length
    ? subjects.map(sanitize).join(', ')
    : isPrefac
      ? "les matières du concours d'admission"
      : 'all Bac subjects';

  const weakSubjects =
    Object.entries(performance)
      .filter(([, d]) => (d?.avgScore ?? d?.pct ?? 100) < 60)
      .map(([s]) => s)
      .join(', ') || 'none identified yet';

  const strongSubjects =
    Object.entries(performance)
      .filter(([, d]) => (d?.avgScore ?? d?.pct ?? 0) >= 75)
      .map(([s]) => s)
      .join(', ') || 'none identified yet';

  const system = isPrefac
    ? `You are a study plan advisor for Haitian students preparing university-entrance exams (concours d'admission / "préfac") on the EdLight Academy platform.
You create personalised, spaced-repetition study schedules built on past concours papers.
Output ONLY valid JSON with the exact structure specified.`
    : `You are a study plan advisor for Haitian Baccalauréat students on the EdLight Academy platform.
You create personalised, spaced-repetition study schedules.
The student's track (filière) is "${safeTrack}".
Output ONLY valid JSON with the exact structure specified.`;

  const audience = isPrefac ? "university-entrance (concours d'admission)" : `${safeTrack}`;
  const user = `Create a ${weeks}-week study plan for a ${audience} student.

Student performance:
${perfLines || '  No prior data — first-time student.'}

Weak subjects: ${weakSubjects}
Strong subjects: ${strongSubjects}
Daily study time: ${dailyMinutes} minutes
Subjects to cover: ${subjectList}
Total exams to schedule: ${examCount}

Rules:
1. Focus MORE time on weak subjects and high-coefficient subjects.
2. Use spaced repetition: revisit weak topics 2-3 times across weeks.
3. Mix difficult and easy exams each day for motivation.
4. Include rest days (1/week recommended).
5. Build complexity gradually (easier exams first, harder later).
6. Mix task types: use "exam" for full exam practice, "practice" for short quiz exercises, and "video" for watching lesson videos.
7. Start each subject with a video, then practice exercises, then full exams.

Return ONLY valid JSON:
{
  "title": "string — motivational plan title in French",
  "description": "string — 1-2 sentence description in French",
  "weeklyGoals": ${weeks},
  "dailyTargetMinutes": ${dailyMinutes},
  "tips": ["string — 4-6 personalised study tips in French"],
  "schedule": [
    {
      "week": 1,
      "day": 1,
      "type": "exam | practice | video",
      "subject": "exact canonical subject name",
      "focusArea": "specific topic like 'Dérivées' or 'Acides & Bases'",
      "examDifficulty": 1-5,
      "rationale": "brief reason in French"
    }
  ]
}`;

  return { system, user };
}

const toPositiveInt = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Coerce arbitrary model output into GeneratedPlan; null when unusable. */
function normalizePlan(raw: unknown, reqData: PlanRequest): GeneratedPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;
  return {
    title,
    description: typeof obj.description === 'string' ? obj.description.trim() : '',
    weeklyGoals: toPositiveInt(obj.weeklyGoals, reqData.weeks),
    dailyTargetMinutes: toPositiveInt(obj.dailyTargetMinutes, reqData.dailyMinutes),
    tips: Array.isArray(obj.tips)
      ? obj.tips.map((t) => String(t ?? '').trim()).filter(Boolean)
      : [],
    schedule: Array.isArray(obj.schedule)
      ? (obj.schedule.filter((e) => e && typeof e === 'object' && !Array.isArray(e)) as Array<Record<string, unknown>>)
      : [],
  };
}

/**
 * Generate a study plan via the configured LLM provider, falling back to the
 * static French plan when no provider is configured or the call/parse fails.
 * Never throws — the fallback plan is always a valid answer.
 */
export async function generatePlanCore(reqData: PlanRequest): Promise<{ plan: GeneratedPlan; source: 'ai' | 'fallback' }> {
  const config = resolveLLMConfig();
  if (!config) {
    return { plan: buildFallbackPlan(reqData), source: 'fallback' };
  }

  try {
    const { system, user } = buildPlanPrompt(reqData);
    const raw = await chatJSON({ system, user, temperature: 0.4, maxTokens: 3000, timeoutMs: 45000, config });
    const plan = normalizePlan(raw, reqData);
    if (!plan) {
      console.error('generatePlanCore: model response had no usable plan');
      return { plan: buildFallbackPlan(reqData), source: 'fallback' };
    }
    return { plan, source: 'ai' };
  } catch (err) {
    console.error('generatePlanCore error:', err);
    return { plan: buildFallbackPlan(reqData), source: 'fallback' };
  }
}
