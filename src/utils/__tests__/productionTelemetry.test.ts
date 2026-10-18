describe('web production telemetry bootstrap', () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalRelease = process.env.EDLIGHT_RELEASE;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    process.env.NODE_ENV = originalEnvironment;
    if (originalRelease === undefined) delete process.env.EDLIGHT_RELEASE;
    else process.env.EDLIGHT_RELEASE = originalRelease;
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sends a controlled error through the installed global handler with the web release', async () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'production';
    process.env.EDLIGHT_RELEASE = 'test-commit';
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202 });
    const listeners: Record<string, (event: any) => void> = {};
    jest.spyOn(window, 'addEventListener').mockImplementation((name, listener) => { listeners[name] = listener as any; });
    jest.spyOn(document, 'addEventListener').mockImplementation(() => {});
    jest.isolateModules(() => {
      const { initTelemetry } = require('../telemetry');
      initTelemetry();
      initTelemetry();
      listeners.error({ error: new TypeError('private student answer'), filename: 'https://example.com?token=secret', lineno: 1, colno: 2 });
    });
    await jest.advanceTimersByTimeAsync(2000);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/telemetry');
    const { events } = JSON.parse(request.body);
    expect(events[0].context).toEqual({ platform: 'web', release: 'test-commit', environment: 'production' });
    expect(events[0].name).toBe('window_error');
    expect(request.body).not.toMatch(/private|secret|example.com/);
    expect(request).toEqual(expect.objectContaining({ credentials: 'omit', keepalive: true }));
  });

  it('keeps development traffic off the production reporting endpoint', async () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'development';
    globalThis.fetch = jest.fn();
    jest.spyOn(window, 'addEventListener').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.isolateModules(() => {
      const { initTelemetry, trackEvent } = require('../telemetry');
      initTelemetry();
      trackEvent('practice_started');
    });
    await jest.advanceTimersByTimeAsync(5000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
