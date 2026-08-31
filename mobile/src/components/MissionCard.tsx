import React from 'react';
import { View, Text } from 'react-native';
import { Check, ChevronRight, Timer } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import PressableScale from './ui/PressableScale';
import { radius, useTheme, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';

/**
 * Mission du jour — the home screen's single "do this now" card. Absorbs the
 * old "+50 XP / Défi du jour" grid tile and the first-run nudge: one gradient
 * card, one verb. Once today's challenge is done it settles into a quiet
 * success state (with a replay entry point) until tomorrow.
 */
export default function MissionCard({ onStart }: { onStart: () => void }) {
  const { colors, cardSurface, shadow } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const { daily } = useTrivia();
  const { streak } = useStreak();
  const streakCount = streak?.currentStreak ?? 0;

  const press = () => {
    tapLight();
    onStart();
  };

  if (daily.completedToday) {
    return (
      <PressableScale
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={t(
          `Mission du jour accomplie, ${daily.xpEarned} XP gagnés. Rejouer`,
          `Misyon jodi a fini, ou genyen ${daily.xpEarned} XP. Rejwe`,
        )}
        style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View
          style={{
            width: 40, height: 40, borderRadius: radius.tile,
            backgroundColor: colors.successSoft,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Check color={colors.success} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
            {t('Mission du jour accomplie', 'Misyon jodi a fini')}
          </Text>
          <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]}>
            {daily.xpEarned > 0
              ? t(`+${daily.xpEarned} XP · reviens demain`, `+${daily.xpEarned} XP · tounen demen`)
              : t('Reviens demain pour la prochaine', 'Tounen demen pou pwochen an')}
          </Text>
        </View>
        <ChevronRight color={colors.faint} size={18} />
      </PressableScale>
    );
  }

  // Estil Klè: the mission is a quiet row, not a gradient monument — the page's
  // one dominant element is the Reprendre card above it.
  return (
    <PressableScale
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={t(
        'Mission du jour : quiz éclair, gagne 50 XP. Commencer',
        'Misyon jodi a: quiz rapid, genyen 50 XP. Kòmanse',
      )}
      style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 40, height: 40, borderRadius: radius.tile,
          backgroundColor: colors.azureSoft,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Timer color={colors.azure} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
          {t('Mission du jour · +50 XP', 'Misyon jodi a · +50 XP')}
        </Text>
        <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]}>
          {streakCount > 0
            ? t(`Quiz éclair · 2 min · protège ta série 🔥${streakCount}`, `Quiz rapid · 2 min · pwoteje seri ou 🔥${streakCount}`)
            : t('Quiz éclair · 2 min · commence ta série', 'Quiz rapid · 2 min · kòmanse seri ou')}
        </Text>
      </View>
      <ChevronRight color={colors.faint} size={18} />
    </PressableScale>
  );
}
