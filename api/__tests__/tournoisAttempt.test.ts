/**
 * shared/tournois/attempt — one player's timed run through a round.
 * The clock is the server's `servedAt`; walking away never buys time.
 */
import { answerAttempt, attemptTotals, catchUp, newAttempt, SKIPPED } from '../../shared/tournois/attempt';

describe('a timed round attempt', () => {
  const Q = 10_000;
  const T0 = 1_900_000_000_000;
  const CLOSE = T0 + 3_600_000;
  const fresh = () => catchUp(newAttempt('u', 0, [4, 1, 7], T0), T0, Q, CLOSE);

  it('serves the first question on start, stamped by the server', () => {
    const a = fresh();
    expect(a.pos).toBe(0);
    expect(a.servedAt[0]).toBe(T0);
  });

  it('scores an in-time correct answer and serves the next question at once', () => {
    const r = answerAttempt(fresh(), 0, 2, 2, T0 + 3_000, Q, CLOSE);
    expect(r.refused).toBeNull();
    expect(r.attempt.points[0]).toBe(1000);
    expect(r.attempt.pos).toBe(1);
    expect(r.attempt.servedAt[1]).toBe(T0 + 3_000);
  });

  it('gives half points in the second half of the time', () => {
    const r = answerAttempt(fresh(), 0, 2, 2, T0 + 7_000, Q, CLOSE);
    expect(r.attempt.points[0]).toBe(500);
  });

  it('gives a late answer nothing, even when it is right', () => {
    const r = answerAttempt(fresh(), 0, 2, 2, T0 + Q + 5_000, Q, CLOSE);
    expect(r.attempt.points[0]).toBe(0);
    expect(r.attempt.correct[0]).toBe(false);
  });

  it('treats a retry of an answer that already landed as a duplicate, not a change', () => {
    const once = answerAttempt(fresh(), 0, 2, 2, T0 + 1_000, Q, CLOSE).attempt;
    const twice = answerAttempt(once, 0, 1, 2, T0 + 1_500, Q, CLOSE);
    expect(twice.duplicate).toBe(true);
    expect(twice.attempt.choices[0]).toBe(2);
  });

  it('refuses an answer to a question it has not reached', () => {
    expect(answerAttempt(fresh(), 2, 0, 0, T0 + 1_000, Q, CLOSE).refused).toBe('wrong_position');
  });

  it('closes abandoned questions and never serves after the round closes', () => {
    const a = catchUp(fresh(), CLOSE + 1, Q, CLOSE);
    expect(a.choices[0]).toBe(SKIPPED);
    expect(a.done).toBe(true);
    expect(attemptTotals(a)).toMatchObject({ points: 0, answered: 0, played: true });
  });
});
