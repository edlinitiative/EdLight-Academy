import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Check, School as SchoolIcon, Share2, Trophy, Users } from 'lucide-react-native';
import useStore from '../../contexts/store';
import SchoolPicker from '../../components/SchoolPicker';
import PressableScale from '../../components/ui/PressableScale';
import StageEnter from '../../components/trivia/StageEnter';
import QualificationBar from '../../components/arena/QualificationBar';
import { useArenaLobby, useArenaRegister } from '../../hooks/useArena';
import { formatCountdown, shareArenaInvite } from '../../services/arenaService';
import { logInviteSent } from '../../services/referralService';
import { deviceHash } from '../../utils/integrity';
import { useColors, useTheme, typeScale, displayScale } from '../../theme/theme';
import { select, tapMedium } from '../../utils/haptics';
import type { School } from '../../../../shared/schools';

/**
 * The Lobby — from announcement to doors.
 *
 * The screen is ordered by what the student can ACT ON, not by importance:
 * countdown, your school, your school's five, the invite. Prizes and rules sit
 * below all of it, because a student who has not picked a school yet cannot use
 * a prize table, and a student who has cannot stop reading it.
 *
 * The countdown is the hero and it is in tabular figures. That is not a
 * typographic flourish: it is the one element on this screen that is looked at
 * continuously, and proportional digits make it shuffle sideways every second.
 *
 * The invite is framed around the SCHOOL, never the sender — see
 * `buildArenaInviteMessage`. "Il manque 2 joueurs à CODOSA pour se qualifier"
 * is a fact about something the reader already belongs to; "viens jouer avec
 * moi" is a favour, and gets the response a favour gets.
 */
