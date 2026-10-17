import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Clock, Check } from 'lucide-react-native';
import { ArenaButton } from '../arena/ArenaKit';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { nightType } from './night';

/**
 * "Défi du jour" — a shared once-a-day round (the same 10 questions for
 * everyone, drawn across every subject) worth a +50 XP bonus.
 *
 * The night feature card (DIRECTION §8): raised surface, radius 24, a quiet
 * sentence-case label, a 24 title, the deadline, and the screen's one coral
 * button. The reward preview is NOT gold — nothing has been earned yet.
 * Done → a settled card with the real score and no coral at all.
 */
export default function DailyChallengeBanner({
  daily,
  isCreole,
  onStart,
  style,
  compact = false,
}: {
  daily: { completedToday?: boolean; score?: number | null; total?: number | null } | null;
  isCreole: boolean;
  onStart: () => void;
  style?: StyleProp<ViewStyle>;
  /** A row-sized version (above the trivia category grid). */
  compact?: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const done = !!daily?.completedToday;

  if (done) {
    return (
      <View
        accessible
        accessibilityLabel={t(
          `Défi du jour terminé : ${daily?.score ?? 0} sur ${daily?.total ?? 10}. Reviens demain.`,
          `Defi jodi a fini : ${daily?.score ?? 0} sou ${daily?.total ?? 10}. Tounen demen.`,
        )}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderRadius: 24, backgroundColor: C.surface }, style]}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.successSoft }}>
          <Check color={C.success} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[nightType.cardTitle, { color: C.ink }]}>{t('Défi du jour terminé', 'Defi jodi a fini')}</Text>
          <Text style={[nightType.meta, { color: C.muted }]}>
            {t(`${daily?.score ?? 0}/${daily?.total ?? 10} · Reviens demain`, `${daily?.score ?? 0}/${daily?.total ?? 10} · Tounen demen`)}
          </Text>
        </View>
        <Text style={[arenaType.num, { fontSize: 20, color: C.gold }]}>{daily?.score ?? 0}/{daily?.total ?? 10}</Text>
      </View>
    );
  }

  return (
    <View style={[{ padding: compact ? 20 : 24, gap: compact ? 12 : 14, borderRadius: 24, backgroundColor: C.surfaceRaised }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[nightType.meta, { color: C.muted }]}>{t('Défi du jour', 'Defi jodi a')}</Text>
          <Text style={[compact ? nightType.cardTitle : nightType.feature, { color: C.ink }]}>
            {t('10 questions · Toutes les matières', '10 kesyon · Tout matyè yo')}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.surface }}>
          <Text style={[arenaType.status, { color: C.inkSoft }]} maxFontSizeMultiplier={1.3}>+50 XP</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Clock color={C.muted} size={18} />
        <Text style={[nightType.meta, { color: C.muted, flex: 1 }]}>
          {t('Les mêmes pour tous · se termine à minuit', 'Menm yo pou tout moun · fini a minwi')}
        </Text>
      </View>
      <ArenaButton
        label={t('Jouer le défi', 'Jwe defi a')}
        onPress={onStart}
        accessibilityHint={t('Lance les 10 questions du jour, 15 secondes chacune', 'Lanse 10 kesyon jodi a, 15 segonn chak')}
        style={{ marginTop: 4 }}
      />
    </View>
  );
}
