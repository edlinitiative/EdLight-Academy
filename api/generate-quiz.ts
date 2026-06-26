// Vercel serverless function for generating a Perseus item.
// NOTE: For a real integration, set OPENAI_API_KEY in Vercel env vars
// and call OpenAI APIs here, then map the response into a Perseus item.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/requireAuth';
import { checkRateLimit } from './_lib/rateLimit';

interface AIChoice {
  content?: string;
  text?: string;
  correct?: boolean;
}

interface AIQuiz {
  question?: string;
  choices?: AIChoice[];
  hints?: string[];
  explanation?: string;
}

interface PerseusItem {
  question: {
    content: string;
    images: Record<string, unknown>;
    widgets: Record<string, unknown>;
  };
  answerArea: { calculator: boolean };
  hints: Array<{ content: string }>;
  itemDataVersion: { major: number; minor: number };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Verify Firebase auth token to prevent unauthorized access
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { allowed, remaining, resetAt } = await checkRateLimit(uid, 'generate-quiz');
  if (!allowed) {
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(Math.ceil((resetAt - Date.now()) / 1000)));
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Trop de requêtes. Réessayez dans une heure.',
    });
    return;
  }
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  const OPENAI_KEY = process.env.OPENAI_API_KEY || process.env.edlight_chatgpt_api;

  const buildPerseusFromAI = (ai: AIQuiz): PerseusItem => {
    const question = (ai.question || '').toString();
    const choices = Array.isArray(ai.choices) ? ai.choices : [];
    const hints = Array.isArray(ai.hints) ? ai.hints : [];
    const content = `${question}\n\n[[☃ multiple-choice 1]]`;
    return {
      question: {
        content,
        images: {},
        widgets: {
          'multiple-choice 1': {
            type: 'multiple-choice',
            graded: true,
            options: {
              choices: choices.map((c) => ({
                content: c.content || c.text || '',
                correct: !!c.correct,
              })),
              randomize: true,
            },
            version: { major: 0, minor: 0 },
          },
        },
      },
      answerArea: { calculator: false },
      hints: hints.map((h) => ({ content: h })),
      itemDataVersion: { major: 0, minor: 1 },
    };
  };

  const fallback = (): PerseusItem => ({
    question: {
      content: `What is the value of $x$ in $2x + 6 = 10$?\n\n[[☃ multiple-choice 1]]`,
      images: {},
      widgets: {
        'multiple-choice 1': {
          type: 'multiple-choice',
          graded: true,
          options: {
            choices: [
              { content: '$1$', correct: false },
              { content: '$2$', correct: true },
              { content: '$3$', correct: false },
              { content: '$4$', correct: false },
            ],
            randomize: true,
          },
          version: { major: 0, minor: 0 },
        },
      },
    },
    answerArea: { calculator: false },
    hints: [
      { content: 'Subtract $6$ from both sides to get $2x=4$.' },
      { content: 'Divide both sides by $2$ to get $x=2$.' },
    ],
    itemDataVersion: { major: 0, minor: 1 },
  });

  try {
    const { topic = 'algebra', level = 'NS I', difficulty = 'easy' } = (req.body || {}) as {
      topic?: string;
      level?: string;
      difficulty?: string;
    };

    // Sanitize inputs to prevent prompt injection
    const sanitize = (str: string): string =>
      String(str).replace(/[^a-zA-Z0-9\s\-'àèìòùâêîôûäëïöüéÈ]/g, '').slice(0, 100);
    const safeTopic = sanitize(topic);
    const safeLevel = sanitize(level);
    const safeDifficulty = sanitize(difficulty);

    if (!OPENAI_KEY) {
      res.status(200).json({ item: fallback(), meta: { topic: safeTopic, level: safeLevel, source: 'fallback' } });
      return;
    }

    const prompt = [
      {
        role: 'system',
        content:
          'You are a quiz generator for EdLight Academy. Produce a single multiple-choice math question suitable for the given topic and level. Output JSON only.',
      },
      {
        role: 'user',
        content: `Generate a multiple-choice question. Constraints:\n- Topic: ${safeTopic}\n- Level: ${safeLevel}\n- Difficulty: ${safeDifficulty}\n- Use LaTeX math wrapped in $...$ when helpful.\n- Return ONLY valid JSON with keys: question (markdown string), choices (array of {content, correct}), hints (array of strings), explanation (string). Exactly one choice must have correct=true.`,
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
        temperature: 0.3,
        messages: prompt,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('OpenAI error', resp.status, text);
      res.status(200).json({ item: fallback(), meta: { topic, level, source: 'fallback' } });
      return;
    }

    const data = await resp.json();
    const raw: string = data?.choices?.[0]?.message?.content || '';

    let parsed: AIQuiz | undefined;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Attempt to extract JSON substring
      const first = raw.indexOf('{');
      const last = raw.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        parsed = JSON.parse(raw.slice(first, last + 1));
      }
    }

    if (!parsed || !parsed.question || !Array.isArray(parsed.choices)) {
      res.status(200).json({ item: fallback(), meta: { topic, level, source: 'fallback-parse' } });
      return;
    }

    const item = buildPerseusFromAI(parsed);
    res.status(200).json({ item, meta: { topic, level, source: 'openai' } });
  } catch (err) {
    console.error(err);
    res.status(200).json({ item: fallback(), meta: { source: 'fallback-error' } });
  }
}