export default function ArenaLobbyScreen() {
  const route = useRoute<any>();
  const tid: string | null = route?.params?.tournamentId ?? null;

  const colors = useColors();
  const { radius, shadow } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const lobby = useArenaLobby(tid);
  const { tournament, loading, absent, signedIn, registered, counts, mySchool, qualification, doorsOpen } = lobby;
  const navigation = useNavigation<any>();

  const [picker, setPicker] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [attested, setAttested] = useState(false);
  const register = useArenaRegister(tid);

  // Attested, not proven — and prefilled, because the student already told us
  // in onboarding. POSTBAC is the one the server refuses: the Arena is a
  // primary-and-secondary tournament.
  const grade = useStore((s) => s.grade);
  const gradeEligible = !!grade && grade !== 'POSTBAC';

  // Once registered, the school is whatever the standings document says — the
  // picker's local choice is only ever the pre-registration draft.
  const schoolName = lobby.schoolName || school?.shortName || school?.name || '';

  const countdown = formatCountdown(lobby.msToTarget);

  const canRegister = !!tid && signedIn && !!school && attested && gradeEligible && !register.isPending;

  const doRegister = async () => {
    if (!canRegister || !school || !grade) return;
    tapMedium();
    const hash = await deviceHash().catch(() => null);
    const res = await register.mutateAsync({ schoolKey: school.key, grade, deviceHash: hash });
    // Seed the counts from the response so the student sees THEMSELVES in
    // "CODOSA · 3/5" immediately — a bar that does not count the person reading
    // it is the off-by-one that makes somebody register twice.
    if (res.ok) lobby.seedCounts(res.counts);
  };

  const invite = async () => {
    if (!qualification) return;
    tapMedium();
    logInviteSent('champion');
    await shareArenaInvite({
      schoolName: schoolName || t('ton école', 'lekòl ou'),
      qualification,
      lang: isCreole ? 'ht' : 'fr',
      url: 'https://academy.edlight.org/arena',
    });
  };

  const prizeRows = useMemo(() => (tournament?.prizes ?? []).map((cents, i) => ({
    place: i + 1,
    amount: `$${Math.round(cents / 100)}`,
  })), [tournament?.prizes]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.azure} />
      </SafeAreaView>
    );
  }

  // No tournament, or we were not allowed to read it. Both are "nothing is on
  // tonight" to a student, and neither is worth an error they cannot act on.
  if (absent || !tournament) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 }}>
          <Trophy color={colors.faint} size={28} />
          <Text style={[typeScale.title, { color: colors.ink, textAlign: 'center' }]}>
            {t('Aucun championnat programmé', 'Pa gen chanpyona pwograme')}
          </Text>
          <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
            {t(
              'Le prochain sera annoncé dans l’application.',
              'Y ap anonse pwochen an nan aplikasyon an.',
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── The hero: how long until the room opens ─────────────────── */}
        <StageEnter playKey="lobby" index={0} springy>
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
            <Text style={[typeScale.overline, { color: colors.muted }]}>
              {lobby.targetIsDoors
                ? t('Ouverture des portes dans', 'Pòt yo ouvri nan')
                : t('Première question dans', 'Premye kesyon an nan')}
            </Text>
            <Text
              style={[displayScale.hero, {
                color: colors.ink,
                // Tabular figures: the digits must not shuffle sideways.
                fontVariant: ['tabular-nums'],
                letterSpacing: 0,
              }]}
              accessibilityLabel={t(`Compte à rebours : ${countdown}`, `Kontè : ${countdown}`)}
            >
              {countdown}
            </Text>
            <Text numberOfLines={2} style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
              {tournament.title}
            </Text>
          </View>
        </StageEnter>

        {/* ── Your school ─────────────────────────────────────────────── */}
        <StageEnter playKey="lobby" index={1}>
          {registered ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              padding: 13, borderRadius: radius.card,
              backgroundColor: colors.azureSoft, borderWidth: 1, borderColor: colors.azureBorder,
            }}>
              <SchoolIcon color={colors.azure} size={16} />
              <Text numberOfLines={1} style={[typeScale.label, { color: colors.ink, flex: 1 }]}>
                {schoolName || t('École enregistrée', 'Lekòl anrejistre')}
              </Text>
              <Text style={[typeScale.micro, { color: colors.azure }]}>
                {t('Inscrit', 'Enskri')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <PressableScale
                onPress={() => { select(); setPicker(true); }}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={t('Choisir ton école', 'Chwazi lekòl ou')}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  padding: 13, borderRadius: radius.card,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <SchoolIcon color={colors.muted} size={16} />
                <Text numberOfLines={1} style={[typeScale.label, { color: school ? colors.ink : colors.faint, flex: 1 }]}>
                  {school ? (school.shortName || school.name) : t('Choisis ton école…', 'Chwazi lekòl ou…')}
                </Text>
              </PressableScale>

              {/* The attestation. It costs nothing at signup and it is the whole
                  deterrent, because verification only ever touches winners. */}
              <PressableScale
                onPress={() => { select(); setAttested((a) => !a); }}
                pressedScale={0.99}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: attested }}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 6, marginTop: 1,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: attested ? colors.azure : colors.border,
                  backgroundColor: attested ? colors.azure : 'transparent',
                }}>
                  {attested ? <Check color="#fff" size={13} /> : null}
                </View>
                <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>
                  {t(
                    'Je confirme que ces informations sont exactes. Si je gagne, je devrai prouver mon identité.',
                    'Mwen konfime enfòmasyon sa yo kòrèk. Si m genyen, m ap bezwen prouve idantite m.',
                  )}
                </Text>
              </PressableScale>

              <PressableScale
                onPress={doRegister}
                disabled={!canRegister}
                pressedScale={0.98}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canRegister }}
                style={{
                  alignItems: 'center', paddingVertical: 14, borderRadius: radius.control,
                  backgroundColor: canRegister ? colors.azureFill : colors.border,
                }}
              >
                {register.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <Text style={[typeScale.title, { color: canRegister ? '#fff' : colors.faint }]}>
                      {t('Je m’inscris', 'M ap enskri')}
                    </Text>
                  )}
              </PressableScale>

              {!signedIn ? (
                <Text style={[typeScale.caption, { color: colors.muted }]}>
                  {t('Connecte-toi pour participer.', 'Konekte pou w patisipe.')}
                </Text>
              ) : !gradeEligible ? (
                <Text style={[typeScale.caption, { color: colors.muted }]}>
                  {grade === 'POSTBAC'
                    ? t(
                      'Ce championnat est réservé aux élèves du primaire et du secondaire.',
                      'Konkou sa a se pou elèv primè ak segondè.',
                    )
                    : t(
                      'Indique ta classe dans ton profil pour participer.',
                      'Mete klas ou nan pwofil ou pou w patisipe.',
                    )}
                </Text>
              ) : null}
              {register.data && register.data.ok === false ? (
                <Text style={[typeScale.caption, { color: colors.danger }]}>
                  {t('Inscription impossible pour le moment.', 'Nou pa ka enskri w kounye a.')}
                </Text>
              ) : null}
            </View>
          )}
        </StageEnter>

        {/* ── The five ────────────────────────────────────────────────── */}
        {registered && qualification ? (
          <StageEnter playKey="lobby" index={2}>
            <QualificationBar
              schoolName={schoolName}
              qualification={qualification}
              registered={counts?.registered ?? mySchool?.members ?? 0}
              present={counts?.present ?? 0}
              minPlayers={tournament.minPlayers}
              isCreole={isCreole}
            />
          </StageEnter>
        ) : null}

        {/* ── The invite ──────────────────────────────────────────────── */}
        {registered && qualification ? (
          <StageEnter playKey="lobby" index={3}>
            <PressableScale
              onPress={invite}
              pressedScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={t('Partager l’invitation', 'Pataje envitasyon an')}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
                paddingVertical: 14, borderRadius: radius.control,
                backgroundColor: qualification.qualified ? colors.surface : colors.azureFill,
                borderWidth: qualification.qualified ? 1 : 0,
                borderColor: colors.border,
                ...(qualification.qualified ? {} : shadow.md),
              }}
            >
              <Share2 color={qualification.qualified ? colors.azure : '#fff'} size={17} />
              <Text style={[typeScale.title, { color: qualification.qualified ? colors.azure : '#fff' }]}>
                {qualification.qualified
                  ? t('Invite ton école', 'Envite lekòl ou')
                  : doorsOpen
                    ? t('Appelle-les maintenant', 'Rele yo kounye a')
                    : t('Compléter l’équipe', 'Konplete ekip la')}
              </Text>
            </PressableScale>
          </StageEnter>
        ) : null}

        {/* Once the room is open, being IN it is the only thing that matters:
            qualification is measured on who turned up, not who registered. So
            this becomes the primary action and sits above the invite. */}
        {doorsOpen && registered ? (
          <StageEnter playKey="lobby" index={3}>
            <PressableScale
              onPress={() => { tapMedium(); navigation.navigate('ArenaDoors', { tournamentId: tid }); }}
              pressedScale={0.98}
              accessibilityRole="button"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                paddingVertical: 16,
                borderRadius: radius.control,
                backgroundColor: colors.azure,
                marginBottom: 14,
              }}
            >
              <Trophy color="#fff" size={17} />
              <Text style={[typeScale.title, { color: '#fff' }]}>
                {t('Entrer dans l’Arène', 'Antre nan Arèn nan')}
              </Text>
            </PressableScale>
          </StageEnter>
        ) : null}

        {/* ── The room, in numbers ────────────────────────────────────── */}
        <StageEnter playKey="lobby" index={4}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Counter
              icon={<SchoolIcon color={colors.azure} size={15} />}
              value={tournament.counts.schools}
              label={t('écoles inscrites', 'lekòl enskri')}
            />
            <Counter
              icon={<Users color={colors.azure} size={15} />}
              value={tournament.counts.players}
              label={t('joueurs inscrits', 'jwè enskri')}
            />
            <Counter
              icon={<Trophy color={colors.success} size={15} />}
              value={tournament.counts.qualifiedSchools}
              label={t('écoles qualifiées', 'lekòl kalifye')}
            />
          </View>
        </StageEnter>

        {/* ── Prizes ──────────────────────────────────────────────────── */}
        {prizeRows.length > 0 ? (
          <StageEnter playKey="lobby" index={5}>
            <Section title={t('Les prix', 'Pri yo')}>
              {prizeRows.map((p) => (
                <View key={p.place} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={[typeScale.label, { color: colors.muted, width: 26, fontVariant: ['tabular-nums'] }]}>
                    {p.place}
                  </Text>
                  <Text style={[typeScale.title, { color: colors.ink, flex: 1, fontVariant: ['tabular-nums'] }]}>
                    {p.amount}
                  </Text>
                </View>
              ))}
              <Text style={[typeScale.caption, { color: colors.muted }]}>
                {t(
                  'Les gagnants devront prouver leur identité avant le versement.',
                  'Moun ki genyen yo ap bezwen prouve idantite yo anvan yo peye.',
                )}
              </Text>
            </Section>
          </StageEnter>
        ) : null}

        {/* ── Rules ───────────────────────────────────────────────────── */}
        <StageEnter playKey="lobby" index={6}>
          <Section title={t('Les règles', 'Règ yo')}>
            <Rule text={t(
              `${tournament.questionCount} questions, une seule tentative par question.`,
              `${tournament.questionCount} kesyon, yon sèl tantativ pou chak.`,
            )} />
            <Rule text={t(
              'Réponds vite : pleine valeur avant 12 s, moitié jusqu’à 20 s.',
              'Reponn vit : tout pwen anvan 12 s, mwatye jiska 20 s.',
            )} />
            <Rule text={t(
              `Une école concourt avec ses ${tournament.teamSize} meilleurs joueurs présents.`,
              `Yon lekòl konkouri ak ${tournament.teamSize} pi bon jwè prezan li yo.`,
            )} />
            <Rule text={t(
              `Il faut ${tournament.minPlayers} joueurs présents à l’ouverture pour qualifier l’école. Sans eux, tu joues quand même — en individuel.`,
              `Ou bezwen ${tournament.minPlayers} jwè prezan lè pòt yo louvri pou lekòl la kalifye. San yo, ou jwe kanmenm — pou kont ou.`,
            )} />
          </Section>
        </StageEnter>
      </ScrollView>

      {/* The picker already exists, short names and all — reused, not rebuilt. */}
      <SchoolPicker
        visible={picker}
        commune={null}
        onSelect={(s) => setSchool(s)}
        onClose={() => setPicker(false)}
      />
    </SafeAreaView>
  );
}

function Counter({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  const colors = useColors();
  const { radius } = useTheme();
  return (
    <View style={{
      flex: 1, gap: 4, padding: 11, borderRadius: radius.card,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    }}>
      {icon}
      <Text style={[typeScale.h2, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[typeScale.micro, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  const { radius } = useTheme();
  return (
    <View style={{
      gap: 9, padding: 14, borderRadius: radius.card,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    }}>
      <Text style={[typeScale.overline, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function Rule({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={[typeScale.body, { color: colors.faint }]}>·</Text>
      <Text style={[typeScale.body, { color: colors.muted, flex: 1 }]}>{text}</Text>
    </View>
  );
}
