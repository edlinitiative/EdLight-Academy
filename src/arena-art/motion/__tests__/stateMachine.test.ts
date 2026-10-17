import {
  defineMachine, init, send, advance, setInput, nextDeadline, chainDuration, progress,
} from '../stateMachine';
import {
  revealMachine, countdownMachine, ceremonyMachine, beatAt, CEREMONY_TIMING, REVEAL_TIMING, GO_HOLD_MS,
} from '../machines';
import { DUR, EASE, MOTION_CSS_VARS } from '../tokens';

type S = 'a' | 'b' | 'c' | 'x';
type T = 'go' | 'stop' | 'alarm';
const toy = defineMachine<S, T, { level: number }>({
  id: 'toy',
  initial: 'a',
  inputs: { level: 0 },
  any: { alarm: 'x' },
  states: {
    a: { on: { go: 'b' }, always: [{ to: 'c', guard: (i) => i.level > 5 }] },
    b: { cosmetic: true, after: { ms: 100, to: 'c' }, on: { stop: 'a' } },
    c: { after: { ms: 50, to: 'a' } },
    x: {},
  },
});

describe('state machine core', () => {
  it('starts in the initial state and records the entry', () => {
    const s = init(toy, 1000);
    expect(s.state).toBe('a');
    expect(s.entered).toEqual([{ state: 'a', at: 1000, lateMs: 0, preempted: false }]);
  });

  it('ignores unhandled triggers', () => {
    const s = send(toy, init(toy, 0), 'stop', 10);
    expect(s.state).toBe('a');
    expect(s.entered).toEqual([]);
  });

  it('follows trigger then timed transitions, against the clock', () => {
    let s = send(toy, init(toy, 0), 'go', 10);
    expect(s.state).toBe('b');
    expect(nextDeadline(toy, s)).toBe(110);
    expect(progress(toy, s, 60)).toBeCloseTo(0.5);
    s = advance(toy, s, 109);
    expect(s.state).toBe('b');
    s = advance(toy, s, 110);
    expect(s.state).toBe('c');
  });

  it('a sleeping tab catches up through the whole chain with exact timestamps', () => {
    const s = advance(toy, send(toy, init(toy, 0), 'go', 0), 400);
    // b(0) → c(100) → a(150), then rest.
    expect(s.state).toBe('a');
    expect(s.entered.map((e) => [e.state, e.at, e.lateMs])).toEqual([['c', 100, 300], ['a', 150, 250]]);
  });

  it('authoritative Any-State input preempts a cosmetic state and cancels its exit', () => {
    let s = send(toy, init(toy, 0), 'go', 0);
    s = send(toy, s, 'alarm', 50);
    expect(s.state).toBe('x');
    expect(s.entered[s.entered.length - 1].preempted).toBe(true);
    expect(advance(toy, s, 10_000).state).toBe('x');
  });

  it('value inputs drive guarded condition transitions', () => {
    let s = init(toy, 0);
    s = setInput(toy, s, 'level', 3, 1);
    expect(s.state).toBe('a');
    s = setInput(toy, s, 'level', 9, 2);
    expect(s.state).toBe('c');
  });

  it('rejects definitions that target unknown states', () => {
    expect(() => defineMachine<'a', 'go', Record<string, never>>({
      id: 'bad', initial: 'a', inputs: {}, states: { a: { on: { go: 'nope' as 'a' } } },
    })).toThrow(/unknown state "nope"/);
  });

  it('does not loop forever on a mis-authored cycle', () => {
    const loop = defineMachine<'p' | 'q', 'go', Record<string, never>>({
      id: 'loop', initial: 'p', inputs: {},
      states: { p: { always: [{ to: 'q' }] }, q: { always: [{ to: 'p' }] } },
    });
    expect(() => init(loop, 0)).not.toThrow();
  });
});

describe('motion tokens', () => {
  it('match the brief timing table', () => {
    expect(DUR.press).toBeGreaterThanOrEqual(80); expect(DUR.press).toBeLessThanOrEqual(160);
    expect(DUR.component).toBeGreaterThanOrEqual(180); expect(DUR.component).toBeLessThanOrEqual(300);
    expect(DUR.navigation).toBeGreaterThanOrEqual(300); expect(DUR.navigation).toBeLessThanOrEqual(500);
    expect(DUR.intro).toBeGreaterThanOrEqual(1000); expect(DUR.intro).toBeLessThanOrEqual(2000);
    expect(DUR.ceremony).toBeGreaterThanOrEqual(4000); expect(DUR.ceremony).toBeLessThanOrEqual(7000);
  });
  it('expose the same values as CSS custom properties', () => {
    expect(MOTION_CSS_VARS['--mo-dur-press']).toBe(`${DUR.press}ms`);
    expect(MOTION_CSS_VARS['--mo-ease-enter']).toBe(EASE.enter);
    expect(Object.keys(MOTION_CSS_VARS)).toHaveLength(Object.keys(DUR).length + Object.keys(EASE).length);
  });
});

