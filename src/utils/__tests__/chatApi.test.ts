/**
 * Handler tests for POST /api/chat (Sandra chat endpoint).
 *
 * Everything with I/O is mocked (`_lib/llm`, `_lib/firebaseAdmin`,
 * `_lib/requireAuth`, `_lib/rateLimit`, `firebase-admin/firestore`);
 * `_lib/sandraPrompt` is pure and used for real. `res` is a plain recording
 * stub so each test can assert status / headers / JSON body.
 */

jest.mock('../../../api/_lib/requireAuth', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('../../../api/_lib/rateLimit', () => ({
  checkRateLimit: jest.fn(),
}));

jest.mock('../../../api/_lib/llm', () => {
  class LLMError extends Error {
    status: number;
    provider: string;
    constructor(message: string, status = 0, provider = '') {
      super(message);
      this.name = 'LLMError';
      this.status = status;
      this.provider = provider;
    }
  }
  return {
    LLMError,
    chatText: jest.fn(),
    chatWithTools: jest.fn(),
    embed: jest.fn(),
    resolveLLMConfig: jest.fn(() => ({
      provider: 'gemini',
      label: 'gemini (gemini-2.5-flash)',
      apiKey: 'AIza-test',
      baseUrl: '',
      model: 'gemini-2.5-flash',
    })),
  };
});

jest.mock('../../../api/_lib/sandraTools', () => ({
  SANDRA_TOOL_DEFS: [
    { name: 'recommend_exams', description: 'stub', parameters: { type: 'object' } },
  ],
  createToolExecutor: jest.fn(() => jest.fn()),
}));

jest.mock('../../../api/_lib/firebaseAdmin', () => ({
  getDb: jest.fn(),
}));

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    vector: (v: number[]) => ({ __vector: v }),
    arrayUnion: (...elements: unknown[]) => ({ __arrayUnion: elements }),
    increment: (n: number) => ({ __increment: n }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));

import handler from '../../../api/chat';
import { requireAuth } from '../../../api/_lib/requireAuth';
import { checkRateLimit } from '../../../api/_lib/rateLimit';
import { chatWithTools, embed } from '../../../api/_lib/llm';
import { SANDRA_TOOL_DEFS, createToolExecutor } from '../../../api/_lib/sandraTools';
import { getDb } from '../../../api/_lib/firebaseAdmin';
import { SANDRA_LIMITS } from '../../../api/_lib/sandraPrompt';

const requireAuthMock = requireAuth as jest.Mock;
const checkRateLimitMock = checkRateLimit as jest.Mock;
const chatWithToolsMock = chatWithTools as jest.Mock;
const createToolExecutorMock = createToolExecutor as jest.Mock;
const embedMock = embed as jest.Mock;
const getDbMock = getDb as jest.Mock;

/** Recording response stub — enough of VercelResponse for the handler. */
function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(key: string, value: string) {
      res.headers[key] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: {},
    body: { message: 'Explique-moi les dérivées', lang: 'fr' },
    ...overrides,
  } as any;
}

/**
 * Minimal Firestore Admin stub. Returns the recording mocks so tests can
 * assert what was written.
 */
function makeDb(options: {
  existingConversation?: { id: string; data: Record<string, unknown> } | null;
  userDoc?: Record<string, unknown> | null;
  kbDocs?: Array<Record<string, unknown>>;
} = {}) {
  const { existingConversation = null, userDoc = null, kbDocs = [] } = options;

  const setMock = jest.fn().mockResolvedValue(undefined);
  const updateMock = jest.fn().mockResolvedValue(undefined);

  const newConvRef = {
    id: 'new-conv-1',
    set: setMock,
    update: updateMock,
  };
  const existingConvRef = existingConversation
    ? {
        id: existingConversation.id,
        set: setMock,
        update: updateMock,
        get: jest.fn().mockResolvedValue({
          exists: true,
          id: existingConversation.id,
          data: () => existingConversation.data,
        }),
      }
    : {
        id: 'missing-conv',
        set: setMock,
        update: updateMock,
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      };

  const findNearestGet = jest.fn().mockResolvedValue({
    docs: kbDocs.map((d) => ({ data: () => d })),
  });
  const kbQuery: any = {};
  kbQuery.where = jest.fn(() => kbQuery);
  kbQuery.findNearest = jest.fn(() => ({ get: findNearestGet }));

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'chatConversations') {
        return {
          doc: jest.fn((id?: string) => (id ? existingConvRef : newConvRef)),
        };
      }
      if (name === 'users') {
        return {
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              exists: !!userDoc,
              data: () => userDoc || undefined,
            }),
          })),
        };
      }
      if (name === 'sandraKb') return kbQuery;
      throw new Error(`Unexpected collection: ${name}`);
    }),
  };

  return { db, setMock, updateMock, kbQuery, findNearestGet };
}

