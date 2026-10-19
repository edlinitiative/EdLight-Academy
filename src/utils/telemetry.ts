import { createDiagnosticTransport } from '../../shared/telemetry';
import { createErrorGate, describeError } from '../../shared/errorSignature';

export type TelemetryEvent = {
  type: 'error' | 'event';
  name: string;
  detail?: Record<string, unknown>;
  error?: unknown;
  context?: Record<string, unknown>;
  timestamp: number;
};

type Sink = (event: TelemetryEvent) => void;

let sink: Sink | null = null;
let installed = false;
let context: Record<string, unknown> = {};
// Per page-load dedupe: each signature at most 3 times, 30 errors in all.
const errorGate = createErrorGate();

export function setTelemetryContext(next: Record<string, unknown>) {
  context = { ...context, ...next };
}

/** Register the production reporter (e.g. forward to Sentry). */
export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

/** The deployed commit (DefinePlugin, webpack.config.js `releaseId`). */
export function getWebRelease(): string {
  return process.env.EDLIGHT_RELEASE || 'local';
}

/**
 * The first path segment only ("courses", "arena", "admin") — never ids,
 * query strings or the rest of the path.
 */
export function currentScreen(pathname?: string): string | null {
  try {
    const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    const first = String(path || '').split('/')[1] || '';
    if (!first) return 'home';
    return /^[a-z][a-z-]{0,29}$/.test(first) ? first : 'other';
  } catch {
    return null;
  }
}

function enrichError(event: TelemetryEvent): TelemetryEvent | null {
  const described = describeError(event.error);
  const occurrence = errorGate.admit(described.signature);
  if (occurrence == null) return null;
  return {
    ...event,
    // A failed lazy route is its own, actionable event.
    name: described.errorKind === 'chunk_load' && event.name !== 'render_error' ? 'chunk_load_error' : event.name,
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

function emit(input: TelemetryEvent) {
  const event = input.type === 'error' ? enrichError(input) : input;
  if (!event) return;
  try {
    sink?.({ ...event, context: { ...context, ...event.context } });
  } catch {
    /* never let telemetry throw */
  }
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const label = `[telemetry:${event.type}] ${event.name}`;
    if (event.error) console.error(label, event.error, event.detail || '');
    else console.warn(label, event.detail || '');
  }
}

/** Report a handled error with optional context. */
export function reportError(error: unknown, detail?: Record<string, unknown>) {
  emit({ type: 'error', name: 'handled_error', error, detail, timestamp: Date.now() });
}

/** A render error contained by an error boundary ('root' or 'route'). */
export function reportRenderError(error: unknown, boundary: string) {
  emit({ type: 'error', name: 'render_error', error, detail: { boundary, fatal: false }, timestamp: Date.now() });
}

/** Track a product analytics event (lesson_start, quiz_attempt, …). */
export function trackEvent(name: string, detail?: Record<string, unknown>) {
  emit({ type: 'event', name, detail, timestamp: Date.now() });
}

/** Test helper. */
export function __resetWebTelemetryForTests() {
  sink = null;
  installed = false;
  context = {};
  errorGate.reset();
}

/** Install global handlers once, as early as possible in app bootstrap. */
export function initTelemetry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  setTelemetryContext({ platform: 'web',
    release: getWebRelease(),
    environment: process.env.NODE_ENV || 'development' });
  if (process.env.NODE_ENV === 'production') {
    const transport = createDiagnosticTransport({
      send: (events, signal) => fetch('/api/telemetry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }), signal, keepalive: true,
        credentials: 'omit',
      }),
    });
    setTelemetrySink(transport.enqueue);
    window.addEventListener('online', () => { void transport.flush(); });
    window.addEventListener('pagehide', () => { void transport.flush(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void transport.flush();
    });
  }

  window.addEventListener('error', (e) => {
    // Opaque cross-origin script errors (ads, analytics) carry nothing
    // actionable and would crowd out real signatures.
    if (!e.error && /^Script error\.?$/i.test(String(e.message || ''))) return;
    emit({
      type: 'error',
      name: 'window_error',
      error: e.error || e.message,
      detail: { fatal: false },
      timestamp: Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    emit({
      type: 'error',
      name: 'unhandled_rejection',
      error: e.reason,
      timestamp: Date.now(),
    });
  });
}
