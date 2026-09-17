import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listMyChallenges, type Challenge } from '../services/challengeService';
import { returnedDuels, unseenDuels } from '../utils/duels';

/**
 * The duels you sent, and which of their results you have not seen yet.
 *
 * "Seen" is kept on the device rather than on the challenge document: the
 * doc is server-authoritative (all writes go through /api/challenges/*), and
 * whether you have looked at a result is not something worth a round trip or
 * a rules change. The cost is that it resets on a new device, which shows you
 * one result card again — a much better failure than a missed rematch.
 */
const SEEN_KEY = 'duels:seenResults';

async function readSeen(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function useMyChallenges() {
  const { data, isPending, refetch } = useQuery({
    queryKey: ['my-challenges'],
    queryFn: () => listMyChallenges(),
    staleTime: 60 * 1000,
  });
  const [seen, setSeen] = useState<string[] | null>(null);

  useEffect(() => { readSeen().then(setSeen); }, []);

  const challenges = data ?? [];
  const played = returnedDuels(challenges);
  // Until the seen list has loaded, treat everything as seen: flashing a
  // "you were beaten" card for a split second on every launch is worse than
  // showing it a moment late.
  const unseen = unseenDuels(played, seen);

  const markSeen = useCallback(async (codes: string[]) => {
    if (codes.length === 0) return;
    const current = seen ?? (await readSeen());
    const next = Array.from(new Set([...current, ...codes])).slice(-200);
    setSeen(next);
    try {
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {
      /* a device that cannot remember just shows the result again */
    }
  }, [seen]);

  return {
    challenges,
    played,
    open: challenges.filter((c) => c.status === 'open'),
    unseen,
    isLoading: isPending,
    refetch,
    markSeen,
  };
}

export type { Challenge };
