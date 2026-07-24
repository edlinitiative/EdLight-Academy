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
import { useColors } from '../../theme/theme';
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
        className="w-full items-center rounded-3xl px-5 py-8"
        style={{
          backgroundColor: colors.surface,
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 4,
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

        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 16 }}>
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
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{pct}%</Text>
          </View>
        </View>

        {/* Stat rows */}
        {stats.length > 0 && (
          <View className="flex-row justify-center gap-6 mt-5">
            {stats.map((s) => (
              <View key={s.label} className="items-center px-2">
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
                  {s.value}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Personal record */}
        {highScore != null && score >= highScore && score > 0 && (
          <View className="flex-row items-center gap-1.5 mt-4">
            <Trophy color="#d97706" size={14} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#d97706' }}>
              {isCreole ? 'Nouvo rekò pèsonèl !' : 'Nouveau record personnel !'}
            </Text>
          </View>
        )}

        <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 14 }}>
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
              <Text style={{ fontSize: 14, fontWeight: '800', color: accent }}>
                +{reward.xpEarned} XP
              </Text>
            </View>
            {reward.leveledUp && (
              <View className="flex-row items-center gap-1.5 mt-2">
                <Crown color="#d97706" size={14} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#d97706' }}>
                  {isCreole ? `Nivo ${reward.newLevel} !` : `Niveau ${reward.newLevel} !`}
                </Text>
              </View>
            )}
            {reward.guest && (
              <Text style={{ fontSize: 12, color: colors.faint, marginTop: 6, textAlign: 'center' }}>
                {isCreole ? 'Konekte pou anrejistre XP ou' : 'Connectez-vous pour sauvegarder vos XP'}
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View className="w-full mt-6">
          {onReplay && (
            <TouchableOpacity
              onPress={onReplay}
              accessibilityRole="button"
              accessibilityLabel={isCreole ? 'Jwe ankò' : 'Rejouer'}
              activeOpacity={0.85}
              className="w-full flex-row items-center justify-center gap-2 py-4 rounded-2xl mb-3"
              style={{ backgroundColor: accent }}
            >
              <RefreshCw color="#fff" size={18} />
              <Text className="text-white font-bold text-base">
                {isCreole ? 'Jwe ankò' : 'Rejouer'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onExit}
            accessibilityRole="button"
            accessibilityLabel={isCreole ? 'Tounen nan jwèt yo' : 'Retour aux jeux'}
            activeOpacity={0.85}
            className="w-full items-center justify-center py-4 rounded-2xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Text className="font-semibold text-base" style={{ color: colors.muted }}>
              ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