describe('opponent reveal machine', () => {
  it('searching → found → introduce → settled within one routine intro', () => {
    let s = send(revealMachine, init(revealMachine, 0), 'search', 0);
    expect(s.state).toBe('searching');
    s = send(revealMachine, s, 'match', 1000);
    expect(s.state).toBe('found');
    expect(advance(revealMachine, s, 1000 + REVEAL_TIMING.found).state).toBe('introduce');
    expect(advance(revealMachine, s, 1000 + DUR.intro).state).toBe('settled');
    expect(chainDuration(revealMachine, 'found').ms).toBe(DUR.intro);
  });
  it('cancel and fail are only reachable from a real search', () => {
    const idle = init(revealMachine, 0);
    expect(send(revealMachine, idle, 'cancel', 1).state).toBe('idle');
    const searching = send(revealMachine, idle, 'search', 1);
    expect(send(revealMachine, searching, 'cancel', 2).state).toBe('cancelled');
    expect(send(revealMachine, searching, 'fail', 2).state).toBe('failed');
    expect(send(revealMachine, send(revealMachine, searching, 'fail', 2), 'search', 3).state).toBe('searching');
  });
  it('the match starting preempts the cosmetic intro', () => {
    let s = send(revealMachine, send(revealMachine, init(revealMachine, 0), 'search', 0), 'match', 10);
    s = send(revealMachine, s, 'start', 200);
    expect(s.state).toBe('settled');
    expect(s.entered[0].preempted).toBe(true);
  });
  it('reconnecting into a known match lands settled without replaying', () => {
    const s = send(revealMachine, init(revealMachine, 0), 'match', 0);
    expect(s.state).toBe('settled');
    expect(s.entered.map((e) => e.state)).toEqual(['settled']);
  });
});

describe('ready countdown machine', () => {
  const at = (startsAt: number, now: number) =>
    setInput(countdownMachine, setInput(countdownMachine, init(countdownMachine, 0), 'armed', true, 0),
      'remaining', startsAt - now, now).state;
  it('beats are a pure function of the clock', () => {
    expect(beatAt({ armed: false, remaining: 100 })).toBe('idle');
    expect(beatAt({ armed: true, remaining: 5000 })).toBe('idle');
    expect(beatAt({ armed: true, remaining: 3000 })).toBe('three');
    expect(beatAt({ armed: true, remaining: 2000 })).toBe('two');
    expect(beatAt({ armed: true, remaining: 1 })).toBe('one');
    expect(beatAt({ armed: true, remaining: 0 })).toBe('go');
    expect(beatAt({ armed: true, remaining: -GO_HOLD_MS })).toBe('done');
  });
  it('the machine state always equals the clock beat, even after a long stall', () => {
    const start = 10_000;
    expect(at(start, 6000)).toBe('idle');
    expect(at(start, 7500)).toBe('three');
    expect(at(start, 8500)).toBe('two');
    expect(at(start, 9500)).toBe('one');
    expect(at(start, 10_100)).toBe('go');
    expect(at(start, 60_000)).toBe('done');
  });
  it('jumping straight to a late beat enters only that beat (no stale replay)', () => {
    let s = setInput(countdownMachine, init(countdownMachine, 0), 'remaining', 5000, 0);
    s = setInput(countdownMachine, s, 'armed', true, 0);
    s = setInput(countdownMachine, s, 'remaining', 400, 4600);
    expect(s.state).toBe('one');
    expect(s.entered.map((e) => e.state)).toEqual(['one']);
  });
});

describe('trophy ceremony machine', () => {
  it('runs dark → anticipation → reveal → roster → settled in 4–7 s', () => {
    const { ms, path } = chainDuration(ceremonyMachine, 'dark');
    expect(path).toEqual(['dark', 'anticipation', 'reveal', 'roster', 'settled']);
    expect(ms).toBe(Object.values(CEREMONY_TIMING).reduce((a, b) => a + b, 0));
    expect(ms).toBeGreaterThanOrEqual(4000); expect(ms).toBeLessThanOrEqual(7000);
  });
  it('provisional and tie never reach the winner reveal', () => {
    for (const t of ['provisional', 'tie'] as const) {
      let s = send(ceremonyMachine, init(ceremonyMachine, 0), t, 0);
      expect(s.state).toBe(t);
      s = send(ceremonyMachine, s, 'skip', 1);
      s = send(ceremonyMachine, s, 'replay', 2);
      s = advance(ceremonyMachine, s, 60_000);
      expect(s.state).toBe(t);
    }
  });
  it('a result turning provisional preempts a running ceremony', () => {
    let s = send(ceremonyMachine, init(ceremonyMachine, 0), 'confirm', 0);
    s = advance(ceremonyMachine, s, 2500);
    expect(s.state).toBe('reveal');
    s = send(ceremonyMachine, s, 'provisional', 2600);
    expect(s.state).toBe('provisional');
    expect(advance(ceremonyMachine, s, 60_000).state).toBe('provisional');
  });
  it('skip jumps to the settled composition; replay runs again', () => {
    let s = send(ceremonyMachine, init(ceremonyMachine, 0), 'confirm', 0);
    s = send(ceremonyMachine, s, 'skip', 300);
    expect(s.state).toBe('settled');
    s = send(ceremonyMachine, s, 'replay', 400);
    expect(s.state).toBe('dark');
  });
  it('waiting cannot be skipped into a result', () => {
    expect(send(ceremonyMachine, init(ceremonyMachine, 0), 'skip', 1).state).toBe('waiting');
  });
});
