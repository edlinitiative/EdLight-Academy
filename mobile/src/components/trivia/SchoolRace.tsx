import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import SchoolCrest from '../arena/art/crest/SchoolCrest';
import { duration, easing, stagger } from '../../theme/motion';
import { useReduceMotion } from '../../utils/motion';
import { useCollectives, useLeaderboard } from '../../hooks/useLeaderboard';
import { rankTeams, teamStandingFor, TEAM_SIZE, type TeamStanding } from '../../../../shared/leaderboardAgg';

/**
 * Which school is winning, while you play.
 *
 * The school board exists and sits on another screen, which means nobody is
 * looking at it during the only moment it would change how they play. Putting
 * the race beside the game is the whole point of a school competition: you are
 * not answering for yourself, and the bar that moves when you do is your
 * school's.
 *
 * Bars, not a list. A list of names and numbers is a spreadsheet; five bars of
 * different lengths is a race, readable at a glance and without reading at all
 * — which matters when it is sharing a screen with a running timer.
 */

/** A school's bar, growing to its share of the leader's score. */
function Lane({ team, leader, mine, index, isCreole }: {
  team: TeamStanding;
  leader: number;
  mine: boolean;
  index: number;
  isCreole: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const share = leader > 0 ? Math.max(team.teamXp / leader, 0.06) : 0.06;
  const grow = useSharedValue(reduceMotion ? share : 0);

  useEffect(() => {
    if (reduceMotion) { grow.value = share; return; }
    grow.value = withDelay(
      stagger(index),
      withTiming(share, { duration: duration.slow, easing: easing.emphasis }),
    );
  }, [share, index, reduceMotion, grow]);

  const bar = useAnimatedStyle(() => ({ width: `${grow.value * 100}%` }));
  // Your school's lane is the coral one; the rest are a quiet tonal step.
  const tone = mine ? C.coral : C.secondary;

  return (
    <View
      accessible
      accessibilityLabel={`${index + 1}. ${team.label}, ${team.teamXp} XP${mine ? (isCreole ? ', lekòl ou' : ', ton école') : ''}`}
      style={{ gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <SchoolCrest name={team.label} size={24} />
        <Text
          numberOfLines={1}
          style={[arenaType.status, { fontSize: 15, fontFamily: mine ? fonts.bold : fonts.medium, color: mine ? C.ink : C.inkSoft, flex: 1 }]}
        >
          {team.label}
        </Text>
        <Text style={[arenaType.num, { fontSize: 15, color: index === 0 ? C.gold : mine ? C.ink : C.muted }]}>
          {team.teamXp}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: 999, backgroundColor: C.surfaceAlt, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 6, borderRadius: 999, backgroundColor: tone }, bar]} />
      </View>
      {mine && !team.qualified ? (
        // The one number a student can act on tonight.
        <Text style={[arenaType.status, { color: C.warn }]}>
          {isCreole
            ? `${team.needed} jwè ankò pou lekòl ou kalifye`
            : `Encore ${team.needed} joueur${team.needed > 1 ? 's' : ''} pour qualifier ton école`}
        </Text>
      ) : null}
    </View>
  );
}

export default function SchoolRace({ isCreole, compact = false }: {
  isCreole: boolean;
  /** Three lanes instead of five, for sitting beside a running question. */
  compact?: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { groups, isLoading } = useCollectives('school', 'week');
  const { myEntry } = useLeaderboard(50, 'week');

  const standings = useMemo(() => rankTeams(groups ?? []), [groups]);
  const mine = useMemo(
    () => teamStandingFor(standings, myEntry?.school ?? null),
    [standings, myEntry?.school],
  );

  // The top few, plus the player's own school when it is not among them —
  // a race you are not in is someone else's race.
  const lanes = useMemo(() => {
    const top = standings.filter((s) => s.qualified).slice(0, compact ? 3 : 5);
    if (mine && !top.some((s) => s.key === mine.key)) return [...top, mine];
    return top;
  }, [standings, mine, compact]);

  if (isLoading || lanes.length === 0) return null;
  const leader = lanes[0]?.teamXp ?? 0;

  return (
    <View style={{ gap: 14, padding: 20, borderRadius: 20, backgroundColor: C.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text accessibilityRole="header" style={[arenaType.name, { fontSize: 17, color: C.ink, flex: 1 }]}>
          {t('La course des écoles', 'Kous lekòl yo')}
        </Text>
        <Text style={[arenaType.status, { color: C.muted }]}>
          {t(`ses ${TEAM_SIZE} meilleurs comptent`, `${TEAM_SIZE} pi bon yo konte`)}
        </Text>
      </View>
      {lanes.map((team, i) => (
        <Lane
          key={team.key}
          team={team}
          leader={leader}
          mine={!!mine && team.key === mine.key}
          index={i}
          isCreole={isCreole}
        />
      ))}
    </View>
  );
}
