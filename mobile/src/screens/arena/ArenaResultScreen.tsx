import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Share2, Trophy, Target, Timer, Users } from 'lucide-react-native';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import useStore from '../../contexts/store';
import { useArenaResult, useOpenArenaTournament } from '../../hooks/useArena';
import StageEnter from '../../components/trivia/StageEnter';
import ScoreCounter from '../../components/trivia/ScoreCounter';
import PressableScale from '../../components/ui/PressableScale';
import { tapMedium } from '../../utils/haptics';
import type { RootParamList } from '../../navigation/AppNavigator';

/**
 * What a student sees when it is over.
 *
 * Two rules shape this screen.
 *
 * Everything is PROVISIONAL until integrity review completes, and it says so
 * plainly rather than in small print. Prizes are held; a screen that says "you
 * won" and is later taken back in public costs more than a screen that was
 * honest about the wait. Announced up front, a removal is the rule working.
 *
 * And the student's own contribution is the headline, not their rank. Most
 * players will not be near the podium, and a screen that leads with "#412"
 * tells almost everyone they lost. Whether they were one of the five who
 * counted for their school is something nearly anyone can have done, and it is
 * the thing that makes them want to bring four friends next month.
 */

type Nav = NativeStackNavigationProp<RootParamList, 'ArenaResult'>;
type Route = RouteProp<RootParamList, 'ArenaResult'>;

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  const colors = useColors();
  const { radius } = useTheme();
  return (
    <View style={{
      flex: 1,
      padding: 14,
      borderRadius: radius.card,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 5,
    }}>
      {icon}
      <Text style={[typeScale.titleSm, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[typeScale.caption, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

export default function ArenaResultScreen() {
  const colors = useColors();
  const { radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const tournamentId = route.params?.tournamentId ?? '';
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const result = useArenaResult(tournamentId);
  const {
    me, mySchool, schoolName, inTheFive, accuracyPct, avgMs, calculating, provisional,
    prizeCents, claimOpen,
  } = result;

  // CORRECTION, from an external audit: "Prépare le prochain avec ton école"
  // used to navigate('ArenaLobby', { tournamentId }) with THIS screen's own
  // tournamentId — the event that had just ended. A student following that
  // button landed back in the lobby for a tournament already over. The next
  // one, if any is open for registration right now, is a different id this
  // screen never had.
  const nextOpen = useOpenArenaTournament();
  const nextTournamentId = nextOpen.data && nextOpen.data.id !== tournamentId ? nextOpen.data.id : null;

  if (!tournamentId || result.absent) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
            {t('Ce tournoi n’est pas disponible.', 'Tounwa sa a pa disponib.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  /*
   * The scores are still settling. Withholding here is deliberate: showing a
   * rank that then moves is worse than a short wait, and the broadcast is
   * running its own "calcul des scores" sequence at the same moment — the phone
   * should not contradict the big screen.
   */
  if (calculating) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
          <Text style={[typeScale.title, { color: colors.ink, textAlign: 'center' }]}>
            {t('Calcul des scores…', 'N ap kalkile nòt yo…')}
          </Text>
          <Text style={[typeScale.caption, { color: colors.muted, textAlign: 'center' }]}>
            {t('Reste ici, ça arrive.', 'Rete la, l ap vini.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>

        {/* The contribution, not the rank. */}
        <StageEnter playKey="result" index={0} springy>
          <Text style={[typeScale.overline, { color: colors.muted }]}>
            {schoolName || t('Ton école', 'Lekòl ou')}
          </Text>
          <Text style={[typeScale.display ?? typeScale.title, {
            color: inTheFive ? colors.success : colors.ink,
            marginTop: 4,
          }]}>
            {inTheFive
              ? t('Tu étais dans les cinq', 'Ou te nan senk yo')
              : t('Tu as joué pour ton école', 'Ou te jwe pou lekòl ou')}
          </Text>
          {mySchool ? (
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 6 }]}>
              {mySchool.rank > 0
                ? t(`${schoolName} termine #${mySchool.rank}`, `${schoolName} fini #${mySchool.rank}`)
                : t(
                    `${schoolName} n’avait pas ses cinq joueurs — mais tes points comptent pour toi.`,
                    `${schoolName} pa t gen senk jwè — men pwen ou yo konte pou ou.`,
                  )}
            </Text>
          ) : null}
        </StageEnter>

        {/* Your own numbers. */}
        {me ? (
          <>
            <StageEnter playKey="result" index={1}>
              <View style={{
                padding: 18,
                borderRadius: radius.card,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                gap: 2,
              }}>
                <Text style={[typeScale.overline, { color: colors.muted }]}>
                  {t('Ton score', 'Nòt ou')}
                </Text>
                <ScoreCounter
                  value={me.score}
                  style={{ fontSize: 48, fontWeight: '800', color: colors.azure, fontVariant: ['tabular-nums'] }}
                />
                {me.rank > 0 ? (
                  <Text style={[typeScale.caption, { color: colors.muted }]}>
                    {t(`#${me.rank} au classement individuel`, `#${me.rank} nan klasman endividyèl`)}
                  </Text>
                ) : null}
              </View>
            </StageEnter>

            <StageEnter playKey="result" index={2}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat
                  icon={<Target color={colors.muted} size={14} />}
                  value={accuracyPct != null ? `${accuracyPct}%` : '—'}
                  label={t('de bonnes réponses', 'bon repons')}
                />
                <Stat
                  icon={<Timer color={colors.muted} size={14} />}
                  value={avgMs ? `${(avgMs / 1000).toFixed(1)}s` : '—'}
                  label={t('temps moyen', 'tan mwayèn')}
                />
                <Stat
                  icon={<Trophy color={colors.muted} size={14} />}
                  value={String(me.correct)}
                  label={t('réponses justes', 'bon repons')}
                />
              </View>
            </StageEnter>
          </>
        ) : (
          <StageEnter playKey="result" index={1}>
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {t(
                'Tes réponses sont enregistrées. Ton score apparaîtra ici.',
                'Repons ou yo anrejistre. Nòt ou ap parèt isit la.',
              )}
            </Text>
          </StageEnter>
        )}

        {/* Money waiting, and the clock running against it.
            This sits ABOVE the provisional notice on purpose: a winner who
            only ever sees "we will contact you" waits for an email that may
            land in spam, and the 72-hour window does not wait with them. */}
        {claimOpen ? (
          <StageEnter playKey="result" index={3} springy>
            <View style={{
              padding: 18,
              borderRadius: radius.card,
              backgroundColor: colors.azure,
              gap: 10,
            }}>
              <Text style={[typeScale.overline, { color: 'rgba(255,255,255,0.8)' }]}>
                {t('Tu as gagné', 'Ou genyen')}
              </Text>
              <Text style={[typeScale.title, { color: '#fff' }]}>
                {`$${(prizeCents / 100).toFixed(prizeCents % 100 === 0 ? 0 : 2)}`}
              </Text>
              <Text style={[typeScale.caption, { color: 'rgba(255,255,255,0.9)' }]}>
                {t(
                  'Tu as 72 heures pour réclamer. Passé ce délai, le prix passe au suivant.',
                  'Ou gen 72 èdtan pou reklame. Apre delè sa a, pri a pase bay moun ki vin apre a.',
                )}
              </Text>
              <PressableScale
                onPress={() => {
                  tapMedium();
                  Linking.openURL(
                    `https://academy.edlight.org/arena/reclamation?tid=${encodeURIComponent(tournamentId)}`,
                  ).catch(() => undefined);
                }}
                pressedScale={0.98}
                accessibilityRole="button"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 13,
                  borderRadius: radius.control,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={[typeScale.label, { color: colors.azure }]}>
                  {t('Réclamer mon prix', 'Reklame pri mwen')}
                </Text>
              </PressableScale>
            </View>
          </StageEnter>
        ) : null}

        {/* Provisional, said plainly and before anyone asks. */}
        {provisional ? (
          <StageEnter playKey="result" index={4}>
            <View style={{
              padding: 14,
              borderRadius: radius.card,
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 4,
            }}>
              <Text style={[typeScale.label, { color: colors.ink }]}>
                {t('Résultats provisoires', 'Rezilta pwovizwa')}
              </Text>
              <Text style={[typeScale.caption, { color: colors.muted }]}>
                {t(
                  'Les prix sont confirmés après vérification. Les gagnants seront contactés.',
                  'Nou konfime pri yo apre verifikasyon. N ap kontakte moun ki genyen yo.',
                )}
              </Text>
            </View>
          </StageEnter>
        ) : null}

        {/* The invite, framed at the school — the only framing that works here,
            because a school needs five and that is not a favour to ask. */}
        <StageEnter playKey="result" index={5}>
          <PressableScale
            onPress={() => {
              tapMedium();
              if (nextTournamentId) {
                navigation.navigate('ArenaLobby', { tournamentId: nextTournamentId });
              } else {
                // Nothing open yet — Home is where ArenaAnnounceCard will
                // pick the next one up the moment it is, not a lobby for the
                // event that just ended.
                navigation.navigate('Main');
              }
            }}
            pressedScale={0.98}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 15,
              borderRadius: radius.control,
              backgroundColor: colors.azure,
            }}
          >
            <Users color="#fff" size={16} />
            <Text style={[typeScale.label, { color: '#fff' }]}>
              {t('Prépare le prochain avec ton école', 'Prepare pwochen an ak lekòl ou')}
            </Text>
          </PressableScale>
        </StageEnter>

        <StageEnter playKey="result" index={6}>
          <PressableScale
            onPress={() => { tapMedium(); navigation.goBack(); }}
            pressedScale={0.98}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 14,
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Share2 color={colors.muted} size={15} />
            <Text style={[typeScale.label, { color: colors.muted }]}>
              {t('Fermer', 'Fèmen')}
            </Text>
          </PressableScale>
        </StageEnter>
      </ScrollView>
    </SafeAreaView>
  );
}
