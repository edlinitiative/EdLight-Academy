import React, { useState, useEffect, useMemo } from 'react';
import { useScrollToTop, useNavigation } from '@react-navigation/native';
import { View, Text, ScrollView, Alert, Image, AppState, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Flame, Trophy, Zap, LogOut, Moon, Languages, Trash2, Target, Bell, GraduationCap,
  Sprout, Brain, Mail, Vibrate, Palette, UserPlus, Eye, Info, Instagram, ChevronRight, Pencil,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import { Avatar as Face, SchoolCrest } from '../components/arena/art';
import { schoolColors } from '../components/arena/art/crest/SchoolCrest';
import { useMyAvatar } from '../hooks/useMyAvatar';
import PressableScale from '../components/ui/PressableScale';
import PageTitle from '../components/ui/PageTitle';
import Button from '../components/ui/Button';
import Segmented from '../components/ui/Segmented';
import XpBar from '../components/ui/XpBar';
import StreakFlame from '../components/ui/StreakFlame';
import { SettingsCard, SettingsRow, SettingsSwitch } from '../components/profile/SettingsCard';
import { gradeShortLabel, ordinal } from '../components/profile/gradeLabel';
import { useQueryClient } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { logoutUser, deleteAccount } from '../services/authService';
import { saveNotificationPrefs, getNotificationPrefs } from '../services/firebase';
import { setLeaderboardOptIn } from '../services/triviaService';
import { setBoardVisibility } from '../services/leaderboardService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useLeaderboard, useCollectives } from '../hooks/useLeaderboard';
import { normalizeName } from '../../../shared/leaderboardAgg';
import { getFirstName } from '../utils/shared';
import ReadinessCard from '../components/ReadinessCard';
import GradeProgress from '../components/GradeProgress';
import InviteSheet from '../components/InviteSheet';
import { openInstagram } from '../components/FollowInstagram';
import { gradeProfile } from '../config/trackConfig';
import { resetTabToRoot } from '../navigation/navHelpers';
import { useTheme, touch } from '../theme/theme';
import { usePreference } from '../settings/preferences';
import { countLessonEvidence } from '../settings/profileEvidence';
import { EVIDENCE, evidenceLabel } from '../utils/learningJourney';
import { select as hapticSelect } from '../utils/haptics';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import {
  areNotificationsEnabled,
  setNotificationsEnabled as persistNotificationsEnabled,
  askForNotifications,
  getNotificationPermissionAction,
  openNotificationSettings,
  scheduleEngagementReminders,
} from '../services/notificationService';

/**
 * Profil (Stitch 11). Title row, then cards only — no band, no greeting:
 *
 *   guest      the web's "Ton profil EdLight" feature card + a settings card
 *              (night mode and language work without an account).
 *   signed in  identity card → ranking (real ranks or an honest empty state)
 *              → lesson evidence → level → earned badges → Réglages → Compte
 *              → invite / sign-out links.
 */

const GUTTER = 20;
const GAP = 16;

const ABOUT_URL = 'https://edlight.org';

// ── main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors, cardSurface, featureSurface, typeScale, fonts, radius, isDark } = useTheme();
  // `danger` (#ef4444) is 3.8:1 on white: too light for a text label. Deeper red in light.
  const dangerInk = isDark ? colors.danger : "#B91C1C";
  const {
    user,
    isAuthenticated,
    language,
    setLanguage,
    theme,
    setTheme,
    logout,
    quizAttempts,
    progress,
    grade,
    setGradeChosen,
    toggleAuthModal,
    setActiveTab,
  } = useStore();

  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const navigation = useNavigation<any>();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column

  const { level, profile } = useTrivia();
  const { avatar: myAvatar } = useMyAvatar();
  const { streak } = useStreak();
  const { myRank, showingLastWeek } = useLeaderboard(25);
  const queryClient = useQueryClient();

  // The student's school, as stored on the board profile. Its rank comes from
  // the server-side collective ranking — never estimated on the device.
  const school: string | null = (profile as any)?.leaderboard?.school || null;
  const { groups: schoolGroups } = useCollectives('school', 'week', !!school && isAuthenticated);
  const schoolRank = useMemo(() => {
    if (!school || !schoolGroups.length) return null;
    const key = normalizeName(school);
    const g = schoolGroups.find((x: any) => x.key === key);
    return g ? { rank: g.rank as number, of: schoolGroups.length, label: g.label as string } : null;
  }, [school, schoolGroups]);

  // Public-board visibility. Everyone appears by default (auto-alias); this
  // switch is the opt-out. Local override for instant feedback, profile as the
  // source of truth otherwise.
  const [boardVisibleOverride, setBoardVisibleOverride] = useState<boolean | null>(null);
  const boardVisible = boardVisibleOverride ?? (profile?.leaderboard?.optedIn !== false);
  const handleBoardVisibilityToggle = async (next: boolean) => {
    setBoardVisibleOverride(next);
    if (!user?.uid) return;
    // Profile flag (drives this switch + future awards) and the entry flags
    // (hide/show the current week + all-time rows immediately).
    await Promise.all([
      setLeaderboardOptIn(user.uid, { optedIn: next }),
      setBoardVisibility(user.uid, next),
    ]);
    queryClient.invalidateQueries({ queryKey: ['leaderboard-weekly'] });
  };

  const allAttempts = Object.values(quizAttempts).flat() as { score: number; total: number; date: number }[];
  const totalQuizzes = allAttempts.length;
  // The 3rd tab is always named "Exams", but Quiz-primary grades (7e–8e, NS1–NS3)
  // mount QuizNavigator behind it, which has no ExamLanding route.
  const practiceRoot = gradeProfile(grade).primaryTab === 'Quiz' ? 'Quizzes' : 'ExamLanding';
  const firstName = getFirstName(user);

  const avgPct: number | null = (() => {
    if (allAttempts.length === 0) return null;
    const avg = allAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) / allAttempts.length;
    return Math.round(avg * 100);
  })();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  // Refused at the OS level: the switch can't fix it, only the system settings can.
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(true);
  const [competitionUpdatesEnabled, setCompetitionUpdatesEnabled] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = usePreference('hapticsEnabled');

  // Read on mount and every time the app comes back to the foreground — the
  // student may have just changed the permission in the system settings.
  useEffect(() => {
    const refresh = () => {
      areNotificationsEnabled().then(setNotificationsEnabled).catch(() => {});
      getNotificationPermissionAction()
        .then((a) => setNotificationsBlocked(a === 'settings'))
        .catch(() => {});
    };
    refresh();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    return () => sub.remove();
  }, []);

  // Server-side prefs are a separate store from the device toggle above: the
  // backend crons read only Firestore, so this is what governs emails.
  useEffect(() => {
    if (!user?.uid) return;
    getNotificationPrefs(user.uid)
      .then((p) => {
        setEmailRemindersEnabled(p.emailNotifications !== false);
        setCompetitionUpdatesEnabled(p.competitionUpdates !== false);
      })
      .catch(() => {});
  }, [user?.uid]);

  async function handleEmailRemindersToggle(value: boolean) {
    setEmailRemindersEnabled(value);
    if (!user?.uid) return;
    try {
      await saveNotificationPrefs(user.uid, { emailNotifications: value });
    } catch {
      setEmailRemindersEnabled(!value); // put the switch back if the write failed
    }
  }

  async function handleCompetitionUpdatesToggle(value: boolean) {
    setCompetitionUpdatesEnabled(value);
    if (!user?.uid) return;
    try {
      await saveNotificationPrefs(user.uid, { competitionUpdates: value });
    } catch {
      setCompetitionUpdatesEnabled(!value);
    }
  }

  async function handleNotificationToggle(value: boolean) {
    if (value) {
      // Explicit opt-in: explain → OS dialog (at most once) → or the settings
      // path after an earlier refusal. Never a silent re-prompt.
      setNotificationsEnabled(true);
      const result = await askForNotifications('profile');
      if (result !== 'granted') {
        setNotificationsEnabled(false);
        await persistNotificationsEnabled(false);
        setNotificationsBlocked(result === 'blocked' || result === 'denied');
        return;
      }
      setNotificationsBlocked(false);
      await persistNotificationsEnabled(true);
      // Also record it server-side. Without this, switching notifications off
      // silenced only the LOCAL schedule while the backend kept sending nudges.
      if (user?.uid) saveNotificationPrefs(user.uid, { studyReminders: true }).catch(() => {});
      await scheduleEngagementReminders();
    } else {
      setNotificationsEnabled(false);
      await persistNotificationsEnabled(false);
      if (user?.uid) saveNotificationPrefs(user.uid, { studyReminders: false }).catch(() => {});
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }

  function handleHapticsToggle(value: boolean) {
    setHapticsEnabled(value);
    // Confirm "on" with the very feedback it enables (the setter is synchronous).
    if (value) hapticSelect();
  }

  function handleLanguageChange(next: string) {
    if (next === language) return;
    setLanguage(next);
    areNotificationsEnabled()
      .then((enabled) => { if (enabled) return scheduleEngagementReminders(); })
      .catch(() => {});
  }

  function openAuth(tab: 'signin' | 'signup') {
    setActiveTab(tab);
    toggleAuthModal();
  }

  async function handleLogout() {
    Alert.alert(
      t('Déconnexion', 'Dekoneksyon'),
      t('Tu veux vraiment te déconnecter ?', 'Ou vle dekonekte?'),
      [
        { text: t('Annuler', 'Anile'), style: 'cancel' },
        {
          text: t('Se déconnecter', 'Dekonekte'),
          style: 'destructive',
          onPress: async () => {
            try { await logoutUser(); } catch { /* ignore */ }
            logout();
          },
        },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      t('Supprimer le compte', 'Efase kont lan'),
      t(
        'Cette action est définitive. Ton compte et toutes tes données (progression, XP, résultats) seront supprimés. Impossible de revenir en arrière.',
        'Aksyon sa a definitif. Kont ou ak tout done ou yo (pwogrè, XP, rezilta) ap efase. Ou pa ka defè sa.',
      ),
      [
        { text: t('Annuler', 'Anile'), style: 'cancel' },
        {
          text: t('Supprimer', 'Efase'),
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              t('Confirmer la suppression', 'Konfime efasman an'),
              t('Dernière étape : supprimer ton compte pour de bon ?', 'Dènye etap : efase kont ou nèt ?'),
              [
                { text: t('Annuler', 'Anile'), style: 'cancel' },
                {
                  text: t('Supprimer définitivement', 'Efase nèt'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      logout();
                    } catch (e: any) {
                      Alert.alert(
                        t('Erreur', 'Erè'),
                        e?.message || t('Suppression impossible. Réessaie.', 'Efasman echwe. Eseye ankò.'),
                      );
                    }
                  },
                },
              ],
            ),
        },
      ],
    );
  }

  // Shared settings controls (guest + signed in).
  const languageControl = (
    <Segmented
      options={[
        { key: 'ht', label: 'Kreyòl' },
        { key: 'fr', label: 'Français' },
      ]}
      value={isCreole ? 'ht' : 'fr'}
      onChange={handleLanguageChange}
      style={{ width: 196 }}
    />
  );
  const themeControl = (
    <Segmented
      options={[
        { key: 'light', label: t('Jour', 'Jou') },
        { key: 'dark', label: t('Nuit', 'Nwit') },
      ]}
      value={theme === 'dark' ? 'dark' : 'light'}
      onChange={(k) => setTheme(k as 'light' | 'dark')}
      style={{ width: 160 }}
    />
  );

  // ── Guest state ─────────────────────────────────────────────────────────────
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[{ paddingBottom: 120 }, centerColumn]}
          showsVerticalScrollIndicator={false}
        >
          <PageTitle title={t('Profil', 'Pwofil')} />

          {/* The web's signed-out card, word for word. */}
          <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
            <View style={[featureSurface, { padding: 24, alignItems: 'center' }]}>
              <View
                style={{
                  width: 64, height: 64, borderRadius: 18, backgroundColor: colors.azureFill,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 18,
                }}
              >
                <GraduationCap color="#ffffff" size={30} strokeWidth={2} />
              </View>
              <Text
                accessibilityRole="header"
                style={{ fontFamily: fonts.heading, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: colors.ink, textAlign: 'center' }}
              >
                {t('Ton profil EdLight', 'Pwofil EdLight ou')}
              </Text>
              <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 10 }]}>
                {t(
                  'Un compte garde ce que tu as déjà fait : ta progression, ton score de préparation, ta série et ta place au classement te suivent d’un appareil à l’autre.',
                  'Kont ou kenbe sa w deja fè : pwogrè ou, nòt preparasyon ou, seri ou ak plas ou nan klasman an swiv ou sou tout aparèy.',
                )}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch', marginTop: 22 }}>
                <Button
                  label={t('Créer un compte', 'Kreye yon kont')}
                  onPress={() => openAuth('signup')}
                  style={{ flex: 1, paddingHorizontal: 10 }}
                />
                <Button
                  label={t('Se connecter', 'Konekte')}
                  variant="outline"
                  onPress={() => openAuth('signin')}
                  style={{ flex: 1, paddingHorizontal: 10 }}
                />
              </View>
              <Text style={[typeScale.meta, { color: colors.muted, textAlign: 'center', marginTop: 18 }]}>
                {t('Sans compte, les cours et les vidéos restent accessibles. ', 'San kont, kou ak videyo yo rete aksesib. ')}
                <Text
                  accessibilityRole="link"
                  onPress={() => resetTabToRoot(navigation, 'Courses', 'CourseList')}
                  style={{ fontFamily: fonts.bold, color: colors.azureInk }}
                >
                  {t('Voir les cours', 'Wè kou yo')}
                </Text>
              </Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
            <SettingsCard title={t('Réglages', 'Paramèt')}>
              <SettingsRow icon={Moon} label={t('Thème', 'Tèm')} accessory={themeControl} />
              <SettingsRow icon={Languages} label={t('Langue', 'Lang')} accessory={languageControl} />
              <SettingsRow
                icon={Vibrate}
                label={t('Vibrations', 'Vibrasyon')}
                accessory={
                  <SettingsSwitch
                    value={hapticsEnabled}
                    onValueChange={handleHapticsToggle}
                    accessibilityLabel={t('Vibrations', 'Vibrasyon')}
                  />
                }
              />
              <SettingsRow
                icon={Info}
                label={t('À propos d’EdLight', 'Konsènan EdLight')}
                onPress={() => Linking.openURL(ABOUT_URL).catch(() => {})}
              />
            </SettingsCard>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Authenticated state ──────────────────────────────────────────────────────
  const displayName = user.name || user.displayName || firstName || t('Élève', 'Elèv');
  const photo: string | null = (user as any).picture || (user as any).photoURL || null;
  const gradeLabel = gradeShortLabel(grade, isCreole);
  const identityMeta = [gradeLabel, school].filter(Boolean).join(' · ');

  // Lessons by EVIDENCE (learningJourney): a finished video is "Terminée",
  // never "Maîtrisée" — only a chapter test confirms mastery.
  const evidence = countLessonEvidence(progress);
  const hasEvidence = evidence.completed + evidence.practised + evidence.mastered > 0;
  const currentStreak = streak?.currentStreak ?? 0;

  // Badges the student has actually EARNED. Locked ones are not shown: a row of
  // grey pills reads as a wall of failures and explains nothing.
  const earned = [
    { key: 's1', label: t('1er jour', '1ye jou'), target: 1, Icon: Sprout },
    { key: 's7', label: t('7 jours', '7 jou'), target: 7, Icon: Flame },
    { key: 's30', label: t('30 jours', '30 jou'), target: 30, Icon: Zap },
    { key: 's100', label: t('100 jours', '100 jou'), target: 100, Icon: Trophy },
    { key: 'q10', label: '10 quiz', target: 10, isQuiz: true, Icon: Target },
    { key: 'q50', label: '50 quiz', target: 50, isQuiz: true, Icon: Brain },
  ].filter((a) => (a.isQuiz ? totalQuizzes : (streak?.longestStreak ?? 0)) >= a.target);

  const goLeaderboard = () => navigation.navigate('Leaderboard');
  const goAvatar = () => navigation.navigate('AvatarEditor');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={[{ paddingBottom: 120 }, centerColumn]}
        showsVerticalScrollIndicator={false}
      >
        <PageTitle title={t('Profil', 'Pwofil')} />

        {/* Identity — a card, not a band. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <View style={[cardSurface, { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
            {/* The face is the way into the avatar editor. A chosen avatar wins over the photo. */}
            <PressableScale
              onPress={goAvatar}
              accessibilityRole="button"
              accessibilityLabel={t('Modifier mon avatar', 'Modifye avatar mwen')}
              pressedScale={0.95}
              style={{ width: 64, height: 64 }}
            >
              {photo && !myAvatar ? (
                <Image source={{ uri: photo }} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceAlt }} />
              ) : (
                <Face seed={user.uid || displayName} config={myAvatar} colors={school ? schoolColors(school) : undefined} size={64} still />
              )}
              <View
                style={{
                  position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13,
                  backgroundColor: colors.azureFill, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Pencil size={13} color="#ffffff" strokeWidth={2.6} />
              </View>
            </PressableScale>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 27, letterSpacing: -0.6, color: colors.ink }}
              >
                {displayName}
              </Text>
              <Text numberOfLines={2} style={[typeScale.meta, { color: colors.muted, marginTop: 2 }]}>
                {identityMeta || user.email}
              </Text>
              <Text
                accessibilityRole="link"
                onPress={goAvatar}
                suppressHighlighting
                style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.azureInk, marginTop: 4, alignSelf: 'flex-start' }}
              >
                {t('Modifier mon avatar', 'Modifye avatar mwen')}
              </Text>
            </View>
            <PressableScale
              onPress={() => setGradeChosen(false)}
              haptic={false}
              accessibilityRole="button"
              accessibilityLabel={t('Modifier ma classe', 'Chanje klas mwen')}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={{ minHeight: touch.min, justifyContent: 'center' }}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.azureInk }}>{t('Modifier', 'Modifye')}</Text>
            </PressableScale>
          </View>
        </View>

        {/* Ton classement — real ranks only. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
          <View style={[cardSurface, { padding: 20 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {school ? <SchoolCrest name={schoolRank?.label || school} size={40} /> : (
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Trophy color={colors.muted} size={20} strokeWidth={1.9} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Ton classement', 'Klasman ou')}</Text>
                <Text numberOfLines={2} style={{ fontFamily: fonts.headingBold, fontSize: 18, lineHeight: 23, color: colors.ink }}>
                  {schoolRank?.label || school || t('Classement national', 'Klasman nasyonal')}
                </Text>
              </View>
              {gradeLabel ? (
                <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.ink }}>{gradeLabel}</Text>
                </View>
              ) : null}
            </View>

            <View style={{ backgroundColor: colors.azureSoft, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16, marginTop: 16 }}>
              {school ? (
                schoolRank ? (
                  <>
                    <Text style={[typeScale.meta, { color: colors.muted }]}>
                      {t('Ton école cette semaine', 'Lekòl ou semèn sa a')}
                    </Text>
                    <Text
                      accessibilityLabel={t(`${ordinal(schoolRank.rank, false)} sur ${schoolRank.of} écoles`, `${ordinal(schoolRank.rank, true)} sou ${schoolRank.of} lekòl`)}
                      style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, color: colors.azureInk, marginTop: 2 }}
                    >
                      {t(`${ordinal(schoolRank.rank, false)} sur ${schoolRank.of} écoles`, `${ordinal(schoolRank.rank, true)} sou ${schoolRank.of} lekòl`)}
                    </Text>
                  </>
                ) : (
                  <Text style={[typeScale.body, { color: colors.ink }]}>
                    {t(
                      'Ton école n’a pas encore de points cette semaine. Joue pour la faire entrer au classement.',
                      'Lekòl ou poko gen pwen semèn sa a. Jwe pou fè l antre nan klasman an.',
                    )}
                  </Text>
                )
              ) : (
                <Text style={[typeScale.body, { color: colors.ink }]}>
                  {t(
                    'Choisis ton école pour la faire gagner contre les autres écoles du pays.',
                    'Chwazi lekòl ou pou fè l genyen kont lòt lekòl nan peyi a.',
                  )}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: myRank ? colors.azure : colors.faint }} />
              <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>
                {myRank
                  ? showingLastWeek
                    ? t(`${ordinal(myRank, false)} au classement national la semaine dernière`, `${ordinal(myRank, true)} nan klasman nasyonal semèn pase`)
                    : t(`${ordinal(myRank, false)} au classement national`, `${ordinal(myRank, true)} nan klasman nasyonal la`)
                  : t('Pas encore classé cette semaine', 'Poko klase semèn sa a')}
              </Text>
            </View>
            <PressableScale
              onPress={goLeaderboard}
              haptic={false}
              accessibilityRole="link"
              accessibilityLabel={school ? t('Voir le classement', 'Wè klasman an') : t('Choisir mon école', 'Chwazi lekòl mwen')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: touch.min, marginTop: 4 }}
            >
              <Text style={[typeScale.bodyMd, { color: colors.azureInk, fontFamily: fonts.bold }]}>
                {school ? t('Voir le classement', 'Wè klasman an') : t('Choisir mon école', 'Chwazi lekòl mwen')}
              </Text>
              <ChevronRight color={colors.azureInk} size={18} strokeWidth={2.4} />
            </PressableScale>
          </View>
        </View>

        {/* Leçons — evidence, the same words as the lesson and course screens. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
          <View
            style={[cardSurface, { padding: 20 }]}
            accessible={hasEvidence}
            accessibilityLabel={hasEvidence ? [
              t('Leçons', 'Leson'),
              `${evidenceLabel('completed', isCreole)} ${evidence.completed}`,
              `${evidenceLabel('practised', isCreole)} ${evidence.practised}`,
              `${evidenceLabel('mastered', isCreole)} ${evidence.mastered}`,
            ].join(', ') : undefined}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>{t('Leçons', 'Leson')}</Text>
              {currentStreak > 0 ? (
                <PressableScale
                  onPress={() => navigation.navigate('Trivia')}
                  haptic={false}
                  accessibilityRole="button"
                  accessibilityLabel={t(`Série : ${currentStreak} jours`, `Seri : ${currentStreak} jou`)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <StreakFlame count={currentStreak} color={colors.coral} size={16} />
                  <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.ink }}>
                    {t(`Série : ${currentStreak} ${currentStreak > 1 ? 'jours' : 'jour'}`, `Seri : ${currentStreak} jou`)}
                  </Text>
                </PressableScale>
              ) : null}
            </View>

            {hasEvidence ? (
              <>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  {(['completed', 'practised', 'mastered'] as const).map((e) => (
                    <View
                      key={e}
                      style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 6, alignItems: 'center' }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.4}
                        style={{ fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: e === 'mastered' ? colors.azureInk : colors.ink, fontVariant: ['tabular-nums'] }}
                      >
                        {evidence[e]}
                      </Text>
                      <Text numberOfLines={1} style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>{evidenceLabel(e, isCreole)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[typeScale.caption, { color: colors.muted, marginTop: 12 }]}>
                  {isCreole ? EVIDENCE.mastered.helpHt : EVIDENCE.mastered.helpFr}
                </Text>
              </>
            ) : (
              <View style={{ marginTop: 10, gap: 14 }}>
                <Text style={[typeScale.body, { color: colors.muted }]}>
                  {t('Ta première leçon remplira ce tableau.', 'Premye leson ou ap ranpli tablo sa a.')}
                </Text>
                <Button
                  size="sm"
                  label={t('Commencer', 'Kòmanse')}
                  onPress={() => resetTabToRoot(navigation, 'Courses', 'CourseList')}
                  style={{ alignSelf: 'flex-start' }}
                />
              </View>
            )}
          </View>
        </View>

        {/* Level / XP, with the practice record underneath. */}
        {profile && level ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
            <PressableScale
              onPress={() => resetTabToRoot(navigation, 'Exams', practiceRoot)}
              pressedScale={0.985}
              accessibilityRole="button"
              accessibilityLabel={[
                `${t('Niveau', 'Nivo')} ${level.level}`,
                `${level.xpIntoLevel} / ${level.xpForNext} XP`,
                totalQuizzes ? `${totalQuizzes} quiz` : null,
              ].filter(Boolean).join(', ')}
              accessibilityHint={t('Ouvre les quiz et examens', 'Louvri quiz ak egzamen yo')}
              style={[cardSurface, { padding: 20 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={[typeScale.cardTitle, { color: colors.ink }]}>{t('Niveau', 'Nivo')} {level.level}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[typeScale.meta, { color: colors.muted }]}>
                  {level.xpIntoLevel.toLocaleString('fr-FR')} / {level.xpForNext.toLocaleString('fr-FR')} XP
                </Text>
              </View>
              <XpBar pct={level.progressPct ?? 0} height={6} />
              {totalQuizzes > 0 ? (
                <Text style={[typeScale.meta, { color: colors.muted, marginTop: 12 }]}>
                  {t(
                    `${totalQuizzes} quiz terminés${avgPct !== null ? ` · ${avgPct} % de moyenne` : ''}`,
                    `${totalQuizzes} quiz fini${avgPct !== null ? ` · mwayèn ${avgPct} %` : ''}`,
                  )}
                </Text>
              ) : null}
            </PressableScale>
          </View>
        ) : null}

        {/* Readiness (Bac track) or grade progress for everyone else. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
          {gradeProfile(grade).examLevel === 'baccalaureat' ? (
            <ReadinessCard
              onFocusPress={(subject) =>
                navigation.navigate('Exams', {
                  screen: 'ExamBrowser',
                  params: { level: 'terminale', subject },
                  // initial:false keeps ExamLanding mounted beneath ExamBrowser.
                  initial: false,
                })
              }
            />
          ) : (
            <GradeProgress />
          )}
        </View>

        {/* Succès — earned only; hidden until the first one. */}
        {earned.length > 0 ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
            <View style={[cardSurface, { padding: 20 }]}>
              <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink, marginBottom: 14 }]}>
                {t('Succès', 'Siksè')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                {earned.map((a) => (
                  <View key={a.key} style={{ alignItems: 'center', width: 64, gap: 6 }} accessible accessibilityLabel={a.label}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <a.Icon color={colors.azureInk} size={24} strokeWidth={2} />
                    </View>
                    <Text numberOfLines={1} style={[typeScale.caption, { color: colors.ink, textAlign: 'center' }]}>{a.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {/* Réglages */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
          <SettingsCard title={t('Réglages', 'Paramèt')}>
            <SettingsRow
              icon={Vibrate}
              label={t('Vibrations', 'Vibrasyon')}
              accessory={
                <SettingsSwitch
                  value={hapticsEnabled}
                  onValueChange={handleHapticsToggle}
                  accessibilityLabel={t('Vibrations', 'Vibrasyon')}
                />
              }
            />
            {notificationsBlocked ? (
              // Refused at the OS level: a switch would only flip back. Offer the
              // one thing that works — the system settings — and never re-prompt.
              <SettingsRow
                icon={Bell}
                label={t('Notifications', 'Notifikasyon')}
                sublabel={t('Désactivées dans les réglages du téléphone', 'Dezaktive nan paramèt telefòn nan')}
                sublabelTone="status"
                value={t('Réglages', 'Paramèt')}
                onPress={openNotificationSettings}
              />
            ) : (
              <SettingsRow
                icon={Bell}
                label={t('Notifications', 'Notifikasyon')}
                sublabel={t("Rappels d'étude et défi du jour", 'Rapèl etid ak defi jodi a')}
                accessory={
                  <SettingsSwitch
                    value={notificationsEnabled}
                    onValueChange={handleNotificationToggle}
                    accessibilityLabel={t('Notifications', 'Notifikasyon')}
                  />
                }
              />
            )}
            {/* Server-side: api/_lib/competitionNotify.ts skips the push when this
                is false. The "Mon activité" inbox records the item either way. */}
            <SettingsRow
              icon={Trophy}
              label={t('Compétitions et équipes', 'Konpetisyon ak ekip')}
              sublabel={t(
                "Invitations, changements d'horaire, annulations et résultats. Tout reste dans Mon activité.",
                'Envitasyon, chanjman orè, anilasyon ak rezilta. Tout rete nan Aktivite mwen.',
              )}
              accessory={
                <SettingsSwitch
                  value={competitionUpdatesEnabled}
                  onValueChange={handleCompetitionUpdatesToggle}
                  accessibilityLabel={t('Compétitions et équipes', 'Konpetisyon ak ekip')}
                />
              }
            />
            <SettingsRow icon={Languages} label={t('Langue', 'Lang')} accessory={languageControl} />
            <SettingsRow icon={Palette} label={t('Thème', 'Tèm')} accessory={themeControl} />
            <SettingsRow
              icon={GraduationCap}
              label={t('Classe', 'Klas')}
              value={gradeLabel || t('Non définie', 'Pa defini')}
              onPress={() => setGradeChosen(false)}
            />
          </SettingsCard>
        </View>

        {/* Compte */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: GAP }}>
          <SettingsCard title={t('Compte', 'Kont')}>
            <SettingsRow
              icon={Eye}
              label={t('Apparaître dans le classement', 'Parèt nan klasman an')}
              accessory={
                <SettingsSwitch
                  value={boardVisible}
                  onValueChange={handleBoardVisibilityToggle}
                  accessibilityLabel={t('Apparaître dans le classement', 'Parèt nan klasman an')}
                />
              }
            />
            <SettingsRow
              icon={Mail}
              label={t('Emails de rappel', 'Imèl rapèl')}
              sublabel={t('Un rappel le matin par email', 'Yon rapèl maten pa imèl')}
              accessory={
                <SettingsSwitch
                  value={emailRemindersEnabled}
                  onValueChange={handleEmailRemindersToggle}
                  accessibilityLabel={t('Emails de rappel', 'Imèl rapèl')}
                />
              }
            />
            <SettingsRow
              icon={GraduationCap}
              label={t('Devenir enseignant bénévole', 'Vin yon pwofesè volontè')}
              onPress={() => navigation.navigate('Teach')}
            />
            <SettingsRow
              icon={Instagram}
              label={t('Suivre EdLight sur Instagram', 'Swiv EdLight sou Instagram')}
              value="@edlightacademy"
              onPress={openInstagram}
            />
            <SettingsRow
              icon={Trash2}
              tone="danger"
              chevron={false}
              label={t('Supprimer mon compte', 'Efase kont mwen')}
              onPress={handleDeleteAccount}
            />
          </SettingsCard>
        </View>

        {/* Links under the cards. */}
        <View style={{ alignItems: 'center', marginTop: 24, gap: 4 }}>
          <PressableScale
            onPress={() => setInviteOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('Inviter des amis', 'Envite zanmi')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16 }}
          >
            <UserPlus color={colors.azureInk} size={20} strokeWidth={2.2} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: colors.azureInk }}>{t('Inviter des amis', 'Envite zanmi')}</Text>
          </PressableScale>
          <PressableScale
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel={t('Déconnexion', 'Dekoneksyon')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16 }}
          >
            <LogOut color={dangerInk} size={20} strokeWidth={2.2} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 17, color: dangerInk }}>{t('Déconnexion', 'Dekoneksyon')}</Text>
          </PressableScale>
        </View>
      </ScrollView>

      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} lang={isCreole ? 'ht' : 'fr'} />
    </SafeAreaView>
  );
}
