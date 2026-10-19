/** Bounded API transport. Mutation retries retain their operation ID at the form. */
import { COMPETITION_ERROR_MESSAGES } from './errors';
export class WorkspaceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const operationId = () =>
  `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function createCompetitionClient(options: {
  base: string;
  token: () => Promise<string | null>;
  track?: (
    name: string,
    detail: Record<string, string | number | boolean>,
  ) => void;
}) {
  const failed = new Set<string>();
  return async (action: string, values: Record<string, unknown> = {}) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const track = (detail: Record<string, string | number | boolean>) => {
      try {
        options.track?.('competition_action', detail);
      } catch {
        /* diagnostics are best effort */
      }
    };
    track({ action, outcome: 'started' });
    try {
      const response = await Promise.race([
        (async () => {
          const token = await options.token();
          const response = await fetch(`${options.base}/api/competition`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ action, ...values }),
          });
          const body = await response.json();
          return { ok: response.ok, body };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new WorkspaceError('receipt_unknown'));
          }, 8000);
        }),
      ]);
      const body = response.body;
      if (!response.ok)
        throw new WorkspaceError(body.error || 'service_unavailable');
      if (failed.delete(action)) track({ action, outcome: 'recovered' });
      track({
        action,
        outcome: 'confirmed',
        durationMs: Date.now() - startedAt,
      });
      return body;
    } catch (error) {
      failed.add(action);
      const code = error instanceof WorkspaceError ? error.code : 'network';
      track({ action, outcome: code, durationMs: Date.now() - startedAt });
      throw error instanceof WorkspaceError
        ? error
        : new WorkspaceError('network');
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
export function workspaceError(code: string, ht: boolean): string {
  const specific = Object.prototype.hasOwnProperty.call(
    COMPETITION_ERROR_MESSAGES,
    code,
  )
    ? COMPETITION_ERROR_MESSAGES[code]
    : null;
  return specific
    ? specific[ht ? 1 : 0]
    : ht
      ? 'Aksyon an pa konfime. Verifye kondisyon yo epi eseye ankò.'
      : 'Action non confirmée. Vérifiez les conditions puis réessayez.';
}
