import React from 'react';
import { View, Text } from 'react-native';
import { Zap, Check, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { navigateToTab } from '../navigation/AppNavigator';
import { GAMES } from '../data/games';
import { weeklyGameId } from '../utils/weeklyGame';
import PressableScale from './ui/PressableScale';
import { useTheme, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';

/**
 * Post-content handoff into the XP loop. The 2026-08 activation analysis found
 * 25 of 97 users did exams/courses but never earned a single XP — the games
 * loop is invisible from the content paths. This card mounts at content
 * completion moments (exam results, quiz results, lesson done) and offers the
 * Défi du jour as the natural next step. Guests see it too — the daily is
 * playable signed-out; it's the sign-up hook.
 *
 * Self-hides when today's défi is already done, unless `showWeeklyWhenDone`
 * flips it to a quieter "essaie le Jeu de la semaine (×2 XP)" row.
 *
 * `variant="glass"` restyles it for dark hero surfaces (QuizResultHero);
 * `compact` trims it for tight surfaces like the lesson panel.
 */
export default function DefiHandoffCard({
  variant = 'card',
  compact = false,
  showWeeklyWhenDone = false,
}: {
  variant?: 'card' | 'glass';
  compact?: boolean;
  showWeeklyWhenDone?: boolean;
}) {
  const { colors, cardSurface, radius } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const { daily } = useTrivia();

  const glassLook = variant === 'glass';
  const dailyDone = daily.completedToday;
  if (dailyDone && !showWeeklyWhenDone) return null;

  // Colors per surface: the glass variant sits on the dark result hero, so it
  // paints its own translucent ground and white ink.
  const ground = glassLook
    ? { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 14 }
    : { ...cardSurface, borderWidth: 1.5, borderColor: colors.azureBorder };
  const ink = glassLook ? '#ffffff' : colors.ink;
  const sub = glassLook ? 'rgba(255,255,255,0.75)' : colors.muted;
  const accent = glassLook ? '#fde68a' : colors.azure;

  if (dailyDone) {
    // Quieter follow-up: today's défi is banked — point at the ×2 weekly game.
    const game = GAMES.find((g) => g.id === weeklyGameId());
    const gameName = game ? (language === 'ht' ? game.nameHt : game.name) : t('Jeux', 'Jwèt');
    return (
      <PressableScale
        onPress={() => { tapLight(); navigateToTab('Trivia'); }}
        accessibilityRole="button"
        accessibilityLabel={t(
          `Défi du jour fait. Essayer ${gameName}, XP doublés cette semaine`,
          `Defi jodi a fini. Eseye ${gameName}, XP double semèn sa a`,
        )}
        style={{ ...ground, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 }}
      >
        <Check color={glassLook ? '#4ade80' : colors.success} size={16} />
        <Text style={[typeScale.caption, { color: sub, flex: 1 }]} numberOfLines={2}>
          {t('Défi du jour fait ✓ — essaie ', 'Defi jodi a fini ✓ — eseye ')}
          <Text style={{ color: ink, fontFamily: typeScale.label.fontFamily }}>{gameName}</Text>
          {t(' (×2 XP cette semaine)', ' (×2 XP semèn sa a)')}
        </Text>
        <ChevronRight color={sub} size={16} />
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={() => { tapLight(); navigateToTab('Trivia', { daily: true }); }}
      accessibilityRole="button"
      accessibilityLabel={t(
        'Défi du jour : 2 minutes, gagne 50 XP. Commencer',
        'Defi jodi a: 2 minit, genyen 50 XP. Kòmanse',
      )}
      style={{
        ...ground,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: compact ? 10 : 14,
        paddingHorizontal: 14,
      }}
    >
      <View
        style={{
          width: compact ? 34 : 40,
          height: compact ? 34 : 40,
          borderRadius: radius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: glassLook ? 'rgba(255,255,255,0.16)' : colors.azureSoft,
        }}
      >
        <Zap color={accent} size={compact ? 16 : 19} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[compact ? typeScale.label : typeScale.titleSm, { color: ink }]} numberOfLines={1}>
          {t('Continue sur ta lancée !', 'Kontinye sou elan ou !')}
        </Text>
        <Text style={[typeScale.caption, { color: sub, marginTop: 1 }]} numberOfLines={1}>
          {t('Défi du jour · 2 min · +50 XP 🔥', 'Defi jodi a · 2 minit · +50 XP 🔥')}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          borderRadius: 999,
          paddingLeft: 12,
          paddingRight: 8,
          paddingVertical: 7,
          backgroundColor: glassLook ? '#ffffff' : colors.azure,
        }}
      >
        <Text style={[typeScale.label, { color: glassLook ? '#1B6FE0' : '#ffffff' }]}>
          {t('Jouer', 'Jwe')}
        </Text>
        <ChevronRight color={glassLook ? '#1B6FE0' : '#ffffff'} size={14} />
      </View>
    </PressableScale>
  );
}
