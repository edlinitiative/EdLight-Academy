import {
  classifyAuthTransition,
  shouldClearStudentState,
  createSessionGuard,
  withTimeout,
  TimeoutError,
  shouldAttemptProfileSync,
  retryDelayMs,
  INITIAL_PROFILE_SYNC,
  PROFILE_SYNC_INTERVAL_MS,
  PROFILE_RETRY_BASE_MS,
  PROFILE_RETRY_MAX_MS,
  type ProfileSyncState,
} from '../sessionLogic';

describe('classifyAuthTransition', () => {
  it('classifies every prev/next combination', () => {
    expect(classifyAuthTransition(null, null)).toBe('still-signed-out');
    expect(classifyAuthTransition('A', null)).toBe('signed-out');
    expect(classifyAuthTransition(null, 'A')).toBe('signed-in');
    expect(classifyAuthTransition('A', 'A')).toBe('same-user');
    expect(classifyAuthTransition('A', 'B')).toBe('account-switch');
  });

  it('treats empty strings / undefined as no account', () => {
    expect(classifyAuthTransition('', undefined)).toBe('still-signed-out');
    expect(classifyAuthTransition(undefined, 'B')).toBe('signed-in');
  });

  it('clears student state only when a known account goes away or changes', () => {
    expect(shouldClearStudentState('signed-out')).toBe(true);
    expect(shouldClearStudentState('account-switch')).toBe(true);
    // A guest's work is carried into the new account, never wiped.
    expect(shouldClearStudentState('signed-in')).toBe(false);
    expect(shouldClearStudentState('same-user')).toBe(false);
    // A guest cold launch must not wipe the guest's grade/progress.
    expect(shouldClearStudentState('still-signed-out')).toBe(false);
  });
});

describe('createSessionGuard', () => {
  it('invalidates tokens when the account changes', () => {
    const g = createSessionGuard();
    const a = g.begin('A');
    expect(g.isCurrent(a)).toBe(true);
    g.begin('B');
    expect(g.isCurrent(a)).toBe(false);
    expect(g.current().uid).toBe('B');
  });

  it('keeps in-flight work valid across repeat events for the same account', () => {
    const g = createSessionGuard();
    const a1 = g.begin('A');
    const a2 = g.begin('A');
    expect(g.isCurrent(a1)).toBe(true);
    expect(a2.epoch).toBe(a1.epoch);
  });

  it('A → signed out → A again does not revive the first session token', () => {
    const g = createSessionGuard();
    const first = g.begin('A');
    g.begin(null);
    g.begin('A');
    expect(g.isCurrent(first)).toBe(false);
  });

  it('rejects null tokens', () => {
    expect(createSessionGuard().isCurrent(null)).toBe(false);
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with the value when fast enough', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it('passes rejections through', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000)).rejects.toThrow('nope');
  });

  it('rejects with TimeoutError when the promise never settles (offline Firestore write)', async () => {
    const p = withTimeout(new Promise(() => {}), 500, 'profile upsert');
    jest.advanceTimersByTime(501);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe('shouldAttemptProfileSync', () => {
  const now = 10_000_000;
  const state = (over: Partial<ProfileSyncState>): ProfileSyncState => ({ ...INITIAL_PROFILE_SYNC, ...over });

  it('never syncs without a uid', () => {
    expect(shouldAttemptProfileSync(INITIAL_PROFILE_SYNC, null, now)).toBe(false);
  });

  it('always syncs a new account, even while another is pending', () => {
    expect(shouldAttemptProfileSync(state({ uid: 'A', status: 'pending' }), 'B', now)).toBe(true);
  });

  it('never doubles an in-flight attempt, even when forced', () => {
    expect(shouldAttemptProfileSync(state({ uid: 'A', status: 'pending' }), 'A', now, true)).toBe(false);
  });

  it('throttles a synced profile to the interval', () => {
    const s = state({ uid: 'A', status: 'synced', lastSuccessAt: now - 1000 });
    expect(shouldAttemptProfileSync(s, 'A', now)).toBe(false);
    expect(shouldAttemptProfileSync(s, 'A', now, true)).toBe(true);
    expect(shouldAttemptProfileSync(s, 'A', now + PROFILE_SYNC_INTERVAL_MS)).toBe(true);
  });

  it('retries failures with a growing, capped backoff', () => {
    const s = state({ uid: 'A', status: 'failed', lastAttemptAt: now, failures: 2 });
    expect(shouldAttemptProfileSync(s, 'A', now + PROFILE_RETRY_BASE_MS)).toBe(false);
    expect(shouldAttemptProfileSync(s, 'A', now + 2 * PROFILE_RETRY_BASE_MS)).toBe(true);
    expect(retryDelayMs(0)).toBe(PROFILE_RETRY_BASE_MS);
    expect(retryDelayMs(1000)).toBe(PROFILE_RETRY_MAX_MS);
  });
});
