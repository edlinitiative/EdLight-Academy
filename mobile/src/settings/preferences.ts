/**
 * Device preferences that are NOT student-owned state (audit #19).
 *
 * They live here rather than in contexts/store.ts on purpose: they belong to
 * the device, not the account, so a logout must never reset them, and they are
 * read from non-React modules (utils/haptics fires on every tap) where a
 * synchronous answer is required.
 *
 * Model: one AsyncStorage key holding a small JSON object, mirrored into an
 * in-memory cache that is the synchronous source of truth. Until the stored
 * value has loaded, the defaults apply (haptics ON — the existing behaviour),
 * so a cold start never feels different from before this module existed.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PREFERENCES_KEY = '@edlight:device_preferences';

export interface DevicePreferences {
  /** Taps, ticks and success/warning buzzes. Default on. */
  hapticsEnabled: boolean;
}

export const DEFAULT_PREFERENCES: DevicePreferences = Object.freeze({
  hapticsEnabled: true,
});

/** Parse whatever is stored; unknown or malformed values fall back to defaults. */
export function parsePreferences(raw: string | null | undefined): DevicePreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const v = JSON.parse(raw);
    return {
      hapticsEnabled: typeof v?.hapticsEnabled === 'boolean' ? v.hapticsEnabled : DEFAULT_PREFERENCES.hapticsEnabled,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let cache: DevicePreferences = { ...DEFAULT_PREFERENCES };
let loaded = false;
let loading: Promise<DevicePreferences> | null = null;
const listeners = new Set<(p: DevicePreferences) => void>();

function emit() {
  for (const l of listeners) {
    try { l(cache); } catch { /* a bad listener must not break the others */ }
  }
}

/** Load once from storage (idempotent). Resolves with the current preferences. */
export function loadPreferences(): Promise<DevicePreferences> {
  if (loaded) return Promise.resolve(cache);
  if (!loading) {
    loading = AsyncStorage.getItem(PREFERENCES_KEY)
      .then((raw) => {
        // A write that happened before the load finished wins over the stored value.
        if (!loaded) cache = parsePreferences(raw);
        loaded = true;
        emit();
        return cache;
      })
      .catch(() => {
        loaded = true;
        return cache;
      });
  }
  return loading;
}

/** Synchronous read — the cache (defaults until loaded). */
export function getPreferences(): DevicePreferences {
  return cache;
}

export function isHapticsEnabled(): boolean {
  return cache.hapticsEnabled;
}

export async function setPreference<K extends keyof DevicePreferences>(key: K, value: DevicePreferences[K]): Promise<void> {
  cache = { ...cache, [key]: value };
  loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(cache));
  } catch {
    // Best-effort: the in-memory value still applies for this session.
  }
}

export function setHapticsEnabled(value: boolean): Promise<void> {
  return setPreference('hapticsEnabled', !!value);
}

export function subscribePreferences(fn: (p: DevicePreferences) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** React binding: `[value, setValue]` for one preference, live across screens. */
export function usePreference<K extends keyof DevicePreferences>(
  key: K,
): [DevicePreferences[K], (v: DevicePreferences[K]) => void] {
  const [value, setValue] = useState<DevicePreferences[K]>(cache[key]);
  useEffect(() => {
    const unsub = subscribePreferences((p) => setValue(p[key]));
    loadPreferences().then((p) => setValue(p[key])).catch(() => {});
    return unsub;
  }, [key]);
  return [value, (v) => { setPreference(key, v); }];
}

/** Test-only: reset module state between cases. */
export function __resetPreferencesForTests() {
  cache = { ...DEFAULT_PREFERENCES };
  loaded = false;
  loading = null;
  listeners.clear();
}

// Start loading at import so the very first tap already honours the setting.
loadPreferences();
