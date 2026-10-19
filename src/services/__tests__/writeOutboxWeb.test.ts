/**
 * D-3 (web): a failed leaderboard award is kept and replayed with the same
 * operation id, and never under another account's token.
 */
const mockAuth: { currentUser: any } = { currentUser: null };
const mockFetch = jest.fn();
jest.mock('../firebase', () => ({
  get auth() { return mockAuth; },
  authedFetch: (...a: unknown[]) => mockFetch(...a),
}));

import { awardXpDurably, drainWriteOutbox, outbox } from '../writeOutbox';

beforeEach(() => {
  window.localStorage.clear();
  mockFetch.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

it('keeps a failed award and replays it with the same operation id', async () => {
  mockAuth.currentUser = { uid: 'alice' };
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await awardXpDurably('alice', { xpDelta: 10 });
  expect(await outbox.list('alice')).toHaveLength(1);
  mockFetch.mockResolvedValue({ status: 200 });
  await drainWriteOutbox('alice');
  expect(mockFetch.mock.calls[1][1].opId).toBe(mockFetch.mock.calls[0][1].opId);
  expect(await outbox.list('alice')).toEqual([]);
});

it('does not replay alice\'s award while bob is signed in', async () => {
  mockAuth.currentUser = { uid: 'alice' };
  mockFetch.mockResolvedValueOnce({ status: 503 });
  await awardXpDurably('alice', { xpDelta: 10 });
  mockAuth.currentUser = { uid: 'bob' };
  mockFetch.mockReset();
  await drainWriteOutbox('alice');
  await drainWriteOutbox('bob');
  expect(mockFetch).not.toHaveBeenCalled();
  expect(await outbox.list('alice')).toHaveLength(1);
});
