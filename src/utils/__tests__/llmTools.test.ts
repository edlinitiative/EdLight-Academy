import { chatWithTools, LLMConfig, ToolDef } from '../../../api/_lib/llm';

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

const progressTool: ToolDef = {
  name: 'get_student_progress',
  description: "Lit les résultats d'examens de l'étudiant.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};

const recommendTool: ToolDef = {
  name: 'recommend_exams',
  description: 'Recommande des examens du catalogue.',
  parameters: {
    type: 'object',
    properties: { level: { type: 'string' }, count: { type: 'number' } },
    required: ['level'],
  },
};

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response);

const geminiToolCallResponse = (name: string, args: Record<string, unknown>) =>
  jsonResponse({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] });

const geminiTextResponse = (text: string) =>
  jsonResponse({ candidates: [{ content: { parts: [{ text }] } }] });

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('chatWithTools — gemini transport', () => {
  it('runs a functionCall/functionResponse round-trip and returns the final text', async () => {
    fetchMock
      .mockResolvedValueOnce(geminiToolCallResponse('get_student_progress', { level: 'terminale' }))
      .mockResolvedValueOnce(geminiTextResponse('Voici tes progrès.'));
    const executeTool = jest.fn().mockResolvedValue({ totalAttempts: 4 });

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Comment vont mes révisions ?' }],
      tools: [progressTool, recommendTool],
      executeTool,
      config: geminiConfig,
    });

    expect(out.reply).toBe('Voici tes progrès.');
    expect(out.toolCalls).toEqual([{ name: 'get_student_progress', ok: true }]);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith('get_student_progress', { level: 'terminale' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Round 1: tool declarations in gemini shape.
    const [url1, init1] = fetchMock.mock.calls[0];
    expect(url1).toContain('models/gemini-2.5-flash:generateContent');
    const payload1 = JSON.parse((init1 as RequestInit).body as string);
    expect(payload1.systemInstruction).toEqual({ parts: [{ text: 'Tu es Sandra.' }] });
    expect(payload1.tools).toEqual([{
      functionDeclarations: [
        { name: progressTool.name, description: progressTool.description, parameters: progressTool.parameters },
        { name: recommendTool.name, description: recommendTool.description, parameters: recommendTool.parameters },
      ],
    }]);

    // Round 2: model functionCall echoed back + functionResponse part with the tool result.
    const payload2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(payload2.contents).toEqual([
      { role: 'user', parts: [{ text: 'Comment vont mes révisions ?' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_student_progress', args: { level: 'terminale' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_student_progress', response: { totalAttempts: 4 } } }] },
    ]);
  });

  it('passes { error } to the model when the executor throws, records ok:false, and keeps looping', async () => {
    fetchMock
      .mockResolvedValueOnce(geminiToolCallResponse('get_student_progress', {}))
      .mockResolvedValueOnce(geminiTextResponse('Je ne peux pas lire tes progrès pour le moment.'));
    const executeTool = jest.fn().mockRejectedValue(new Error('firestore down'));

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Mes progrès ?' }],
      tools: [progressTool],
      executeTool,
      config: geminiConfig,
    });

    expect(out.reply).toBe('Je ne peux pas lire tes progrès pour le moment.');
    expect(out.toolCalls).toEqual([{ name: 'get_student_progress', ok: false }]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // the loop continued after the failure

    const payload2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(payload2.contents[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { name: 'get_student_progress', response: { error: 'firestore down' } } }],
    });
  });

  it('stops at maxRounds and returns a safe French fallback when the model never yields text', async () => {
    fetchMock.mockResolvedValue(geminiToolCallResponse('get_student_progress', {}));
    const executeTool = jest.fn().mockResolvedValue({ ok: true });

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Boucle infinie ?' }],
      tools: [progressTool],
      executeTool,
      maxRounds: 2,
      config: geminiConfig,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2); // maxRounds caps the model calls
    expect(executeTool).toHaveBeenCalledTimes(1); // final-round tool calls are not executed
    expect(out.reply).toMatch(/désolée/i); // safe French fallback text
    expect(out.reply.length).toBeGreaterThan(10);
    expect(out.toolCalls).toEqual([{ name: 'get_student_progress', ok: true }]);
  });

  it('stops at maxRounds with whatever text the model produced alongside its last tool calls', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [
        { text: 'Un instant, je vérifie…' },
        { functionCall: { name: 'get_student_progress', args: {} } },
      ] } }],
    }));

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Encore ?' }],
      tools: [progressTool],
      executeTool: jest.fn().mockResolvedValue({}),
      maxRounds: 2,
      config: geminiConfig,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.reply).toBe('Un instant, je vérifie…');
  });

  it('answers directly (no executeTool, single request) when the model returns plain text', async () => {
    fetchMock.mockResolvedValueOnce(geminiTextResponse('Bonjour !'));
    const executeTool = jest.fn();

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Salut' }],
      tools: [progressTool],
      executeTool,
      config: geminiConfig,
    });

    expect(out).toEqual({ reply: 'Bonjour !', toolCalls: [] });
    expect(executeTool).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('chatWithTools — openai-compatible transport', () => {
  it('runs a tool_calls / role:"tool" round-trip and returns the final text', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: {
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'recommend_exams', arguments: '{"level":"9e","count":2}' },
          }],
        } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: '  Voici deux examens.  ' } }],
      }));
    const toolResult = [{ examId: 'chi-9e-2019', title: 'Chimie 9e 2019' }];
    const executeTool = jest.fn().mockResolvedValue(toolResult);

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [
        { role: 'user', content: 'Salut' },
        { role: 'assistant', content: 'Bonjour !' },
        { role: 'user', content: 'Des examens de chimie ?' },
      ],
      tools: [recommendTool],
      executeTool,
      config: openaiConfig,
    });

    expect(out.reply).toBe('Voici deux examens.');
    expect(out.toolCalls).toEqual([{ name: 'recommend_exams', ok: true }]);
    expect(executeTool).toHaveBeenCalledWith('recommend_exams', { level: '9e', count: 2 });

    // Round 1: openai tools shape + full conversation.
    const [url1, init1] = fetchMock.mock.calls[0];
    expect(url1).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((init1 as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer dk-test');
    const payload1 = JSON.parse((init1 as RequestInit).body as string);
    expect(payload1.tools).toEqual([{
      type: 'function',
      function: { name: recommendTool.name, description: recommendTool.description, parameters: recommendTool.parameters },
    }]);
    expect(payload1.messages[0]).toEqual({ role: 'system', content: 'Tu es Sandra.' });

    // Round 2: assistant tool_calls message echoed back + role:'tool' result message.
    const payload2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    const echoed = payload2.messages[payload2.messages.length - 2];
    expect(echoed.role).toBe('assistant');
    expect(echoed.tool_calls).toEqual([{
      id: 'call_1',
      type: 'function',
      function: { name: 'recommend_exams', arguments: '{"level":"9e","count":2}' },
    }]);
    expect(payload2.messages[payload2.messages.length - 1]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: JSON.stringify(toolResult),
    });
  });

  it('sends { error } as the tool message when the executor throws and records ok:false', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: {
          content: null,
          tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'recommend_exams', arguments: '{"level":"terminale"}' } }],
        } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: 'Le catalogue est indisponible.' } }],
      }));
    const executeTool = jest.fn().mockRejectedValue(new Error('catalog fetch failed'));

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Des examens ?' }],
      tools: [recommendTool],
      executeTool,
      config: openaiConfig,
    });

    expect(out.reply).toBe('Le catalogue est indisponible.');
    expect(out.toolCalls).toEqual([{ name: 'recommend_exams', ok: false }]);

    const payload2 = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(payload2.messages[payload2.messages.length - 1]).toEqual({
      role: 'tool',
      tool_call_id: 'call_9',
      content: JSON.stringify({ error: 'catalog fetch failed' }),
    });
  });

  it('stops at maxRounds with the safe French fallback when the model keeps calling tools', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      choices: [{ message: {
        content: null,
        tool_calls: [{ id: 'call_x', type: 'function', function: { name: 'recommend_exams', arguments: '{}' } }],
      } }],
    }));
    const executeTool = jest.fn().mockResolvedValue([]);

    const out = await chatWithTools({
      system: 'Tu es Sandra.',
      messages: [{ role: 'user', content: 'Encore ?' }],
      tools: [recommendTool],
      executeTool,
      maxRounds: 3,
      config: openaiConfig,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(executeTool).toHaveBeenCalledTimes(2); // not executed on the final round
    expect(out.reply).toMatch(/désolée/i);
    expect(out.toolCalls).toHaveLength(2);
  });
});
