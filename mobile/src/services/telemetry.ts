/**
 * Minimal, dependency-free observability layer (mirrors the web's
 * src/utils/telemetry.ts). Call sites use `trackEvent` / `reportError`;
 * a real reporter is wired in one place with `setTelemetrySink()`.
 *
 * Privacy: events carry technical context only (ids, mode, source, outcome).
 * Never put answers, names, emails or free text in `detail`.
 *
 * Release builds deliver sanitized batches to /api/telemetry. The local ring
 * remains useful during development; it is never persisted.
 */
import { createDiagnosticTransport } from '../../../shared/telemetry';

let productionTransport: ReturnType<typeof createDiagnosticTransport> | undefined;

/** Called before global handlers, so startup failures have a destination. */
export function installProductionTelemetry() {
  if (__DEV__ || productionTransport) return;
  const info = getBuildInfo();
  setTelemetryContext({ ...info, environment: info.channel || 'release' });
  productionTransport = createDiagnosticTransport({
    send: (events, signal) => fetch('https://academy.edlight.org/api/telemetry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }), signal, credentials: 'omit',
    }),
  });
  setTelemetrySink(productionTransport.enqueue);
}

export function flushTelemetry() {
  return productionTransport?.flush() ?? Promise.resolve();
}

export type TelemetryEvent = {
  type: 'error' | 'event';
  name: string;
  detail?: Record<string, unknown>;
  error?: unknown;
  /** Build/runtime context merged into every event (see setTelemetryContext). */
  context?: Record<string, unknown>;
  timestamp: number;
};

type Sink = (event: TelemetryEvent) => void;

let sink: Sink | null = null;
let context: Record<string, unknown> = {};

const RING_SIZE = 50;
const ring: TelemetryEvent[] = [];

export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

/** Merge stable context (build, update id, platform) into every future event. */
export function setTelemetryContext(next: Record<string, unknown>) {
  context = { ...context, ...next };
}

/** The last few events, newest last. For diagnostics only — never persisted. */
export function getRecentTelemetry(): TelemetryEvent[] {
  return ring.slice();
}

/** Test helper. */
export function __resetTelemetryForTests() {
  productionTransport?.dispose();
  productionTransport = undefined;
  sink = null;
  context = {};
  ring.length = 0;
}

function emit(event: TelemetryEvent) {
  const full: TelemetryEvent = Object.keys(context).length ? { ...event, context } : event;
  ring.push(full);
  if (ring.length > RING_SIZE) ring.shift();
  try {
    sink?.(full);
  } catch {
    /* never let telemetry throw */
  }
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    const label = `[telemetry:${event.type}] ${event.name}`;
    if (event.error) console.warn(label, event.error, event.detail || '');
    else console.log(label, event.detail || '');
  }
}

export function reportError(error: unknown, detail?: Record<string, unknown>) {
  emit({ type: 'error', name: 'handled_error', error, detail, timestamp: Date.now() });
}

export function trackEvent(name: string, detail?: Record<string, unknown>) {
  emit({ type: 'event', name, detail, timestamp: Date.now() });
}

/** Errors that escaped every boundary/catch. Kept separate so they can be counted. */
function reportUncaught(name: string, error: unknown, detail?: Record<string, unknown>) {
  emit({ type: 'error', name, error, detail, timestamp: Date.now() });
}

// ── Build info ───────────────────────────────────────────────────────────────

/**
 * Which build and OTA update produced an event — what makes a report
 * attributable. Uses modules that are already installed (expo-constants,
 * expo-updates); each read is guarded so telemetry never breaks startup.
 */
export function getBuildInfo(): Record<string, unknown> {
  const info: Record<string, unknown> = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    info.appVersion = Constants?.expoConfig?.version ?? null;
    const rv = Constants?.expoConfig?.runtimeVersion;
    info.runtimeVersion = typeof rv === 'string' ? rv : null;
  } catch { /* unavailable */ }
  try {
    // Native build number distinguishes binary releases sharing a runtime.
    const Application = require('expo-application');
    info.buildNumber = Application.nativeBuildVersion ?? null;
    info.appVersion = Application.nativeApplicationVersion ?? info.appVersion;
  } catch { /* unavailable */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Updates = require('expo-updates');
    info.updateId = Updates?.updateId ?? null;
    info.channel = Updates?.channel ?? null;
    info.embeddedLaunch = Updates?.isEmbeddedLaunch ?? null;
  } catch { /* unavailable (e.g. Expo Go) */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native');
    info.platform = Platform?.OS ?? null;
  } catch { /* unavailable */ }
  return info;
}

// ── Global handlers ──────────────────────────────────────────────────────────

let globalHandlersInstalled = false;

/**
 * Report errors nothing else caught:
 *  - JS exceptions via RN's ErrorUtils (the previous handler still runs, so dev
 *    red boxes and the native crash path are unchanged);
 *  - unhandled promise rejections via Hermes' rejection tracker. Installed in
 *    release builds only — in dev, RN's own tracker drives LogBox warnings and
 *    replacing it would hide them.
 * Idempotent.
 */
export function installGlobalErrorHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  setTelemetryContext(getBuildInfo());

  const g = globalThis as any;
  const errorUtils = g.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      reportUncaught('uncaught_error', error, { fatal: !!isFatal });
      try { previous?.(error, isFatal); } catch { /* ignore */ }
    });
  }

  if (!__DEV__) {
    const hermes = g.HermesInternal;
    try {
      if (hermes?.enablePromiseRejectionTracker && (hermes.hasPromise?.() ?? true)) {
        hermes.enablePromiseRejectionTracker({
          allRejections: true,
          onUnhandled: (_id: number, rejection: unknown) => {
            reportUncaught('unhandled_rejection', rejection);
          },
          onHandled: () => {},
        });
      }
    } catch { /* tracker unavailable — nothing to install */ }
  }
}
