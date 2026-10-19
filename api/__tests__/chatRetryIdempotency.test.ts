/**
 * S-2: a Sandra retry after the reply was saved but the response was lost must
 * return the stored reply — not run the LLM again and not duplicate the exchange
 * (or, on a first message, create an orphan conversation).
 */
type Data = Record<string, any>;
const store = new Map<string, Data>();
let autoId = 0;

function docRef(path: string) {
  return {
    id: path.split('/').pop() as string,
    path,
    get: async () => ({ exists: store.has(path), data: () => (store.has(path) ? JSON.parse(JSON.stringify(store.get(path))) : undefined) }),
    set: async (d: Data) => { store.set(path, { ...d }); },
    update: async (d: Data) => {
      const prev = store.get(path);
      if (!prev) throw new Error('NOT_FOUND');
      const next = { ...prev };
      for (const [k, v] of Object.entries(d)) {
        if (v && v.__union) next[k] = [...(next[k] || []), ...v.__union];
        else if (v && typeof v.__inc === 'number') next[k] = (next[k] || 0) + v.__inc;
        else next[k] = v;
      }
      store.set(path, next);
    },
  };
}
const mockDb = {
  collection: (name: string) => ({
    doc: (id?: string) => docRef(`${name}/${id || `auto${(autoId += 1)}`}`),
  }),
};

const mockChat = jest.fn();
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...v: unknown[]) => ({ __union: v }),
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => 'ts',
    vector: (v: unknown) => v,
  },
}));
jest.mock('../_lib/firebaseAdmin', () => ({ getDb: () => mockDb }));
jest.mock('../_lib/requireAuth', () => ({ requireAuth: async () => 'u1' }));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: 0 }) }));
jest.mock('../_lib/llm', () => ({
  chatWithTools: (...a: unknown[]) => mockChat(...a),
  embed: async () => { throw new Error('no kb in tests'); },
  resolveLLMConfig: () => ({}),
  LLMError: class LLMError extends Error {},
}));
jest.mock('../_lib/sandraTools', () => ({ SANDRA_TOOL_DEFS: [], createToolExecutor: () => () => null }));
jest.mock('../_lib/sandraProbes', () => ({ resolveOrigin: () => 'https://example.test' }));

import handler from '../chat';

function call(body: Data) {
  const out: { status?: number; body?: any } = {};
  const r: any = {
    setHeader: () => r,
    status: (s: number) => { out.status = s; return r; },
    json: (b: unknown) => { out.body = b; return r; },
  };
  return handler({ method: 'POST', headers: {}, body } as any, r).then(() => out);
}

const convs = () => [...store.entries()].filter(([p]) => p.startsWith('chatConversations/'));

beforeEach(() => {
  store.clear();
  mockChat.mockReset();
  let n = 0;
  mockChat.mockImplementation(async () => ({ reply: `réponse ${(n += 1)}`, toolCalls: [] }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

it('a retried FIRST message finds the conversation it created, returns the stored reply, no orphan', async () => {
  const first = await call({ message: 'Bonjou', clientMessageId: 'msg-00000001' });
  // The response was lost: the client retries WITHOUT a conversation id.
  const retry = await call({ message: 'Bonjou', clientMessageId: 'msg-00000001' });
  expect(retry.status).toBe(200);
  expect(retry.body).toMatchObject({ reply: first.body.reply, conversationId: first.body.conversationId, duplicate: true });
  expect(mockChat).toHaveBeenCalledTimes(1);
  expect(convs()).toHaveLength(1);
  expect(convs()[0][1].messages).toHaveLength(2);
});

it('a retried later message in an existing conversation is not answered twice', async () => {
  const first = await call({ message: 'Q1', clientMessageId: 'msg-00000001' });
  const id = first.body.conversationId;
  const second = await call({ message: 'Q2', conversationId: id, clientMessageId: 'msg-00000002' });
  const retry = await call({ message: 'Q2', conversationId: id, clientMessageId: 'msg-00000002' });
  expect(retry.body).toMatchObject({ reply: second.body.reply, duplicate: true });
  expect(mockChat).toHaveBeenCalledTimes(2);
  expect(store.get(`chatConversations/${id}`)?.messages).toHaveLength(4);
  expect(store.get(`chatConversations/${id}`)?.messageCount).toBe(4);
});

it('a different message id is a new exchange', async () => {
  const first = await call({ message: 'Q1', clientMessageId: 'msg-00000001' });
  await call({ message: 'Q1', conversationId: first.body.conversationId, clientMessageId: 'msg-00000003' });
  expect(mockChat).toHaveBeenCalledTimes(2);
});

it('older clients without a message id keep working', async () => {
  const a = await call({ message: 'Q1' });
  expect(a.status).toBe(200);
  expect(a.body.duplicate).toBeUndefined();
});
