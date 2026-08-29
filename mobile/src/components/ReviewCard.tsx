import React from 'react';
import { View, Text } from 'react-native';
import { Brain, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTheme, typeScale } from '../theme/theme';
import { dueQuestionIds } from '../utils/review';
import PressableScale from './ui/PressableScale';
import { tapLight } from '../utils/haptics';

/**
 * The quiet "Revizyon" entry point — a compact row that appears as soon as the
 * student has even one missed question waiting. (When the pile is big enough,
 * the NextStepCard takes over as the headline; this row is for the rest of the
 * time, so a mistake never silently disappears from view.)
 */
export default function ReviewCard({ onOpen }: { onOpen: () => void }) {
  const { colors, cardSurface, radius } = useTheme();
  const review = useStore((s) => s.review);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const dueCount = dueQuestionIds(review).length;
  // Self-hides — and takes its margin with it — when there's nothing to revise.
  if (dueCount === 0) return null;

  return (
    <View className="px-5 mt-4">
    <PressableScale
      onPress={() => { tapLight(); onOpen(); }}
      accessibilityRole="button"
      accessibilityLabel={`${t('Révision', 'Revizyon')}. ${dueCount} ${t('questions à revoir', 'kesyon pou revize')}`}
      style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View
        style={{
          width: 38, height: 38, borderRadius: radius.tile,
          backgroundColor: colors.warn + '1A',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Brain color={colors.warn} size={19} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
          {t('Révision', 'Revizyon')}
        </Text>
        <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]}>
          {dueCount === 1
            ? t('1 question que tu as ratée', '1 kesyon ou te rate')
            : `${dueCount} ${t('questions que tu as ratées', 'kesyon ou te rate')}`}
        </Text>
      </View>
      <ChevronRight color={colors.faint} size={18} />
    </PressableScale>
    </View>
  );
}
