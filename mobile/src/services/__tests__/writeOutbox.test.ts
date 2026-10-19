/**
 * L-3 / O-3 / D-3: lesson completions and XP awards survive an app kill and
 * are replayed only into the account that made them.
 */
const mockAuth: { currentUser: any } = { currentUser: null };
jest.mock('../firebase', () => ({ get auth() { return mockAuth; }, db: {} }));
const mockConfirm = jest.fn();
jest.mock('../progressTracking', () => ({ confirmLessonComplete: (...a: unknown[]) => mockConfirm(...a) }));
const mockUpdateProgress = jest.fn();
const mockState: { user: any } = { user: null };
jest.mock('../../contexts/store', () => ({
  __esModule: true,
  default: { getState: () => ({ user: mockState.user, updateProgress: mockUpdateProgress }) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completeLessonDurably, drainWriteOutbox, pendingLessonIds, awardXpDurably, outbox, subscribeLessonOutbox,
} from '../writeOutbox';

const signIn = (uid: string) => {
  mockAuth.currentUser = { uid, getIdToken: async () => `tok-${uid}` };
  mockState.user = { uid };
};
const never = () => new Promise<never>(() => undefined);
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockConfirm.mockReset();
  mockUpdateProgress.mockReset();
  fetchMock.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('lesson completion outbox', () => {
  it('queues the completion before the write, so a kill mid-write keeps it', async () => {
    signIn('alice');
    mockConfirm.mockImplementation(never); // offline: the write never acks, then the app dies
    void completeLessonDurably('alice', 'chem', 'L1');
    await new Promise((r) => setImmediate(r));
    expect(await pendingLessonIds('alice', 'chem')).toEqual(['L1']);
    expect(await pendingLessonIds('bob', 'chem')).toEqual([]);
  });

  it('removes the operation once the server confirms', async () => {
    signIn('alice');
    mockConfirm.mockResolvedValue('saved');
    await expect(completeLessonDurably('alice', 'chem', 'L1')).resolves.toBe('saved');
    expect(await pendingLessonIds('alice', 'chem')).toEqual([]);
  });

  it('replays at launch: confirms, marks the lesson locally and tells the screen', async () => {
    await outbox.enqueue('alice', { id: 'lesson:chem:L1', kind: 'lesson-complete', payload: { courseId: 'chem', lessonId: 'L1' } });
    signIn('alice');
    mockConfirm.mockResolvedValue('saved');
    const seen: unknown[] = [];
    const off = subscribeLessonOutbox((e) => seen.push(e));
    await drainWriteOutbox('alice');
    off();
    expect(mockConfirm).toHaveBeenCalledWith('alice', 'chem', 'L1');
    expect(mockUpdateProgress).toHaveBeenCalledWith('L1', { completed: true });
    expect(seen).toEqual([{ uid: 'alice', courseId: 'chem', lessonId: 'L1', result: 'confirmed' }]);
    expect(await pendingLessonIds('alice', 'chem')).toEqual([]);
  });

  it('never replays into another account', async () => {
    await outbox.enqueue('alice', { id: 'lesson:chem:L1', kind: 'lesson-complete', payload: { courseId: 'chem', lessonId: 'L1' } });
    signIn('bob');
    await drainWriteOutbox('alice');
    await drainWriteOutbox('bob');
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(await pendingLessonIds('alice', 'chem')).toEqual(['L1']);
  });

  it('keeps the operation when the replay fails', async () => {
    await outbox.enqueue('alice', { id: 'lesson:chem:L1', kind: 'lesson-complete', payload: { courseId: 'chem', lessonId: 'L1' } });
    signIn('alice');
    mockConfirm.mockRejectedValue(new Error('unavailable'));
    await drainWriteOutbox('alice');
    expect(await pendingLessonIds('alice', 'chem')).toEqual(['L1']);
    expect(mockUpdateProgress).not.toHaveBeenCalled();
  });
});

describe('XP award outbox', () => {
  it('sends an operation id and forgets it after a 200', async () => {
    signIn('alice');
    fetchMock.mockResolvedValue({ status: 200 });
    await awardXpDurably('alice', { xpDelta: 20 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.opId).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(await outbox.list('alice')).toEqual([]);
  });

  it('keeps a failed award and replays it with the SAME operation id', async () => {
    signIn('alice');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await awardXpDurably('alice', { xpDelta: 20 });
    expect(await outbox.list('alice')).toHaveLength(1);
    const firstId = JSON.parse(fetchMock.mock.calls[0][1].body).opId;
    fetchMock.mockResolvedValue({ status: 200 });
    await drainWriteOutbox('alice');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).opId).toBe(firstId);
    expect(await outbox.list('alice')).toEqual([]);
  });

  it('retries a 5xx, drops a 400', async () => {
    signIn('alice');
    fetchMock.mockResolvedValueOnce({ status: 503 });
    await awardXpDurably('alice', { xpDelta: 20 });
    expect(await outbox.list('alice')).toHaveLength(1);
    fetchMock.mockResolvedValueOnce({ status: 400 });
    await drainWriteOutbox('alice');
    expect(await outbox.list('alice')).toEqual([]);
  });

  it('does not post one account\'s queued award under another account\'s token', async () => {
    signIn('alice');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await awardXpDurably('alice', { xpDelta: 20 });
    signIn('bob');
    fetchMock.mockReset();
    await drainWriteOutbox('bob');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await outbox.list('alice')).toHaveLength(1);
  });
});
