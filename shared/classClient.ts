import { ClassError } from './classes';
/** Includes token acquisition and response decoding in the deadline. No persisted student data. */
export function createClassClient(base: string, token: () => Promise<string | null>, track?: (name: string, detail: Record<string, unknown>) => void) {
  return async <T = any>(action: string, values: Record<string, unknown> = {}): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const idToken = await token();
          if (!idToken) throw new ClassError('unauthorized');
          if (controller.signal.aborted) throw new ClassError('timeout');
          const res = await fetch(`${base}/api/classes`, { method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ ...values, action }) });
          const data = await res.json();
          if (!res.ok) throw new ClassError(data.error || 'unavailable');
          if (action === 'approve' && data.joined) {
            try { track?.('class_joined', { source: 'teacher_approval' }); } catch { /* best effort */ }
          }
          return data as T;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ClassError('timeout')); }, 15000); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  };
}
