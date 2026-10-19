import {
  installProductionTelemetry, flushTelemetry, reportError, trackEvent,
  __resetTelemetryForTests,
} from '../../services/telemetry';

jest.mock('expo-constants', () => ({
  __esModule: true, default: { expoConfig: { version: '1.6.0', runtimeVersion: '1.2.0' } },
}));
jest.mock('expo-updates', () => ({ updateId: 'ota-test', channel: 'preview', isEmbeddedLaunch: false }));
jest.mock('expo-application', () => ({ nativeBuildVersion: '42', nativeApplicationVersion: '1.6.0' }));

const originalFetch = globalThis.fetch;
const originalDev = __DEV__;

beforeEach(() => {
  (globalThis as any).__DEV__ = false;
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202 });
  __resetTelemetryForTests();
});
afterEach(() => {
  __resetTelemetryForTests();
  (globalThis as any).__DEV__ = originalDev;
  globalThis.fetch = originalFetch;
});

it('delivers a controlled error with binary and OTA context without private text', async () => {
  installProductionTelemetry();
  installProductionTelemetry();
  reportError(new Error('private answer'), { flow: 'exam', answer: 'private', email: 'student@example.com' });
  await flushTelemetry();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  const [url, request] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('https://academy.edlight.org/api/telemetry');
  const { events } = JSON.parse(request.body);
  expect(events).toHaveLength(1);
  expect(events[0].context).toEqual(expect.objectContaining({
    platform: 'ios', appVersion: '1.6.0', buildNumber: '42', runtimeVersion: '1.2.0',
    updateId: 'ota-test', channel: 'preview', embeddedLaunch: false, environment: 'preview',
  }));
  expect(events[0].detail).toEqual(expect.objectContaining({
    flow: 'exam', signature: expect.stringMatching(/^[0-9a-f]{8}$/), errorKind: 'unknown', occurrence: 1,
  }));
  expect(Object.keys(events[0].detail).sort()).toEqual(
    expect.arrayContaining(['errorKind', 'flow', 'occurrence', 'signature']),
  );
  expect(events[0].detail).not.toHaveProperty('answer');
  expect(events[0].detail).not.toHaveProperty('email');
  expect(request.body).not.toMatch(/private|student@example/);
  expect(request.credentials).toBe('omit');
});

it('does not send development events to production', async () => {
  (globalThis as any).__DEV__ = true;
  installProductionTelemetry();
  trackEvent('practice_started');
  await flushTelemetry();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
