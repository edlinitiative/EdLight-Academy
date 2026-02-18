const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * POST /api/grade-scaffold
 *
 * Grades scaffold blanks that can't be auto-graded by exact string matching.
 * Accepts a batch of blanks in a single call to minimise latency and cost.
 *
 * Body: {
 *   question: string,          // the original question text
 *   blanks: [                   // only the blanks that need AI grading
 *     { index: number, label: string, userAnswer: string, expectedAnswer: string, alternatives: string[] }
 *   ]
 * }
 *
 * Response: {
 *   results: [
 *     { index: number, isCorrect: boolean, feedback: string }
 *   ]
 * }
 */

const PROMPT_TEMPLATE = `You are an expert Haitian high-school teacher grading short-answer blanks.
The student filled in blanks for the question below. For each blank you receive:
- The student's answer
- The expected (model) answer and any acceptable alternatives

A student's answer is CORRECT if it conveys the same meaning / key concepts as the expected answer,
even if the wording, order, or phrasing differs. Minor spelling errors in the correct language are acceptable.
An answer is INCORRECT only if it is factually wrong, missing the key point, or irrelevant.

Be generous but fair — the student is a Haitian high-school student who may answer in French, Kreyòl, English, or Spanish.

Respond with ONLY a JSON array (one object per blank, in the same order), each with:
- "index": the blank index (number)
- "isCorrect": boolean
- "feedback": a short 1-sentence explanation in FRENCH (the students are Haitian)

---
QUESTION:
{question}

---
BLANKS TO GRADE:
{blanks}
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { question, blanks } = req.body;

  if (!question || !blanks || !Array.isArray(blanks) || blanks.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: question, blanks[]' });
  }

  // Cap batch size to avoid prompt bloat
  if (blanks.length > 20) {
    return res.status(400).json({ error: 'Too many blanks (max 20)' });
  }

  try {
    const blanksText = blanks.map(b =>
      `Blank #${b.index}:\n  Student's answer: "${b.userAnswer}"\n  Expected answer: "${b.expectedAnswer}"` +
      (b.alternatives && b.alternatives.length > 0
        ? `\n  Also acceptable: ${b.alternatives.map(a => `"${a}"`).join(', ')}`
        : '')
    ).join('\n\n');

    const prompt = PROMPT_TEMPLATE
      .replace('{question}', question)
      .replace('{blanks}', blanksText);

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    };

    const apiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!apiRes.ok) {
      const errorBody = await apiRes.text();
      console.error('Gemini API Error:', errorBody);
      throw new Error(`Gemini API ${apiRes.status}`);
    }

    const body = await apiRes.json();
    const text = body.candidates[0].content.parts[0].text;
    let results = JSON.parse(text);

    // Ensure it's an array and has the expected shape
    if (!Array.isArray(results)) results = [results];
    results = results.map(r => ({
      index: r.index ?? 0,
      isCorrect: !!r.isCorrect,
      feedback: r.feedback || '',
    }));

    res.status(200).json({ results });
  } catch (error) {
    console.error('Error grading scaffold:', error);
    // On failure, return all blanks as "needs manual review"
    res.status(500).json({
      error: 'AI grading unavailable',
      results: blanks.map(b => ({
        index: b.index,
        isCorrect: false,
        feedback: 'Évaluation automatique indisponible.',
      })),
    });
  }
}
