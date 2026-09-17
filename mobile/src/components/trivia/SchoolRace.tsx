import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from 'react-native-reanimated';
import { School, Crown } from 'lucide-react-native';
import { useColors, useTheme, typeScale } from '../../theme/theme';
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
  const colors = useColors();
  const { radius } = useTheme();
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
  const tone = mine ? colors.azure : colors.border;

  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {index === 0 ? <Crown color={colors.warn} size={12} /> : null}
        <Text
          numberOfLines={1}
          style={[
            mine ? typeScale.label : typeScale.caption,
            { color: mine ? colors.ink : colors.muted, flex: 1 },
          ]}
        >
          {team.label}
        </Text>
        <Text style={[typeScale.caption, { color: mine ? colors.azure : colors.faint }]}>
          {team.teamXp}
        </Text>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill ?? 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 6, borderRadius: 999, backgroundColor: tone }, bar]} />
      </View>
      {mine && !team.qualified ? (
        // The one number a student can act on tonight.
        <Text style={[typeScale.micro, { color: colors.warn }]}>
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
  const colors = useColors();
  const { radius } = useTheme();
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
    <View style={{
      gap: 9,
      padding: 13,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <School color={colors.muted} size={13} />
        <Text style={[typeScale.overline, { color: colors.muted, flex: 1 }]}>
          {t('La course des écoles', 'Kous lekòl yo')}
        </Text>
        <Text style={[typeScale.micro, { color: colors.faint }]}>
          {t(`meilleurs ${TEAM_SIZE}`, `${TEAM_SIZE} pi bon yo`)}
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
