const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBA4NHDVyIbnGt7iVfPUJHi7jNMV2Maqbc';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const GRADING_PROMPT = `You are an expert teacher grading a high-school level essay.
Compare the student's answer to the provided model answer.

Your task is to:
1.  Determine if the student's answer is substantially correct based on the model answer.
2.  Provide a short, constructive feedback (2-3 sentences) explaining what the student did well and what they could improve.
3.  Assign a score from 0 to 10, where 10 is a perfect match to the model answer's concepts.

Respond with ONLY a JSON object with three keys: "isCorrect" (boolean), "feedback" (string), and "score" (string, e.g., "8/10").

---
REFERENCE TEXT:
{context}

---
QUESTION:
{question}

---
MODEL ANSWER:
{modelAnswer}

---
STUDENT'S ANSWER:
{answer}
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { question, answer, modelAnswer, context } = req.body;

  if (!question || !answer || !modelAnswer) {
    return res.status(400).json({ error: 'Missing required fields: question, answer, modelAnswer' });
  }

  try {
    const prompt = GRADING_PROMPT.replace('{question}', question)
      .replace('{modelAnswer}', modelAnswer)
      .replace('{answer}', answer)
      .replace('{context}', context || 'N/A');

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 512,
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
      throw new Error(`API request failed with status ${apiRes.status}`);
    }

    const body = await apiRes.json();
    const text = body.candidates[0].content.parts[0].text;
    const result = JSON.parse(text);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error grading essay:', error);
    res.status(500).json({
      feedback: 'Could not grade this essay automatically. A human will review it.',
      score: 'N/A',
    });
  }
}
