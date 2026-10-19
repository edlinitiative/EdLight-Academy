/**
 * P0 code validation (2026-10-19) — mastery must never regress.
 *  1. The debounced push wrote the device's whole map with {merge:true}:
 *     Firestore merges field by field, so a phone that last synced days ago
 *     wrote lessons.X.bestPct 40 over the 100 the student earned on the web.
 *  2. mergeRemoteProgress REPLACED the map, dropping a score recorded while
 *     the sign-in read was in flight.
 *  3. Sign-out within the 4 s debounce dropped the last result.
 */
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: any, ...parts: string[]) => ({ path: parts.join('/') })),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 0),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import useStore from '../../contexts/store';
import { startMasterySync, disposeMasterySync, flushMasterySync, syncMasteryOnLogin } from '../masterySync';

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  disposeMasterySync();
});
afterAll(() => disposeMasterySync());

describe('mergeRemoteProgress', () => {
  it('joins with the current map instead of replacing it', () => {
    useStore.setState({ progress: { L2: { bestPct: 90 } } } as any);
    useStore.getState().mergeRemoteProgress({ L1: { completed: true } });
    expect(useStore.getState().progress).toMatchObject({ L1: { completed: true }, L2: { bestPct: 90 } });
  });
});

describe('debounced push', () => {
  it('joins the server copy before writing (no bestPct regression)', async () => {
    jest.useFakeTimers();
    try {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ lessons: { X: { bestPct: 100, masteredAt: 5 } } }),
      });
      useStore.setState({ user: { uid: 'u1' }, isAuthenticated: true, progress: { X: { bestPct: 40 } } } as any);
      startMasterySync();
      useStore.setState({ progress: { X: { bestPct: 40 }, Y: { bestPct: 80 } } } as any);
      jest.advanceTimersByTime(4000);
      jest.useRealTimers();
      await flush(); await flush();
      const call = (setDoc as jest.Mock).mock.calls.find(([ref]) => ref.path.endsWith('mastery/lessons'));
      expect(call).toBeTruthy();
      expect(call[1].lessons.X.bestPct).toBe(100);
      expect(call[1].lessons.Y.bestPct).toBe(80);
      // and the device learns the web's progress
      expect(useStore.getState().progress.X).toMatchObject({ bestPct: 100 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('on a failed read, pushes only the lessons this device changed', async () => {
    jest.useFakeTimers();
    try {
      useStore.setState({ user: { uid: 'u1' }, isAuthenticated: true, progress: { X: { bestPct: 40 } }, review: {} } as any);
      // Sign-in sync establishes what the server already has.
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => true, data: () => ({ lessons: { X: { bestPct: 40 } } }) });
      await syncMasteryOnLogin('u1');
      (setDoc as jest.Mock).mockClear();
      (getDoc as jest.Mock).mockRejectedValue(new Error('offline'));
      startMasterySync();
      useStore.setState({ progress: { X: { bestPct: 40 }, Y: { bestPct: 80 } } } as any);
      jest.advanceTimersByTime(4000);
      jest.useRealTimers();
      await flush(); await flush();
      const call = (setDoc as jest.Mock).mock.calls.find(([ref]) => ref.path.endsWith('mastery/lessons'));
      expect(Object.keys(call[1].lessons)).toEqual(['Y']);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('flushMasterySync (sign-out)', () => {
  it('pushes a pending change immediately instead of dropping it', async () => {
    (getDoc as jest.Mock).mockResolvedValue({ exists: () => false, data: () => ({}) });
    useStore.setState({ user: { uid: 'u1' }, isAuthenticated: true, progress: {} } as any);
    startMasterySync();
    useStore.setState({ progress: { Z: { bestPct: 70 } } } as any);
    await flushMasterySync('u1');
    const call = (setDoc as jest.Mock).mock.calls.find(([ref]) => ref.path.endsWith('mastery/lessons'));
    expect(call[1].lessons.Z.bestPct).toBe(70);
  });
});
