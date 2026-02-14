// Vercel serverless function for generating a Perseus item.
// NOTE: For a real integration, set OPENAI_API_KEY in Vercel env vars
// and call OpenAI APIs here, then map the response into a Perseus item.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify Firebase auth token to prevent unauthorized access
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  // Validate the token with Firebase Admin SDK (or Google's tokeninfo endpoint)
  try {
    const token = authHeader.split('Bearer ')[1];
    const verifyResp = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
    );
    if (!verifyResp.ok) {
      // Try Firebase ID token verification via Google's secure token API
      const idResp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY || ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }
      );
      if (!idResp.ok) {
        return res.status(401).json({ error: 'Invalid authentication token' });
      }
    }
  } catch (authErr) {
    return res.status(401).json({ error: 'Authentication verification failed' });
  }

  const OPENAI_KEY = process.env.edlight_chatgpt_api;

  const buildPerseusFromAI = (ai) => {
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

  const fallback = () => ({
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
    const { topic = 'algebra', level = 'NS I', difficulty = 'easy' } = req.body || {};

    // Sanitize inputs to prevent prompt injection
    const sanitize = (str) => String(str).replace(/[^a-zA-Z0-9\s\-'àèìòùâêîôûäëïöüéÈ]/g, '').slice(0, 100);
    const safeTopic = sanitize(topic);
    const safeLevel = sanitize(level);
    const safeDifficulty = sanitize(difficulty);

    if (!OPENAI_KEY) {
      return res.status(200).json({ item: fallback(), meta: { topic: safeTopic, level: safeLevel, source: 'fallback' } });
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
      return res.status(200).json({ item: fallback(), meta: { topic, level, source: 'fallback' } });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || '';

    let parsed;
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
      return res.status(200).json({ item: fallback(), meta: { topic, level, source: 'fallback-parse' } });
    }

    const item = buildPerseusFromAI(parsed);
    return res.status(200).json({ item, meta: { topic, level, source: 'openai' } });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ item: fallback(), meta: { source: 'fallback-error' } });
  }
}
