import { createClassClient } from '../../../shared/classClient';

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
it('bounds token acquisition and never posts after the deadline', async () => {
  jest.useFakeTimers();
  let token!: (value: string) => void;
  const fetchMock = jest.fn(); global.fetch = fetchMock;
  const request = createClassClient('', () => new Promise((resolve) => { token = resolve; }));
  const pending = request('home'); const expected = expect(pending).rejects.toMatchObject({ code: 'timeout' });
  await jest.advanceTimersByTimeAsync(15001); await expected;
  token('late'); await Promise.resolve(); expect(fetchMock).not.toHaveBeenCalled();
});
it('requires authentication and uses only the verified bearer identity', async () => {
  const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })); global.fetch = fetchMock as any;
  await expect(createClassClient('', async () => null)('home')).rejects.toMatchObject({ code: 'unauthorized' });
  await createClassClient('', async () => 'token')('join', { code: 'ABC234', consent: true });
  expect(fetchMock).toHaveBeenCalledWith('/api/classes', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }));
});
