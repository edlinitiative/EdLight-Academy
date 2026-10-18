/** Wire contract for diagnostics. No user identity, answer text, URLs or raw errors. */
export interface DiagnosticEvent {
  type: 'error' | 'event';
  name: string;
  timestamp: number;
  detail?: Record<string, string | number | boolean | null>;
  context?: Record<string, string | number | boolean | null>;
  error?: { name: string; frames: string[] };
}

const DETAIL_KEYS = new Set([
  'flow', 'surface', 'step', 'reason', 'mode', 'source', 'outcome', 'action',
  'kind', 'type', 'status', 'httpStatus', 'durationMs', 'failures', 'fatal',
  'count', 'total', 'score', 'correct', 'answered', 'pct', 'due', 'courses',
  'signedIn', 'timed', 'timedOut', 'elapsedMs', 'scoped', 'has_position',
  'course_id', 'lesson_id', 'course', 'unit', 'category', 'channel', 'where',
  'game', 'grade', 'level', 'target', 'scope', 'ok', 'result', 'duel', 'operationId',
]);
const CONTEXT_KEYS = new Set([
  'platform', 'appVersion', 'buildNumber', 'runtimeVersion', 'updateId',
  'channel', 'embeddedLaunch', 'release', 'environment',
]);
const TOKEN = /^[a-zA-Z0-9_.:-]{1,100}$/;

function fields(value: unknown, allowed: Set<string>) {
  const out: Record<string, string | number | boolean | null> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) continue;
    if (item === null || typeof item === 'boolean') out[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item)) out[key] = item;
    else if (typeof item === 'string' && TOKEN.test(item)) out[key] = item;
  }
  return out;
}

/** Reapplied on the server: callers cannot bypass privacy filtering. */
export function sanitizeDiagnostic(input: unknown): DiagnosticEvent | null {
  if (!input || typeof input !== 'object') return null;
  const event = input as Record<string, unknown>;
  if (event.type !== 'event' && event.type !== 'error') return null;
  if (typeof event.name !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(event.name)) return null;
  if (typeof event.timestamp !== 'number' || !Number.isFinite(event.timestamp) || event.timestamp < 0) return null;
  const clean: DiagnosticEvent = {
    type: event.type, name: event.name, timestamp: event.timestamp,
    detail: fields(event.detail, DETAIL_KEYS), context: fields(event.context, CONTEXT_KEYS),
  };
  if (event.type === 'error') {
    const error = event.error as { name?: unknown; stack?: unknown; frames?: unknown } | undefined;
    const names = ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'EvalError', 'FirebaseError', 'AbortError'];
    // Only source coordinates, never the message, first stack line, function
    // arguments, URL query parameters or an absolute filesystem path.
    const raw = typeof error?.stack === 'string' ? error.stack.split('\n').slice(1) : error?.frames;
    const frames = Array.isArray(raw) ? raw.slice(0, 12).flatMap((line) => {
      if (typeof line !== 'string') return [];
      const match = line.match(/(?:^|[\s/@(])([a-zA-Z0-9_.-]{1,120}\.(?:js|jsx|ts|tsx|mjs|bundle)):(\d{1,8}):(\d{1,8})\)?$/);
      return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
    }) : [];
    clean.error = { name: names.includes(String(error?.name)) ? String(error?.name) : 'Error', frames };
  }
  return clean;
}

/** Bounded, best-effort delivery. Failures never reject into a student flow. */
export function createDiagnosticTransport(options: {
  send: (events: DiagnosticEvent[], signal: AbortSignal) => Promise<{ ok: boolean; status: number }>;
  delayMs?: number;
}) {
  const queue: DiagnosticEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let failures = 0;
  let disposed = false;
  let notBefore = 0;
  const schedule = (delay = options.delayMs ?? 2000) => {
    if (disposed || timer || !queue.length) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, Math.max(delay, notBefore - Date.now()));
  };
  const flush = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (active) return active;
    if (!queue.length) return Promise.resolve();
    if (Date.now() < notBefore) { schedule(); return Promise.resolve(); }
    if (timer) { clearTimeout(timer); timer = undefined; }
    const batch = queue.splice(0, 20);
    // The wire schema is ASCII-only; character count bounds payload bytes too.
    while (batch.length > 1 && JSON.stringify({ events: batch }).length > 48_000) {
      queue.unshift(batch.pop()!);
    }
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    // Promise.race also bounds a fetch implementation that ignores abort.
    const expired = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(new Error('diagnostic_timeout')); }, 8000);
    });
    active = (async () => {
      try {
        const response = await Promise.race([Promise.resolve().then(() => options.send(batch, controller.signal)), expired]);
        if (!response.ok && (response.status === 429 || response.status >= 500)) throw new Error('diagnostic_retry');
        failures = 0;
        notBefore = 0;
        // Other 4xx responses are permanent: discard this batch.
      } catch {
        failures += 1;
        // Three attempts per batch; a long outage cannot grow memory forever.
        if (failures < 3 && !disposed) queue.unshift(...batch);
        else failures = 0;
        queue.splice(100);
        notBefore = Date.now() + 30_000;
      } finally {
        clearTimeout(timeout!);
        active = undefined;
        schedule();
      }
    })();
    return active;
  };
  return {
    enqueue(input: unknown) {
      try {
        if (disposed) return;
        const event = sanitizeDiagnostic(input);
        if (!event) return;
        if (queue.length === 100) queue.shift();
        queue.push(event);
        schedule();
      } catch { /* diagnostics must never break the app */ }
    },
    flush,
    dispose() { disposed = true; if (timer) clearTimeout(timer); queue.length = 0; },
  };
}
