/**
 * P0 code validation (2026-10-19): Sandra's request had no ceiling, so a
 * stalled fetch kept the panel "sending" forever and every later message was
 * ignored. authedFetch now takes an optional timeout that aborts the request.
 */
import { authedFetch } from '../firebase';

describe('authedFetch timeout', () => {
  it('aborts a request that never settles', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    (global as any).fetch = fetchMock;
    const p = authedFetch('/api/chat', { message: 'x' }, { timeoutMs: 1000 });
    await Promise.resolve(); await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await expect(p).rejects.toThrow('aborted');
    jest.useRealTimers();
  });
});
