/**
 * Crash/error signatures for production diagnostics (web + app + server).
 *
 * A raw error message can carry anything — a URL with a token, an email, a
 * uid, a school name, a student's answer. The diagnostics wire contract
 * (shared/telemetry.ts) therefore never transmits it. What leaves the device
 * is only:
 *
 *   - `signature`: 8 hex chars, FNV-1a over error class + kind + a NORMALIZED
 *     message (URLs, emails, numbers, ids and quoted text replaced by
 *     placeholders) + the top source frame. The normalized text itself is
 *     never sent, so it cannot leak; the hash only groups identical failures.
 *   - `errorKind`: one word from a fixed vocabulary (CHUNK_LOAD, NETWORK, …),
 *     derived from the message by pattern, never copied from it.
 *   - `topFrame`: `file:line:col` of the first parseable stack frame — a
 *     bundle coordinate, no path, no function argument.
 *
 * Pure and dependency-free: runs in Hermes, browsers and Node alike.
 */

export type ErrorKind =
  | 'chunk_load'
  | 'network'
  | 'undefined_access'
  | 'not_a_function'
  | 'not_defined'
  | 'stack_overflow'
  | 'invalid_hook'
  | 'render_loop'
  | 'invariant'
  | 'permission'
  | 'quota'
  | 'timeout'
  | 'abort'
  | 'json_parse'
  | 'storage'
  | 'unknown';

const KIND_PATTERNS: Array<[ErrorKind, RegExp]> = [
  ['chunk_load', /loading (css )?chunk|chunkloaderror|dynamically imported module|importing a module script failed|failed to fetch dynamically/i],
  ['network', /network request failed|failed to fetch|networkerror|load failed|net::|err_internet|offline/i],
  ['stack_overflow', /maximum call stack|too much recursion/i],
  ['render_loop', /too many re-renders|maximum update depth/i],
  ['invalid_hook', /invalid hook call|rendered (more|fewer) hooks|hooks can only be called/i],
  ['undefined_access', /cannot read propert|undefined is not an object|null is not an object|cannot (read|set) .* of (undefined|null)|is undefined|is null/i],
  ['not_a_function', /is not a function|not a function/i],
  ['not_defined', /is not defined|can't find variable|property .* doesn't exist/i],
  ['invariant', /invariant violation|minified react error/i],
  ['permission', /permission[-_ ]denied|missing or insufficient permissions|unauthori[sz]ed/i],
  ['quota', /quota|resource[-_ ]exhausted|exceeded the/i],
  ['timeout', /timed? ?out|deadline[-_ ]exceeded/i],
  ['abort', /abort/i],
  ['json_parse', /json parse|unexpected token|is not valid json|json\.parse/i],
  ['storage', /asyncstorage|localstorage|indexeddb|sessionstorage|storage/i],
];

/** One word from a fixed vocabulary. Never echoes the message. */
export function classifyError(name: string, message: string): ErrorKind {
  if (name === 'ChunkLoadError') return 'chunk_load';
  if (name === 'AbortError') return 'abort';
  for (const [kind, pattern] of KIND_PATTERNS) if (pattern.test(message)) return kind;
  return 'unknown';
}

/**
 * Message → template. Strips everything that could identify a person, a
 * record or a request. Used ONLY as hash input; never transmitted.
 */
export function normalizeErrorMessage(message: string): string {
  return String(message || '')
    .slice(0, 500)
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"`)]+/gi, '<url>')
    .replace(/[^\s@'"`]+@[^\s@'"`]+\.[a-z]{2,}/gi, '<email>')
    .replace(/(["'`])(?:(?!\1).){0,200}\1/g, '<str>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    // Firebase uids, push tokens, doc ids: long mixed alnum runs.
    .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}\b/g, '<id>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

const FRAME = /(?:^|[\s/@(])([a-zA-Z0-9_.-]{1,120}):(\d{1,8}):(\d{1,8})\)?$/;
const SOURCE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|bundle|jsbundle|hbc)$/;

/**
 * First parseable frame as `file:line:col`. Files without a source extension
 * (an OTA bundle stored under a content hash) become `bundle` — the name is
 * meaningless and the update id already identifies the bundle.
 */
export function topFrameOf(stack: unknown): string | null {
  if (typeof stack !== 'string') return null;
  for (const raw of stack.split('\n').slice(0, 20)) {
    const line = raw.trim();
    // Skip the message line ("TypeError: …") which has no coordinates anyway,
    // and native/anonymous frames.
    if (!line || /\[native code\]|<anonymous>$/.test(line)) continue;
    const m = line.match(FRAME);
    if (!m) continue;
    const file = SOURCE_EXT.test(m[1]) ? m[1] : 'bundle';
    return `${file}:${m[2]}:${m[3]}`.slice(0, 100);
  }
  return null;
}

/** FNV-1a 32-bit → 8 lowercase hex chars. Grouping only, not security. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const SIGNATURE_PATTERN = /^[0-9a-f]{8}$/;

export interface ErrorDescription {
  /** Class name as thrown; the wire sanitizer further restricts it to standard names. */
  name: string;
  errorKind: ErrorKind;
  signature: string;
  topFrame: string | null;
}

/** Everything diagnostics may know about an error. Never throws. */
export function describeError(error: unknown): ErrorDescription {
  let name = 'Error';
  let message = '';
  let stack: unknown;
  try {
    if (error && typeof error === 'object') {
      const e = error as { name?: unknown; message?: unknown; stack?: unknown };
      if (typeof e.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(e.name)) name = e.name;
      if (typeof e.message === 'string') message = e.message;
      stack = e.stack;
    } else if (typeof error === 'string') {
      message = error;
    }
  } catch { /* exotic thrown value */ }
  const errorKind = classifyError(name, message);
  const topFrame = topFrameOf(stack);
  const signature = fnv1a(`${name}|${errorKind}|${normalizeErrorMessage(message)}|${topFrame ?? ''}`);
  return { name, errorKind, signature, topFrame };
}

/**
 * Per-session dedupe + rate limit. A render loop or a polling failure can
 * throw hundreds of identical errors a minute; one session reports each
 * signature at most `perSignature` times and at most `perSession` errors in
 * all. Returns the occurrence number (1-based) when the event may be sent.
 */
export function createErrorGate(options: { perSignature?: number; perSession?: number } = {}) {
  const perSignature = options.perSignature ?? 3;
  const perSession = options.perSession ?? 30;
  const seen = new Map<string, number>();
  let sent = 0;
  return {
    admit(signature: string): number | null {
      const count = (seen.get(signature) ?? 0) + 1;
      if (seen.size < 500 || seen.has(signature)) seen.set(signature, count);
      if (count > perSignature || sent >= perSession) return null;
      sent += 1;
      return count;
    },
    reset() { seen.clear(); sent = 0; },
  };
}
