import { useEffect, useMemo, useState } from 'react';
import { fetchAmbassadorUids } from '../../shared/ambassadors';

// One CDN-cached request per page load, shared by every board row and the profile.
// Deliberately not react-query: the board renders in places without a provider.
const TTL = 5 * 60_000;
let cache: { at: number; uids: string[] } | null = null;
let inflight: Promise<string[]> | null = null;

function loadUids(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.uids);
  if (!inflight) {
    inflight = fetchAmbassadorUids('')
      .then((uids) => { cache = { at: Date.now(), uids }; return uids; })
      .catch(() => cache?.uids || [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Active ambassador uids for the badge. Empty (no badge) when the list is unavailable. */
export function useAmbassadorUids(): Set<string> {
  const [uids, setUids] = useState<string[]>(() => cache?.uids || []);
  useEffect(() => {
    let live = true;
    void loadUids().then((next) => { if (live) setUids(next); });
    return () => { live = false; };
  }, []);
  return useMemo(() => new Set(uids), [uids]);
}

export function useIsAmbassador(uid: string | null | undefined): boolean {
  const uids = useAmbassadorUids();
  return !!uid && uids.has(uid);
}

export function __resetAmbassadorCache() { cache = null; inflight = null; }
