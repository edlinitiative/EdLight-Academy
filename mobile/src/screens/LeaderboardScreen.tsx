import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import Leaderboard from '../components/Leaderboard';
import useStore from '../contexts/store';
import { useColors, typeScale } from '../theme/theme';

/**
 * Dedicated, full-page classement — reached from the "Classement" card on the
 * Dashboard and the entry row on Profile (pushed on the root stack, so it gets
 * its own header + back button instead of the board being buried inside a tab).
 * The board itself is the shared <Leaderboard> component in its full, non-compact
 * form (period + scope tabs, join footer, drill-downs all included).
 */
export default function LeaderboardScreen({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header — back + title, matching the app's neutral page chrome. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Tounen')}
          style={{ padding: 4 }}
        >
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <Text style={[typeScale.h1, { color: colors.ink }]}>
          {t('Classement', 'Klasman')}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        <Leaderboard compact={false} maxRows={50} />
      </ScrollView>
    </SafeAreaView>
  );
}
