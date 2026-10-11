import {
  arenaScreen,
  classifyAnswerResult,
  countsFrom,
  effectiveShownAt,
  formatCountdown,
  isTestEdition,
  isValidDeviceHash,
  keyToChoice,
  makeWebDeviceHash,
  pickPlayableArena,
  qualificationState,
  tierRing,
  toLiveQuestion,
  toTournament,
  type ArenaTournament,
  type ScreenInput,
} from '../arenaPlay';
import { RENDER_GRACE_MS } from '../../../shared/arena/scoring';
import { ARENA_WEB_PLAY } from '../../../shared/arena/webPlay';

const base: ScreenInput = {
  loading: false,
  tournament: { state: 'live' },
  signedIn: true,
  registered: true,
  webPlay: true,
};
const screen = (over: Partial<ScreenInput>) => arenaScreen({ ...base, ...over });

describe('arenaScreen — which screen a student is on', () => {
  it('waits for the tournament and for the registration listener', () => {
    expect(screen({ loading: true })).toBe('loading');
    expect(screen({ registered: undefined })).toBe('loading');
  });

  it('maps a missing tournament, a draft and a void edition to their notices', () => {
    expect(screen({ tournament: null })).toBe('absent');
    expect(screen({ tournament: { state: 'draft' } })).toBe('notOpen');
    expect(screen({ tournament: { state: 'void' } })).toBe('void');
  });

  it('shows results to anyone, signed in or not', () => {
    expect(screen({ tournament: { state: 'provisional' }, signedIn: false, registered: false })).toBe('result');
    expect(screen({ tournament: { state: 'final' }, registered: false })).toBe('result');
  });

  it('asks for sign-in before anything that needs an account', () => {
    expect(screen({ signedIn: false, tournament: { state: 'doors' } })).toBe('signin');
  });

  it('offers registration only while sign-up is open (registration and doors)', () => {
    expect(screen({ registered: false, tournament: { state: 'registration' } })).toBe('register');
    expect(screen({ registered: false, tournament: { state: 'doors' } })).toBe('register');
    expect(screen({ registered: false, tournament: { state: 'live' } })).toBe('closed');
    expect(screen({ registered: false, tournament: { state: 'grading' } })).toBe('grading');
  });

  it('walks a registered student through lobby → doors → live → grading', () => {
    expect(screen({ tournament: { state: 'registration' } })).toBe('lobby');
    expect(screen({ tournament: { state: 'doors' } })).toBe('doors');
    expect(screen({ tournament: { state: 'live' } })).toBe('live');
    expect(screen({ tournament: { state: 'grading' } })).toBe('grading');
  });

  it('falls back to the app message when web play is switched off', () => {
    expect(screen({ webPlay: false, tournament: { state: 'doors' } })).toBe('appOnly');
    expect(screen({ webPlay: false, tournament: { state: 'live' } })).toBe('appOnly');
    // Registration and results never depended on the switch.
    expect(screen({ webPlay: false, registered: false, tournament: { state: 'registration' } })).toBe('register');
    expect(screen({ webPlay: false, tournament: { state: 'provisional' } })).toBe('result');
  });

  it('ships with web play ON (Ted, 2026-10-10)', () => {
    expect(ARENA_WEB_PLAY).toBe(true);
  });
});

describe('classifyAnswerResult — the receipt', () => {
  it('is sending until there is a result', () => {
    expect(classifyAnswerResult(null)).toBe('sending');
  });
  it('accepts a recorded submission, duplicates included', () => {
    expect(classifyAnswerResult({ ok: true })).toBe('accepted');
    expect(classifyAnswerResult({ ok: true, duplicate: true })).toBe('accepted');
  });
  it('rejects window errors for good — retrying cannot help', () => {
    for (const error of ['window_closed', 'no_window', 'answers_closed', 'not_registered', 'not_eligible']) {
      expect(classifyAnswerResult({ ok: false, error })).toBe('rejected');
    }
  });
  it('offers a retry for anything that may never have reached the server', () => {
    for (const error of ['offline', 'write_failed', 'http_502', 'not_signed_in', undefined]) {
      expect(classifyAnswerResult({ ok: false, error })).toBe('retryable');
    }
  });
});

describe('the clock', () => {
  it('reads the tier with inclusive boundaries at 12s and 20s', () => {
    expect(tierRing(0)).toMatchObject({ tier: 'full', points: 1000, secondsInTier: 12, remaining: 1 });
    expect(tierRing(12_000)).toMatchObject({ tier: 'full', points: 1000 });
    expect(tierRing(12_001)).toMatchObject({ tier: 'half', points: 500, secondsInTier: 8 });
    expect(tierRing(20_000)).toMatchObject({ tier: 'half' });
    expect(tierRing(20_001)).toMatchObject({ tier: 'none', points: 0, secondsInTier: 0, remaining: 0 });
    expect(tierRing(0).boundary).toBeCloseTo(0.4);
  });

  it('starts the clock where the server will: shownAt clamped into the render grace', () => {
    const opensAt = 1_000_000;
    expect(effectiveShownAt(opensAt + 500, opensAt)).toBe(opensAt + 500);
    // A late page load is not a fresh twenty seconds.
    expect(effectiveShownAt(opensAt + 15_000, opensAt)).toBe(opensAt + RENDER_GRACE_MS);
    // A clock that runs ahead of the server cannot start before the open.
    expect(effectiveShownAt(opensAt - 4_000, opensAt)).toBe(opensAt);
    expect(effectiveShownAt(123, 0)).toBe(123);
  });

  it('formats a fixed-width countdown', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-5)).toBe('00:00:00');
    expect(formatCountdown(61_000)).toBe('00:01:01');
    expect(formatCountdown(2 * 86_400_000 + 3_600_000)).toBe('2j 01:00:00');
  });
});

