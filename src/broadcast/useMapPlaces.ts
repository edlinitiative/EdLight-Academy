/**
 * The map's SCHOOL layer, read live for the broadcast.
 *
 * Only the school layer. `selectMapPlaces` in shared/arena/mapPlaces.ts was
 * built for two — schools and players — and the player half is not wired
 * here, on purpose: `tournaments/{tid}/players/{uid}` is `allow read, write:
 * if false`, server-only, for the same integrity reason a player's own score
 * is hidden from them mid-tournament. A student's ville was never copied onto
 * the public `standings/current` document, so there is currently no public
 * surface a browser can read it from at all.
 *
 * Wiring that in later needs a server-side aggregation step — pre-summed
 * counts per commune, written by the same tick that computes standings,
 * NEVER a uid-keyed list — because most of this audience is under 18 and
 * `standings/current` is public: a raw per-student ville on a document
 * anyone can subscribe to would name which commune a specific child is
 * answering from. That is real, separate, privacy-bearing scope, not a
 * follow-up to finish here.
 *
 * The school layer has no such wall. `schools/{id}` is `allow read: if
 * request.auth != null`, schools are not people, and `standings.schools`
 * already carries everything else `selectMapPlaces` needs (label, player
 * count, qualified). This hook is the join between the two.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '../services/firebase';
import { selectMapPlaces, type MapPlace, type MapSchoolInput } from '../../shared/arena/mapPlaces';
import type { SchoolStanding } from '../../shared/arena/events';

/** Firestore's `in` operator caps at 30 values per query (client SDK limit). */
const SCHOOL_BATCH = 30;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Look up each standings school's commune from the `schools` collection.
 *
 * Batched rather than one read per school: a tournament fields a few dozen
 * schools, and a few dozen individual `getDoc` calls on every board refresh is
 * the kind of cost that is invisible in development and real on a stream.
 */
async function loadCommunes(keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (keys.length === 0) return out;

  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += SCHOOL_BATCH) {
    const batch = unique.slice(i, i + SCHOOL_BATCH);
    try {
      const snap = await getDocs(
        query(collection(db, 'schools'), where(documentId(), 'in', batch)),
      );
      for (const doc of snap.docs) out.set(doc.id, str(doc.data()?.commune));
    } catch (err) {
      // A rules refusal or a dropped connection leaves this batch unplaced —
      // reported honestly through `schoolsWithoutLocation` — rather than
      // failing the whole map over schools this tick could not resolve.
      console.error('[useMapPlaces] commune lookup failed for a batch:', err);
    }
  }
  return out;
}

export interface MapPlacesState {
  places: MapPlace[];
  schoolsWithoutLocation: number;
  schoolsTotal: number;
  loading: boolean;
}

const EMPTY: MapPlacesState = { places: [], schoolsWithoutLocation: 0, schoolsTotal: 0, loading: false };

export function useMapPlaces(schools: SchoolStanding[] | undefined): MapPlacesState {
  const [communes, setCommunes] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(false);

  // Keyed on the school KEYS, not the array identity — `standings.schools` is
  // a fresh array on every tick even when the roster of schools has not
  // changed, and a commune lookup is only worth re-running when it has.
  const keySignature = (schools ?? []).map((s) => s.key).sort().join(',');

  useEffect(() => {
    const keys = (schools ?? []).map((s) => s.key).filter(Boolean);
    if (keys.length === 0) { setCommunes(new Map()); return; }
    let alive = true;
    setLoading(true);
    loadCommunes(keys).then((result) => {
      if (alive) { setCommunes(result); setLoading(false); }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on keySignature, not `schools`
  }, [keySignature]);

  return useMemo(() => {
    if (!schools || schools.length === 0) return EMPTY;

    const inputs: MapSchoolInput[] = schools.map((s) => ({
      key: s.key,
      label: s.shortName || s.label,
      commune: communes.get(s.key) ?? null,
      players: s.members,
      qualified: s.qualified,
    }));

    const result = selectMapPlaces({ schools: inputs, players: [] });
    return {
      places: result.places,
      schoolsWithoutLocation: result.schoolsWithoutLocation,
      schoolsTotal: result.schoolsTotal,
      loading,
    };
  }, [schools, communes, loading]);
}
