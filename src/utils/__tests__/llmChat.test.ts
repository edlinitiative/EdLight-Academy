import { chatText, embed, EMBED_DIM, LLMError, LLMConfig } from '../../../api/_lib/llm';

const openaiConfig: LLMConfig = {
  provider: 'openai-compatible',
  label: 'deepseek (deepseek-chat)',
  apiKey: 'dk-test',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

const geminiConfig: LLMConfig = {
  provider: 'gemini',
  label: 'gemini (gemini-2.5-flash)',
  apiKey: 'AIza-test',
  baseUrl: '',
  model: 'gemini-2.5-flash',
};

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('chatText — openai-compatible transport', () => {
  it('builds a system + interleaved-messages payload and returns the reply text', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      choices: [{ message: { content: '  Bonjour! Voici la démarche.  ' } }],
    }));

    const reply = await chatText({
      system: 'Tu es Sandra.',
      messages: [
        { role: 'user', content: 'Salut' },
        { role: 'assistant', content: 'Bonjour!' },
        { role: 'user', content: 'Explique les dérivées' },
      ],
      config: openaiConfig,
    });

    expect(reply).toBe('Bonjour! Voici la démarche.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.messages).toEqual([
      { role: 'system', content: 'Tu es Sandra.' },
      { role: 'user', content: 'Salut' },
      { role: 'assistant', content: 'Bonjour!' },
      { role: 'user', content: 'Explique les dérivées' },
    ]);
    expect(payload.response_format).toBeUndefined(); // plain text, not JSON mode
  });
});

describe('chatText — gemini transport', () => {
  it('maps assistant messages to the "model" role in contents', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'Réponse.' }] } }],
    }));

    const reply = await chatText({
      system: 'Tu es Sandra.',
      messages: [
        { role: 'user', content: 'Salut' },
        { role: 'assistant', content: 'Bonjour!' },
        { role: 'user', content: 'Et ensuite?' },
      ],
      config: geminiConfig,
    });

    expect(reply).toBe('Réponse.');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.systemInstruction).toEqual({ parts: [{ text: 'Tu es Sandra.' }] });
    expect(payload.contents).toEqual([
      { role: 'user', parts: [{ text: 'Salut' }] },
      { role: 'model', parts: [{ text: 'Bonjour!' }] },
      { role: 'user', parts: [{ text: 'Et ensuite?' }] },
    ]);
    expect(payload.generationConfig.responseMimeType).toBeUndefined(); // plain text, not JSON mode
  });

  it('throws LLMError on an empty reply', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      candidates: [{ content: { parts: [{ text: '   ' }] } }],
    }));

    await expect(chatText({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Salut' }],
      config: geminiConfig,
    })).rejects.toThrow(LLMError);
  });
});

describe('embed', () => {
  it('exports EMBED_DIM = 768', () => {
    expect(EMBED_DIM).toBe(768);
  });

  it('throws LLMError when no Gemini key is configured', async () => {
    await expect(embed(['hello'], {})).rejects.toThrow(LLMError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to models/gemini-embedding-001:batchEmbedContents at EMBED_DIM and normalizes the vectors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      embeddings: [{ values: [3, 4] }, { values: [0, 2] }],
    }));

    const vectors = await embed(['un', 'deux'], { GEMINI_API_KEY: 'AIza-test' });

    // gemini-embedding-001 vectors below 3072 dims are not unit length — embed()
    // must normalize them ([3,4] → [0.6,0.8]).
    expect(vectors).toEqual([[0.6, 0.8], [0, 1]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('models/gemini-embedding-001:batchEmbedContents');
    expect(url).toContain('key=AIza-test');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.requests).toEqual([
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'un' }] }, outputDimensionality: 768 },
      { model: 'models/gemini-embedding-001', content: { parts: [{ text: 'deux' }] }, outputDimensionality: 768 },
    ]);
  });

  it('honors the LLM_EMBED_MODEL env override', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ embeddings: [{ values: [1] }] }));

    await embed(['x'], { GEMINI_API_KEY: 'AIza-test', LLM_EMBED_MODEL: 'text-embedding-005' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('models/text-embedding-005:batchEmbedContents');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.requests[0].model).toBe('models/text-embedding-005');
  });

  it('splits more than 100 texts into batches of ≤ 100', async () => {
    const texts = Array.from({ length: 150 }, (_, i) => `t${i}`);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ embeddings: texts.slice(0, 100).map((_, i) => ({ values: [i] })) }))
      .mockResolvedValueOnce(jsonResponse({ embeddings: texts.slice(100).map((_, i) => ({ values: [100 + i] })) }));

    const vectors = await embed(texts, { LLM_API_KEY: 'generic-key' }); // LLM_API_KEY also works

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBatch = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondBatch = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBatch.requests).toHaveLength(100);
    expect(secondBatch.requests).toHaveLength(50);
    expect(vectors).toHaveLength(150);
    expect(vectors[0]).toEqual([0]); // zero vector passes through unnormalized
    expect(vectors[149]).toEqual([1]); // [149] normalizes to a unit vector
  });
});
