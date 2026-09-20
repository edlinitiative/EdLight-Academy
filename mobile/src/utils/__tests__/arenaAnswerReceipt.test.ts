import { classifyAnswerResult } from '../arenaAnswerReceipt';

describe('classifyAnswerResult', () => {
  it('is "sending" while the mutation has not settled', () => {
    expect(classifyAnswerResult(null)).toBe('sending');
  });

  it('is "accepted" on a genuine server acceptance', () => {
    expect(classifyAnswerResult({ ok: true, recorded: true, duplicate: false })).toBe('accepted');
  });

  it('is "accepted" on a replayed duplicate — the first attempt already landed', () => {
    expect(classifyAnswerResult({ ok: true, recorded: true, duplicate: true })).toBe('accepted');
  });

  it('CLOSED: a dropped connection is retryable, not a silent "sent"', () => {
    // This is the exploit's honest twin: the old screen showed "Réponse
    // envoyée" here too, because the mutation resolved without throwing.
    expect(classifyAnswerResult({ ok: false, error: 'offline' })).toBe('retryable');
  });

  it('CLOSED: an unrecognised server error is retryable rather than assumed final', () => {
    expect(classifyAnswerResult({ ok: false, error: 'http_500' })).toBe('retryable');
    expect(classifyAnswerResult({ ok: false, error: 'unknown' })).toBe('retryable');
  });

  it('a closed window is rejected, not retryable — trying again cannot fix a moment that passed', () => {
    expect(classifyAnswerResult({ ok: false, error: 'window_closed' })).toBe('rejected');
    expect(classifyAnswerResult({ ok: false, error: 'no_window' })).toBe('rejected');
    expect(classifyAnswerResult({ ok: false, error: 'answers_closed' })).toBe('rejected');
  });

  it('treats a structural rejection (never registered / ineligible) as terminal too', () => {
    expect(classifyAnswerResult({ ok: false, error: 'not_registered' })).toBe('rejected');
    expect(classifyAnswerResult({ ok: false, error: 'not_eligible' })).toBe('rejected');
  });
});
