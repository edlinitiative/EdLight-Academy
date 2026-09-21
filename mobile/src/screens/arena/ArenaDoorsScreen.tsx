import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Users, School as SchoolIcon, Share2, Zap } from 'lucide-react-native';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import useStore from '../../contexts/store';
import { useArenaDoors } from '../../hooks/useArena';
import { formatCountdown, shareArenaInvite } from '../../services/arenaService';
import { logInviteSent } from '../../services/referralService';
import QualificationBar from '../../components/arena/QualificationBar';
import ArenaWarmUp from '../../components/arena/ArenaWarmUp';
import ArenaDemoLoop from '../../components/arena/ArenaDemoLoop';
import PressableScale from '../../components/ui/PressableScale';
import { tapMedium } from '../../utils/haptics';
import StageEnter from '../../components/trivia/StageEnter';
import ScoreCounter from '../../components/trivia/ScoreCounter';
import type { RootParamList } from '../../navigation/AppNavigator';

/**
 * The ten minutes before the first question.
 *
 * This is the only moment in the tournament when a student is staring at the
 * screen with nothing to do, so the room filling has to BE the content: the
 * count climbing, schools arriving by name, their own five confirming. A
 * countdown alone would make the wait feel like a wait.
 *
 * It is also the moment qualification actually gets decided. A school can be
 * qualified on paper — five registered — and short in the room, and finding
 * that out at kick-off is a bad surprise and a worse story. So the number on
 * screen here counts who is PRESENT, and if the school is short it says so
 * while there is still time to fix it.
 */

type Nav = NativeStackNavigationProp<RootParamList, 'ArenaDoors'>;
type Route = RouteProp<RootParamList, 'ArenaDoors'>;

