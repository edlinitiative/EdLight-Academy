/**
 * NightResult — the end of every Jeux round (trivia, duel, arcade game) on
 * the night (Stitch 09b, DIRECTION §9). Replaces the Jeux uses of the aurora
 * QuizResultHero, which stays as-is for the learning tabs (ChapterTest).
 *
 *  header   44 close · centred title / subtitle
 *  card     the faces (yours, and your opponent's in a duel; the winner wears
 *           a gold crown badge — earned), the gold score numeral (earned),
 *           the verdict line, and the reward chips the caller passes
 *  body     whatever the caller adds (share preview, school race, review)
 *  actions  ONE coral primary, tonal secondaries, an underlined link
 *
 * Opaque surfaces, no rings or hairlines, no glass, no gradient, sentence
 * case, 14pt floor. Motion: the card rises once; skipped for reduced motion.
 */

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crown } from 'lucide-react-native';
import { ArenaButton } from '../arena/ArenaKit';
import Avatar from '../arena/art/avatars/Avatar';
import { useMyAvatar } from '../../hooks/useMyAvatar';
import PopIn from '../ui/PopIn';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import { NightIconButton, NightLink, nightType } from './night';

export interface ResultPerson {
  seed: string;
  label: string;
  /** Their chosen avatar (wire string). For `me`, the signed-in student's own is used when absent. */
  avatar?: string | null;
}

export interface ResultAction {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  busy?: boolean;
  accessibilityHint?: string;
}

export function RewardChip({ icon, label, earned = false }: { icon?: React.ReactNode; label: string; earned?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14,
      borderRadius: 999, backgroundColor: earned ? C.goldSoft : C.surface,
    }}>
      {icon}
      <Text style={[arenaType.name, { fontSize: 15, color: earned ? C.gold : C.ink }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

function Face({ person, size, winner, dim }: { person: ResultPerson; size: number; winner: boolean; dim?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, flex: 1, opacity: dim ? 0.8 : 1 }}>
      <View style={{ width: size, height: size }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <Avatar seed={person.seed} config={person.avatar} size={size - 6} mood={winner ? 'celebrating' : 'idle'} />
        </View>
        {winner ? (
          <View
            accessibilityLabel="Gagnant"
            style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }}
          >
            <Crown color={C.onGold} size={16} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={[arenaType.name, { fontSize: 15, color: winner ? C.ink : C.inkSoft }]}>{person.label}</Text>
    </View>
  );
}

export default function NightResult({
  title, subtitle, onClose, closeLabel,
  me, opponent, winner = null,
  score, total, scoreEarned = true, scoreLine, headline,
  chips, children, primary, secondary = [], link,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  closeLabel?: string;
  me: ResultPerson;
  opponent?: ResultPerson | null;
  /** Who won a duel; a solo round crowns `me` when the caller says so. */
  winner?: 'me' | 'opponent' | null;
  score: number | string;
  total?: number | string | null;
  /** Gold only when the number is a real, earned result. */
  scoreEarned?: boolean;
  /** One plain line under the numeral ("Victoire · 8 à 6 contre Daphné"). */
  scoreLine?: string | null;
  /** Optional bigger verdict above the numeral ("Excellent !"). */
  headline?: string | null;
  chips?: React.ReactNode;
  children?: React.ReactNode;
  primary?: ResultAction | null;
  secondary?: ResultAction[];
  link?: ResultAction | null;
}) {
  const insets = useSafeAreaInsets();
  const { avatar: myAvatar } = useMyAvatar();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        {onClose ? <NightIconButton onPress={onClose} label={closeLabel ?? 'Fermer'} /> : <View style={{ width: 44 }} />}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text accessibilityRole="header" numberOfLines={1} style={[arenaType.name, { fontSize: 18, lineHeight: 23, color: C.ink }]}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={[arenaType.status, { color: C.muted }]}>{subtitle}</Text> : null}
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 20) + 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <PopIn from={0.96}>
          <View
            accessible
            accessibilityLabel={[headline, `${score}${total != null ? ` / ${total}` : ''}`, scoreLine].filter(Boolean).join('. ')}
            style={{ padding: 24, gap: 14, borderRadius: 24, backgroundColor: C.surfaceRaised, alignItems: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <Face person={{ ...me, avatar: me.avatar ?? myAvatar }} size={opponent ? 76 : 92} winner={winner === 'me'} />
              {opponent ? (
                <>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.secondary, marginBottom: 26 }}>
                    <Text style={[arenaType.status, { fontFamily: fonts.bold, color: C.inkSoft }]}>VS</Text>
                  </View>
                  <Face person={opponent} size={76} winner={winner === 'opponent'} dim={winner === 'me'} />
                </>
              ) : null}
            </View>

            {headline ? <Text style={[nightType.section, { color: C.ink, textAlign: 'center' }]}>{headline}</Text> : null}
            <Text style={[nightType.big, { color: scoreEarned ? C.gold : C.ink }]} maxFontSizeMultiplier={1.2}>
              {score}{total != null ? ` / ${total}` : ''}
            </Text>
            {scoreLine ? <Text style={[arenaType.body, { fontSize: 17, lineHeight: 23, fontFamily: fonts.medium, color: C.ink, textAlign: 'center' }]}>{scoreLine}</Text> : null}
            {chips ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>{chips}</View> : null}
          </View>
        </PopIn>

        {children}

        {primary || secondary.length || link ? (
          <View style={{ gap: 10, marginTop: 4 }}>
            {primary ? (
              <ArenaButton label={primary.label} onPress={primary.onPress} icon={primary.icon} busy={primary.busy} accessibilityHint={primary.accessibilityHint} style={{ minHeight: 52 }} />
            ) : null}
            {secondary.map((a) => (
              <ArenaButton key={a.label} variant="secondary" label={a.label} onPress={a.onPress} icon={a.icon} busy={a.busy} accessibilityHint={a.accessibilityHint} style={{ minHeight: 52 }} />
            ))}
            {link ? <NightLink label={link.label} onPress={link.onPress} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
