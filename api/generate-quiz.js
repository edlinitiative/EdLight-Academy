// Vercel serverless function for generating a Perseus item.
// NOTE: For a real integration, set OPENAI_API_KEY in Vercel env vars
// and call OpenAI APIs here, then map the response into a Perseus item.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { topic = 'algebra', level = 'NS I' } = req.body || {};

    // Placeholder Perseus item (multiple choice)
    const item = {
      question: {
        content: `What is the value of $x$ in $2x + 6 = 10$?\\n\\n[[☃ multiple-choice 1]]`,
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
                { content: '$4$', correct: false }
              ],
              randomize: true,
            },
            version: { major: 0, minor: 0 },
          }
        }
      },
      answerArea: { calculator: false },
      hints: [
        { content: 'Subtract $6$ from both sides to get $2x=4$.' },
        { content: 'Divide both sides by $2$ to get $x=2$.' }
      ],
      itemDataVersion: { major: 0, minor: 1 }
    };

    return res.status(200).json({ item, meta: { topic, level } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to generate quiz item' });
  }
}
