import { isOnlineSnapshot, isForegroundAppState } from '../connectivity';

describe('isOnlineSnapshot', () => {
  it('is offline only on an explicit negative', () => {
    expect(isOnlineSnapshot({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(isOnlineSnapshot({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnlineSnapshot({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it('treats unknown as online (no false offline flashes / paused queries)', () => {
    expect(isOnlineSnapshot({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnlineSnapshot(null)).toBe(true);
  });
});

describe('isForegroundAppState', () => {
  it('only "active" is focused', () => {
    expect(isForegroundAppState('active')).toBe(true);
    expect(isForegroundAppState('background')).toBe(false);
    expect(isForegroundAppState('inactive')).toBe(false);
    expect(isForegroundAppState(undefined)).toBe(false);
  });
});
