import { createDiagnosticTransport } from '../../shared/telemetry';

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

export function setTelemetryContext(next: Record<string, unknown>) {
  context = { ...context, ...next };
}

/** Register the production reporter (e.g. forward to Sentry). */
export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

function emit(event: TelemetryEvent) {
  try {
    sink?.({ ...event, context: { ...context, ...event.context } });
  } catch {
    /* never let telemetry throw */
  }
  if (process.env.NODE_ENV !== 'production') {
    const label = `[telemetry:${event.type}] ${event.name}`;
    if (event.error) console.error(label, event.error, event.detail || '');
    else console.warn(label, event.detail || '');
  }
}

/** Report a handled error with optional context. */
export function reportError(error: unknown, detail?: Record<string, unknown>) {
  emit({ type: 'error', name: 'handled_error', error, detail, timestamp: Date.now() });
}

/** Track a product analytics event (lesson_start, quiz_attempt, …). */
export function trackEvent(name: string, detail?: Record<string, unknown>) {
  emit({ type: 'event', name, detail, timestamp: Date.now() });
}

/** Install global handlers once, as early as possible in app bootstrap. */
export function initTelemetry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  setTelemetryContext({ platform: 'web',
    release: process.env.EDLIGHT_RELEASE || 'local',
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
    emit({
      type: 'error',
      name: 'window_error',
      error: e.error || e.message,
      detail: { source: e.filename, line: e.lineno, col: e.colno },
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
