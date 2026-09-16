import React, { useMemo, useRef } from 'react';
import { View, Text } from 'react-native';
import { Swords, Timer, Share2 } from 'lucide-react-native';
import { useCollectives, useLeaderboard } from '../hooks/useLeaderboard';
import { timeToWeekEnd } from '../services/leaderboardService';
import { normalizeName } from '../../../shared/leaderboardAgg';
import { standing, playersNeeded, recruitUrgency } from '../utils/tournament';
import { shareScoreWhatsApp } from '../services/scoreShare';
import { logInviteSent } from '../services/referralService';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, displayScale, lift } from '../theme/theme';
import PressableScale from './ui/PressableScale';
import { tapMedium } from '../utils/haptics';

/**
 * The school tournament — the headline growth engine.
 *
 * Every other invite in the app asks a student to share a score. This one gives
 * them a REASON that survives the question "why would I invite someone who
 * isn't my friend?": their school cannot win if only they play. That is the
 * only mechanic here where recruiting a stranger is rational, which is why the
 * growth design made it the headline.
 *
 * So the card leads with the arithmetic, not the sentiment: the rank, the gap,
 * and how many more players at the school's current average would close it.
 * "340 XP behind" is a fact nobody can act on; "2 more players closes it" is an
 * instruction.
 *
 * Built entirely on the weekly collective board that already exists, so there is
 * no new collection, no rules change, and it ships over the air.
 */
export default function TournamentCard() {
  const colors = useColors();
  const { radius } = useTheme();
  const language = useStore((st) => st.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const busy = useRef(false);

  const { groups, isLoading } = useCollectives('school', 'week');
  // The student's own board entry carries their school, which is the group key
  // once normalized — cheaper than threading every entry through groupForUid.
  const { myEntry } = useLeaderboard(50, 'week');
  const myKey = useMemo(
    () => (myEntry?.school ? normalizeName(myEntry.school) : null),
    [myEntry?.school],
  );

  const place = useMemo(
    () => standing(
      (groups ?? []).map((g) => ({
        key: g.key,
        name: g.label,
        xp: g.totalXp ?? 0,
        memberCount: g.members ?? 0,
      })),
      myKey,
    ),
    [groups, myKey],
  );

  const { days, hours } = timeToWeekEnd();

  // No school set, or the board has not placed them yet: this card has nothing
  // true to say, so it says nothing. A tournament card showing "—" teaches the
  // student the feature is broken.
  if (isLoading || !place) return null;

  const urgency = recruitUrgency({ rank: place.rank, gapAhead: place.ahead?.gap ?? null });
  const needed = place.ahead
    ? playersNeeded(place.ahead.gap, place.xp, place.memberCount)
    : null;

  const headline = urgency === 'defending'
    ? t(`${place.name} est en tête`, `${place.name} alatèt`)
    : t(`${place.rank}ᵉ · ${place.ahead!.gap} XP derrière`, `${place.rank}yèm · ${place.ahead!.gap} XP dèyè`);

  // The line that does the work. Only claimed when the arithmetic supports it.
  const reason = urgency === 'defending'
    ? t(
        place.behind
          ? `${place.behind.lead} XP d'avance. Garde-la.`
          : 'Garde la première place.',
        place.behind ? `${place.behind.lead} XP davans. Kenbe l.` : 'Kenbe premye plas la.',
      )
    : needed != null
      ? t(
          needed === 1
            ? '1 joueur de plus suffit pour passer devant.'
            : `${needed} joueurs de plus suffisent pour passer devant.`,
          needed === 1
            ? '1 jwè anplis ase pou pase devan.'
            : `${needed} jwè anplis ase pou pase devan.`,
        )
      : t('Chaque nouveau joueur compte pour ton école.', 'Chak nouvo jwè konte pou lekòl ou.');

  const invite = async () => {
    if (busy.current) return;
    busy.current = true;
    tapMedium();
    try {
      await shareScoreWhatsApp({
        title: t(`le tournoi des écoles · ${place.name}`, `tounwa lekòl yo · ${place.name}`),
        score: place.xp,
        lang: isCreole ? 'ht' : 'fr',
      });
      logInviteSent('other');
    } finally {
      busy.current = false;
    }
  };

  return (
    <View style={{ borderRadius: radius.hero, padding: 18, gap: 14, backgroundColor: colors.surface, ...lift.rest }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Swords color={colors.azure} size={16} />
        <Text style={[typeScale.overline, { color: colors.azure }]}>
          {t('Tournoi des écoles', 'Tounwa lekòl yo')}
        </Text>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Timer color={colors.faint} size={13} />
          <Text style={[typeScale.micro, { color: colors.muted }]}>
            {days > 0 ? t(`${days}j ${hours}h`, `${days}j ${hours}è`) : t(`${hours}h`, `${hours}è`)}
          </Text>
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={[displayScale.lg, { color: colors.ink }]} numberOfLines={2}>{headline}</Text>
        <Text style={[typeScale.bodyMd, { color: colors.muted }]}>{reason}</Text>
      </View>

      <PressableScale
        onPress={invite}
        accessibilityRole="button"
        accessibilityLabel={t('Inviter pour mon école', 'Envite pou lekòl mwen')}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          height: 48, borderRadius: radius.pill, backgroundColor: colors.azureFill, ...lift.azureGlow,
        }}
      >
        <Share2 color="#ffffff" size={16} />
        <Text style={[typeScale.label, { color: '#ffffff' }]}>
          {t('Recruter pour mon école', 'Rekrite pou lekòl mwen')}
        </Text>
      </PressableScale>
    </View>
  );
}
