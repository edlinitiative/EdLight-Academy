/**
 * WeeklyGoalSheet — what tapping the Home "Objectif de la semaine" card opens.
 * ────────────────────────────────────────────────────────────────────────────
 * The card used to teleport straight into Trivia with zero explanation
 * (TestFlight feedback: "i need a better ux flow when i click on this").
 * This sheet makes the goal legible first — progress, the 5 weekly slots,
 * what the reward is — then offers the action.
 */

import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { X, Zap } from 'lucide-react-native';
import useStore from '../contexts/store';
import PressableScale from './ui/PressableScale';
import ProgressRing from './ui/ProgressRing';
import { useTheme, radius, typeScale } from '../theme/theme';
import { WEEKLY_QUIZ_GOAL } from '../utils/weeklyActivity';
import { tapLight } from '../utils/haptics';

export default function WeeklyGoalSheet({
  visible,
  onClose,
  quizzesThisWeek,
  weeklyXp,
  onStartQuiz,
  onSeeLeaderboard,
}: {
  visible: boolean;
  onClose: () => void;
  quizzesThisWeek: number;
  weeklyXp: number;
  onStartQuiz: () => void;
  onSeeLeaderboard: () => void;
}) {
  const { colors } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const done = Math.min(quizzesThisWeek, WEEKLY_QUIZ_GOAL);
  const reached = quizzesThisWeek >= WEEKLY_QUIZ_GOAL;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' }}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel={t('Fermer', 'Fèmen')}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.hero,
          borderTopRightRadius: radius.hero,
          padding: 20,
          paddingBottom: 34,
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[typeScale.title, { color: colors.ink }]}>
            {t('Objectif de la semaine', 'Objektif semèn nan')}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer', 'Fèmen')}
          >
            <X size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* Progress ring + the 5 weekly slots */}
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <ProgressRing
            value={(done / WEEKLY_QUIZ_GOAL) * 100}
            color={reached ? colors.success : colors.azure}
            size={92}
            strokeWidth={9}
            showLabel={false}
          />
          <Text style={[typeScale.h2, { color: colors.ink, marginTop: 12 }]}>
            {done}/{WEEKLY_QUIZ_GOAL} {t('quiz', 'quiz')}
          </Text>
          <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
            {reached
              ? t('Objectif atteint — bravo, continue sur ta lancée !', 'Ou rive sou objektif la — bravo, kontinye konsa !')
              : t('cette semaine (lundi à dimanche)', 'semèn sa a (lendi rive dimanch)')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {Array.from({ length: WEEKLY_QUIZ_GOAL }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 12, height: 12, borderRadius: 6,
                  backgroundColor: i < done ? (reached ? colors.success : colors.azure) : colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: i < done ? 'transparent' : colors.border,
                }}
              />
            ))}
          </View>
        </View>

        {/* Reward — spell out what the gel actually is */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.surfaceAlt, borderRadius: radius.tile,
            padding: 12, marginTop: 18,
          }}
        >
          <Text style={{ fontSize: 22 }}>🧊</Text>
          <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>
            {t(
              `Termine ${WEEKLY_QUIZ_GOAL} quiz dans la semaine et gagne 1 gel — il protège ta série 🔥 si tu rates un jour.`,
              `Fini ${WEEKLY_QUIZ_GOAL} quiz nan semèn nan epi genyen 1 jèl — li pwoteje seri w 🔥 si w rate yon jou.`,
            )}
          </Text>
        </View>

        {/* Weekly XP context */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <Zap color={colors.warn} size={14} />
          <Text style={[typeScale.caption, { color: colors.muted }]}>
            {weeklyXp} {t('XP gagnés cette semaine', 'XP ou genyen semèn sa a')}
          </Text>
        </View>

        {/* Action */}
        <PressableScale
          onPress={() => { tapLight(); onClose(); (reached ? onSeeLeaderboard : onStartQuiz)(); }}
          accessibilityRole="button"
          accessibilityLabel={reached ? t('Voir le classement', 'Wè klasman an') : t('Faire un quiz maintenant', 'Fè yon quiz kounye a')}
          style={{
            marginTop: 18, borderRadius: 999, backgroundColor: colors.azure,
            paddingVertical: 14, alignItems: 'center',
          }}
        >
          <Text style={[typeScale.titleSm, { color: '#ffffff' }]}>
            {reached ? t('Voir le classement', 'Wè klasman an') : t('Faire un quiz maintenant', 'Fè yon quiz kounye a')}
          </Text>
        </PressableScale>
      </View>
    </Modal>
  );
}
