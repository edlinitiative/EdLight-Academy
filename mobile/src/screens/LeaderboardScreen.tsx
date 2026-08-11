import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import Leaderboard, { type BoardPeriod, type BoardScope } from '../components/Leaderboard';
import Avatar from '../components/ui/Avatar';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';

/**
 * Dedicated, full-page classement — reached from the "Classement" card on the
 * Dashboard and the entry row on Profile (pushed on the root stack, so it gets
 * its own header + back button instead of the board being buried inside a tab).
 * The board itself is the shared <Leaderboard> component in its full, non-compact
 * form (period + scope tabs, join footer, drill-downs all included).
 */
export default function LeaderboardScreen({ onClose }: { onClose: () => void }) {
  const colors = useColors();
  const { cardSurface } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  // Mirrors the tabs inside <Leaderboard> so the sticky bar knows when the
  // weekly national board (the only view it describes) is on screen.
  const [view, setView] = useState<{ period: BoardPeriod; scope: BoardScope }>({ period: 'week', scope: 'national' });

  // Same query the board itself runs — react-query dedupes, so no extra read.
  const { entries, myEntry, myRank, showingLastWeek } = useLeaderboard(50, 'week');

  // "45 XP → rang 8": distance to the entry directly above. Rank 1 celebrates.
  const showMeBar =
    view.period === 'week' && view.scope === 'national' && !showingLastWeek && !!myEntry && !!myRank;
  const above = showMeBar && myRank! > 1 ? entries.find((e: any) => e.rank === myRank! - 1) : null;
  const gap = above ? Math.max(1, (above.xp ?? 0) - ((myEntry as any).xp ?? 0) + 1) : 0;
  const nudge = !showMeBar
    ? ''
    : myRank === 1
      ? t('En tête ! 🏆', 'Ou an tèt ! 🏆')
      : above
        ? t(`${gap} XP → rang ${myRank! - 1}`, `${gap} XP → ran ${myRank! - 1}`)
        : '';

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
        contentContainerStyle={[
          { paddingHorizontal: 20, paddingBottom: showMeBar ? 96 : 40, paddingTop: 4 },
          centerColumn,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Leaderboard compact={false} maxRows={50} onViewChange={setView} />
      </ScrollView>

      {/* Sticky "you" bar — your rank never scrolls off screen, and the nudge
          gives a concrete next goal instead of a bare number. */}
      {showMeBar && (
        <View
          accessible
          accessibilityLabel={`${t('Votre rang', 'Ran ou')} ${myRank}. ${nudge}`}
          style={{
            ...cardSurface,
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderWidth: 1.5,
            borderColor: colors.azure,
            backgroundColor: colors.azureSoft,
          }}
        >
          <Text style={[typeScale.titleSm, { color: colors.azure }]} maxFontSizeMultiplier={1.3}>
            #{myRank}
          </Text>
          <Avatar
            name={(myEntry as any)?.displayName || ''}
            uri={(myEntry as any)?.photoURL || null}
            seed={(myEntry as any)?.id || ''}
            size={30}
          />
          <Text style={[typeScale.bodyMd, { color: colors.azure, flexShrink: 1 }]} numberOfLines={1}>
            {(myEntry as any)?.displayName || t('Élève', 'Elèv')}{t(' (vous)', ' (ou)')}
          </Text>
          <View style={{ flex: 1 }} />
          <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {nudge}
          </Text>
          <Text style={[typeScale.bodyMd, { color: colors.azure }]} maxFontSizeMultiplier={1.3}>
            {(myEntry as any)?.xp ?? 0}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
