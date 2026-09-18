/**
 * Which tournament a projector shows when nobody types a URL.
 *
 * The ordering is a product decision, not plumbing: get it wrong and a hall
 * full of people watches last month's champion while this month's first
 * question is live. It is also exactly the kind of thing that is quietly wrong
 * for weeks, so it is tested rather than eyeballed.
 */
import { pickOnAir } from '../../broadcast/useOnAir';

const row = (id: string, state: string, startsAt = 0) => ({ id, state, startsAt });

describe('pickOnAir', () => {
  it('shows nothing when there is nothing to show', () => {
    expect(pickOnAir([])).toBeNull();
    expect(pickOnAir([row('x', 'draft')])).toBeNull();
  });

  it('prefers the tournament that is actually being played', () => {
    expect(pickOnAir([
      row('sept', 'final'),
      row('oct', 'live'),
      row('nov', 'registration'),
    ])).toBe('oct');
  });

  it('prefers grading over a finished tournament — the scores are still settling', () => {
    expect(pickOnAir([row('sept', 'final'), row('oct', 'grading')])).toBe('oct');
  });

  it('shows the doors before a podium that has already been up for two days', () => {
    expect(pickOnAir([row('sept', 'provisional'), row('oct', 'doors')])).toBe('oct');
  });

  it('shows the fresh podium over the old record', () => {
    expect(pickOnAir([row('aout', 'final'), row('sept', 'provisional')])).toBe('sept');
  });

  it('falls back to the last champion, then to the next announcement', () => {
    expect(pickOnAir([row('sept', 'final')])).toBe('sept');
    expect(pickOnAir([row('nov', 'registration')])).toBe('nov');
    expect(pickOnAir([row('sept', 'final'), row('nov', 'registration')])).toBe('sept');
  });

  it('takes the most recent when two sit in the same state', () => {
    expect(pickOnAir([row('old', 'final', 1000), row('new', 'final', 9000)])).toBe('new');
  });

  it('ignores a state it does not know', () => {
    expect(pickOnAir([row('x', 'void'), row('y', 'archived')])).toBeNull();
  });
});
