/**
 * Every Arena failure gets its own state — never `absent`, never `interval`.
 *
 * The bug: a rejected tournament listener became "no championship scheduled",
 * and a missing or failed question became the pause between questions.
 */
import {
  deriveEventStatus,
  deriveLivePhase,
  classifyFirestoreError,
  retryDelayMs,
  isFaultPhase,
  type LiveSource,
  type LiveTournamentLike,
  type LiveQuestionLike,
} from '../arenaViewState';

const src = <T = any,>(over: Partial<LiveSource<T>> = {}): LiveSource<T> => ({
  data: null, loading: false, error: false, errorKind: null, exists: null, fromCache: false, ...over,
});

const NOW = 1_000_000;
const tour = (over: Partial<LiveTournamentLike> = {}): LiveTournamentLike => ({
  state: 'live',
  currentQuestion: { index: 3, opensAt: NOW - 5_000, closesAt: NOW + 15_000 },
  ...over,
});
const question = (over: Partial<LiveQuestionLike> = {}): LiveQuestionLike => ({
  index: 3, state: 'open', closesAt: NOW + 15_000, ...over,
});

describe('classifyFirestoreError', () => {
  it('separates a rules rejection from a dropped connection', () => {
    expect(classifyFirestoreError({ code: 'permission-denied' })).toBe('denied');
    expect(classifyFirestoreError({ code: 'firestore/permission-denied' })).toBe('denied');
    expect(classifyFirestoreError({ code: 'unavailable' })).toBe('unavailable');
    expect(classifyFirestoreError(new Error('boom'))).toBe('unavailable');
    expect(classifyFirestoreError({ code: 'failed-precondition' })).toBe('other');
  });
  it('backs off, caps, and never auto-retries a denial', () => {
    expect(retryDelayMs(0, 'unavailable')).toBe(2000);
    expect(retryDelayMs(1, 'unavailable')).toBe(4000);
    expect(retryDelayMs(10, 'other')).toBe(30_000);
    expect(retryDelayMs(0, 'denied')).toBeNull();
  });
});

describe('deriveEventStatus (lobby, doors, results)', () => {
  it('loading is loading', () => {
    expect(deriveEventStatus(src({ loading: true })).status).toBe('loading');
  });
  it('a listener error is NOT "nothing scheduled"', () => {
    expect(deriveEventStatus(src({ error: true, errorKind: 'unavailable' })).status).toBe('reconnecting');
    expect(deriveEventStatus(src({ error: true, errorKind: 'denied' })).status).toBe('denied');
  });
  it('a deleted / missing event is unavailable', () => {
    expect(deriveEventStatus(src({ exists: false })).status).toBe('unavailable');
  });
  it('a cache miss offline is reconnecting, not unavailable', () => {
    expect(deriveEventStatus(src({ exists: false, fromCache: true })).status).toBe('reconnecting');
  });
  it('a voided event is unavailable', () => {
    expect(deriveEventStatus(src({ data: { state: 'void' } })).status).toBe('unavailable');
  });
  it('keeps last-known data through an error, labelled stale', () => {
    expect(deriveEventStatus(src({ data: { state: 'doors' }, error: true, errorKind: 'unavailable' })))
      .toEqual({ status: 'reconnecting', stale: true });
    expect(deriveEventStatus(src({ data: { state: 'doors' }, fromCache: true })))
      .toEqual({ status: 'ready', stale: true });
    expect(deriveEventStatus(src({ data: { state: 'doors' } }))).toEqual({ status: 'ready', stale: false });
  });
});

describe('deriveLivePhase', () => {
  it('maps tournament faults to their own phases', () => {
    expect(deriveLivePhase(src({ loading: true }), src(), NOW).phase).toBe('loading');
    expect(deriveLivePhase(src({ error: true, errorKind: 'denied' }), src(), NOW).phase).toBe('denied');
    expect(deriveLivePhase(src({ error: true, errorKind: 'unavailable' }), src(), NOW).phase).toBe('reconnecting');
    expect(deriveLivePhase(src({ exists: false }), src(), NOW).phase).toBe('unavailable');
  });

  it('an open question is answerable', () => {
    const v = deriveLivePhase(src({ data: tour() }), src({ data: question() }), NOW);
    expect(v).toEqual({ phase: 'question', stale: false, answerable: true });
  });

  it('a question still loading is questionLoading, not an interval', () => {
    expect(deriveLivePhase(src({ data: tour() }), src({ loading: true }), NOW).phase).toBe('questionLoading');
    expect(deriveLivePhase(src({ data: tour() }), src({ exists: false }), NOW).phase).toBe('questionLoading');
    expect(deriveLivePhase(src({ data: tour() }), src({ data: question({ state: 'pending' }) }), NOW).phase)
      .toBe('questionLoading');
  });

  it('a question from the previous index is not the current one', () => {
    const v = deriveLivePhase(src({ data: tour() }), src({ data: question({ index: 2, state: 'closed' }) }), NOW);
    expect(v.phase).toBe('questionLoading');
  });

  it('a failed question listener is reconnecting, not an interval', () => {
    const v = deriveLivePhase(src({ data: tour() }), src({ error: true, errorKind: 'unavailable' }), NOW);
    expect(v).toEqual({ phase: 'reconnecting', stale: true, answerable: false });
    const cached = deriveLivePhase(src({ data: tour() }), src({ exists: false, fromCache: true }), NOW);
    expect(cached.phase).toBe('reconnecting');
  });

  it('reconnecting mid-question keeps the open question answerable, labelled stale', () => {
    const v = deriveLivePhase(src({ data: tour() }), src({ data: question(), error: true, errorKind: 'unavailable' }), NOW);
    expect(v).toEqual({ phase: 'question', stale: true, answerable: true });
  });

  it('the real interval: closed, or open past its deadline, or nothing on the clock', () => {
    expect(deriveLivePhase(src({ data: tour() }), src({ data: question({ state: 'closed' }) }), NOW).phase).toBe('interval');
    expect(deriveLivePhase(src({ data: tour() }), src({ data: question({ closesAt: NOW - 1 }) }), NOW).phase).toBe('interval');
    expect(deriveLivePhase(src({ data: tour({ currentQuestion: null }) }), src(), NOW).phase).toBe('interval');
  });

  it('before start and after the end', () => {
    expect(deriveLivePhase(src({ data: tour({ state: 'doors', currentQuestion: null }) }), src(), NOW).phase).toBe('waitingStart');
    for (const state of ['grading', 'provisional', 'final'] as const) {
      expect(deriveLivePhase(src({ data: tour({ state }) }), src(), NOW).phase).toBe('ended');
    }
    expect(deriveLivePhase(src({ data: tour({ state: 'void' }) }), src(), NOW).phase).toBe('unavailable');
  });

  it('a deleted event mid-round is unavailable', () => {
    expect(deriveLivePhase(src({ exists: false }), src({ data: question() }), NOW).phase).toBe('unavailable');
  });

  it('flags faults', () => {
    expect(isFaultPhase('reconnecting')).toBe(true);
    expect(isFaultPhase('interval')).toBe(false);
  });
});
