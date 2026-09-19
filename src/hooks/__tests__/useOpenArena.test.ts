/**
 * Which tournament the web Dashboard tells a signed-in student about.
 *
 * The ordering matters for the same reason `pickOnAir` on the broadcast side
 * is tested: get it wrong and the banner announces the wrong month, or stays
 * silent about a room that is filling right now.
 */
import { pickOpenArena } from '../useOpenArena';

const row = (id: string, state: string, startsAt = 0) => ({
  id, title: id, titleHt: id, state, startsAt, schools: 0, players: 0,
});

describe('pickOpenArena', () => {
  it('is silent when nothing is open for sign-up', () => {
    expect(pickOpenArena([])).toBeNull();
    expect(pickOpenArena([row('x', 'live')])).toBeNull();
    expect(pickOpenArena([row('x', 'final')])).toBeNull();
    expect(pickOpenArena([row('x', 'draft')])).toBeNull();
  });

  it('announces a tournament that is open for registration', () => {
    const result = pickOpenArena([row('oct', 'registration')]);
    expect(result?.id).toBe('oct');
    expect(result?.state).toBe('registration');
  });

  it('prefers doors over registration — the room filling is more urgent', () => {
    const result = pickOpenArena([row('sept', 'registration'), row('oct', 'doors')]);
    expect(result?.id).toBe('oct');
    expect(result?.state).toBe('doors');
  });

  it('never announces a tournament already live or finished, even alongside an open one', () => {
    const result = pickOpenArena([row('live-one', 'live'), row('next', 'registration')]);
    expect(result?.id).toBe('next');
  });

  it('picks the soonest when two share a state', () => {
    const result = pickOpenArena([
      row('later', 'registration', 9000),
      row('sooner', 'registration', 1000),
    ]);
    expect(result?.id).toBe('sooner');
  });
});
