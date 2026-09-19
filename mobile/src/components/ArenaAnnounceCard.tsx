import React from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Swords, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useOpenArenaTournament } from '../hooks/useArena';
import PressableScale from './ui/PressableScale';
import { useColors, useTheme, typeScale } from '../theme/theme';
import { tapLight } from '../utils/haptics';
import type { RootParamList } from '../navigation/AppNavigator';

/**
 * The Home tab's only mention that the Arena exists.
 *
 * Before this card, `ArenaLobbyScreen` — the actual sign-up screen, fully
 * built: school picker, grade attestation, the registration call itself —
 * had exactly one link to it anywhere in the app: a button on the RESULTS
 * screen of a tournament that had already finished. A student who had never
 * played had no way in, and neither did the very first tournament ever run.
 * This is that missing door.
 *
 * Self-hides, like `MissionCard`'s completed state and `ReviewBanner` on web:
 * no tournament open for sign-up means this renders nothing, not an empty
 * card. It sits above `TournamentCard` (the weekly school XP board) rather
 * than replacing it — that is a different, ongoing mechanic; this is a
 * dated event with a closing window, which is why it takes the more urgent
 * position when both have something to say.
 */
type Nav = NativeStackNavigationProp<RootParamList>;

export default function ArenaAnnounceCard() {
  const navigation = useNavigation<Nav>();
  const colors = useColors();
  const { radius } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: open } = useOpenArenaTournament();
  if (!open) return null;

  // `ArenaTournament` carries only `title` — the tournament document's Kreyòl
  // title never made it into this type's parser. Worth fixing there if a
  // Kreyòl title is ever actually authored; today it always matches French.
  const title = open.title;

  let dateStr = '';
  if (open.startsAt) {
    try {
      dateStr = new Intl.DateTimeFormat(isCreole ? 'fr-HT' : 'fr-FR', {
        day: 'numeric', month: 'long',
      }).format(new Date(open.startsAt));
    } catch {
      dateStr = '';
    }
  }

  const subtitle = open.state === 'doors'
    ? t('Les portes sont ouvertes maintenant', 'Pòt yo louvri kounye a')
    : dateStr
      ? t(`Inscris ton école pour le ${dateStr}`, `Enskri lekòl ou pou ${dateStr}`)
      : t('Inscris ton école dès maintenant', 'Enskri lekòl ou kounye a');

  return (
    <PressableScale
      onPress={() => { tapLight(); navigation.navigate('ArenaLobby', { tournamentId: open.id }); }}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${t('L’Arène', 'Arèn nan')} — ${title} — ${subtitle}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: radius.card,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          width: 40, height: 40, borderRadius: radius.tile,
          backgroundColor: colors.azureSoft,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Swords color={colors.azure} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
          {t('L’Arène', 'Arèn nan')} — {title}
        </Text>
        <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight color={colors.faint} size={18} />
    </PressableScale>
  );
}
