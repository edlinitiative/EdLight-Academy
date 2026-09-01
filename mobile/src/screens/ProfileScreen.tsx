import React, { useState, useEffect } from 'react';
import { useScrollToTop, useNavigation } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Flame, Trophy, Zap, LogOut, Moon, Sun, Languages, Trash2,
  Award, Target, BookOpen, Bell, ChevronRight, GraduationCap,
  Sprout, Brain, Gift, Mail,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import Avatar from '../components/ui/Avatar';
import PressableScale from '../components/ui/PressableScale';
import StreakFlame from '../components/ui/StreakFlame';
import XpBar from '../components/ui/XpBar';
import { useQueryClient } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { logoutUser, deleteAccount } from '../services/authService';
import { saveNotificationPrefs, getNotificationPrefs } from '../services/firebase';
import { setLeaderboardOptIn } from '../services/triviaService';
import { setBoardVisibility } from '../services/leaderboardService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import ReadinessCard from '../components/ReadinessCard';
import GradeProgress from '../components/GradeProgress';
import InviteSheet from '../components/InviteSheet';
import FollowInstagram from '../components/FollowInstagram';
import { GRADES, gradeProfile } from '../config/trackConfig';
import { resetTabToRoot } from '../navigation/navHelpers';
import { useColors, useTheme, radius, typeScale } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import {
  areNotificationsEnabled,
  setNotificationsEnabled as persistNotificationsEnabled,
  requestPermissions,
  scheduleEngagementReminders,
} from '../services/notificationService';
import { registerForPushNotifications } from '../services/pushService';

const GUTTER = 20;

// ── sub-components ────────────────────────────────────────────────────────────

/** One stat tile in the 2×2 progress grid. Tappable — each stat is a shortcut
 *  into the section it summarises (quizzes, courses, streak…). PressableScale
 *  already fires the light haptic on press-in. */
