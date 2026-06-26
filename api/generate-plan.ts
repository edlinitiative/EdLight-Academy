/**
 * Vercel serverless function: POST /api/generate-plan
 * ────────────────────────────────────────────────────
 * Generates a personalised study plan using OpenAI (GPT-4o-mini).
 *
 * Request body:
 *   { track, subjects, performance, examCount, preferences? }
 *
 * Response:
 *   { plan: { title, description, weeklyGoals, dailyTargetMinutes, tips[], schedule[] } }
 *
 * The schedule[] is a list of { week, day, subject, focusArea, examDifficulty, rationale }.
 * The client then maps those to actual exam IDs from the catalog.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';

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

interface StudyPlan {
  title: string;
  description: string;
  weeklyGoals: number;
  dailyTargetMinutes: number;
  tips: string[];
  schedule: unknown[];
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

  const sanitize = (s: string): string =>
    String(s)
      .replace(/[^a-zA-Z0-9\s\-'àèìòùâêîôûäëïöüéÉÈÊëçÇ&]/g, '')
      .slice(0, 200);

  const safeTrack = sanitize(track);

  // Build performance summary for the prompt
  const perfLines = Object.entries(performance)
    .map(([subj, data]) => {
      const pct = data?.avgScore ?? data?.pct ?? '?';
      const attempts = data?.attempts ?? 0;
      return `  - ${subj}: avg ${pct}% (${attempts} attempts)`;
    })
    .join('\n');

  const subjectList = subjects.length
    ? subjects.map(sanitize).join(', ')
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

  const dailyMinutes = preferences.dailyMinutes || 90;
  const weeksAvailable = preferences.weeks || 8;

  // ── Fallback plan (no API key) ─────────────────────────────────────
  const fallbackPlan = (): StudyPlan => ({
    title: `Plan d'étude — ${safeTrack}`,
    description: `Plan personnalisé pour la filière ${safeTrack} sur ${weeksAvailable} semaines.`,
    weeklyGoals: weeksAvailable,
    dailyTargetMinutes: dailyMinutes,
    tips: [
      'Commencez par les matières où vous avez le plus de difficulté.',
      'Révisez les matières à fort coefficient en priorité.',
      'Alternez entre examens, exercices pratiques et vidéos pour varier.',
      'Pratiquez au moins un examen ou exercice par jour.',
      'Utilisez les indices (hints) avant de regarder les corrections.',
    ],
    schedule: [],
  });

  const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.edlight_chatgpt_api;

  if (!OPENAI_KEY) {
    res.status(200).json({ plan: fallbackPlan(), source: 'fallback' });
    return;
  }

  // ── AI generation ──────────────────────────────────────────────────
  try {
    const prompt = [
      {
        role: 'system',
        content: `You are a study plan advisor for Haitian Baccalauréat students on the EdLight Academy platform.
You create personalised, spaced-repetition study schedules.
The student's track (filière) is "${safeTrack}".
Output ONLY valid JSON with the exact structure specified.`,
      },
      {
        role: 'user',
        content: `Create a ${weeksAvailable}-week study plan for a ${safeTrack} student.

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
  "weeklyGoals": ${weeksAvailable},
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
}`,
      },
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: prompt,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI error', resp.status, errText);
      res.status(200).json({ plan: fallbackPlan(), source: 'fallback' });
      return;
    }

    const data = await resp.json();
    const raw: string = data?.choices?.[0]?.message?.content || '';

    let parsed: StudyPlan | undefined;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        parsed = JSON.parse(raw.slice(first, last + 1));
      }
    }

    if (!parsed || !parsed.title) {
      res.status(200).json({ plan: fallbackPlan(), source: 'fallback-parse' });
      return;
    }

    res.status(200).json({ plan: parsed, source: 'openai' });
  } catch (err) {
    console.error('generate-plan error:', err);
    res.status(200).json({ plan: fallbackPlan(), source: 'fallback-error' });
  }
}
