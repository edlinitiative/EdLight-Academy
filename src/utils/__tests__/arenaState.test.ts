import {
  ARENA_STATES, acceptsAnswers, canTransition, isPlayable, nextState,
  type ArenaState,
} from '../../../shared/arena/state';

/** Every transition the machine allows, written out rather than derived. */
const LEGAL: Array<[ArenaState, ArenaState]> = [
  ['draft', 'registration'],
  ['registration', 'doors'],
  ['doors', 'live'],
  ['live', 'grading'],
  ['grading', 'provisional'],
  ['provisional', 'final'],
  ['draft', 'void'],
  ['registration', 'void'],
  ['doors', 'void'],
  ['live', 'void'],
  ['grading', 'void'],
  ['provisional', 'void'],
];

const isLegal = (from: ArenaState, to: ArenaState) =>
  LEGAL.some(([f, t]) => f === from && t === to);

describe('canTransition — the happy path', () => {
  it.each(LEGAL)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe('canTransition — every illegal transition', () => {
  const pairs: Array<[ArenaState, ArenaState]> = [];
  for (const from of ARENA_STATES) {
    for (const to of ARENA_STATES) {
      if (!isLegal(from, to)) pairs.push([from, to]);
    }
  }

  it('checks the whole matrix, not a sample', () => {
    expect(pairs.length + LEGAL.length).toBe(ARENA_STATES.length ** 2);
  });

  it.each(pairs)('refuses %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('canTransition — the refusals that matter most', () => {
  it('refuses to skip grading, which would publish standings that never settled', () => {
    expect(canTransition('live', 'provisional')).toBe(false);
  });

  it('refuses to skip provisional, which would release prize money without the integrity review', () => {
    expect(canTransition('grading', 'final')).toBe(false);
    expect(canTransition('live', 'final')).toBe(false);
  });

  it('refuses to reopen a closed tournament', () => {
    expect(canTransition('grading', 'live')).toBe(false);
    expect(canTransition('provisional', 'live')).toBe(false);
    expect(canTransition('final', 'live')).toBe(false);
  });

  it('refuses to run the event backwards at any point', () => {
    expect(canTransition('doors', 'registration')).toBe(false);
    expect(canTransition('registration', 'draft')).toBe(false);
    expect(canTransition('final', 'provisional')).toBe(false);
  });

  it('refuses to open the doors on a tournament that was never published', () => {
    expect(canTransition('draft', 'doors')).toBe(false);
    expect(canTransition('draft', 'live')).toBe(false);
  });
});

describe('canTransition — void', () => {
  it.each(['draft', 'registration', 'doors', 'live', 'grading', 'provisional'] as ArenaState[])(
    'can void a tournament from %s, because an event that did not count must be stoppable at any point',
    (from) => { expect(canTransition(from, 'void')).toBe(true); },
  );

  it('cannot void a FINAL tournament — prizes are paid and a published champion is not erasable by one click', () => {
    expect(canTransition('final', 'void')).toBe(false);
  });

  it('is terminal: a voided event is re-run as a new tournament, never resurrected', () => {
    for (const to of ARENA_STATES) expect(canTransition('void', to)).toBe(false);
  });
});

describe('canTransition — self and nonsense', () => {
  it.each(ARENA_STATES)('refuses %s → itself, so a double-pressed control is a no-op and not a second start', (s) => {
    expect(canTransition(s, s)).toBe(false);
  });

  it('refuses a state that is not in the machine at all', () => {
    expect(canTransition('paused' as ArenaState, 'live')).toBe(false);
    expect(canTransition('live', 'paused' as ArenaState)).toBe(false);
  });
});

describe('nextState', () => {
  it('walks the whole happy path one step at a time', () => {
    const walked: ArenaState[] = ['draft'];
    let s = nextState('draft');
    while (s) { walked.push(s); s = nextState(s); }
    expect(walked).toEqual(['draft', 'registration', 'doors', 'live', 'grading', 'provisional', 'final']);
  });

  it('never proposes void — voiding an event is a decision, never the default next step', () => {
    for (const s of ARENA_STATES) expect(nextState(s)).not.toBe('void');
  });

  it('stops at final and at void', () => {
    expect(nextState('final')).toBeNull();
    expect(nextState('void')).toBeNull();
  });

  it('only ever proposes a transition canTransition would allow', () => {
    for (const from of ARENA_STATES) {
      const to = nextState(from);
      if (to) expect(canTransition(from, to)).toBe(true);
    }
  });

  it('returns null for a state outside the machine instead of guessing', () => {
    expect(nextState('paused' as ArenaState)).toBeNull();
  });
});

describe('acceptsAnswers — the one that must not be wrong', () => {
  it('accepts answers ONLY while live', () => {
    expect(acceptsAnswers('live')).toBe(true);
    for (const s of ARENA_STATES) {
      if (s !== 'live') expect(acceptsAnswers(s)).toBe(false);
    }
  });

  it('rejects an answer once grading has begun, which would score into a tournament already being totalled', () => {
    expect(acceptsAnswers('grading')).toBe(false);
  });

  it('rejects an answer after the standings are public, which would rewrite a result announced on a stream', () => {
    expect(acceptsAnswers('provisional')).toBe(false);
    expect(acceptsAnswers('final')).toBe(false);
  });

  it('rejects an answer before the first question, when no window has ever opened', () => {
    expect(acceptsAnswers('draft')).toBe(false);
    expect(acceptsAnswers('registration')).toBe(false);
    expect(acceptsAnswers('doors')).toBe(false);
  });

  it('rejects an answer to a voided event', () => {
    expect(acceptsAnswers('void')).toBe(false);
  });
});

describe('isPlayable — does the Arena own the screen?', () => {
  it('holds the takeover from doors through grading, so nobody wanders off and misses the podium', () => {
    expect(isPlayable('doors')).toBe(true);
    expect(isPlayable('live')).toBe(true);
    expect(isPlayable('grading')).toBe(true);
  });

  it('leaves the student in the Lobby before doors and on the Result screen after', () => {
    expect(isPlayable('draft')).toBe(false);
    expect(isPlayable('registration')).toBe(false);
    expect(isPlayable('provisional')).toBe(false);
    expect(isPlayable('final')).toBe(false);
    expect(isPlayable('void')).toBe(false);
  });

  it('is broader than acceptsAnswers, and never narrower — every state that scores is a state you are in', () => {
    for (const s of ARENA_STATES) {
      if (acceptsAnswers(s)) expect(isPlayable(s)).toBe(true);
    }
  });
});
