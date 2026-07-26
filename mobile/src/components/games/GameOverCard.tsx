/**
 * Shared game-over screen for the arcade games — score ring, per-game stat
 * rows, the XP reward block, and replay/exit actions. RN port of the web's
 * GameOverCard so every game ends with the same celebratory look.
 */

import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import {
  Trophy, Star, ThumbsUp, Dumbbell, Sparkles, Crown, RefreshCw,
} from 'lucide-react-native';
import { useColors, useTheme, typeScale, radius } from '../../theme/theme';
import PressableScale from '../ui/PressableScale';
import { success } from '../../utils/haptics';
import { useReduceMotion } from '../../utils/motion';
import Confetti from '../ui/Confetti';

const CIRC = 327; // 2 * π * 52
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface GameReward {
  xpEarned: number;
  leveledUp?: boolean;
  newLevel?: number;
  prevLevel?: number;
  guest?: boolean;
}

export interface GameStat {
  label: string;
  value: string | number;
}

interface GameOverCardProps {
  score: number;
  maxScore: number;
  stats?: GameStat[];
  reward?: GameReward | null;
  onReplay?: (() => void) | null;
  onExit: () => void;
  isCreole: boolean;
  accent?: string;
  highScore?: number | null;
}

export default function GameOverCard({
  score,
  maxScore,
  stats = [],
  reward = null,
  onReplay,
  onExit,
  isCreole,
  accent = '#1B6FE0',
  highScore = null,
}: GameOverCardProps) {
  const colors = useColors();
  const { shadow } = useTheme();
  const reduceMotion = useReduceMotion();
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // Celebrate the game-over reveal once on mount.
  useEffect(() => { success(); }, []);

  let IconCmp: typeof Trophy;
  let message: string;
  let messageHt: string;
  if (pct >= 90) {
    IconCmp = Trophy;
    message = 'Excellent ! Vous êtes un champion !';
    messageHt = 'Ekselan! Ou se yon chanpyon!';
  } else if (pct >= 70) {
    IconCmp = Star;
    message = 'Très bien ! Continuez comme ça !';
    messageHt = 'Trè byen! Kontinye konsa!';
  } else if (pct >= 50) {
    IconCmp = ThumbsUp;
    message = 'Pas mal ! Vous pouvez vous améliorer.';
    messageHt = 'Pa mal! Ou ka amelyore.';
  } else {
    IconCmp = Dumbbell;
    message = 'Courage ! Réessayez pour progresser.';
    messageHt = 'Kouraj! Eseye ankò pou pwogrese.';
  }

  const fill = (pct / 100) * CIRC;
  const tint = `${accent}1a`; // soft accent wash for chips/pills

  // Sweep the score arc up to its final value on mount (snap for reduce-motion).
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion
      ? fill
      : withTiming(fill, { duration: 850, easing: Easing.out(Easing.cubic) });
  }, [fill, progress, reduceMotion]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value} ${CIRC}`,
  }));

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ alignItems: 'center', padding: 24, paddingTop: 36, paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {(pct >= 90 || reward?.leveledUp) && <Confetti />}
      <View
        className="w-full items-center px-5 py-8"
        style={{
          borderRadius: radius.hero,
          backgroundColor: colors.surface,
          ...shadow.md,
        }}
      >
        {/* Result icon */}
        <View
          style={{
            width: 72, height: 72, borderRadius: 36, backgroundColor: tint,
            alignItems: 'center', justifyContent: 'center', marginBottom: 14,
          }}
        >
          <IconCmp color={accent} size={34} />
        </View>

        <Text style={[typeScale.h1, { color: colors.ink, marginBottom: 16 }]}>
          {isCreole ? 'Rezilta Ou' : 'Vos Résultats'}
        </Text>

        {/* Score ring */}
        <View className="items-center justify-center" style={{ width: 140, height: 140 }}>
          <Svg width={140} height={140} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={52} fill="none" stroke={colors.border} strokeWidth={10} />
            <AnimatedCircle
              cx={60}
              cy={60}
              r={52}
              fill="none"
              stroke={accent}
              strokeWidth={10}
              animatedProps={animatedProps}
              strokeLinecap="round"
              rotation="-90"
              origin="60, 60"
            />
          </Svg>
          <View className="absolute items-center justify-center">
            <Text style={[typeScale.display, { color: colors.ink }]}>{pct}%</Text>
          </View>
        </View>

        {/* Stat rows */}
        {stats.length > 0 && (
          <View className="flex-row justify-center gap-6 mt-5">
            {stats.map((s) => (
              <View key={s.label} className="items-center px-2">
                <Text style={[typeScale.h2, { color: colors.ink }]}>
                  {s.value}
                </Text>
                <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Personal record */}
        {highScore != null && score >= highScore && score > 0 && (
          <View className="flex-row items-center gap-1.5 mt-4">
            <Trophy color={colors.warn} size={14} />
            <Text style={[typeScale.label, { color: colors.warn }]}>
              {isCreole ? 'Nouvo rekò pèsonèl !' : 'Nouveau record personnel !'}
            </Text>
          </View>
        )}

        <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 14 }]}>
          {isCreole ? messageHt : message}
        </Text>

        {/* XP reward */}
        {reward && reward.xpEarned > 0 && (
          <View className="items-center mt-4">
            <View
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: tint }}
            >
              <Sparkles color={accent} size={16} />
              <Text style={[typeScale.bodyMd, { color: accent }]}>
                +{reward.xpEarned} XP
              </Text>
            </View>
            {reward.leveledUp && (
              <View className="flex-row items-center gap-1.5 mt-2">
                <Crown color={colors.warn} size={14} />
                <Text style={[typeScale.label, { color: colors.warn }]}>
                  {isCreole ? `Nivo ${reward.newLevel} !` : `Niveau ${reward.newLevel} !`}
                </Text>
              </View>
            )}
            {reward.guest && (
              <Text style={[typeScale.caption, { color: colors.faint, marginTop: 6, textAlign: 'center' }]}>
                {isCreole ? 'Konekte pou anrejistre XP ou' : 'Connectez-vous pour sauvegarder vos XP'}
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View className="w-full mt-6">
          {onReplay && (
            <PressableScale
              onPress={onReplay}
              accessibilityRole="button"
              accessibilityLabel={isCreole ? 'Jwe ankò' : 'Rejouer'}
              style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: radius.tile, marginBottom: 12, backgroundColor: accent }}
            >
              <RefreshCw color="#fff" size={18} />
              <Text style={[typeScale.title, { color: '#fff' }]}>
                {isCreole ? 'Jwe ankò' : 'Rejouer'}
              </Text>
            </PressableScale>
          )}
          <PressableScale
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel={isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
            style={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Text style={[typeScale.title, { color: colors.muted }]}>
              ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
            </Text>
          </PressableScale>
        </View>
      </View>
    </ScrollView>
  );
}
