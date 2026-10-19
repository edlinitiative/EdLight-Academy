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
 *
 * Error events are enriched with a privacy-safe signature, kind and top frame
 * (shared/errorSignature.ts) and gated per session. A fatal JS error leaves a
 * sanitized breadcrumb in AsyncStorage that is delivered on the next launch.
 * This is JAVASCRIPT crash capture only: a native crash (SIGSEGV in a
 * TurboModule, as in build 59) kills the process before any JS runs and needs
 * a native crash reporter shipped with a store build.
 */
import { createDiagnosticTransport } from '../../../shared/telemetry';
import { createErrorGate, describeError } from '../../../shared/errorSignature';

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
let routeProvider: (() => string | null | undefined) | null = null;
// One session = one JS runtime. A loop of identical failures reports each
// signature at most 3 times and at most 30 errors in all.
const errorGate = createErrorGate();

const RING_SIZE = 50;
const ring: TelemetryEvent[] = [];

export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

/** Merge stable context (build, update id, platform) into every future event. */
export function setTelemetryContext(next: Record<string, unknown>) {
  context = { ...context, ...next };
}

/** The navigator registers this so errors carry the static screen NAME (never params). */
export function setCurrentRouteProvider(next: (() => string | null | undefined) | null) {
  routeProvider = next;
}

function currentScreen(): string | null {
  try {
    const name = routeProvider?.();
    return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(name) ? name : null;
  } catch {
    return null;
  }
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
  routeProvider = null;
  ring.length = 0;
  errorGate.reset();
  globalHandlersInstalled = false;
}

/**
 * Adds signature / kind / top frame / screen to an error event and applies
 * the per-session gate. Returns null when the event must be dropped.
 */
function enrichError(event: TelemetryEvent): TelemetryEvent | null {
  const described = describeError(event.error);
  const occurrence = errorGate.admit(described.signature);
  if (occurrence == null) return null;
  return {
    ...event,
    detail: {
      screen: currentScreen(),
      ...event.detail,
      signature: described.signature,
      errorKind: described.errorKind,
      topFrame: described.topFrame,
      occurrence,
    },
  };
}

function record(full: TelemetryEvent) {
  ring.push(full);
  if (ring.length > RING_SIZE) ring.shift();
  try {
    sink?.(full);
  } catch {
    /* never let telemetry throw */
  }
}

function emit(input: TelemetryEvent) {
  const event = input.type === 'error' ? enrichError(input) : input;
  if (!event) return;
  // The event's own context wins: a breadcrumb from a crashed session keeps
  // the build/update that crashed, not the one now running.
  const merged = { ...context, ...event.context };
  record(Object.keys(merged).length ? { ...event, context: merged } : event);
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

/** A render error contained by an error boundary (the student saw the recovery screen). */
export function reportRenderError(error: unknown, boundary: string) {
  emit({ type: 'error', name: 'render_error', error, detail: { boundary, fatal: false }, timestamp: Date.now() });
}

// ── Build info ───────────────────────────────────────────────────────────────

/**
 * Which build and OTA update produced an event — what makes a report
 * attributable. Uses modules that are already installed (expo-constants,
 * expo-updates, expo-application); each read is guarded so telemetry never
 * breaks startup. No native dependency is added: this ships over the air.
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
    if (typeof Updates?.runtimeVersion === 'string') info.runtimeVersion = Updates.runtimeVersion;
    // EAS writes the update group into the manifest metadata; absent for the
    // embedded bundle.
    const group = Updates?.manifest?.metadata?.updateGroup;
    info.updateGroup = typeof group === 'string' ? group : null;
  } catch { /* unavailable (e.g. Expo Go) */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native');
    info.platform = Platform?.OS ?? null;
    const os = Platform?.Version;
    info.osVersion = typeof os === 'number' || typeof os === 'string' ? String(os) : null;
  } catch { /* unavailable */ }
  return info;
}

/**
 * "1.2.0 (61) · mise à jour 1a2b3c4d · runtime 1.2.0" — the exact build a
 * tester is running, shown in Profil so a report names the binary AND the OTA
 * update.
 */
export function releaseLabel(lang: 'fr' | 'ht', info: Record<string, unknown> = getBuildInfo()): string {
  const version = typeof info.appVersion === 'string' ? info.appVersion : '?';
  const build = typeof info.buildNumber === 'string' || typeof info.buildNumber === 'number' ? ` (${info.buildNumber})` : '';
  const update = typeof info.updateId === 'string' && !info.embeddedLaunch
    ? `${lang === 'ht' ? 'mizajou' : 'mise à jour'} ${info.updateId.slice(0, 8)}`
    : lang === 'ht' ? 'vèsyon entegre' : 'version intégrée';
  const runtime = typeof info.runtimeVersion === 'string' ? ` · runtime ${info.runtimeVersion}` : '';
  const channel = typeof info.channel === 'string' && info.channel !== 'production' ? ` · ${info.channel}` : '';
  return `${version}${build} · ${update}${runtime}${channel}`;
}

// ── Fatal crash breadcrumb ───────────────────────────────────────────────────

/**
 * A fatal JS error kills the app within milliseconds — the in-memory queue
 * never gets to send. Before handing the error to React Native's fatal
 * handler we persist a SANITIZED breadcrumb (signature, kind, frames, screen,
 * build — never the message) and deliver it on the next launch.
 */
export const CRASH_BREADCRUMB_KEY = 'diagnostics:fatal-breadcrumb';
export const BREADCRUMB_WAIT_MS = 400;
const BREADCRUMB_MAX_AGE_MS = 30 * 86_400_000;

