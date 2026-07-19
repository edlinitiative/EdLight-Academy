import React, { useState, useEffect } from 'react';
import { useScrollToTop } from '@react-navigation/native';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Flame, Trophy, Zap, LogOut, Moon, Sun, Languages, Trash2,
  Award, CheckCircle2, Target, BookOpen, Bell, ChevronRight,
  Sprout, Brain,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import Avatar from '../components/ui/Avatar';
import PressableScale from '../components/ui/PressableScale';
import useStore from '../contexts/store';
import { logoutUser, deleteAccount } from '../services/authService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { getFirstName } from '../utils/shared';
import ReadinessCard from '../components/ReadinessCard';
import Leaderboard from '../components/Leaderboard';
import { colors, radius, shadow, cardSurface } from '../theme/theme';
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
  return (
    <View style={{ flex: 1, ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 42, height: 42, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 }}>{value}</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }} numberOfLines={1}>{label}</Text>
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
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }}>{label}</Text>
        {sublabel ? <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{sublabel}</Text> : null}
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
  return (
    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 12 }}>{children}</Text>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
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
    toggleAuthModal,
  } = useStore();

  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();

  const allAttempts = Object.values(quizAttempts).flat() as { score: number; total: number; date: number }[];
  const totalQuizzes = allAttempts.length;
  const firstName = getFirstName(user);

  const avgScore: string = (() => {
    if (allAttempts.length === 0) return '—';
    const avg = allAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) / allAttempts.length;
    return `${Math.round(avg * 100)}%`;
  })();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

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
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>
            {t('Votre profil EdLight', 'Pwofil EdLight ou')}
          </Text>
          <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
            {t(
              'Connectez-vous pour suivre votre progression, vos XP et votre série.',
              'Konekte pou swiv pwogrè ou, XP ou ak seri ou.',
            )}
          </Text>
          <PressableScale
            onPress={toggleAuthModal}
            style={{ backgroundColor: colors.azure, borderRadius: radius.chip, paddingVertical: 15, paddingHorizontal: 40, marginTop: 4, ...shadow.sm }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{t('Créer un compte', 'Kreye yon kont')}</Text>
          </PressableScale>
          <TouchableOpacity onPress={toggleAuthModal} activeOpacity={0.85}>
            <Text style={{ fontWeight: '700', fontSize: 15, color: colors.azure }}>{t('Se connecter', 'Konekte')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleLanguageChange(isCreole ? 'fr' : 'ht')}
            className="flex-row items-center"
            style={{ gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.azureSoft }}
            activeOpacity={0.85}
          >
            <Languages color={colors.azure} size={16} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.azure }}>
              {isCreole ? 'Français' : 'Kreyòl Ayisyen'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Authenticated state ──────────────────────────────────────────────────────
  const displayName = user.name || user.displayName || firstName || 'Étudiant';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView ref={scrollRef} className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* Header — identity */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.hairline,
            paddingHorizontal: GUTTER,
            paddingTop: 20,
            paddingBottom: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Avatar name={user?.name || user?.displayName || ''} seed={user?.uid || ''} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
              {user.email}
            </Text>
            {track ? (
              <View style={{ alignSelf: 'flex-start', marginTop: 8, backgroundColor: colors.azureSoft, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: colors.azure, fontSize: 12, fontWeight: '700' }}>{t('Série', 'Seri')} {track}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Level / XP hero — the single home for level + XP (no more duplicate chips + card) */}
        {profile && level ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: 16 }}>
            <PressableScale
              haptic={false}
              pressedScale={1}
              style={{ borderRadius: radius.card, overflow: 'hidden', ...shadow.md }}
            >
              <LinearGradient
                colors={['#2E86F0', '#1B6FE0', '#0857A6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 18 }}
              >
                <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <View style={{ width: 34, height: 34, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                      <Zap color="#fff" size={18} />
                    </View>
                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                      {t('Niveau', 'Nivo')} {level.level}
                    </Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{profile.xp ?? 0} XP</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                  <View style={{ width: `${Math.min(100, Math.max(0, progressPct))}%`, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 8 }}>
                  {t('Progression vers le niveau', 'Pwogrè vè nivo')} {level.level + 1}
                </Text>
              </LinearGradient>
            </PressableScale>
          </View>
        ) : null}

        {/* Progress stats — 2×2 grid */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <SectionTitle>{t('Votre progression', 'Pwogrè ou')}</SectionTitle>
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
        </View>

        {/* Readiness */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <ReadinessCard />
        </View>

        {/* Achievements */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <View style={{ ...cardSurface, padding: 16 }}>
            <SectionTitle>{t('Succès', 'Siksè')}</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
              {[
                { label: t('1er jour', '1ye jou'), target: 1, Icon: Sprout },
                { label: t('7 jours', '7 jou'), target: 7, Icon: Flame },
                { label: t('30 jours', '30 jou'), target: 30, Icon: Zap },
                { label: t('100 jours', '100 jou'), target: 100, Icon: Trophy },
                { label: t('10 quiz', '10 quiz'), target: 10, isQuiz: true, Icon: Target },
                { label: t('50 quiz', '50 quiz'), target: 50, isQuiz: true, Icon: Brain },
              ].map((a) => {
                const current = a.isQuiz ? totalQuizzes : (streak?.longestStreak ?? 0);
                const unlocked = current >= a.target;
                return (
                  <View key={a.label} className="items-center" style={{ width: '33.33%', gap: 6 }}>
                    <View
                      style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: unlocked ? colors.azureSoft : '#f3f4f6', borderWidth: 1, borderColor: colors.border }}
                    >
                      <a.Icon color={unlocked ? colors.azure : '#9ca3af'} size={24} />
                    </View>
                    <Text style={{ fontSize: 11, textAlign: 'center', fontWeight: '600', color: unlocked ? colors.ink : '#9ca3af' }}>{a.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Leaderboard */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <Leaderboard compact={false} maxRows={10} />
        </View>

        {/* Settings — one grouped card */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
          <SectionTitle>{t('Paramètres', 'Paramèt')}</SectionTitle>
          <View style={{ ...cardSurface }}>
            <SettingRow
              icon={<Languages color={colors.azure} size={18} />}
              iconBg={colors.azureSoft}
              label={t('Langue', 'Lang')}
              sublabel={language === 'fr' ? 'Français' : 'Kreyòl Ayisyen'}
              accessory={<ChevronRight color="#cbd5e1" size={18} />}
              onPress={() => handleLanguageChange(language === 'fr' ? 'ht' : 'fr')}
            />
            <SettingRow
              icon={theme === 'light' ? <Moon color="#6b7280" size={18} /> : <Sun color={colors.warn} size={18} />}
              iconBg="#f3f4f6"
              label={t('Thème', 'Tèm')}
              sublabel={theme === 'light' ? t('Mode jour', 'Mòd jou') : t('Mode nuit', 'Mòd nwit')}
              accessory={<ChevronRight color="#cbd5e1" size={18} />}
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
                  trackColor={{ false: '#e2e8f0', true: '#bfdbfe' }}
                  thumbColor={notificationsEnabled ? colors.azure : '#94a3b8'}
                  ios_backgroundColor="#e2e8f0"
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
            style={{ gap: 8, paddingVertical: 14, borderRadius: radius.chip, borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: colors.surface }}
          >
            <LogOut color="#dc2626" size={16} />
            <Text style={{ color: '#dc2626', fontWeight: '800', fontSize: 14 }}>{t('Se déconnecter', 'Dekonekte')}</Text>
          </TouchableOpacity>
        </View>

        {/* Delete account (irreversible; required for App Store) */}
        <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.7} className="items-center" style={{ paddingVertical: 16, marginTop: 4 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Trash2 color={colors.faint} size={13} />
            <Text style={{ color: colors.faint, fontSize: 12 }}>{t('Supprimer mon compte', 'Efase kont mwen')}</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
