/**
 * Reviewed "Explique-moi" explanations (api/_lib/explanationCache.ts) through
 * the real /api/chat handler and the real explainGate:
 *   • only a VERIFIED request reads or writes the cache, never a hint-only,
 *     unverifiable or competition-downgraded one;
 *   • the first verified request stores ONE canonical pending candidate built
 *     without the student's answer; later ones only count a use;
 *   • an approved text answers the first turn with no LLM call; pending or
 *     rejected texts are never served;
 *   • follow-up turns go to the LLM (continuing from the approved text).
 */
import { FakeDb } from './helpers/fakeFirestore';

const mockDb = new FakeDb();
const mockChat = jest.fn();
const mockChatText = jest.fn();

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...v: unknown[]) => ({ __union: v }),
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => 'ts',
    vector: (v: unknown) => v,
  },
}));
jest.mock('../_lib/firebaseAdmin', () => ({ getDb: () => mockDb }));
jest.mock('../_lib/requireAuth', () => ({ requireAuth: async () => 'stu1' }));
jest.mock('../_lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 9, resetAt: 0 }) }));
jest.mock('../_lib/llm', () => ({
  chatWithTools: (...a: unknown[]) => mockChat(...a),
  chatText: (...a: unknown[]) => mockChatText(...a),
  embed: async () => { throw new Error('no kb in tests'); },
  resolveLLMConfig: () => ({ label: 'test-model' }),
  LLMError: class LLMError extends Error {},
}));
jest.mock('../_lib/sandraTools', () => ({ SANDRA_TOOL_DEFS: [], createToolExecutor: () => () => null }));
jest.mock('../_lib/sandraProbes', () => ({ resolveOrigin: () => 'https://example.test' }));
jest.mock('../_lib/explainGate', () => {
  const actual = jest.requireActual('../_lib/explainGate');
  return { ...actual, examFetcher: () => async (id: string) => (id === 'ex_abc' ? mockExam : null) };
});

const mockExam = {
  exam_id: 'ex_abc',
  sections: [{
    questions: [
      { type: 'short_answer', question: 'Dérivée de $x^2$ ?', correct: '2x', explanation: 'Règle de puissance.' },
    ],
  }],
};

import handler from '../chat';
import { castVote, explanationKey, reviewExplanation, voteId } from '../_lib/explanationCache';
import { reviewedExplanationId } from '../../shared/explanationFeedback';

const KEY = 'exam_ex_abc-0_fr';
const UID = 'stu1';

function call(body: Record<string, unknown>) {
  const out: { status?: number; body?: any } = {};
  const r: any = {
    setHeader: () => r,
    status: (s: number) => { out.status = s; return r; },
    json: (b: unknown) => { out.body = b; return r; },
  };
  return handler({ method: 'POST', headers: {}, body } as any, r).then(() => out);
}

const explainCtx = (over: Record<string, unknown> = {}) => ({
  surface: 'exam_results',
  question: 'texte client',
  studentAnswer: '3x',
  expectedAnswer: 'FORGED',
  examId: 'ex_abc',
  questionId: '0',
  status: 'incorrect',
  ...over,
});

function submitted() {
  mockDb.store.set(`users/${UID}/examResults/ex_abc`, { answers: { 0: '3x' } });
  mockDb.store.set(`users/${UID}/examAttempts/ex_abc`, { status: 'submitted' });
}

function seed(status: 'pending' | 'approved' | 'rejected', key = KEY) {
  mockDb.store.set(`explanations/${key}`, {
    key, status, text: `Texte ${status}`, uses: 4, served: 1, helpful: 0, notHelpful: 0, lang: key.endsWith('_ht') ? 'ht' : 'fr',
  });
}

const doc = (key = KEY) => mockDb.store.get(`explanations/${key}`);
const explanationDocs = () => [...mockDb.store.keys()].filter((p) => p.startsWith('explanations/'));

beforeEach(() => {
  mockDb.store.clear();
  mockChat.mockReset();
  mockChatText.mockReset();
  mockChat.mockImplementation(async () => ({ reply: 'réponse fraîche', toolCalls: [] }));
  mockChatText.mockImplementation(async () => 'Explication canonique : on applique $(x^n)\'= nx^{n-1}$.');
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('explanation cache in /api/chat', () => {
  it('cache miss on a verified request: fresh reply + one pending canonical candidate (no student answer)', async () => {
    submitted();
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.status).toBe(200);
    expect(out.body.reply).toBe('réponse fraîche');
    expect(out.body.explanation).toBeUndefined();
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockChatText).toHaveBeenCalledTimes(1);
    const prompt = mockChatText.mock.calls[0][0];
    expect(prompt.system).toContain('2x'); // the server's key
    expect(prompt.system).not.toContain('3x'); // never the student's answer
    expect(prompt.system).not.toContain('FORGED'); // never the client's key
    expect(doc()).toMatchObject({ status: 'pending', uses: 1, served: 0, source: 'exam', examId: 'ex_abc', questionIndex: 0, lang: 'fr', expectedAnswer: '2x', model: 'test-model' });
    expect(doc()?.text).toContain('Explication canonique');
  });

  it('a pending candidate is not served and not regenerated; the use is counted', async () => {
    submitted();
    seed('pending');
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(mockChatText).not.toHaveBeenCalled();
    expect(doc()).toMatchObject({ uses: 5, served: 1, text: 'Texte pending' });
  });

  it('a rejected text is not served', async () => {
    submitted();
    seed('rejected');
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(out.body.explanation).toBeUndefined();
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it('cache hit after approval: served instantly with no LLM call, flagged for feedback, stored in the transcript', async () => {
    submitted();
    seed('approved');
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.status).toBe(200);
    expect(out.body.reply).toBe('Texte approved');
    expect(out.body.explanation).toEqual({ id: KEY, reviewed: true });
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockChatText).not.toHaveBeenCalled();
    expect(doc()).toMatchObject({ uses: 5, served: 2 });
    const conv = [...mockDb.store.entries()].find(([p]) => p.startsWith('chatConversations/'))?.[1];
    const [userMsg, assistantMsg] = conv!.messages.__union;
    expect(userMsg.explain.gate).toBe('verified_exam');
    expect(assistantMsg).toMatchObject({ text: 'Texte approved', explanationId: KEY });
  });

  it('a follow-up turn goes to the LLM, with the approved text in the history', async () => {
    submitted();
    seed('approved');
    mockDb.store.set('chatConversations/c1', {
      uid: UID, messageCount: 2,
      messages: [{ role: 'user', text: 'Explique-moi', ts: 1 }, { role: 'assistant', text: 'Texte approved', ts: 2 }],
    });
    const out = await call({ message: 'Pourquoi n-1 ?', conversationId: 'c1', questionContext: explainCtx() });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(out.body.explanation).toBeUndefined();
    const sent = mockChat.mock.calls[0][0].messages;
    expect(sent.some((m: any) => m.role === 'assistant' && m.content === 'Texte approved')).toBe(true);
    expect(doc()).toMatchObject({ uses: 4, served: 1 }); // follow-ups are not "uses"
  });

  it('the language is part of the key: an approved fr text is not served to a ht request', async () => {
    submitted();
    seed('approved');
    const out = await call({ message: 'Eksplike m', lang: 'ht', questionContext: explainCtx() });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(doc('exam_ex_abc-0_ht')).toMatchObject({ status: 'pending', lang: 'ht' });
  });

  it('never for an unverified request (exam not submitted): no read, no write, no candidate', async () => {
    seed('approved');
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(out.body.explanation).toBeUndefined();
    expect(mockChatText).not.toHaveBeenCalled();
    expect(doc()).toMatchObject({ uses: 4, served: 1 });
    expect(explanationDocs()).toHaveLength(1);
  });

  it('never for a hint-only request without ids', async () => {
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx({ examId: undefined, questionId: undefined }) });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(mockChatText).not.toHaveBeenCalled();
    expect(explanationDocs()).toHaveLength(0);
  });

  it('never while a competition round is live for the caller (gate downgrade), even with an approved text', async () => {
    submitted();
    seed('approved');
    mockDb.store.set(`users/${UID}/myTournaments/t1`, { tid: 't1', startsAt: Date.now() - 60_000 });
    mockDb.store.set('userTournaments/t1', { state: 'live', schedule: { endsAt: Date.now() + 3_600_000 } });
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.body.reply).toBe('réponse fraîche');
    expect(out.body.explanation).toBeUndefined();
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockChatText).not.toHaveBeenCalled();
    expect(doc()).toMatchObject({ uses: 4, served: 1 });
  });

  it('a failed candidate generation never breaks the student reply', async () => {
    submitted();
    mockChatText.mockImplementation(async () => { throw new Error('boom'); });
    const out = await call({ message: 'Explique-moi', questionContext: explainCtx() });
    expect(out.status).toBe(200);
    expect(out.body.reply).toBe('réponse fraîche');
    expect(explanationDocs()).toHaveLength(0);
  });
});

