import React, { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Users, School as SchoolIcon } from 'lucide-react-native';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import useStore from '../../contexts/store';
import { useArenaDoors } from '../../hooks/useArena';
import { formatCountdown } from '../../services/arenaService';
import QualificationBar from '../../components/arena/QualificationBar';
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

  const doors = useArenaDoors(tournamentId);
  const { started, msToStart, counts, qualification, arrivals, roomSchools, roomPlayers, schoolName } = doors;

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
              <Text style={[typeScale.caption, { color: colors.warn, marginTop: 8 }]}>
                {t(
                  'Dis-leur d’ouvrir l’app maintenant — il reste quelques minutes.',
                  'Di yo louvri app la kounye a — gen kèk minit ki rete.',
                )}
              </Text>
            ) : null}
          </StageEnter>
        ) : null}

        {/* Arrivals. A number climbing is data; a name arriving is an event. */}
        {arrivals.length > 0 ? (
          <StageEnter playKey="doors" index={3}>
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
