import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Check, GraduationCap, School as SchoolIcon, Share2, ShieldAlert, Trophy, User as UserIcon, Users, Zap } from 'lucide-react-native';
import useStore from '../../contexts/store';
import SchoolPicker from '../../components/SchoolPicker';
import PressableScale from '../../components/ui/PressableScale';
import StageEnter from '../../components/trivia/StageEnter';
import QualificationBar from '../../components/arena/QualificationBar';
import { useArenaLobby, useArenaRegister } from '../../hooks/useArena';
import { useSaveFullName } from '../../hooks/useSaveFullName';
import { useTrivia } from '../../hooks/useTrivia';
import { formatCountdown, shareArenaInvite } from '../../services/arenaService';
import { logInviteSent } from '../../services/referralService';
import { deviceHash } from '../../utils/integrity';
import { useTheme, typeScale } from '../../theme/theme';
import { useArenaColors, arenaType } from '../../theme/arenaTheme';
import arenaHaptics from '../../components/arena/arenaHaptics';
import { ArenaScreen, ArenaButton, ArenaStateView, StaleBanner, ArenaPanel } from '../../components/arena/ArenaKit';
import SchoolCrest from '../../components/arena/art/crest/SchoolCrest';
import type { School } from '../../../../shared/schools';
import { GRADES } from '../../../../shared/trackConfig';
import { defaultAlias } from '../../../../shared/alias';
import ArenaIdentityRow from '../../components/arena/ArenaIdentityRow';
import ArenaNameSheet from '../../components/arena/ArenaNameSheet';
import ArenaGradeSheet from '../../components/arena/ArenaGradeSheet';
import ArenaWarmUp from '../../components/arena/ArenaWarmUp';
import ArenaDemoLoop from '../../components/arena/ArenaDemoLoop';

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
 * The invite is one short sentence plus the link (see
 * `buildArenaInviteMessage`): the referral-code line when there is a code,
 * otherwise the school's shortfall.
 */