describe('qualificationState', () => {
  it('counts registrations before doors and presence after', () => {
    expect(qualificationState({ registered: 6, present: 0, minPlayers: 5, doorsOpen: false }))
      .toMatchObject({ counted: 6, needed: 0, qualified: true, shortOnTheNight: false });
    expect(qualificationState({ registered: 6, present: 3, minPlayers: 5, doorsOpen: true }))
      .toMatchObject({ counted: 3, needed: 2, qualified: false, shortOnTheNight: true });
  });
  it('lets a one-player test edition qualify on one present player', () => {
    expect(qualificationState({ registered: 1, present: 1, minPlayers: 1, doorsOpen: true }).qualified).toBe(true);
  });
});

describe('keyToChoice', () => {
  it('maps 1–4 and a–d onto the options shown', () => {
    expect(keyToChoice('1', 4)).toBe(0);
    expect(keyToChoice('4', 4)).toBe(3);
    expect(keyToChoice('b', 4)).toBe(1);
    expect(keyToChoice('D', 4)).toBe(3);
  });
  it('ignores keys past the last option and anything that is not a choice', () => {
    expect(keyToChoice('5', 4)).toBeNull();
    expect(keyToChoice('e', 4)).toBeNull();
    expect(keyToChoice('0', 4)).toBeNull();
    expect(keyToChoice('Enter', 4)).toBeNull();
    expect(keyToChoice(' ', 4)).toBeNull();
  });
});

describe('readers', () => {
  it('never exposes an answer key on an open question', () => {
    const open = toLiveQuestion({ state: 'open', answerIndex: 2, options: ['a', 'b', 'c'] });
    expect(open.answerIndex).toBeNull();
    const closed = toLiveQuestion({ state: 'closed', answerIndex: 2, options: ['a', 'b', 'c'] });
    expect(closed.answerIndex).toBe(2);
  });

  it('reads the counts the register/presence endpoints return at top level', () => {
    expect(countsFrom({ ok: true, registered: 4, present: 2, needed: 3, qualified: false }))
      .toEqual({ registered: 4, present: 2, needed: 3, qualified: false });
    expect(countsFrom({ counts: { registered: 1, present: 1, needed: 0, qualified: true } }))
      .toEqual({ registered: 1, present: 1, needed: 0, qualified: true });
    expect(countsFrom({ ok: true })).toBeNull();
  });

  it('prefers countsPublic and reads timestamps', () => {
    const t = toTournament('x', {
      state: 'doors',
      title: 'Arène',
      startsAt: { toMillis: () => 5000 },
      counts: { schools: 0, players: 0 },
      countsPublic: { schools: 3, players: 12 },
      prizes: { individual: [10000, 'nope', 5000] },
    });
    expect(t.startsAt).toBe(5000);
    expect(t.counts).toMatchObject({ schools: 3, players: 12 });
    expect(t.prizes).toEqual([10000, 5000]);
    expect(t.teamSize).toBe(5);
  });
});

describe('pickPlayableArena', () => {
  const row = (id: string, state: ArenaTournament['state'], startsAt = 0, title = id): ArenaTournament =>
    toTournament(id, { state, startsAt, title });

  it('prefers the edition furthest along', () => {
    expect(pickPlayableArena([row('a', 'registration'), row('b', 'live'), row('c', 'doors')])?.id).toBe('b');
  });
  it('never opens a rehearsal for the public', () => {
    expect(pickPlayableArena([row('t', 'live', 0, 'Test Arène')])).toBeNull();
    expect(isTestEdition({ title: 'Démo du soir' })).toBe(true);
    expect(isTestEdition({ title: 'Arène d’octobre', isTest: true })).toBe(true);
    expect(isTestEdition({ title: 'Arène d’octobre' })).toBe(false);
  });
});

describe('web device hash', () => {
  it('mints an id the server accepts as a device hash', () => {
    const id = makeWebDeviceHash((n) => new Uint8Array(n).fill(171));
    expect(id).toBe(`web_${'ab'.repeat(16)}`);
    expect(isValidDeviceHash(id)).toBe(true);
    expect(isValidDeviceHash('short')).toBe(false);
    expect(isValidDeviceHash('has space in it')).toBe(false);
  });
});
