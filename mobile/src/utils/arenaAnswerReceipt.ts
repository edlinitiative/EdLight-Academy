import type { ArenaWriteResult } from '../services/arenaService';

/**
 * What the student should be told about their tap, once the mutation settles.
 *
 * CORRECTION, from an external audit: `ArenaLiveScreen` used to lock the
 * moment a student tapped and show "Réponse envoyée" unconditionally, never
 * looking at what the mutation actually resolved to. `submitAnswer()` never
 * throws — a dropped connection or a window that had already closed comes
 * back as `{ok:false, error}`, a normal resolved value, not a rejected
 * promise — so "the mutation settled" was being read as "it was accepted."
 * A student answering on a weak signal at 18:40 saw the same reassuring
 * message whether their tap reached the server or not, with nothing kept to
 * tell them otherwise if they left the screen and came back.
 */
export type AnswerReceiptStatus = 'sending' | 'accepted' | 'retryable' | 'rejected';

/**
 * Errors the WINDOW itself produced: the question closed, was never open, or
 * this account was never eligible to answer it. Nothing about trying again
 * fixes these — the moment has passed, or never existed. Everything else
 * (a dropped connection, an unrecognised server error) is presumed
 * transient: the tap may not have reached the server at all, so retrying it
 * is the honest move, not an assumption that it already failed for good.
 */
const TERMINAL_ERRORS = new Set([
  'window_closed',
  'no_window',
  'answers_closed',
  'not_registered',
  'not_eligible',
]);

export function classifyAnswerResult(
  result: ArenaWriteResult<{ recorded: boolean; duplicate: boolean }> | null,
): AnswerReceiptStatus {
  if (result === null) return 'sending';
  if (result.ok) return 'accepted';
  return TERMINAL_ERRORS.has(result.error) ? 'rejected' : 'retryable';
}
