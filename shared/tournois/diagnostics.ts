/**
 * Tournament attempt diagnostics, shared by the web and mobile services.
 *
 * Events describe the transport and the server's receipt only: never the
 * tournament id, PIN, title, a uid, the chosen option or whether it was
 * correct (the play endpoint deliberately never says). `errorCode` is a server
 * error token, `round` a small index, durations are milliseconds.
 *
 *   tournament_join_result        { outcome: joined|already|failed, errorCode?, durationMs }
 *   tournament_attempt_started    { phase: round, round, total, durationMs }
 *   tournament_attempt_recovered  { phase: round, round, count, total, recovered, durationMs }
 *   tournament_answer_receipt     { phase: round|live, round?, outcome: accepted|duplicate|rejected|late, status?, durationMs }
 *   tournament_attempt_failed     { phase, action: start|answer|live_answer|review, round?, errorCode, durationMs }
 *   tournament_result_viewed      { phase, round?, count, durationMs }
 *   tournament_cancel_result      { outcome: confirmed|failed, errorCode?, durationMs }
 *
 * HTTP-level start/success/failure/recovery comes separately from
 * createObservedFetch(…, 'tournois').
 */
export type TournamentOp = 'join' | 'start' | 'answer' | 'live_answer' | 'review' | 'cancel';

type Track = (name: string, detail?: Record<string, unknown>) => void;
interface ResultLike {
  ok: boolean;
  error?: string;
  data?: any;
}

/** Server codes are short snake_case tokens; anything else is collapsed. */
export const safeCode = (code: unknown): string =>
  typeof code === 'string' && /^[a-z0-9_]{1,40}$/.test(code) ? code : 'unknown';

const smallInt = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1000 ? n : undefined;

function classify(op: TournamentOp, result: ResultLike, durationMs: number, round?: number): [string, Record<string, unknown>] {
  const data = result.data || {};
  const errorCode = safeCode(result.error);
  switch (op) {
    case 'join':
      return ['tournament_join_result', result.ok
        ? { outcome: data.already ? 'already' : 'joined', durationMs }
        : { outcome: 'failed', errorCode, durationMs }];
    case 'cancel':
      return ['tournament_cancel_result', result.ok
        ? { outcome: 'confirmed', durationMs }
        : { outcome: 'failed', errorCode, durationMs }];
    case 'start': {
      if (!result.ok) return ['tournament_attempt_failed', { phase: 'round', action: 'start', errorCode, durationMs }];
      const pos = smallInt(data.pos) ?? 0;
      const base = { phase: 'round', round: smallInt(data.round), total: smallInt(data.count), durationMs };
      // The server already held this attempt (a reload, restart or second
      // device): the student resumes where the server says, not from zero.
      return pos > 0 || data.done === true
        ? ['tournament_attempt_recovered', { ...base, count: pos, recovered: true }]
        : ['tournament_attempt_started', base];
    }
    case 'answer':
    case 'live_answer': {
      const phase = op === 'live_answer' ? 'live' : 'round';
      const at = op === 'answer' ? { round: smallInt(round) } : {};
      if (!result.ok) {
        if (errorCode === 'answers_closed') return ['tournament_answer_receipt', { phase, ...at, outcome: 'late', durationMs }];
        return ['tournament_attempt_failed', { phase, action: op, ...at, errorCode, durationMs }];
      }
      const outcome = data.duplicate ? 'duplicate' : data.recorded ? 'accepted' : 'rejected';
      const status = op === 'answer' ? (data.done ? 'finished' : 'open') : undefined;
      return ['tournament_answer_receipt', { phase, ...at, outcome, ...(status ? { status } : {}), durationMs }];
    }
    case 'review': {
      const phase = round === undefined ? 'live' : 'round';
      const at = round === undefined ? {} : { round: smallInt(round) };
      if (!result.ok) return ['tournament_attempt_failed', { phase, action: 'review', ...at, errorCode, durationMs }];
      return ['tournament_result_viewed', { phase, ...at, count: Array.isArray(data.items) ? data.items.length : 0, durationMs }];
    }
  }
}

/** Wraps a service call that never rejects; reporting can never change its result. */
export function createTournamentDiagnostics(track: Track) {
  return async function observe<R extends ResultLike>(op: TournamentOp, call: () => Promise<R>, round?: number): Promise<R> {
    const started = Date.now();
    const result = await call();
    try {
      const [name, detail] = classify(op, result, Date.now() - started, round);
      for (const key of Object.keys(detail)) if (detail[key] === undefined) delete detail[key];
      track(name, detail);
    } catch { /* diagnostics are best effort */ }
    return result;
  };
}
