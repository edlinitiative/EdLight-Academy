import React from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import { useOpenArenaTournament, useActiveArenaTournament, useArenaMyRegistration } from '../../hooks/useArena';
import PressableScale from '../ui/PressableScale';
import StreakFlame from '../celebration/StreakFlame';
import { SchoolCrest } from '../arena/art';
import { useTheme } from '../../theme/theme';
import { tapLight } from '../../utils/haptics';
import { arenaTile } from './homeLayout';

/** The Arène tile's night ground, in both themes (Stitch 01: opaque marine). */
const NIGHT = '#12213A';
const NIGHT_MUTED = '#9FB3D1'; // 7.0:1 on NIGHT

/**
 * "Aujourd'hui" — the two-up row under the next-step card (DIRECTION §1.3):
 * the daily challenge on a white card and the Arène on a night card. It
 * replaces the old stack of icon-tile rows (MissionCard, ArenaAnnounceCard,
 * ReviewCard, weekly goal), which all read the same.
 *
 * Both tiles are real-state only: the challenge pill flips to "Fait" once
 * today's run is recorded; the Arène line names a real tournament date or
 * says "Aucun championnat prévu" — never an invented one.
 */
export default function TodayPair({ onStartDaily, school }: { onStartDaily: () => void; school?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
      <DailyTile onStart={onStartDaily} />
      <ArenaTile school={school ?? null} />
    </View>
  );
}

function DailyTile({ onStart }: { onStart: () => void }) {
  const { colors, cardSurface, typeScale, fonts, radius, isDark } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const { daily } = useTrivia();
  const { streak } = useStreak();
  const streakDays = streak?.currentStreak ?? 0;
  const done = !!daily.completedToday;

  const pill = done
    ? { bg: colors.successSoft, fg: isDark ? colors.success : colors.successFill, label: t('Fait', 'Fini') }
    : { bg: colors.coralSoft, fg: isDark ? colors.coral : '#B5401F', label: t('À prendre', 'Pou pran') };
  const meta = done
    ? (daily.xpEarned > 0 ? t(`+${daily.xpEarned} XP · reviens demain`, `+${daily.xpEarned} XP · tounen demen`) : t('Reviens demain', 'Tounen demen'))
    : t('Quiz éclair · 2 min', 'Quiz rapid · 2 min');

  return (
    <PressableScale
      onPress={() => { tapLight(); onStart(); }}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${t('Défi du jour', 'Defi jodi a')}. ${pill.label}. ${meta}${streakDays > 0 ? `. ${t('Série', 'Seri')} ${streakDays} j` : ''}`}
      style={{ ...cardSurface, borderRadius: radius.hero - 4, flex: 1, minHeight: 168, padding: 16, justifyContent: 'space-between' }}
    >
      <View>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: pill.bg, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pill.fg }} />
          <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 18, color: pill.fg }}>{pill.label}</Text>
        </View>
        <Text style={[typeScale.cardTitle, { color: colors.ink, marginTop: 12 }]} numberOfLines={2}>
          {t('Défi du jour', 'Defi jodi a')}
        </Text>
        <Text style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]} numberOfLines={3}>{meta}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>
          {done ? t('Rejouer', 'Rejwe') : t('Jouer', 'Jwe')}
        </Text>
        {streakDays > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <StreakFlame size={16} alive={done} leapKey={streakDays} />
            <Text style={[typeScale.meta, { color: colors.muted }]}>{`${streakDays} j`}</Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

function ArenaTile({ school }: { school: string | null }) {
  const navigation = useNavigation<any>();
  const { typeScale, fonts, radius, elevation } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Same three reads, in the same unconditional order, as ArenaAnnounceCard
  // (Jeux owns that card; this tile is its Home-shaped twin).
  const { data: open } = useOpenArenaTournament();
  const { data: active } = useActiveArenaTournament();
  const activeId = !open && active ? active.id : null;
  const { data: myRegistration } = useArenaMyRegistration(activeId);

  const tile = arenaTile({
    open, active, myRegistration, now: Date.now(), t,
    formatDate: (ms) => new Intl.DateTimeFormat(isCreole ? 'fr-HT' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ms)),
  });

  const go = () => {
    tapLight();
    const { screen, ...params } = tile.target as any;
    navigation.navigate(screen, Object.keys(params).length ? params : undefined);
  };

  return (
    <PressableScale
      onPress={go}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${t('Arène', 'Arèn')}. ${school ? `${school}. ` : ''}${tile.line}`}
      style={{ flex: 1, minHeight: 168, padding: 16, borderRadius: radius.hero - 4, backgroundColor: NIGHT, justifyContent: 'space-between', ...elevation.card }}
    >
      <View>
        {school ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <SchoolCrest name={school} size={28} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: '#ffffff' }}>{school}</Text>
          </View>
        ) : null}
        <Text style={[typeScale.cardTitle, { color: '#ffffff' }]}>{t('Arène', 'Arèn')}</Text>
        {tile.title ? (
          <Text style={[typeScale.meta, { color: '#ffffff', marginTop: 4 }]} numberOfLines={2}>{tile.title}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
        {tile.live ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF6A45' }} /> : null}
        <Text style={[typeScale.meta, { color: NIGHT_MUTED, flex: 1 }]} numberOfLines={3}>{tile.line}</Text>
      </View>
    </PressableScale>
  );
}
