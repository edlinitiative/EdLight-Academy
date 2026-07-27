import React, { useState, useEffect } from 'react';
import { useScrollToTop, useNavigation, useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  Flame, Trophy, Zap, LogOut, Moon, Sun, Languages, Trash2,
  Award, Target, BookOpen, Bell, ChevronRight, GraduationCap,
  Sprout, Brain, Gift,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import Avatar from '../components/ui/Avatar';
import PressableScale from '../components/ui/PressableScale';
import StreakFlame from '../components/ui/StreakFlame';
import XpBar from '../components/ui/XpBar';
import useStore from '../contexts/store';
import { logoutUser, deleteAccount } from '../services/authService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import ReadinessCard from '../components/ReadinessCard';
import GradeProgress from '../components/GradeProgress';
import InviteSheet from '../components/InviteSheet';
import FollowInstagram from '../components/FollowInstagram';
import { GRADES, gradeProfile } from '../config/trackConfig';
import { useColors, useTheme, radius, typeScale, gradients } from '../theme/theme';
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

/** One stat tile in the 2×2 progress grid. */
function StatTile({
  icon,
  value,
  label,
  iconBg,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBg: string;
}) {
  const { colors, cardSurface } = useTheme();
  return (
    <View style={{ flex: 1, ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.h2, { color: colors.ink }]} maxFontSizeMultiplier={1.3}>{value}</Text>
        <Text style={[typeScale.micro, { color: colors.muted, marginTop: 1 }]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
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
  const insets = useSafeAreaInsets();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column

  const { level, profile } = useTrivia();
  const { streak } = useStreak();
  const { myRank } = useLeaderboard(25);

  // The gradient hero runs under the status bar, so its glyphs must be light
  // while this screen is focused; restore the theme default on blur.
  useFocusEffect(
    React.useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(theme === 'dark' ? 'light' : 'dark');
    }, [theme]),
  );

  const allAttempts = Object.values(quizAttempts).flat() as { score: number; total: number; date: number }[];
  const totalQuizzes = allAttempts.length;
  const firstName = getFirstName(user);

  const avgScore: string = (() => {
    if (allAttempts.length === 0) return '—';
    const avg = allAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) / allAttempts.length;
    return `${Math.round(avg * 100)}%`;
  })();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    areNotificationsEnabled().then(setNotificationsEnabled).catch(() => {});
  }, []);

  async function handleNotificationToggle(value: boolean) {
    setNotificationsEnabled(value);
    await persistNotificationsEnabled(value);
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
  const displayName = user.name || user.displayName || firstName || 'Étudiant';

  // New user — every progress stat is empty. Show one encouraging tile instead
  // of a 2×2 wall of 0 / — / 0 / 0.
  const statsAllZero =
    totalQuizzes === 0 && enrolledCourses.length === 0 && (streak?.currentStreak ?? 0) === 0;

  // One frosted "pill" recipe shared by the streak pill and the "Série {track}"
  // chip so they sit at the same height (was paddingVertical 6 vs 3).
  const frostedPill = {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  } as const;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: gradients.hero[0] }} edges={[]}>
      <ScrollView ref={scrollRef} style={{ backgroundColor: colors.bg }} className="flex-1" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]} showsVerticalScrollIndicator={false}>

        {/* Overscroll filler — when the list is pulled down past the top, iOS
            reveals the ScrollView's own background. Paint that region in the hero
            colour so the pull-down shows blue, not a grey gap above the hero. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -400, left: 0, right: 0, height: 400, backgroundColor: gradients.hero[0] }} />

        {/* Compact gradient hero — identity + level/XP as one continuous band,
            matching the Dashboard. Runs under the status bar and rounds off at
            the bottom. Streak sits as a frosted momentum pill. */}
        <LinearGradient
          colors={[...gradients.hero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            paddingTop: insets.top + 14,
            paddingHorizontal: GUTTER,
            paddingBottom: 20,
            borderBottomLeftRadius: 26,
            borderBottomRightRadius: 26,
          }}
        >
          <View className="flex-row items-center" style={{ gap: 14 }}>
            <Avatar
              name={user?.name || user?.displayName || ''}
              seed={user?.uid || ''}
              size={60}
              radius={18}
            />
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.h1, { color: '#ffffff' }]} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={[typeScale.label, { color: '#bfdbfe', marginTop: 2 }]} numberOfLines={1}>
                {user.email}
              </Text>
              {track ? (
                <View style={{ ...frostedPill, alignSelf: 'flex-start', marginTop: 8 }}>
                  <Text style={[typeScale.caption, { color: '#ffffff' }]}>{t('Série', 'Seri')} {track}</Text>
                </View>
              ) : null}
            </View>
            {streak?.currentStreak ? (
              <View style={{ ...frostedPill, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <StreakFlame count={streak.currentStreak} color="#fecaca" size={14} />
                <Text style={[typeScale.label, { color: '#ffffff' }]}>{streak.currentStreak}</Text>
              </View>
            ) : null}
          </View>

          {/* Level / XP — frosted panel inside the hero */}
          {profile && level ? (
            <View
              style={{
                marginTop: 16,
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
                borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 12,
              }}
            >
              <View className="flex-row items-center justify-between" style={{ marginBottom: 9 }}>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Zap color="#fde68a" size={16} />
                  <Text style={[typeScale.titleSm, { color: '#ffffff' }]}>
                    {t('Niveau', 'Nivo')} {level.level}
                  </Text>
                </View>
                <Text style={[typeScale.bodyMd, { color: '#ffffff' }]} maxFontSizeMultiplier={1.3}>{profile.xp ?? 0} XP</Text>
              </View>
              <XpBar pct={progressPct} height={6} />
            </View>
          ) : null}
        </LinearGradient>

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
                <StatTile icon={<Target color={colors.azure} size={20} />} value={totalQuizzes} label={t('Quiz complétés', 'Quiz fini')} iconBg={colors.azureSoft} />
                <StatTile icon={<Award color={colors.azure} size={20} />} value={avgScore} label={t('Score moyen', 'Mwayèn')} iconBg={colors.azureSoft} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatTile icon={<BookOpen color={colors.azure} size={20} />} value={enrolledCourses.length} label={t('Cours suivis', 'Kou swivi')} iconBg={colors.azureSoft} />
                <StatTile icon={<Flame color={colors.danger} size={20} />} value={streak?.currentStreak ?? 0} label={t('Jours de série', 'Jou seri')} iconBg={colors.dangerSoft} />
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
              last
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
