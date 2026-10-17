import { init, send, advance } from '../stateMachine';
import { revealMachine, REVEAL_TIMING } from '../machines';

describe('OpponentReveal `present` — an opponent known from the start (audit X1)', () => {
  it('plays found → introduce → settled from idle without a search state', () => {
    let s = send(revealMachine, init(revealMachine, 0), 'present', 0);
    expect(s.state).toBe('found');
    expect(s.entered.some((e) => e.state === 'searching')).toBe(false);
    s = advance(revealMachine, s, REVEAL_TIMING.found);
    expect(s.state).toBe('introduce');
    s = advance(revealMachine, s, REVEAL_TIMING.found + REVEAL_TIMING.introduce);
    expect(s.state).toBe('settled');
  });

  it('`start` (the round began, e.g. "Commencer") lands it at once', () => {
    let s = send(revealMachine, init(revealMachine, 0), 'present', 0);
    s = send(revealMachine, s, 'start', 100);
    expect(s.state).toBe('settled');
  });

  it('does nothing mid-search or once settled (no replay)', () => {
    const searching = send(revealMachine, init(revealMachine, 0), 'search', 0);
    expect(send(revealMachine, searching, 'present', 10).state).toBe('searching');
    const settled = send(revealMachine, init(revealMachine, 0), 'match', 0);
    expect(send(revealMachine, settled, 'present', 10).state).toBe('settled');
  });
});
