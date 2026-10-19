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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Zap, Snowflake } from 'lucide-react-native';
import useStore from '../contexts/store';
import Button from './ui/Button';
import { useReduceMotion } from '../utils/motion';
import ProgressRing from './ui/ProgressRing';
import { useTheme, radius } from '../theme/theme';
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
  const insets = useSafeAreaInsets();
  const { colors, typeScale: ts } = useTheme();
  const reduce = useReduceMotion();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const done = Math.min(quizzesThisWeek, WEEKLY_QUIZ_GOAL);
  const reached = quizzesThisWeek >= WEEKLY_QUIZ_GOAL;

  return (
    <Modal visible={visible} transparent animationType={reduce ? 'none' : 'slide'} onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)' }}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel={t('Fermer', 'Fèmen')}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.hero,
          borderTopRightRadius: radius.hero,
          padding: 20,
          paddingBottom: Math.max(34, insets.bottom + 12),
        }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={[ts.section, { color: colors.ink, flex: 1 }]}>
            {t('Objectif de la semaine', 'Objektif semèn nan')}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer', 'Fèmen')}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}
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
          <Text style={[ts.numeral, { color: colors.ink, marginTop: 12, fontSize: 30, lineHeight: 34 }]}>
            {done}/{WEEKLY_QUIZ_GOAL} <Text style={[ts.meta, { color: colors.muted }]}>{t('quiz', 'quiz')}</Text>
          </Text>
          <Text style={[ts.meta, { color: colors.muted, marginTop: 4, textAlign: 'center' }]}>
            {reached
              ? t('Objectif atteint, bravo ! Continue sur ta lancée.', 'Ou rive sou objektif la, bravo ! Kontinye konsa.')
              : t('cette semaine (lundi à dimanche)', 'semèn sa a (lendi rive dimanch)')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {Array.from({ length: WEEKLY_QUIZ_GOAL }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 12, height: 12, borderRadius: 6,
                  backgroundColor: i < done ? (reached ? colors.successFill : colors.azure) : colors.surfaceAlt,
                }}
              />
            ))}
          </View>
        </View>

        {/* Reward — spell out what the gel actually is */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: colors.surface, borderRadius: radius.card,
            padding: 16, marginTop: 20,
          }}
        >
          <Snowflake color={colors.azureInk} size={22} />
          {/* The rule that earns a freeze — an instruction, so ≥14pt. */}
          <Text style={[ts.body, { color: colors.ink, flex: 1 }]}>
            {t(
              `Termine ${WEEKLY_QUIZ_GOAL} quiz dans la semaine et gagne 1 gel. Il protège ta série si tu rates un jour.`,
              `Fini ${WEEKLY_QUIZ_GOAL} quiz nan semèn nan epi genyen 1 jèl. Li pwoteje seri w si w rate yon jou.`,
            )}
          </Text>
        </View>

        {/* Weekly XP context */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <Zap color={colors.muted} size={16} />
          <Text style={[ts.meta, { color: colors.muted }]}>
            {weeklyXp} {t('XP gagnés cette semaine', 'XP ou genyen semèn sa a')}
          </Text>
        </View>

        {/* Action */}
        <Button
          size="lg"
          fullWidth
          onPress={() => { tapLight(); onClose(); (reached ? onSeeLeaderboard : onStartQuiz)(); }}
          label={reached ? t('Voir le classement', 'Wè klasman an') : t('Faire un quiz maintenant', 'Fè yon quiz kounye a')}
          style={{ marginTop: 20 }}
        />
      </View>
    </Modal>
  );
}
