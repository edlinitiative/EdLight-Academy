/**
 * Minimal, dependency-free observability layer.
 *
 * Captures uncaught errors, unhandled promise rejections, and explicit
 * `reportError()` / `trackEvent()` calls. By default it logs to the console in
 * dev and is quiet in production — but it is intentionally shaped so a real
 * provider (Sentry, LogRocket, GA4, …) can be wired in one place via
 * `setTelemetrySink()` without touching call sites across the app.
 */

export type TelemetryEvent = {
  type: 'error' | 'event';
  name: string;
  detail?: Record<string, unknown>;
  error?: unknown;
  timestamp: number;
};

type Sink = (event: TelemetryEvent) => void;

let sink: Sink | null = null;
let installed = false;

/** Register the production reporter (e.g. forward to Sentry). */
export function setTelemetrySink(next: Sink | null) {
  sink = next;
}

function emit(event: TelemetryEvent) {
  try {
    sink?.(event);
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
