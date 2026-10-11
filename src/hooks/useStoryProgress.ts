import { useCallback, useEffect, useState } from 'react';
import useStore from '../contexts/store';
import { parseProgress, recordStage, type StoryProgress } from '../../shared/arenaStory';

/**
 * Mode Histoire progress, kept on this device for now (one key per account,
 * plus one for visitors). Stars are cosmetic — the XP each stage earns goes
 * through useTrivia.recordResult like any other round — so a device-local
 * campaign costs nothing in integrity. Syncing it to the account is the
 * obvious next step once the design settles.
 */
const keyFor = (uid: string | null) => `edlight.arena.story.v1.${uid || 'guest'}`;

function read(uid: string | null): StoryProgress {
  try {
    return parseProgress(JSON.parse(localStorage.getItem(keyFor(uid)) || 'null'));
  } catch {
    return {};
  }
}

export function useStoryProgress() {
  const uid = useStore((s) => s.user?.uid || null);
  const [progress, setProgress] = useState<StoryProgress>(() => read(uid));

  useEffect(() => { setProgress(read(uid)); }, [uid]);

  const record = useCallback((chapter: number, stage: number, stars: number) => {
    setProgress((prev) => {
      const next = recordStage(prev, chapter, stage, stars);
      try { localStorage.setItem(keyFor(uid), JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [uid]);

  return { progress, record };
}
