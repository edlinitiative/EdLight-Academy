/**
 * Vercel serverless function: POST /api/generate-plan
 * ────────────────────────────────────────────────────
 * Thin HTTP wrapper around api/_lib/planGeneration.ts, which generates a
 * personalised study plan through the provider-agnostic LLM client
 * (production is pinned to Gemini via LLM_PROVIDER) with a static French
 * fallback plan when no provider is configured or the model call fails.
 *
 * Request body:
 *   { track, subjects, performance, examCount, preferences? }
 *
 * Response:
 *   { plan: { title, description, weeklyGoals, dailyTargetMinutes, tips[], schedule[] }, source: 'ai' | 'fallback' }
 *
 * The schedule[] is a list of { week, day, type, subject, focusArea, examDifficulty, rationale }.
 * The client then maps those to actual exam IDs from the catalog.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';
import { buildFallbackPlan, generatePlanCore } from './_lib/planGeneration';
import type { PlanRequest } from './_lib/planGeneration';

interface PerformanceEntry {
  avgScore?: number;
  pct?: number;
  attempts?: number;
}

interface PlanPreferences {
  dailyMinutes?: number;
  weeks?: number;
}

interface GeneratePlanBody {
  track?: string;
  subjects?: string[];
  performance?: Record<string, PerformanceEntry>;
  examCount?: number;
  preferences?: PlanPreferences;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'generate-plan');
  if (!allowed) {
    res.setHeader('X-RateLimit-Limit', '5');
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Trop de requêtes. Réessayez dans une heure.',
    });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  // ── Input ───────────────────────────────────────────────────────────
  const {
    track = 'SVT',
    subjects = [],
    performance = {},
    examCount = 20,
    preferences = {},
  }: GeneratePlanBody = req.body || {};

  const reqData: PlanRequest = {
    track,
    subjects,
    performance,
    examCount,
    dailyMinutes: preferences.dailyMinutes || 90,
    weeks: preferences.weeks || 8,
  };

  try {
    const { plan, source } = await generatePlanCore(reqData);
    res.status(200).json({ plan, source });
  } catch (err) {
    // generatePlanCore never throws by contract; this is belt-and-braces so
    // the endpoint still answers 200 with a usable plan, as it always has.
    console.error('generate-plan error:', err);
    res.status(200).json({ plan: buildFallbackPlan(reqData), source: 'fallback' });
  }
}
