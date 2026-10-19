/**
 * fetch with a ceiling (roadmap §4: "no indefinite spinners").
 *
 * React Native's fetch has no read timeout: on a captive portal or "lie-fi" a
 * request can hang forever, and the screen awaiting it shows its skeleton
 * forever. This aborts after `ms` and rejects with a `FetchTimeoutError`, so
 * the caller's existing catch → error/retry state runs.
 */
export class FetchTimeoutError extends Error {
  constructor(public url: string, public ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'FetchTimeoutError';
  }
}

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = DEFAULT_FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const Ctor: typeof AbortController | undefined = (globalThis as any).AbortController;
  const controller = Ctor ? new Ctor() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { controller?.abort(); } catch { /* ignore */ }
      reject(new FetchTimeoutError(url, ms));
    }, ms);
  });
  try {
    return await Promise.race([
      fetchImpl(url, controller ? { ...init, signal: controller.signal } : init),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