function StatTile({
  icon,
  value,
  label,
  iconBg,
  onPress,
  accessibilityHint,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBg: string;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const { colors, cardSurface } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}`}
      accessibilityHint={accessibilityHint}
      style={{ flex: 1, ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.h2, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>{value}</Text>
        <Text style={[typeScale.micro, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>{label}</Text>
      </View>
    </PressableScale>
  );
}

/** A settings row inside the settings card: icon tile + label/sublabel + accessory. */
function SettingRow({
  icon,
  iconBg,
  label,
  sublabel,
  accessory,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  accessory?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const colors = useColors();
  const Body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{label}</Text>
        {sublabel ? <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]}>{sublabel}</Text> : null}
      </View>
      {accessory}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={label}>
        {Body}
      </TouchableOpacity>
    );
  }
  return Body;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Text style={[typeScale.title, { color: colors.ink, marginBottom: 12 }]}>{children}</Text>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors, cardSurface, shadow } = useTheme();
  const {
    user,
    isAuthenticated,
    language,
    setLanguage,
    theme,
    toggleTheme,
    logout,
    quizAttempts,
    enrolledCourses,
    track,
    grade,
    setGradeChosen,
    toggleAuthModal,
  } = useStore();

  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const navigation = useNavigation<any>();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column

  const { level, profile } = useTrivia();
  const { streak } = useStreak();
  const { myRank } = useLeaderboard(25);
  const queryClient = useQueryClient();

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
  // mount QuizNavigator behind it, which has no ExamLanding route. These stat
  // tiles aren't grade-gated, so they must name the root that actually exists.
  const practiceRoot = gradeProfile(grade).primaryTab === 'Quiz' ? 'Quizzes' : 'ExamLanding';
  const firstName = getFirstName(user);

  const avgScore: string = (() => {
    if (allAttempts.length === 0) return '—';
    const avg = allAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) / allAttempts.length;
    return `${Math.round(avg * 100)}%`;
  })();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    areNotificationsEnabled().then(setNotificationsEnabled).catch(() => {});
  }, []);

  // Server-side prefs are a separate store from the device toggle above: the
  // backend crons read only Firestore, so this is what governs emails.
  useEffect(() => {
    if (!user?.uid) return;
    getNotificationPrefs(user.uid)
      .then((p) => setEmailRemindersEnabled(p.emailNotifications !== false))
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

  async function handleNotificationToggle(value: boolean) {
    setNotificationsEnabled(value);
    await persistNotificationsEnabled(value);
    // Also record it server-side. Without this, switching notifications off
    // silenced only the LOCAL schedule while the backend kept sending nudges.
    if (user?.uid) {
      saveNotificationPrefs(user.uid, { studyReminders: value }).catch(() => {});
    }
    if (value) {
      const granted = await requestPermissions();
      if (!granted) {
        setNotificationsEnabled(false);
        await persistNotificationsEnabled(false);
        return;
      }
      await scheduleEngagementReminders();
      if (user?.uid) registerForPushNotifications(user.uid).catch(() => {});
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }

  function handleLanguageChange(next: string) {
    setLanguage(next);
    areNotificationsEnabled()
      .then((enabled) => { if (enabled) return scheduleEngagementReminders(); })
      .catch(() => {});
  }

  const progressPct = level?.progressPct ?? 0;

  async function handleLogout() {
    Alert.alert(
      t('Déconnexion', 'Dekoneksyon'),
      t('Voulez-vous vraiment vous déconnecter ?', 'Ou vle dekonekte?'),
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
              t('Dernière étape — supprimer ton compte pour de bon ?', 'Dènye etap — efase kont ou nèt?'),
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

  // ── Guest state ─────────────────────────────────────────────────────────────
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-8" style={{ gap: 20 }}>
          <Image source={require('../../assets/logo.png')} style={{ width: 96, height: 96 }} resizeMode="contain" />
          <Text style={[typeScale.h1, { color: colors.ink, textAlign: 'center' }]}>
            {t('Votre profil EdLight', 'Pwofil EdLight ou')}
          </Text>
          <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
            {t(
              'Connectez-vous pour suivre votre progression, vos XP et votre série.',
              'Konekte pou swiv pwogrè ou, XP ou ak seri ou.',
            )}
          </Text>
          <PressableScale
            onPress={toggleAuthModal}
            style={{ backgroundColor: colors.azure, borderRadius: radius.chip, paddingVertical: 15, paddingHorizontal: 40, marginTop: 4, ...shadow.sm }}
          >
            <Text style={[typeScale.title, { color: '#fff' }]}>{t('Créer un compte', 'Kreye yon kont')}</Text>
          </PressableScale>
          <TouchableOpacity onPress={toggleAuthModal} activeOpacity={0.85}>
            <Text style={[typeScale.titleSm, { color: colors.azure }]}>{t('Se connecter', 'Konekte')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleLanguageChange(isCreole ? 'fr' : 'ht')}
            className="flex-row items-center"
            style={{ gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.azureSoft }}
            activeOpacity={0.85}
          >
            <Languages color={colors.azure} size={16} />
            <Text style={[typeScale.bodyMd, { color: colors.azure }]}>
              {isCreole ? 'Français' : 'Kreyòl Ayisyen'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Authenticated state ──────────────────────────────────────────────────────
  const displayName = user.name || user.displayName || firstName || t('Étudiant', 'Elèv');

  // New user — every progress stat is empty. Show one encouraging tile instead
  // of a 2×2 wall of 0 / — / 0 / 0.
  const statsAllZero =
    totalQuizzes === 0 && enrolledCourses.length === 0 && (streak?.currentStreak ?? 0) === 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView ref={scrollRef} style={{ backgroundColor: colors.bg }} className="flex-1" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]} showsVerticalScrollIndicator={false}>

        {/* Estil Klè header — identity on the page's own white ground, like the
            Dashboard. The streak chip and Série tag go quiet; level/XP is a
            hairline card instead of a frosted panel on a gradient. */}
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 20 }}>
          <View className="flex-row items-center" style={{ gap: 14 }}>
            <Avatar
              name={user?.name || user?.displayName || ''}
              seed={user?.uid || ''}
              size={56}
              radius={28}
            />
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.h1, { color: colors.ink }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[typeScale.label, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
                {user.email}
              </Text>
              {track ? (
                <View style={{
                  alignSelf: 'flex-start', marginTop: 8,
                  backgroundColor: colors.azureSoft, borderRadius: radius.pill,
                  paddingHorizontal: 10, paddingVertical: 4,
                }}>
                  <Text style={[typeScale.caption, { color: colors.azure }]}>{t('Série', 'Seri')} {track}</Text>
                </View>
              ) : null}
            </View>
            {streak?.currentStreak ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
                paddingHorizontal: 10, paddingVertical: 6,
              }}>
                <StreakFlame count={streak.currentStreak} color={colors.coral} size={14} />
                <Text style={[typeScale.label, { color: colors.ink }]}>{streak.currentStreak}</Text>
              </View>
            ) : null}
          </View>

          {/* Level / XP — one quiet hairline card */}
          {profile && level ? (
            <View
              style={{
                marginTop: 16,
                borderWidth: 1, borderColor: colors.border,
                borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12,
              }}
            >
              <View className="flex-row items-center justify-between" style={{ marginBottom: 9 }}>
                <Text style={[typeScale.titleSm, { color: colors.ink }]}>
                  {t('Niveau', 'Nivo')} {level.level}
                </Text>
                <Text style={[typeScale.bodyMd, { color: colors.muted }]} maxFontSizeMultiplier={1.3}>{profile.xp ?? 0} XP</Text>
              </View>
              <XpBar pct={progressPct} height={5} />
            </View>
          ) : null}
        </View>

        {/* Invite friends — two-sided referral CTA */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 16 }}>
          <PressableScale
            onPress={() => setInviteOpen(true)}
            style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('Inviter des amis', 'Envite zanmi')}
          >
            <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.coralSoft }}>
              <Gift color={colors.coral} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t('Inviter des amis', 'Envite zanmi')}</Text>
              <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>
                {t('Gagnez un bonus quand ils s’inscrivent', 'Genyen yon bonus lè yo enskri')}
              </Text>
            </View>
            <ChevronRight color={colors.faint} size={18} />
          </PressableScale>
        </View>

        {/* Progress stats — 2×2 grid */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <SectionTitle>{t('Votre progression', 'Pwogrè ou')}</SectionTitle>
          {statsAllZero ? (
            <View style={{ ...cardSurface, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 46, height: 46, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
                <Sprout color={colors.azure} size={22} />
              </View>
              <Text style={[typeScale.bodyMd, { flex: 1, color: colors.muted }]}>
                {t('Fais ton premier quiz pour débloquer tes stats.', 'Fè premye quiz ou pou debloke estatistik ou yo.')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatTile
                  icon={<Target color={colors.azure} size={20} />}
                  value={totalQuizzes}
                  label={t('Quiz complétés', 'Quiz fini')}
                  iconBg={colors.azureSoft}
                  // Reset the tab's stack: a bare navigate re-shows whatever the
                  // Exams stack retained (a stale exam), and under React
                  // Navigation 7 naming the root just pushes a second copy on top
                  // of it instead of popping back. See navHelpers.
                  onPress={() => resetTabToRoot(navigation, 'Exams', practiceRoot)}
                  accessibilityHint={t('Ouvre les quiz et examens', 'Louvri quiz ak egzamen yo')}
                />
                <StatTile
                  icon={<Award color={colors.azure} size={20} />}
                  value={avgScore}
                  label={t('Score moyen', 'Mwayèn')}
                  iconBg={colors.azureSoft}
                  onPress={() => resetTabToRoot(navigation, 'Exams', practiceRoot)}
                  accessibilityHint={t('Ouvre les quiz et examens', 'Louvri quiz ak egzamen yo')}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatTile
                  icon={<BookOpen color={colors.azure} size={20} />}
                  value={enrolledCourses.length}
                  label={t('Cours suivis', 'Kou swivi')}
                  iconBg={colors.azureSoft}
                  onPress={() => resetTabToRoot(navigation, 'Courses', 'CourseList')}
                  accessibilityHint={t('Ouvre la liste des cours', 'Louvri lis kou yo')}
                />
                <StatTile
                  icon={<Flame color={colors.danger} size={20} />}
                  value={streak?.currentStreak ?? 0}
                  label={t('Jours de série', 'Jou seri')}
                  iconBg={colors.dangerSoft}
                  onPress={() => navigation.navigate('Trivia')}
                  accessibilityHint={t('Ouvre les jeux quotidiens', 'Louvri jwèt chak jou yo')}
                />
              </View>
            </View>
          )}
        </View>

        {/* Readiness — the Bac preparation score only makes sense for Bac-track
            students (coefficient-weighted Bac subjects). For prefac / lower
            grades it's just noise, so we show a grade-appropriate progress card
            in its place (no empty gap). */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          {gradeProfile(grade).examLevel === 'baccalaureat' ? (
            <ReadinessCard
              onFocusPress={(subject) =>
                navigation.navigate('Exams', {
                  screen: 'ExamBrowser',
                  params: { level: 'terminale', subject },
                  // initial:false keeps ExamLanding mounted beneath ExamBrowser,
                  // so its back arrow pops to the level picker instead of
                  // leaving the tab (ExamBrowser would otherwise be the only route).
                  initial: false,
                })
              }
            />
          ) : (
            <GradeProgress />
          )}
        </View>

        {/* Achievements */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <View style={{ ...cardSurface, padding: 14 }}>
            <SectionTitle>{t('Succès', 'Siksè')}</SectionTitle>
            {/* One compact row of badges — was a tall 2-row grid. */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {[
                { label: t('1j', '1j'), target: 1, Icon: Sprout },
                { label: t('7j', '7j'), target: 7, Icon: Flame },
                { label: t('30j', '30j'), target: 30, Icon: Zap },
                { label: t('100j', '100j'), target: 100, Icon: Trophy },
                { label: t('10 quiz', '10 quiz'), target: 10, isQuiz: true, Icon: Target },
                { label: t('50 quiz', '50 quiz'), target: 50, isQuiz: true, Icon: Brain },
              ].map((a) => {
                const current = a.isQuiz ? totalQuizzes : (streak?.longestStreak ?? 0);
                const unlocked = current >= a.target;
                return (
                  <View key={a.label} className="items-center" style={{ gap: 5 }}>
                    <View
                      style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: unlocked ? colors.azureSoft : colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}
                    >
                      <a.Icon color={unlocked ? colors.azure : colors.faint} size={20} />
                    </View>
                    <Text style={[typeScale.micro, { textAlign: 'center', color: unlocked ? colors.ink : colors.faint }]}>{a.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Classement — entry point to the dedicated full-page leaderboard
            (no longer embedded here). Shows my current national rank inline. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <PressableScale
            onPress={() => navigation.navigate('Leaderboard')}
            style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('Voir le classement', 'Wè klasman an')}
          >
            <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
              <Trophy color={colors.azure} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t('Classement', 'Klasman')}</Text>
              <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>
                {t('Voyez où vous vous situez', 'Wè kote ou ye')}
              </Text>
            </View>
            {myRank ? (
              <View style={{ backgroundColor: colors.azureSoft, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={[typeScale.label, { color: colors.azure }]} maxFontSizeMultiplier={1.3}>#{myRank}</Text>
              </View>
            ) : null}
            <ChevronRight color={colors.faint} size={18} />
          </PressableScale>
        </View>

        {/* Devenir enseignant — recruiting funnel for volunteer instructors.
            Lives on Profil (teachers exploring the app land here), opens the
            Teach application modal. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 12 }}>
          <PressableScale
            onPress={() => navigation.navigate('Teach')}
            style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('Devenir enseignant bénévole', 'Vin yon pwofesè volontè')}
          >
            <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.azureSoft }}>
              <GraduationCap color={colors.azure} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t('Devenir enseignant', 'Vin yon pwofesè')}</Text>
              <Text style={[typeScale.caption, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>
                {t('Enseignez votre matière à tout le pays', 'Anseye matyè ou bay tout peyi a')}
              </Text>
            </View>
            <ChevronRight color={colors.faint} size={18} />
          </PressableScale>
        </View>

        {/* Follow on Instagram — a quiet, secondary social touchpoint. One row,
            near the settings area; deep-links into the app with a web fallback. */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <FollowInstagram />
        </View>

        {/* Settings — one grouped card */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <SectionTitle>{t('Paramètres', 'Paramèt')}</SectionTitle>
          <View style={{ ...cardSurface }}>
            <SettingRow
              icon={<GraduationCap color={colors.azure} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Classe', 'Klas')}
              sublabel={
                (() => {
                  const g = GRADES.find((x) => x.code === grade);
                  return g ? (isCreole ? g.labelHt : g.label) : t('Non définie', 'Pa defini');
                })()
              }
              accessory={<ChevronRight color={colors.faint} size={18} />}
              onPress={() => setGradeChosen(false)}
            />
            <SettingRow
              icon={<Languages color={colors.azure} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Langue', 'Lang')}
              sublabel={language === 'fr' ? 'Français' : 'Kreyòl Ayisyen'}
              accessory={<ChevronRight color={colors.faint} size={18} />}
              onPress={() => handleLanguageChange(language === 'fr' ? 'ht' : 'fr')}
            />
            <SettingRow
              icon={theme === 'dark' ? <Sun color={colors.warn} size={18} /> : <Moon color={colors.muted} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Thème', 'Tèm')}
              sublabel={theme === 'dark' ? t('Mode nuit', 'Mòd nwit') : t('Mode jour', 'Mòd jou')}
              accessory={<ChevronRight color={colors.faint} size={18} />}
              onPress={toggleTheme}
            />
            <SettingRow
              icon={<Bell color={colors.azure} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Notifications', 'Notifikasyon')}
              sublabel={t("Rappels d'étude quotidiens", 'Rapèl etid chak jou')}
              accessory={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleNotificationToggle}
                  trackColor={{ false: colors.border, true: colors.azureBorder }}
                  thumbColor={notificationsEnabled ? colors.azure : colors.faint}
                  ios_backgroundColor={colors.border}
                />
              }
            />
            <SettingRow
              icon={<Mail color={colors.azure} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Emails de rappel', 'Imèl rapèl')}
              sublabel={t('Un rappel le matin par email', 'Yon rapèl maten pa imèl')}
              accessory={
                <Switch
                  value={emailRemindersEnabled}
                  onValueChange={handleEmailRemindersToggle}
                  trackColor={{ false: colors.border, true: colors.azureBorder }}
                  thumbColor={emailRemindersEnabled ? colors.azure : colors.faint}
                  ios_backgroundColor={colors.border}
                />
              }
            />
            <SettingRow
              icon={<Trophy color={colors.azure} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Classement public', 'Klasman piblik')}
              sublabel={t('Apparaître dans le classement', 'Parèt nan klasman an')}
              last
              accessory={
                <Switch
                  value={boardVisible}
                  onValueChange={handleBoardVisibilityToggle}
                  trackColor={{ false: colors.border, true: colors.azureBorder }}
                  thumbColor={boardVisible ? colors.azure : colors.faint}
                  ios_backgroundColor={colors.border}
                />
              }
            />
          </View>
        </View>

        {/* Logout */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 24 }}>
          <TouchableOpacity
            onPress={handleLogout}
            activeOpacity={0.75}
            className="flex-row items-center justify-center"
            style={{ gap: 8, paddingVertical: 14, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.dangerSoft, backgroundColor: colors.surface }}
          >
            <LogOut color={colors.danger} size={16} />
            <Text style={[typeScale.bodyMd, { color: colors.danger }]}>{t('Se déconnecter', 'Dekonekte')}</Text>
          </TouchableOpacity>
        </View>

        {/* Delete account (irreversible; required for App Store) */}
        <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.7} className="items-center" style={{ paddingVertical: 16, marginTop: 4 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Trash2 color={colors.faint} size={13} />
            <Text style={[typeScale.caption, { color: colors.faint }]}>{t('Supprimer mon compte', 'Efase kont mwen')}</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>

      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} lang={isCreole ? 'ht' : 'fr'} />
    </SafeAreaView>
  );
}
