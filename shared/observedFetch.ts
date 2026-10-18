/** Technical outcomes only: no URL, request payload, response body or auth token. */
export function createObservedFetch(
  track: (name: string, detail?: Record<string, unknown>) => void,
  flow: 'arena' | 'challenge',
): typeof fetch {
  const failed = new Set<string>();
  const emit = (name: string, detail: Record<string, unknown>) => {
    try { track(name, detail); } catch { /* reporting must never change a request */ }
  };
  return async (input, init) => {
    const url = typeof input === 'string' ? input : '';
    // Known operations only. Never derive telemetry labels from an arbitrary URL.
    const suffix = url.split('/').pop();
    const step = suffix && ['register', 'answer', 'presence', 'create', 'accept'].includes(suffix) ? suffix : 'request';
    const started = Date.now();
    const operationId = `${started.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const base = { flow, step, operationId };
    emit('critical_request_started', base);
    try {
      const response = await globalThis.fetch(input, init);
      const detail = { ...base, httpStatus: response.status, durationMs: Date.now() - started };
      if (response.ok) {
        emit('critical_request_succeeded', detail);
        if (failed.delete(step)) emit('critical_request_recovered', detail);
      } else {
        failed.add(step);
        emit('critical_request_failed', { ...detail, reason: 'http' });
      }
      return response;
    } catch (error) {
      failed.add(step);
      emit('critical_request_failed', { ...base, reason: 'network', durationMs: Date.now() - started });
      throw error;
    }
  };
}
