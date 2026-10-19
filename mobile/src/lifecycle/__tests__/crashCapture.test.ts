import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CRASH_BREADCRUMB_KEY,
  BREADCRUMB_WAIT_MS,
  flushCrashBreadcrumb,
  installGlobalErrorHandlers,
  persistCrashBreadcrumb,
  releaseLabel,
  reportError,
  setCurrentRouteProvider,
  setTelemetryContext,
  setTelemetrySink,
  __resetTelemetryForTests,
} from '../../services/telemetry';
import { sanitizeDiagnostic } from '../../../../shared/telemetry';

const originalDev = __DEV__;
const g = globalThis as any;
const originalErrorUtils = g.ErrorUtils;

function crashError() {
  const e = new TypeError('Cannot read property of undefined for student@example.com');
  e.stack = 'TypeError: Cannot read property of undefined for student@example.com\n    at render (address at main.jsbundle:1:4242)\n    at x (main.jsbundle:1:99)';
  return e;
}

beforeEach(async () => {
  __resetTelemetryForTests();
  await AsyncStorage.clear();
});
afterEach(() => {
  (globalThis as any).__DEV__ = originalDev;
  g.ErrorUtils = originalErrorUtils;
  jest.useRealTimers();
});

it('a fatal breadcrumb persists sanitized data and is delivered once on the next launch with the crashed build', async () => {
  setTelemetryContext({ platform: 'ios', appVersion: '1.2.0', buildNumber: '61', updateId: 'old-update' });
  setCurrentRouteProvider(() => 'LessonDetail');
  await persistCrashBreadcrumb(crashError());
  const raw = await AsyncStorage.getItem(CRASH_BREADCRUMB_KEY);
  expect(raw).not.toMatch(/student|example|Cannot read/);

  // Next launch: a newer OTA is running.
  __resetTelemetryForTests();
  setTelemetryContext({ platform: 'ios', updateId: 'new-update' });
  const sink = jest.fn();
  setTelemetrySink(sink);
  expect(await flushCrashBreadcrumb()).toBe(true);
  expect(await flushCrashBreadcrumb()).toBe(false);
  expect(sink).toHaveBeenCalledTimes(1);
  const event = sink.mock.calls[0][0];
  expect(event.name).toBe('js_fatal_crash');
  expect(event.context.updateId).toBe('old-update');
  const wire = sanitizeDiagnostic(event)!;
  expect(wire.detail).toEqual(expect.objectContaining({
    fatal: true, previousSession: true, screen: 'LessonDetail', errorKind: 'undefined_access',
    topFrame: 'main.jsbundle:1:4242', occurrence: 1,
  }));
  expect(wire.error).toEqual({ name: 'TypeError', frames: ['main.jsbundle:1:4242', 'main.jsbundle:1:99'] });
  expect(JSON.stringify(wire)).not.toMatch(/student|example/);
});

it('drops stale or malformed breadcrumbs', async () => {
  const sink = jest.fn();
  setTelemetrySink(sink);
  await AsyncStorage.setItem(CRASH_BREADCRUMB_KEY, '{not json');
  expect(await flushCrashBreadcrumb()).toBe(false);
  await AsyncStorage.setItem(CRASH_BREADCRUMB_KEY, JSON.stringify({ v: 1, at: 0, detail: {}, context: {}, frames: [] }));
  expect(await flushCrashBreadcrumb(40 * 86_400_000)).toBe(false);
  expect(sink).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(CRASH_BREADCRUMB_KEY)).toBeNull();
});

it('release fatal: chains the previous handler only after the breadcrumb is written', async () => {
  (globalThis as any).__DEV__ = false;
  const previous = jest.fn();
  let handler: (e: unknown, fatal?: boolean) => void = () => {};
  g.ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler: (h: any) => { handler = h; } };
  installGlobalErrorHandlers();
  handler(crashError(), true);
  expect(previous).not.toHaveBeenCalled();
  await new Promise((r) => setTimeout(r, BREADCRUMB_WAIT_MS + 50));
  expect(previous).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem(CRASH_BREADCRUMB_KEY)).toContain('"fatal":true');
});

it('non-fatal uncaught errors report live and still chain', () => {
  (globalThis as any).__DEV__ = false;
  const previous = jest.fn();
  let handler: (e: unknown, fatal?: boolean) => void = () => {};
  g.ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler: (h: any) => { handler = h; } };
  const sink = jest.fn();
  setTelemetrySink(sink);
  installGlobalErrorHandlers();
  handler(crashError(), false);
  expect(previous).toHaveBeenCalledWith(expect.any(TypeError), false);
  expect(sink.mock.calls.find(([e]) => e.name === 'uncaught_error')?.[0].detail.fatal).toBe(false);
});

it('dedupes a loop of identical errors per session', () => {
  const sink = jest.fn();
  setTelemetrySink(sink);
  for (let i = 0; i < 10; i++) reportError(crashError());
  expect(sink).toHaveBeenCalledTimes(3);
  expect(sink.mock.calls.map(([e]) => e.detail.occurrence)).toEqual([1, 2, 3]);
});

it('release label names the binary and the OTA update', () => {
  expect(releaseLabel('fr', { appVersion: '1.2.0', buildNumber: '61', updateId: '1a2b3c4d5e6f', embeddedLaunch: false, runtimeVersion: '1.2.0', channel: 'production' }))
    .toBe('1.2.0 (61) · mise à jour 1a2b3c4d · runtime 1.2.0');
  expect(releaseLabel('ht', { appVersion: '1.2.0', buildNumber: '61', embeddedLaunch: true, channel: 'preview' }))
    .toBe('1.2.0 (61) · vèsyon entegre · preview');
});