export default function ArenaDoorsScreen() {
  const colors = useColors();
  const { radius } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const tournamentId = route.params?.tournamentId ?? '';
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const [warming, setWarming] = useState(false);

  const doors = useArenaDoors(tournamentId);
  const { started, msToStart, counts, qualification, arrivals, roomSchools, roomPlayers, schoolName } = doors;

  /*
   * The share, on the screen where being short is actually visible. The line
   * under the qualification bar told a student to "tell them to open the app"
   * and then gave them nothing to tell them WITH. The message is built around
   * the SCHOOL — "il manque 2 joueurs à CODOSA" is a fact about something the
   * reader already belongs to, where "viens jouer avec moi" is a favour.
   */
  const invite = useCallback(async () => {
    if (!doors.qualification) return;
    tapMedium();
    // Same bucket as the lobby's Arena invite — one surface in the
    // referral counters, not two that have to be added up later.
    logInviteSent('champion');
    await shareArenaInvite({
      schoolName: doors.schoolName || (language === 'ht' ? 'lekòl ou' : 'ton école'),
      qualification: doors.qualification,
      lang: language === 'ht' ? 'ht' : 'fr',
      url: 'https://academy.edlight.org/arena',
    });
  }, [doors.qualification, doors.schoolName, language]);

  // The handover is automatic and replaces this screen rather than stacking on
  // it: a student must not be able to swipe back out of a live question into
  // the ante-room they came from.
  useEffect(() => {
    if (started) navigation.replace('ArenaLive', { tournamentId });
  }, [started, navigation, tournamentId]);

  if (!tournamentId || doors.absent) {
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

  const short = !!qualification && !qualification.qualified;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 40 }}>

        <StageEnter playKey="doors" index={0} springy>
          <Text style={[typeScale.overline, { color: colors.muted }]}>
            {t('L’Arène ouvre dans', 'Arèn nan ap louvri nan')}
          </Text>
          <Text style={{
            fontSize: 56,
            fontWeight: '800',
            color: colors.ink,
            fontVariant: ['tabular-nums'],
            letterSpacing: -1.5,
            marginTop: 2,
          }}>
            {formatCountdown(msToStart)}
          </Text>
        </StageEnter>

        {/* The room. Two numbers, counting rather than jumping — the whole
            point of this screen is that it is filling up. */}
        <StageEnter playKey="doors" index={1}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {([
              [SchoolIcon, roomSchools, t('écoles', 'lekòl')],
              [Users, roomPlayers, t('joueurs', 'jwè')],
            ] as const).map(([Icon, value, label], i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  padding: 16,
                  borderRadius: radius.card,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 4,
                }}
              >
                <Icon color={colors.muted} size={14} />
                <ScoreCounter
                  value={value}
                  style={{ ...typeScale.title, color: colors.ink, fontVariant: ['tabular-nums'] }}
                />
                <Text style={[typeScale.caption, { color: colors.muted }]}>{label}</Text>
              </View>
            ))}
          </View>
        </StageEnter>

        {/* Your school, and whether it is actually in the room. QualificationBar
            owns this card — it already shows both counts and knows that after
            doors the present one is the one that decides. */}
        {counts && qualification ? (
          <StageEnter playKey="doors" index={2}>
            <QualificationBar
              schoolName={schoolName}
              qualification={qualification}
              registered={counts.registered}
              present={counts.present}
              minPlayers={doors.tournament?.minPlayers ?? 5}
              isCreole={language === 'ht'}
            />
            {short ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Text style={[typeScale.caption, { color: colors.warn }]}>
                  {t(
                    'Dis-leur d’ouvrir l’app maintenant — il reste quelques minutes.',
                    'Di yo louvri app la kounye a — gen kèk minit ki rete.',
                  )}
                </Text>
                <PressableScale
                  onPress={() => { void invite(); }}
                  pressedScale={0.98}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 12, borderRadius: radius.card, backgroundColor: colors.azure,
                  }}
                >
                  <Share2 color="#fff" size={15} />
                  <Text style={[typeScale.label, { color: '#fff' }]}>
                    {t('Appeler mon école', 'Rele lekòl mwen')}
                  </Text>
                </PressableScale>
              </View>
            ) : null}
          </StageEnter>
        ) : null}

        {/*
          * The wait, made into practice.
          *
          * The demo loop is the empty state and the warm-up is the thing
          * itself; a student who wants to play does not have to watch anything
          * first. Both disappear the moment `started` flips, because this
          * whole screen is replaced by the live question — no timer here
          * outlives it.
          */}
        <StageEnter playKey="doors" index={3}>
          {warming ? (
            <ArenaWarmUp isCreole={language === 'ht'} onExit={() => setWarming(false)} />
          ) : (
            <View style={{ gap: 10 }}>
              <ArenaDemoLoop isCreole={language === 'ht'} />
              <PressableScale
                onPress={() => { tapMedium(); setWarming(true); }}
                pressedScale={0.98}
                accessibilityRole="button"
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  paddingVertical: 14, borderRadius: radius.card,
                  borderWidth: 1, borderColor: colors.azureBorder, backgroundColor: colors.azureSoft,
                }}
              >
                <Zap color={colors.azure} size={15} />
                <Text style={[typeScale.label, { color: colors.azure }]}>
                  {t('S’échauffer en attendant', 'Chofe kò w pandan w ap tann')}
                </Text>
              </PressableScale>
            </View>
          )}
        </StageEnter>

        {/* Arrivals. A number climbing is data; a name arriving is an event. */}
        {arrivals.length > 0 ? (
          <StageEnter playKey="doors" index={4}>
            <Text style={[typeScale.overline, { color: colors.muted, marginBottom: 8 }]}>
              {t('Ils viennent d’entrer', 'Yo fèk antre')}
            </Text>
            <View style={{ gap: 6 }}>
              {arrivals.map((name, i) => (
                <StageEnter key={`${name}-${i}`} playKey={name} index={i}>
                  <Text style={[typeScale.body, { color: colors.ink }]}>
                    <Text style={{ fontWeight: '700' }}>{name}</Text>
                    {t(' est entré dans l’Arène', ' antre nan Arèn nan')}
                  </Text>
                </StageEnter>
              ))}
            </View>
          </StageEnter>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