describe('explanation key, review and votes', () => {
  it('clients only offer feedback on a reply the server flagged as reviewed', () => {
    expect(reviewedExplanationId({ explanation: { id: KEY, reviewed: true } })).toBe(KEY);
    expect(reviewedExplanationId({ explanation: { id: KEY } })).toBeUndefined();
    expect(reviewedExplanationId({ explanation: { id: '../x', reviewed: true } })).toBeUndefined();
    expect(reviewedExplanationId({ reply: 'x' })).toBeUndefined();
  });

  it('keys are per source × id × language and doc-id safe', () => {
    expect(explanationKey({ source: 'exam', id: 'ex_abc-3' }, 'fr')).toBe('exam_ex_abc-3_fr');
    expect(explanationKey({ source: 'bank', id: 'q.1:a' }, 'ht')).toBe('bank_q_1_a_ht');
  });

  it('approve, edit-then-approve and reject record audit fields', async () => {
    seed('pending');
    const a = await reviewExplanation(mockDb as any, { key: KEY, action: 'approve', reviewer: { uid: 'adm', name: 'Ted' }, now: 10 });
    expect(a.ok && a.doc).toMatchObject({ status: 'approved', reviewedBy: 'adm', reviewedByName: 'Ted', reviewedAt: 10, text: 'Texte pending' });
    const e = await reviewExplanation(mockDb as any, { key: KEY, action: 'approve', text: 'Texte corrigé', reviewer: { uid: 'adm' }, now: 20 });
    expect(e.ok && e.doc).toMatchObject({ text: 'Texte corrigé', originalText: 'Texte pending' });
    const r = await reviewExplanation(mockDb as any, { key: KEY, action: 'reject', reviewer: { uid: 'adm2' }, now: 30 });
    expect(r.ok && r.doc.status).toBe('rejected');
    expect(doc()?.reviewHistory.map((h: any) => h.action)).toEqual(['approve', 'edit_approve', 'reject']);
    expect(doc()?.originalText).toBe('Texte pending');
    expect(await reviewExplanation(mockDb as any, { key: 'exam_none_fr', action: 'approve', reviewer: { uid: 'adm' } })).toEqual({ ok: false, error: 'not_found' });
    expect(await reviewExplanation(mockDb as any, { key: KEY, action: 'approve', text: '   ', reviewer: { uid: 'adm' } })).toEqual({ ok: false, error: 'empty_text' });
  });

  it('votes: counted once per explanation per day, hashed without the uid, only on approved texts', async () => {
    seed('approved');
    const day1 = Date.UTC(2026, 9, 19, 12);
    const day2 = Date.UTC(2026, 9, 20, 12);
    expect(await castVote(mockDb as any, { key: KEY, uid: UID, helpful: true, secret: 's', now: day1 })).toBe('counted');
    expect(await castVote(mockDb as any, { key: KEY, uid: UID, helpful: false, secret: 's', now: day1 + 1000 })).toBe('duplicate');
    expect(await castVote(mockDb as any, { key: KEY, uid: 'other', helpful: false, secret: 's', now: day1 })).toBe('counted');
    expect(await castVote(mockDb as any, { key: KEY, uid: UID, helpful: true, secret: 's', now: day2 })).toBe('counted');
    expect(doc()).toMatchObject({ helpful: 2, notHelpful: 1 });
    const votes = [...mockDb.store.entries()].filter(([p]) => p.startsWith('explanationVotes/'));
    expect(votes).toHaveLength(3);
    for (const [path, data] of votes) {
      expect(path).not.toContain(UID);
      expect(JSON.stringify(data)).not.toContain(UID);
      expect(data.expiresAt).toBeDefined();
    }
    expect(voteId('s', UID, KEY, '2026-10-19')).not.toBe(voteId('s', UID, KEY, '2026-10-20'));
    seed('pending', 'exam_ex_abc-1_fr');
    expect(await castVote(mockDb as any, { key: 'exam_ex_abc-1_fr', uid: UID, helpful: true, secret: 's' })).toBe('not_approved');
    expect(await castVote(mockDb as any, { key: 'exam_missing_fr', uid: UID, helpful: true, secret: 's' })).toBe('not_found');
  });
});
