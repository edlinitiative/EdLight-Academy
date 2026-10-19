/**
 * "Explique-moi" on mobile: the chat client sends the missed question as
 * structured `questionContext` to the same /api/chat, in a conversation kept
 * in memory so the student's main Sandra thread is not replaced.
 */
jest.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'u-1', getIdToken: jest.fn(() => Promise.resolve('tok')) } },
}));

import { memoryConversation, sendToSandra, writeConvId, readConvId } from '../sandraService';
import { sanitizeQuestionContext } from '../../../../shared/explainContext';

const questionContext = sanitizeQuestionContext({
  surface: 'revision', question: 'Combien font $3 \\times 4$ ?', studentAnswer: '7', expectedAnswer: '12', status: 'incorrect',
})!;

let fetchMock: jest.Mock;
beforeEach(async () => {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ reply: 'Étape 1…', conversationId: 'explain-conv' }) }));
  (global as any).fetch = fetchMock;
  await writeConvId('main-conv');
});

it('sends questionContext to /api/chat and keeps the main conversation untouched', async () => {
  const conversation = memoryConversation();
  const out = await sendToSandra('Explique-moi cette question.', 'fr', { path: '/mobile/explain' }, undefined, false, { questionContext, conversation });

  expect(out).toEqual({ kind: 'reply', reply: 'Étape 1…', remaining: undefined });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://academy.edlight.org/api/chat');
  const body = JSON.parse(init.body);
  expect(body.questionContext).toEqual(questionContext);
  expect(body.conversationId).toBeUndefined(); // a fresh thread, not 'main-conv'
  expect(await conversation.read()).toBe('explain-conv');
  expect(await readConvId()).toBe('main-conv');
});

it('follow-ups carry the same context into the same explain thread', async () => {
  const conversation = memoryConversation();
  await sendToSandra('Explique-moi.', 'ht', undefined, undefined, false, { questionContext, conversation });
  await sendToSandra('Pi senp', 'ht', undefined, undefined, false, { questionContext, conversation });
  const second = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(second.conversationId).toBe('explain-conv');
  expect(second.questionContext.expectedAnswer).toBe('12');
  expect(second.lang).toBe('ht');
});

it('a normal chat sends no questionContext and uses the persisted thread', async () => {
  await sendToSandra('Bonjour', 'fr');
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.questionContext).toBeUndefined();
  expect(body.conversationId).toBe('main-conv');
});
