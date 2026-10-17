import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import Leaderboard, { type BoardPeriod, type BoardScope } from '../components/Leaderboard';
import Avatar from '../components/arena/art/avatars/Avatar';
import SchoolRace from '../components/trivia/SchoolRace';
import { NightIconButton, nightType } from '../components/games/night';
import useNightStatusBar from '../components/arena/useNightStatusBar';
import { arenaColors as C, arenaType } from '../theme/arenaTheme';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import useStore from '../contexts/store';

/**
 * Dedicated, full-page classement — reached from the "Classement" card on the
 * Dashboard and the entry row on Profile (pushed on the root stack, so it gets
 * its own header + back button instead of the board being buried inside a tab).
 * The board itself is the shared <Leaderboard> component in its full, non-compact
 * form (period + scope tabs, join footer, drill-downs all included).
 */
export default function LeaderboardScreen({ onClose }: { onClose: () => void }) {
  useNightStatusBar();
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
      ? t('En tête !', 'Ou an tèt !')
      : above
        ? t(`${gap} XP → rang ${myRank! - 1}`, `${gap} XP → ran ${myRank! - 1}`)
        : '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {/* Header — back + title, no band. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 }}>
        <NightIconButton onPress={onClose} label={t('Retour', 'Tounen')} icon={<ChevronLeft color={C.ink} size={22} />} />
        <Text accessibilityRole="header" style={[nightType.page, { color: C.ink }]}>{t('Classement', 'Klasman')}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { paddingHorizontal: 20, paddingBottom: showMeBar ? 110 : 40, paddingTop: 4, gap: 14 },
          centerColumn,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SchoolRace isCreole={language === 'ht'} />
        <Leaderboard compact={false} maxRows={50} onViewChange={setView} tone="night" />
      </ScrollView>

      {/* Sticky "you" bar — your rank never scrolls off screen, and the nudge
          gives a concrete next goal instead of a bare number. */}
      {showMeBar && (
        <View
          accessible
          accessibilityLabel={`${t('Ton rang', 'Ran ou')} ${myRank}. ${nudge}`}
          style={{
            position: 'absolute', left: 16, right: 16, bottom: 16,
            flexDirection: 'row', alignItems: 'center', gap: 12,
            minHeight: 64, paddingHorizontal: 14, borderRadius: 20,
            backgroundColor: C.surfaceRaised,
          }}
        >
          <Text style={[arenaType.num, { fontSize: 18, color: C.ink }]} maxFontSizeMultiplier={1.3}>{myRank}{t('e', 'yèm')}</Text>
          <Avatar seed={(myEntry as any)?.id || ''} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={[arenaType.name, { color: C.ink }]} numberOfLines={1}>
              {(myEntry as any)?.displayName || t('Élève', 'Elèv')}{t(' (toi)', ' (ou)')}
            </Text>
            {nudge ? <Text style={[arenaType.status, { color: C.muted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{nudge}</Text> : null}
          </View>
          <Text style={[arenaType.num, { color: myRank === 1 ? C.gold : C.ink }]} maxFontSizeMultiplier={1.3}>
            {(myEntry as any)?.xp ?? 0} XP
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
