jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 0),
  // A transaction over the same spies: reads through getDoc, writes through setDoc.
  runTransaction: jest.fn(async (_db: unknown, fn: (tx: any) => Promise<unknown>) => {
    const { getDoc: get, setDoc: set } = jest.requireMock('firebase/firestore');
    const writes: Array<() => unknown> = [];
    const out = await fn({ get: (ref: unknown) => get(ref), set: (...a: unknown[]) => { writes.push(() => set(...a)); } });
    await Promise.all(writes.map((w) => w()));
    return out;
  }),
}));

import { getDoc } from 'firebase/firestore';
import useStore from '../../contexts/store';
import { isSameAccount, syncMasteryOnLogin } from '../masterySync';

describe('isSameAccount', () => {
  it('only matches the signed-in uid', () => {
    expect(isSameAccount('a', { user: { uid: 'a' }, isAuthenticated: true })).toBe(true);
    expect(isSameAccount('a', { user: { uid: 'b' }, isAuthenticated: true })).toBe(false);
    expect(isSameAccount('a', { user: { uid: 'a' }, isAuthenticated: false })).toBe(false);
    expect(isSameAccount('', { user: { uid: '' }, isAuthenticated: true })).toBe(false);
    expect(isSameAccount('a', null)).toBe(false);
  });
});

describe('syncMasteryOnLogin across an account switch', () => {
  it("drops A's merged map when the store switched to B mid-sync", async () => {
    useStore.setState({ user: { uid: 'A' }, isAuthenticated: true, progress: {}, review: {} } as any);
    let release: (v: any) => void = () => {};
    (getDoc as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const run = syncMasteryOnLogin('A');
    // Account switches to B while A's fetch is in flight.
    useStore.setState({ user: { uid: 'B' }, isAuthenticated: true, progress: {}, review: {} } as any);
    release({ exists: () => true, data: () => ({ lessons: { 'L-A': { completed: true } } }) });
    await run;
    expect(useStore.getState().progress).toEqual({});
  });

  it('applies the merged map when the account is unchanged', async () => {
    useStore.setState({ user: { uid: 'A' }, isAuthenticated: true, progress: {}, review: {} } as any);
    (getDoc as jest.Mock)
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ lessons: { 'L-A': { completed: true } } }) })
      .mockResolvedValueOnce({ exists: () => false, data: () => ({}) });
    await syncMasteryOnLogin('A');
    expect(useStore.getState().progress['L-A']).toMatchObject({ completed: true });
  });
});
