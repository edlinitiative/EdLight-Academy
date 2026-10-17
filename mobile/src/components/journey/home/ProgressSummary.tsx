import React from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import PressableScale from '../../ui/PressableScale';
import { useTheme } from '../../../theme/theme';
import { EVIDENCE, evidenceLabel, trackJourney } from '../../../utils/learningJourney';
import { tapLight } from '../../../utils/haptics';
import { useReduceMotion } from '../../../utils/motion';
import type { EvidenceSummary } from './homeJourney';
import { progressTotals, hasEvidence, goalPercent } from '../../home/homeLayout';

/**
 * "Ta progression" (PRD LJ-10, Stitch 01 §4): three independent facts in the
 * shared EVIDENCE words — terminées · pratiquées · maîtrisées — summed over
 * the lessons the student has real evidence in, then this week's goal as one
 * meter. No blended score. The numerals only render once evidence exists (no
 * wall of zeros); the weekly row always does, since a target is motivating at
 * zero in a way a report card is not.
 */
export default function ProgressSummary({
  rows, isCreole, weekDone, weekGoal, momentumLine, onOpenGoal,
}: {
  rows: { course: any; summary: EvidenceSummary }[];
  isCreole: boolean;
  /** Quizzes finished this week, and the weekly target. */
  weekDone: number;
  weekGoal: number;
  /** "Série : 3 j · Bac dans 260 j" — real facts only, or null. */
  momentumLine?: string | null;
  onOpenGoal: () => void;
}) {
  const { colors, cardSurface, typeScale, fonts } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const totals = progressTotals(rows);
  const showFacts = hasEvidence(totals);
  const pct = goalPercent(weekDone, weekGoal);
  const reached = weekDone >= weekGoal;

  const facts = [
    { key: 'completed' as const, n: totals.completed },
    { key: 'practised' as const, n: totals.practised },
    { key: 'mastered' as const, n: totals.mastered },
  ];

  return (
    <View style={{ ...cardSurface, padding: 20 }}>
      <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink }]}>
        {t('Ta progression', 'Pwogrè ou')}
      </Text>

      {showFacts ? (
        <View
          accessible
          accessibilityLabel={facts.map((f) => `${f.n} ${evidenceLabel(f.key, isCreole).toLowerCase()}`).join(', ')}
          accessibilityHint={t(
            `${EVIDENCE.completed.fr} : vidéo finie. ${EVIDENCE.practised.fr} : exercices faits. ${EVIDENCE.mastered.fr} : confirmée au test du chapitre.`,
            `${EVIDENCE.completed.ht} : videyo fini. ${EVIDENCE.practised.ht} : egzèsis fèt. ${EVIDENCE.mastered.ht} : konfime nan tès chapit la.`,
          )}
          style={{ flexDirection: 'row', marginTop: 18 }}
        >
          {facts.map((f) => (
            <View key={f.key} style={{ flex: 1, alignItems: 'center' }}>
              <Text
                maxFontSizeMultiplier={1.4}
                style={[typeScale.numeral, { fontSize: 28, lineHeight: 32, color: f.n > 0 ? colors.ink : colors.faint }]}
              >
                {f.n}
              </Text>
              <Text style={[typeScale.meta, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
                {pluralEvidence(f.key, f.n, isCreole)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <PressableScale
        onPress={() => {
          tapLight();
          trackJourney('progress_summary_opened', { surface: 'home', target: 'weekly_goal' });
          onOpenGoal();
        }}
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`${t('Cette semaine', 'Semèn sa a')} : ${weekDone} ${t('quiz sur', 'quiz sou')} ${weekGoal}. ${pct}%${momentumLine ? `. ${momentumLine}` : ''}`}
        style={{ marginTop: showFacts ? 22 : 14 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Text style={[typeScale.meta, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
            {reached
              ? t('Objectif de la semaine atteint', 'Ou rive sou objektif semèn nan')
              : t(`Cette semaine : ${weekDone} quiz sur ${weekGoal}`, `Semèn sa a : ${weekDone} quiz sou ${weekGoal}`)}
          </Text>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, lineHeight: 20, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {pct}%
          </Text>
        </View>
        <Meter pct={pct} color={reached ? colors.successFill : colors.azureFill} track={colors.surfaceAlt} />
        {momentumLine ? (
          <Text style={[typeScale.meta, { color: colors.muted, marginTop: 10 }]} numberOfLines={1}>
            {momentumLine}
          </Text>
        ) : null}
      </PressableScale>
    </View>
  );
}

/** "terminées" / "terminée", in the shared evidence words, lower-case. */
function pluralEvidence(key: 'completed' | 'practised' | 'mastered', n: number, isCreole: boolean): string {
  const base = evidenceLabel(key, isCreole).toLowerCase();
  if (isCreole) return base;
  return n > 1 && !base.endsWith('s') ? `${base}s` : base;
}

/** 8px meter that fills 0 → value over 700ms (instant under reduced motion). */
function Meter({ pct, color, track }: { pct: number; color: string; track: string }) {
  const reduce = useReduceMotion();
  const w = useSharedValue(reduce ? pct : 0);
  React.useEffect(() => {
    w.value = reduce ? pct : withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [pct, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: track, marginTop: 10, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: color }, fill]} />
    </View>
  );
}
