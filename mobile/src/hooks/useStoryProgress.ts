import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';
import { parseProgress, recordStage, type StoryProgress } from '../../../shared/arenaStory';

/**
 * Mode Histoire progress on the phone — the twin of the web's
 * src/hooks/useStoryProgress.ts: one key per account (plus one for guests),
 * kept on this device. Stars are cosmetic — the XP a stage earns goes through
 * useTrivia.recordResult like any other round — so a device-local campaign
 * costs nothing in integrity.
 *
 * Follow-up (not built): sync to the account so the web and the phone share
 * one campaign. Until then each device keeps its own stars.
 *
 * One module-level store, so the Arène hub's Mode Histoire cabinet and the
 * story screen always show the same stars without a reload.
 */
export const storyKeyFor = (uid: string | null) => `edlight.arena.story.v1.${uid || 'guest'}`;

const EMPTY: StoryProgress = {};
const cache = new Map<string, StoryProgress>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load(uid: string | null) {
  const key = storyKeyFor(uid);
  if (cache.has(key) || loading.has(key)) return;
  loading.add(key);
  AsyncStorage.getItem(key)
    .then((raw) => {
      let parsed: StoryProgress = {};
      try { parsed = parseProgress(JSON.parse(raw || 'null')); } catch { parsed = {}; }
      // A stage recorded while the read was in flight wins.
      if (!cache.has(key)) cache.set(key, parsed);
    })
    .catch(() => { if (!cache.has(key)) cache.set(key, {}); })
    .finally(() => { loading.delete(key); emit(); });
}

/** Test seam: forget every cached account. */
export function __resetStoryProgressForTests() {
  cache.clear();
  loading.clear();
}

export function useStoryProgress() {
  const uid = useStore((s) => s.user?.uid || null);
  const key = storyKeyFor(uid);

  useEffect(() => { load(uid); }, [uid]);

  const progress = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => cache.get(key) || EMPTY,
    () => cache.get(key) || EMPTY,
  );

  const record = useCallback((chapter: number, stage: number, stars: number) => {
    const next = recordStage(cache.get(key) || {}, chapter, stage, stars);
    cache.set(key, next);
    emit();
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => undefined);
  }, [key]);

  return { progress, record, ready: cache.has(key) };
}