export default function ArenaLobbyScreen() {
  const route = useRoute<any>();
  const tid: string | null = route?.params?.tournamentId ?? null;

  const colors = useArenaColors();
  const { radius } = useTheme();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const lobby = useArenaLobby(tid);
  const { tournament, status, stale, signedIn, registered, counts, mySchool, qualification, doorsOpen, accessDenied } = lobby;
  const navigation = useNavigation<any>();

  const [picker, setPicker] = useState(false);
  const [school, setSchool] = useState<School | null>(null);
  const [attested, setAttested] = useState(false);
  const [nameSheet, setNameSheet] = useState(false);
  const [gradeSheet, setGradeSheet] = useState(false);
  const [warming, setWarming] = useState(false);
  const register = useArenaRegister(tid);

  /*
   * TWO NAMES, AND THEY ARE NOT THE SAME NAME.
   *
   * The FULL name lives on the account (`user.name`, mirrored to the ID token
   * and `users/{uid}.full_name`) and exists because a prize winner has to
   * prove their identity. The AUDIENCE name is the first name alone, derived
   * exactly as the server derives it in `publicDisplayName`, and it is the only
   * one that reaches a public broadcast.
   *
   * Ted, 2026-09-21: "ask them to put their full name, but we show them what
   * the audience will see — just first name."
   */
  const user = useStore((st) => st.user);
  const { profile } = useTrivia();
  const fullName: string | null = user?.name || user?.displayName || null;
  const savedAlias: string | null = (profile?.leaderboard as any)?.displayName || null;
  const boardName = savedAlias || defaultAlias(fullName);

  // The one full-name writer, shared with the Profil (hooks/useSaveFullName).
  const { save: persistFullName, saving: savingName } = useSaveFullName();
  const saveFullName = async (next: string) => {
    await persistFullName(next);
    setNameSheet(false);
  };

  // Attested, not proven — and prefilled, because the student already told us
  // in onboarding. POSTBAC is the one the server refuses: the Arena is a
  // primary-and-secondary tournament.
  const grade = useStore((st) => st.grade);
  const setGrade = useStore((st) => st.setGrade);
  const setGradeChosen = useStore((st) => st.setGradeChosen);
  const gradeEligible = !!grade && grade !== 'POSTBAC';
  const gradeEntry = GRADES.find((g) => g.code === grade) || null;
  const gradeLabel = gradeEntry ? (isCreole ? gradeEntry.labelHt : gradeEntry.label) : null;

  /*
   * The reason a row is blocking, ON the row. The previous version put one
   * sentence under the button — "Ce championnat est réservé aux élèves du
   * primaire et du secondaire" — which reads as a general notice rather than
   * "YOUR profile says Préfac", and pointed at nothing the student could
   * change from this screen. It was reported as the button being broken, which
   * is exactly how it looked.
   */
  const gradeProblem = !grade
    ? t('Choisis ta classe pour t’inscrire.', 'Chwazi klas ou pou w enskri.')
    : grade === 'POSTBAC'
      ? t(
        'Ton profil indique « Après le Bac ». Le championnat est réservé au primaire et au secondaire.',
        'Pwofil ou di « Apre Bak ». Chanpyona a se pou primè ak segondè.',
      )
      : null;

  // Once registered, the school is whatever the standings document says — the
  // picker's local choice is only ever the pre-registration draft.
  const schoolName = lobby.schoolName || school?.shortName || school?.name || '';

  const countdown = formatCountdown(lobby.msToTarget);

  const canRegister = !!tid && signedIn && !!school && attested && gradeEligible && !register.isPending;

  const doRegister = async () => {
    if (!canRegister || !school || !grade) return;
    arenaHaptics.commit();
    const hash = await deviceHash().catch(() => null);
    const res = await register.mutateAsync({ schoolKey: school.key, grade, deviceHash: hash });
    // Seed the counts from the response so the student sees THEMSELVES in
    // "CODOSA · 3/5" immediately — a bar that does not count the person reading
    // it is the off-by-one that makes somebody register twice.
    if (res.ok) lobby.seedCounts(res.counts);
  };

  const invite = async () => {
    if (!qualification) return;
    arenaHaptics.commit();
    logInviteSent('champion');
    await shareArenaInvite({
      schoolName: schoolName || '',
      qualification,
      lang: isCreole ? 'ht' : 'fr',
      url: 'https://academy.edlight.org/arena',
    });
  };

  /*
   * A rank that pays nothing is not a prize. The table used to render whatever
   * the tournament document held, so a third place worth zero was published to
   * students as "3 · $0" — which reads as a prize of nothing rather than as a
   * tournament that pays two places.
   */
  const prizeRows = useMemo(() => (tournament?.prizes ?? [])
    .map((cents, i) => ({ place: i + 1, cents }))
    .filter((r) => Number.isFinite(r.cents) && r.cents > 0)
    .map((r) => ({
      place: r.place,
      // Round dollars stay clean ("$100"); anything else keeps its cents.
      // `Math.round(cents / 100)` printed a 50-cent prize as "$1" and a
      // 25-cent one as "$0", which is how a tournament configured in the wrong
      // unit looked plausible on the screen instead of obviously broken.
      amount: r.cents % 100 === 0
        ? `$${r.cents / 100}`
        : `$${(r.cents / 100).toFixed(2)}`,
    })), [tournament?.prizes]);

  /*
   * Every non-event state has its own screen (utils/arenaViewState.ts). A
   * listener that failed is "connexion perdue" with a retry — never "aucun
   * championnat programmé", which would send a registered student away from
   * an event that is happening.
   */
  if (!tid || status !== 'ready' && status !== 'reconnecting' || !tournament) {
    return (
      <ArenaScreen>
        <ArenaStateView
          status={!tid ? 'unavailable' : status === 'ready' ? 'unavailable' : status}
          t={t}
          onRetry={lobby.retry}
          onReturn={() => navigation.navigate('ArenaHub')}
        />
      </ArenaScreen>
    );
  }

  return (
    <ArenaScreen>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {stale ? <StaleBanner t={t} onRetry={lobby.retry} /> : null}

        {/* Integrity review marked this registration ineligible. Said
            plainly, on top, instead of a register form that cannot work. */}
        {accessDenied ? (
          <ArenaPanel tone="warn" accessibilityLabel={t('Accès refusé', 'Aksè refize')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldAlert color={colors.warn} size={18} />
              <Text style={[arenaType.name, { color: colors.ink }]}>{t('Accès refusé', 'Aksè refize')}</Text>
            </View>
            <Text style={[arenaType.status, { color: colors.ink }]}>
              {t(
                'Après vérification, ton inscription ne peut pas jouer ce championnat. Si tu penses que c’est une erreur, écris à EdLight.',
                'Apre verifikasyon, enskripsyon ou pa ka jwe chanpyona sa a. Si w panse se yon erè, ekri EdLight.',
              )}
            </Text>
          </ArenaPanel>
        ) : null}
        {/* ── The hero: how long until the room opens ─────────────────── */}
        <StageEnter playKey="lobby" index={0} springy>
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 10 }}>
            <Text style={[arenaType.label, { color: colors.muted }]}>
              {lobby.targetIsDoors
                ? t('Ouverture des portes dans', 'Pòt yo ouvri nan')
                : t('Première question dans', 'Premye kesyon an nan')}
            </Text>
            <Text
              // Tabular figures (arenaType.score): the digits must not shuffle sideways.
              style={[arenaType.score, { color: colors.ink }]}
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
              backgroundColor: colors.azureSoft,
            }}>
              {schoolName ? <SchoolCrest name={mySchool?.label || schoolName} size={30} /> : <SchoolIcon color={colors.azure} size={16} />}
              <Text numberOfLines={1} style={[arenaType.name, { color: colors.ink, flex: 1 }]}>
                {schoolName || t('École enregistrée', 'Lekòl anrejistre')}
              </Text>
              <Text style={[arenaType.status, { color: colors.azure }]}>
                {t('Inscrit', 'Enskri')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {/*
                * WHO IS BEING REGISTERED — all three facts, each changeable here.
                *
                * The checkbox below says "je confirme que ces informations sont
                * exactes". Until build 58 the only information on the screen was
                * the school: the board name and the class that decides
                * eligibility were invisible and unreachable, so the sentence was
                * asking students to confirm something they could not see.
                */}
              <ArenaIdentityRow
                icon={<UserIcon color={colors.muted} size={16} />}
                label={t('Ton nom sur le tableau', 'Non ou sou tablo a')}
                value={boardName}
                placeholder={t('Ajoute ton nom…', 'Mete non ou…')}
                problem={!boardName
                  ? t('Ajoute ton nom pour apparaître au tableau.', 'Mete non ou pou w parèt sou tablo a.')
                  : null}
                onPress={() => setNameSheet(true)}
              />

              <ArenaIdentityRow
                icon={<GraduationCap color={gradeProblem ? colors.danger : colors.muted} size={16} />}
                label={t('Ta classe', 'Klas ou')}
                value={gradeLabel}
                placeholder={t('Choisis ta classe…', 'Chwazi klas ou…')}
                problem={gradeProblem}
                onPress={() => setGradeSheet(true)}
              />

              <ArenaIdentityRow
                icon={<SchoolIcon color={colors.muted} size={16} />}
                label={t('Ton école', 'Lekòl ou')}
                value={school ? (school.shortName || school.name) : null}
                placeholder={t('Choisis ton école…', 'Chwazi lekòl ou…')}
                problem={!school ? t('Choisis ton école pour t’inscrire.', 'Chwazi lekòl ou pou w enskri.') : null}
                onPress={() => setPicker(true)}
              />

              {/* The attestation. It costs nothing at signup and it is the whole
                  deterrent, because verification only ever touches winners. */}
              <PressableScale
                onPress={() => { arenaHaptics.choose(); setAttested((a) => !a); }}
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
                <Text style={[arenaType.status, { color: colors.ink, flex: 1 }]}>
                  {t(
                    'Je confirme que ces informations sont exactes. Si je gagne, je devrai prouver mon identité.',
                    'Mwen konfime enfòmasyon sa yo kòrèk. Si m genyen, m ap bezwen prouve idantite m.',
                  )}
                </Text>
              </PressableScale>

              <ArenaButton
                label={t('Je m’inscris', 'M ap enskri')}
                onPress={doRegister}
                disabled={!canRegister}
                busy={register.isPending}
              />

              {/* Only what no row above is already saying. The class and school
                  reasons live on their own rows now, where they can be acted on. */}
              {!signedIn ? (
                <Text style={[arenaType.status, { color: colors.muted }]}>
                  {t('Connecte-toi pour participer.', 'Konekte pou w patisipe.')}
                </Text>
              ) : gradeEligible && school && !attested ? (
                <Text style={[arenaType.status, { color: colors.muted }]}>
                  {t('Coche la case pour confirmer.', 'Tcheke kaz la pou konfime.')}
                </Text>
              ) : null}
              {register.data && register.data.ok === false ? (
                <Text style={[arenaType.status, { color: colors.danger }]}>
                  {t('Inscription impossible pour le moment. Réessaie dans un instant.', 'Nou pa ka enskri w kounye a. Eseye ankò talè.')}
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

        {/*
          * The wait, made into practice — same pair as the doors screen.
          *
          * Only once REGISTERED: before that the job of this screen is to get
          * them in, and a game sitting above the register button competes with
          * it. The demo loop is the empty state; a student who wants to play
          * does not have to watch anything first.
          */}
        {registered ? (
          <StageEnter playKey="lobby" index={2}>
            {warming ? (
              <ArenaWarmUp isCreole={isCreole} onExit={() => setWarming(false)} />
            ) : (
              <View style={{ gap: 10 }}>
                <ArenaDemoLoop isCreole={isCreole} />
                <PressableScale
                  onPress={() => { arenaHaptics.choose(); setWarming(true); }}
                  pressedScale={0.98}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    paddingVertical: 14, borderRadius: radius.card,
                    backgroundColor: colors.azureSoft,
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
        ) : null}

        {/* ── The invite ──────────────────────────────────────────────── */}
        {registered && qualification ? (
          <StageEnter playKey="lobby" index={3}>
            <ArenaButton
              variant={qualification.qualified || doorsOpen ? 'secondary' : 'primary'}
              label={qualification.qualified
                ? t('Invite ton école', 'Envite lekòl ou')
                : doorsOpen
                  ? t('Appelle-les maintenant', 'Rele yo kounye a')
                  : t('Compléter l’équipe', 'Konplete ekip la')}
              onPress={invite}
              icon={<Share2 color={qualification.qualified || doorsOpen ? colors.ink : '#12213A'} size={17} />}
            />
          </StageEnter>
        ) : null}

        {/* Once the room is open, being IN it is the only thing that matters:
            qualification is measured on who turned up, not who registered. So
            this becomes the primary action and sits above the invite. */}
        {doorsOpen && registered ? (
          <StageEnter playKey="lobby" index={3}>
            <ArenaButton
              label={t('Entrer dans l’Arène', 'Antre nan Arèn nan')}
              onPress={() => { arenaHaptics.commit(); navigation.navigate('ArenaDoors', { tournamentId: tid }); }}
              icon={<Trophy color="#12213A" size={17} />}
            />
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
              <Text style={[arenaType.status, { color: colors.muted }]}>
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

      <ArenaNameSheet
        visible={nameSheet}
        fullName={fullName}
        isCreole={isCreole}
        saving={savingName}
        onSave={saveFullName}
        onClose={() => setNameSheet(false)}
      />

      <ArenaGradeSheet
        visible={gradeSheet}
        current={grade}
        isCreole={isCreole}
        onPick={(code) => { setGrade(code); setGradeChosen(true); }}
        onClose={() => setGradeSheet(false)}
      />
    </ArenaScreen>
  );
}

function Counter({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  const colors = useArenaColors();
  const { radius } = useTheme();
  return (
    <View style={{
      flex: 1, gap: 4, padding: 11, borderRadius: radius.card,
      backgroundColor: colors.surface,
    }}>
      {icon}
      <Text style={[typeScale.h2, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[arenaType.status, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useArenaColors();
  const { radius } = useTheme();
  return (
    <View style={{
      gap: 9, padding: 14, borderRadius: radius.card,
      backgroundColor: colors.surface,
    }}>
      <Text style={[arenaType.name, { color: colors.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

function Rule({ text }: { text: string }) {
  const colors = useArenaColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={[typeScale.body, { color: colors.faint }]}>·</Text>
      <Text style={[typeScale.body, { color: colors.muted, flex: 1 }]}>{text}</Text>
    </View>
  );
}