type Breadcrumb = {
  v: 1;
  at: number;
  errorName: string;
  detail: Record<string, unknown>;
  context: Record<string, unknown>;
  frames: string[];
};

type KeyValueStore = {
  setItem: (key: string, value: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
};

function storage(): KeyValueStore | null {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    return (mod?.default ?? mod ?? null) as KeyValueStore | null;
  } catch {
    return null;
  }
}

const FRAME = /([a-zA-Z0-9_.-]{1,120}\.(?:js|jsx|ts|tsx|mjs|bundle|jsbundle|hbc)):(\d{1,8}):(\d{1,8})\)?$/;

/** Builds the breadcrumb from the error alone. Holds no message text. */
export function buildCrashBreadcrumb(error: unknown, now = Date.now()): Breadcrumb {
  const described = describeError(error);
  // Same rule as the wire sanitizer: only `file:line:col`.
  const stack = (error as { stack?: unknown } | null)?.stack;
  const frames = typeof stack === 'string'
    ? stack.split('\n').slice(1, 13).flatMap((line) => {
        const m = line.trim().match(FRAME);
        return m ? [`${m[1]}:${m[2]}:${m[3]}`] : [];
      })
    : [];
  return {
    v: 1,
    at: now,
    errorName: described.name,
    detail: {
      fatal: true,
      screen: currentScreen(),
      signature: described.signature,
      errorKind: described.errorKind,
      topFrame: described.topFrame,
    },
    context: { ...context },
    frames,
  };
}

export async function persistCrashBreadcrumb(error: unknown): Promise<void> {
  try {
    await storage()?.setItem(CRASH_BREADCRUMB_KEY, JSON.stringify(buildCrashBreadcrumb(error)));
  } catch { /* best effort */ }
}

/**
 * Sends (and clears) a breadcrumb left by a session that crashed. Called once
 * at startup, after the transport exists. Stale (> 30 days) and malformed
 * breadcrumbs are dropped. Resolves true when one was delivered to the sink.
 */
export async function flushCrashBreadcrumb(now = Date.now()): Promise<boolean> {
  const store = storage();
  if (!store) return false;
  try {
    const raw = await store.getItem(CRASH_BREADCRUMB_KEY);
    if (!raw) return false;
    await store.removeItem(CRASH_BREADCRUMB_KEY);
    const crumb = JSON.parse(raw) as Breadcrumb;
    if (crumb?.v !== 1 || typeof crumb.at !== 'number' || now - crumb.at > BREADCRUMB_MAX_AGE_MS) return false;
    const crumbContext = crumb.context && typeof crumb.context === 'object' ? crumb.context : {};
    // Not re-enriched: the signature was computed from the real error, and a
    // crash is always worth one report.
    record({
      type: 'error',
      name: 'js_fatal_crash',
      error: { name: crumb.errorName, frames: Array.isArray(crumb.frames) ? crumb.frames : [] },
      detail: { ...crumb.detail, previousSession: true, occurrence: 1 },
      context: { ...context, ...crumbContext },
      timestamp: crumb.at,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Global handlers ──────────────────────────────────────────────────────────

let globalHandlersInstalled = false;

/**
 * Report errors nothing else caught:
 *  - JS exceptions via RN's ErrorUtils (the previous handler still runs, so dev
 *    red boxes and the native crash path are unchanged). A FATAL error in a
 *    release build first persists a crash breadcrumb (bounded wait of
 *    BREADCRUMB_WAIT_MS), then hands over to the previous handler;
 *  - unhandled promise rejections via Hermes' rejection tracker (or a global
 *    'unhandledrejection' event where one exists). Installed in release builds
 *    only — in dev, RN's own tracker drives LogBox warnings and replacing it
 *    would hide them. (Promise polyfill's tracker for other engines is not
 *    wired: Hermes is the only engine this app ships.)
 * Also delivers a previous session's crash breadcrumb. Idempotent.
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
      const callPrevious = () => { try { previous?.(error, isFatal); } catch { /* ignore */ } };
      if (!isFatal || __DEV__) {
        reportUncaught('uncaught_error', error, { fatal: !!isFatal });
        callPrevious();
        return;
      }
      // Fatal in release: the default handler terminates the app, so the
      // live queue would never send. The breadcrumb is what survives.
      let done = false;
      const finish = () => { if (!done) { done = true; callPrevious(); } };
      setTimeout(finish, BREADCRUMB_WAIT_MS);
      void persistCrashBreadcrumb(error).then(finish, finish);
    });
  }

  if (!__DEV__) {
    const hermes = g.HermesInternal;
    try {
      const options = {
        allRejections: true,
        onUnhandled: (_id: number, rejection: unknown) => {
          reportUncaught('unhandled_rejection', rejection);
        },
        onHandled: () => {},
      };
      if (hermes?.enablePromiseRejectionTracker && (hermes.hasPromise?.() ?? true)) {
        hermes.enablePromiseRejectionTracker(options);
      } else if (typeof g.addEventListener === 'function') {
        // Engines exposing the web event instead (not Hermes today).
        g.addEventListener('unhandledrejection', (e: { reason?: unknown }) => {
          reportUncaught('unhandled_rejection', e?.reason);
        });
      }
    } catch { /* tracker unavailable — nothing to install */ }
  }

  // A previous session's fatal crash, now that a transport may exist.
  void flushCrashBreadcrumb();
}