beforeEach(() => {
  requireAuthMock.mockResolvedValue('uid-1');
  checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 29, resetAt: Date.now() + 3600_000 });
  embedMock.mockResolvedValue([[0.1, 0.2, 0.3]]);
  chatWithToolsMock.mockResolvedValue({ reply: 'Voici la démarche, étape par étape.', toolCalls: [] });
  getDbMock.mockReturnValue(makeDb().db);
});

describe('api/chat handler', () => {
  it('rejects non-POST with 405', async () => {
    const res = makeRes();
    await handler(makeReq({ method: 'GET' }), res as any);

    expect(res.statusCode).toBe(405);
    expect(requireAuthMock).not.toHaveBeenCalled();
  });

  it('returns without writing anything when requireAuth fails (401)', async () => {
    requireAuthMock.mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'unauthorized' });
      return null;
    });
    const { db, setMock, updateMock } = makeDb();
    getDbMock.mockReturnValue(db);

    const res = makeRes();
    await handler(makeReq(), res as any);

    expect(res.statusCode).toBe(401);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it('returns 429 with a Retry-After header when rate limited', async () => {
    const resetAt = Date.now() + 120_000;
    checkRateLimitMock.mockResolvedValue({ allowed: false, remaining: 0, resetAt });

    const res = makeRes();
    await handler(makeReq(), res as any);

    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    expect((res.body as any).error).toBe('rate_limit_exceeded');
    expect(chatWithToolsMock).not.toHaveBeenCalled();
    expect(embedMock).not.toHaveBeenCalled();
  });

  it('returns 400 on an empty message', async () => {
    const res = makeRes();
    await handler(makeReq({ body: { message: '   ', lang: 'fr' } }), res as any);

    expect(res.statusCode).toBe(400);
    expect(embedMock).not.toHaveBeenCalled();
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it('returns 400 on a message over the 2000-char limit', async () => {
    const res = makeRes();
    const message = 'a'.repeat(SANDRA_LIMITS.maxMessageChars + 1);
    await handler(makeReq({ body: { message, lang: 'fr' } }), res as any);

    expect(res.statusCode).toBe(400);
    expect(embedMock).not.toHaveBeenCalled();
    expect(chatWithToolsMock).not.toHaveBeenCalled();
  });

  it('happy path: embeds once, calls the LLM once, persists both messages in one update', async () => {
    const { db, setMock, updateMock } = makeDb({
      userDoc: { full_name: 'Ti Jak', email: 'tijak@example.com' },
      kbDocs: [
        { text: 'Les dérivées…', courseId: 'math-ns4', level: 'NS4', subject: 'Mathématiques', type: 'lesson', sourceId: 'l1' },
      ],
    });
    getDbMock.mockReturnValue(db);

    const res = makeRes();
    await handler(makeReq(), res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      reply: 'Voici la démarche, étape par étape.',
      conversationId: 'new-conv-1',
      remaining: 29,
    });

    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedMock).toHaveBeenCalledWith(['Explique-moi les dérivées']);
    expect(chatWithToolsMock).toHaveBeenCalledTimes(1);

    // New conversation shell was created with student identity.
    expect(setMock).toHaveBeenCalledTimes(1);
    const shell = setMock.mock.calls[0][0];
    expect(shell.uid).toBe('uid-1');
    expect(shell.studentName).toBe('Ti Jak');
    expect(shell.studentEmail).toBe('tijak@example.com');
    expect(shell.messages).toEqual([]);

    // ONE update containing BOTH the user and the assistant message.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const update = updateMock.mock.calls[0][0];
    const unioned = update.messages.__arrayUnion;
    expect(unioned).toHaveLength(2);
    expect(unioned[0]).toMatchObject({ role: 'user', text: 'Explique-moi les dérivées' });
    expect(unioned[1]).toMatchObject({ role: 'assistant', text: 'Voici la démarche, étape par étape.' });
    expect(update.messageCount).toEqual({ __increment: 2 });
    expect(update.lastMessageAt).toEqual({ __serverTimestamp: true });
  });

  it('returns 403 when reusing a conversation owned by another user', async () => {
    const { db, updateMock } = makeDb({
      existingConversation: { id: 'conv-9', data: { uid: 'someone-else', messageCount: 4, messages: [] } },
    });
    getDbMock.mockReturnValue(db);

    const res = makeRes();
    await handler(makeReq({ body: { message: 'Salut', lang: 'fr', conversationId: 'conv-9' } }), res as any);

    expect(res.statusCode).toBe(403);
    expect(chatWithToolsMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('responds conversationFull at the cap without calling the LLM', async () => {
    const { db, updateMock } = makeDb({
      existingConversation: {
        id: 'conv-full',
        data: { uid: 'uid-1', messageCount: SANDRA_LIMITS.conversationCap, messages: [] },
      },
    });
    getDbMock.mockReturnValue(db);

    const res = makeRes();
    await handler(makeReq({ body: { message: 'Encore une question', lang: 'fr', conversationId: 'conv-full' } }), res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).conversationFull).toBe(true);
    expect(embedMock).not.toHaveBeenCalled();
    expect(chatWithToolsMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('persists toolCalls metadata on the assistant message when tools ran', async () => {
    const { db, updateMock } = makeDb();
    getDbMock.mockReturnValue(db);
    chatWithToolsMock.mockResolvedValue({
      reply: 'Voici trois examens recommandés.',
      toolCalls: [{ name: 'recommend_exams', ok: true }],
    });

    const res = makeRes();
    await handler(makeReq(), res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).reply).toBe('Voici trois examens recommandés.');

    expect(updateMock).toHaveBeenCalledTimes(1);
    const unioned = updateMock.mock.calls[0][0].messages.__arrayUnion;
    expect(unioned).toHaveLength(2);
    expect(unioned[0]).toMatchObject({ role: 'user' });
    expect(unioned[0]).not.toHaveProperty('toolCalls');
    expect(unioned[1]).toMatchObject({
      role: 'assistant',
      text: 'Voici trois examens recommandés.',
      toolCalls: [{ name: 'recommend_exams', ok: true }],
    });
  });

  it('omits the toolCalls key entirely on zero-tool conversations (message shape unchanged)', async () => {
    const { db, updateMock } = makeDb();
    getDbMock.mockReturnValue(db);
    chatWithToolsMock.mockResolvedValue({ reply: 'Réponse simple.', toolCalls: [] });

    const res = makeRes();
    await handler(makeReq(), res as any);

    expect(res.statusCode).toBe(200);
    const unioned = updateMock.mock.calls[0][0].messages.__arrayUnion;
    const assistantMsg = unioned[1];
    // Firestore rejects undefined fields — the key must be absent, not undefined.
    expect(assistantMsg).not.toHaveProperty('toolCalls');
    expect(Object.keys(assistantMsg).sort()).toEqual(['role', 'text', 'ts']);
  });

  it('hands chatWithTools the Sandra tool defs and a per-request executor scoped to uid + origin', async () => {
    const executor = jest.fn();
    createToolExecutorMock.mockReturnValue(executor);

    const res = makeRes();
    await handler(makeReq({ headers: { host: 'academy.edlight.org' } }), res as any);

    expect(res.statusCode).toBe(200);
    expect(createToolExecutorMock).toHaveBeenCalledWith({
      uid: 'uid-1',
      origin: 'https://academy.edlight.org',
    });

    expect(chatWithToolsMock).toHaveBeenCalledTimes(1);
    const params = chatWithToolsMock.mock.calls[0][0];
    expect(params.tools).toBe(SANDRA_TOOL_DEFS);
    expect(params.executeTool).toBe(executor);
    expect(typeof params.executeTool).toBe('function');
    expect(params.maxTokens).toBe(1800);
    expect(typeof params.system).toBe('string');
    expect(params.messages[params.messages.length - 1]).toEqual({
      role: 'user',
      content: 'Explique-moi les dérivées',
    });
  });
});
