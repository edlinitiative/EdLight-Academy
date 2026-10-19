import { createDiagnosticTransport, sanitizeDiagnostic } from '../../../shared/telemetry';
import { createObservedFetch } from '../../../shared/observedFetch';

const event = (name = 'practice_started') => ({ type: 'event', name, timestamp: 10 });

describe('diagnostic privacy', () => {
  it('retains technical context and drops identities, free text, raw errors and nested data', () => {
    const error = new TypeError('private answer from student@example.com');
    error.stack = 'TypeError: private answer\n at submit (https://example.com/assets/app.123.js:10:20)\n at https://example.com/private.js?token=secret:1:2';
    const clean = sanitizeDiagnostic({ ...event('handled_error'), type: 'error', error,
      detail: { flow: 'exam', answer: 'private', email: 'student@example.com', reason: 'private answer', nested: { token: 'secret' }, count: 2 },
      context: { platform: 'ios', buildNumber: '42', updateId: 'u1', userId: 'private' } });
    expect(clean).toEqual({ type: 'error', name: 'handled_error', timestamp: 10,
      detail: { flow: 'exam', count: 2 }, context: { platform: 'ios', buildNumber: '42', updateId: 'u1' },
      error: { name: 'TypeError', frames: ['app.123.js:10:20'] } });
    expect(sanitizeDiagnostic(JSON.parse(JSON.stringify(clean)))).toEqual(clean);
  });

  it('keeps the deliberate tournament keys, sanitizes their values and still drops unknown keys', () => {
    const clean = sanitizeDiagnostic({ ...event('tournament_attempt_failed'),
      detail: { phase: 'round', round: 2, errorCode: 'answers_closed', recovered: true,
        code: 'AB2CD3EF', tid: 'abc123', pin: '482913', title: 'Finale', uid: 'u1', format: 'live' } });
    expect(clean?.detail).toEqual({ phase: 'round', round: 2, errorCode: 'answers_closed', recovered: true });
    const unsafe = sanitizeDiagnostic({ ...event(), detail: { phase: 'Lycée privé', round: Infinity, errorCode: 'a b', recovered: { nested: true } } });
    expect(unsafe?.detail).toEqual({});
  });

  it.each([null, {},{ ...event(), timestamp: Infinity }, { ...event(), name: 'student@example.com' }, { ...event(), type: 'custom' }])('rejects malformed input %#', (input) => {
    expect(sanitizeDiagnostic(input)).toBeNull();
  });
});

describe('bounded diagnostic delivery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('batches at most 20 events, bounds the queue, and filters before delivery', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    const transport = createDiagnosticTransport({ send });
    for (let i = 0; i < 150; i++) transport.enqueue(event(`event_${i}`));
    for (let i = 0; i < 5; i++) await transport.flush();
    expect(send).toHaveBeenCalledTimes(5);
    expect(send.mock.calls[0][0][0].name).toBe('event_50');
    expect(send.mock.calls.every(([events]) => events.length === 20)).toBe(true);
    transport.dispose();
  });

  it('backs off across flush triggers and reports recovery without concurrent requests', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, status: 202 });
    const transport = createDiagnosticTransport({ send });
    transport.enqueue(event());
    const first = transport.flush();
    expect(transport.flush()).toBe(first);
    await first;
    await transport.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
    transport.dispose();
  });

  it('discards permanent rejections and retries transient HTTP failures only three times', async () => {
    const send = jest.fn().mockResolvedValueOnce({ ok: false, status: 400 }).mockResolvedValue({ ok: false, status: 429 });
    const transport = createDiagnosticTransport({ send });
    transport.enqueue(event());
    await transport.flush();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    transport.enqueue(event());
    await transport.flush();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(send).toHaveBeenCalledTimes(4);
    transport.dispose();
  });

  it('times out a stalled reporter without rejecting into the caller', async () => {
    const send = jest.fn((_events, _signal) => new Promise<{ ok: boolean; status: number }>(() => {}));
    const transport = createDiagnosticTransport({ send });
    transport.enqueue(event());
    const pending = transport.flush();
    await jest.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toBeUndefined();
    expect(send.mock.calls[0][1].aborted).toBe(true);
    transport.dispose();
  });
});

describe('critical request diagnostics', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('preserves failures and responses and emits a recovery without private payloads', async () => {
    const response = { ok: true, status: 200 } as Response;
    globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('private')).mockResolvedValue(response);
    const track = jest.fn();
    const request = createObservedFetch(track, 'arena');
    const init = { method: 'POST', body: 'private answer', headers: { Authorization: 'secret' } };
    await expect(request('/api/arena/answer', init)).rejects.toThrow('private');
    await expect(request('/api/arena/answer', init)).resolves.toBe(response);
    expect(track.mock.calls.map(([name]) => name)).toEqual([
      'critical_request_started', 'critical_request_failed', 'critical_request_started', 'critical_request_succeeded', 'critical_request_recovered',
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/private|secret|\/api/);
    expect(globalThis.fetch).toHaveBeenLastCalledWith('/api/arena/answer', init);
  });

  it('labels tournament operations from a fixed list, never from the URL', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const track = jest.fn();
    const request = createObservedFetch(track, 'tournois');
    await request('https://academy.edlight.org/api/tournois/play');
    await request('/api/tournois/join');
    await request('/api/tournois/tick');
    await request('/api/tournois/secret-tid-482913');
    expect(track.mock.calls.filter(([n]) => n === 'critical_request_started').map(([, d]) => [d.flow, d.step]))
      .toEqual([['tournois', 'play'], ['tournois', 'join'], ['tournois', 'tick'], ['tournois', 'request']]);
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/secret|482913|academy/);
  });

  it('records HTTP rejection without changing it, even when the reporter throws', async () => {
    const response = { ok: false, status: 409 } as Response;
    globalThis.fetch = jest.fn().mockResolvedValue(response);
    const track = jest.fn(() => { throw new Error('reporter'); });
    await expect(createObservedFetch(track, 'challenge')('/api/challenges/accept')).resolves.toBe(response);
    expect(track).toHaveBeenLastCalledWith('critical_request_failed', expect.objectContaining({ httpStatus: 409, reason: 'http' }));
  });
});
