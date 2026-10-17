import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

import * as Haptics from 'expo-haptics';
import {
  parsePreferences, loadPreferences, setHapticsEnabled, isHapticsEnabled, subscribePreferences,
  PREFERENCES_KEY, DEFAULT_PREFERENCES, __resetPreferencesForTests,
} from '../preferences';
import { tapLight, success, select } from '../../utils/haptics';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetPreferencesForTests();
  jest.clearAllMocks();
});

describe('parsePreferences', () => {
  it('defaults when missing or malformed', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{oops')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{"hapticsEnabled":"no"}')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('{"hapticsEnabled":false}')).toEqual({ hapticsEnabled: false });
  });
});

describe('haptics preference', () => {
  it('is on by default (unchanged behaviour before the setting loads)', () => {
    expect(isHapticsEnabled()).toBe(true);
    tapLight();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('turning it off silences every helper and persists', async () => {
    await setHapticsEnabled(false);
    tapLight(); success(); select();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(PREFERENCES_KEY))!)).toEqual({ hapticsEnabled: false });
  });

  it('loads a stored "off" on the next launch', async () => {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify({ hapticsEnabled: false }));
    await loadPreferences();
    expect(isHapticsEnabled()).toBe(false);
  });

  it('a change made before loading finishes is not overwritten by the stored value', async () => {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify({ hapticsEnabled: true }));
    const p = loadPreferences();
    await setHapticsEnabled(false);
    await p;
    expect(isHapticsEnabled()).toBe(false);
  });

  it('notifies subscribers', async () => {
    const seen: boolean[] = [];
    const unsub = subscribePreferences((p) => seen.push(p.hapticsEnabled));
    await setHapticsEnabled(false);
    await setHapticsEnabled(true);
    unsub();
    await setHapticsEnabled(false);
    expect(seen).toEqual([false, true]);
  });
});
