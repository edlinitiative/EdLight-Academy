/**
 * useSchoolRace — the one school ranking every surface shows.
 *
 * Before it the site had two: the dashboard/profile card ranked schools by
 * TOTAL XP (so a three-player school read "#1"), while the Arène ranked by the
 * best five and listed only schools with five players (so it read "aucune
 * école classée"). Same student, two answers. This is the Arène's rule
 * (`schoolRace`, best five, qualified first) with every school given a place.
 */
import { useMemo } from 'react';
import { useCollectives } from './useCollectives';
import { schoolRace, type RaceStanding } from '../../shared/leaderboardAgg';

export function useSchoolRace(enabled = true): { race: RaceStanding[]; isLoading: boolean } {
  const { groups, isLoading } = useCollectives('school', 'all', enabled);
  const race = useMemo(() => schoolRace(groups), [groups]);
  return { race, isLoading };
}
