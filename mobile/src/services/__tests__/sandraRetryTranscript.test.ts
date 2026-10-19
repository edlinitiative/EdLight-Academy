/**
 * S-2: a retry resends the same clientMessageId.
 * S-5: the transcript is restored only for its own account and conversation.
 */
const mockAuth: { currentUser: any } = { currentUser: { uid: 'alice', getIdToken: async () => 'tok' } };
jest.mock('../firebase', () => ({ get auth() { return mockAuth; } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sendToSandra, restorableTranscript, readTranscript, writeTranscript, writeConvId, TRANSCRIPT_MAX,
} from '../sandraService';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'sandra' as const : 'user' as const, text: `t${i}` }));

beforeEach(async () => { await AsyncStorage.clear(); fetchMock.mockReset(); });

it('sends the caller\'s clientMessageId, and keeps it on the conversation-full resend', async () => {
  fetchMock
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ conversationFull: true }) })
    .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ reply: 'ok', conversationId: 'c2' }) });
  const r = await sendToSandra('Q', 'fr', undefined, undefined, false, { clientMessageId: 'cid-12345678' });
  expect(r).toMatchObject({ kind: 'reply', reply: 'ok' });
  const ids = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).clientMessageId);
  expect(ids).toEqual(['cid-12345678', 'cid-12345678']);
});

it('generates a valid id when none is given', async () => {
  fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ reply: 'ok', conversationId: 'c1' }) });
  await sendToSandra('Q', 'fr');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).clientMessageId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
});

describe('transcript restore', () => {
  it('restores only the same account and conversation', () => {
    const stored = { uid: 'alice', convId: 'c1', messages: msgs(2) };
    expect(restorableTranscript(stored, 'alice', 'c1')).toHaveLength(2);
    expect(restorableTranscript(stored, 'bob', 'c1')).toEqual([]);
    expect(restorableTranscript(stored, 'alice', 'c2')).toEqual([]);
    expect(restorableTranscript(stored, 'alice', null)).toEqual([]);
  });

  it('round-trips through storage, bounded, and is forgotten with the conversation', async () => {
    await writeConvId('c1');
    await writeTranscript('alice', msgs(TRANSCRIPT_MAX + 10));
    const back = await readTranscript('alice');
    expect(back).toHaveLength(TRANSCRIPT_MAX);
    expect(back[back.length - 1].text).toBe(`t${TRANSCRIPT_MAX + 9}`);
    expect(await readTranscript('bob')).toEqual([]);
    await writeConvId(null); // new conversation / sign-out
    expect(await readTranscript('alice')).toEqual([]);
  });
});
