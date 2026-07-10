import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Flame, Trophy, Zap, LogOut, Moon, Sun, Languages,
  Award, CheckCircle2, Target, BookOpen, Bell,
  Sprout, Brain,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import useStore from '../contexts/store';
import { logoutUser } from '../services/authService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { getFirstName } from '../utils/shared';
import ProgressBar from '../components/ProgressBar';
import ReadinessCard from '../components/ReadinessCard';
import Leaderboard from '../components/Leaderboard';
import {
  areNotificationsEnabled,
  setNotificationsEnabled as persistNotificationsEnabled,
  requestPermissions,
  scheduleDailyStudyReminder,
} from '../services/notificationService';
import { registerForPushNotifications } from '../services/pushService';

// ── helpers ──────────────────────────────────────────────────────────────────

function initialsOf(user: any): string {
  const name = user?.name || user?.displayName || '';
  return String(name).trim().split(/\s+/).filter(Boolean).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase() || 'EL';
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  icon,
  last = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View className={`flex-row items-center justify-between py-3 ${!last ? 'border-b border-gray-100' : ''}`}>
      <View className="flex-row items-center gap-3">
        {icon}
        <Text className="text-gray-700 text-sm">{label}</Text>
      </View>
      <Text className="font-bold text-gray-900">{value}</Text>
    </View>
  );
}

function SettingsTile({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="flex-1 bg-white border border-gray-200 rounded-xl items-center justify-center py-5 gap-2"
    >
      {icon}
      <Text className="text-xs font-semibold text-gray-700 text-center">{label}</Text>
    </TouchableOpacity>
  );
}

function KpiCard({
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
    <View style={{ flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        {icon}
      </View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#64748b', textAlign: 'center' }}>{label}</Text>
    </View>
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

  const { level, profile } = useTrivia();
  const { streak } = useStreak();

  const allAttempts = Object.values(quizAttempts).flat() as { score: number; total: number; date: number }[];
  const totalQuizzes = allAttempts.length;
  const firstName = getFirstName(user);

  // Average score calculation
  const avgScore: string = (() => {
    if (allAttempts.length === 0) return '—';
    const avg = allAttempts.reduce((sum, a) => sum + (a.total > 0 ? a.score / a.total : 0), 0) / allAttempts.length;
    return `${Math.round(avg * 100)}%`;
  })();

  // Notifications toggle state — reflects reality: enabled by default when the
  // OS permission is granted, unless the user explicitly opted out.
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
        // OS permission denied — the toggle can't actually enable anything.
        setNotificationsEnabled(false);
        await persistNotificationsEnabled(false);
        return;
      }
      await scheduleDailyStudyReminder();
      if (user?.uid) registerForPushNotifications(user.uid).catch(() => {});
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }

  function handleLanguageChange(next: string) {
    setLanguage(next);
    // The daily reminder text is baked in at schedule time — re-schedule it so
    // it matches the new language (no-op when notifications are off).
    areNotificationsEnabled()
      .then((enabled) => { if (enabled) return scheduleDailyStudyReminder(); })
      .catch(() => {});
  }

  // Progress value: level.progress is a 0–1 fraction; ProgressBar expects 0–100
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

  // ── Guest state ─────────────────────────────────────────────────────────────
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-8 gap-5">
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 96, height: 96 }}
            resizeMode="contain"
          />
          <Text className="text-xl font-bold text-gray-900 text-center">
            {t('Votre profil EdLight', 'Pwofil EdLight ou')}
          </Text>
          <Text className="text-gray-500 text-center text-sm leading-5">
            {t(
              'Connectez-vous pour suivre votre progression, vos XP et votre série.',
              'Konekte pou swiv pwogrè ou, XP ou ak seri ou.',
            )}
          </Text>
          <TouchableOpacity
            onPress={toggleAuthModal}
            className="rounded-2xl py-4 px-10 mt-1"
            style={{ backgroundColor: '#0857A6' }}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-base">{t('Créer un compte', 'Kreye yon kont')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleAuthModal} activeOpacity={0.85}>
            <Text className="font-semibold text-base" style={{ color: '#0857A6' }}>
              {t('Se connecter', 'Konekte')}
            </Text>
          </TouchableOpacity>

          {/* Language toggle — guests can switch too (PWA parity) */}
          <TouchableOpacity
            onPress={() => handleLanguageChange(isCreole ? 'fr' : 'ht')}
            className="flex-row items-center gap-2 mt-4 px-4 py-2 rounded-full"
            style={{ backgroundColor: '#0857A614' }}
            activeOpacity={0.85}
          >
            <Languages color="#0857A6" size={16} />
            <Text className="text-sm font-medium" style={{ color: '#0857A6' }}>
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

        {/* ── 1. Header ─────────────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: '#ffffff',
            borderBottomWidth: 1,
            borderBottomColor: '#eef1f6',
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 20,
          }}
        >
          {/* Initials avatar */}
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#eaf2fb',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#0857A6', fontSize: 26, fontWeight: '800' }}>
              {initialsOf(user)}
            </Text>
          </View>

          {/* Name */}
          <Text style={{ color: '#0f172a', fontSize: 26, fontWeight: '800', lineHeight: 32 }}>
            {displayName}
          </Text>

          {/* Email */}
          <Text style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
            {user.email}
          </Text>

          {/* Track badge + level chip row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {track && (
              <View style={{ backgroundColor: '#eaf2fb', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ color: '#0857A6', fontSize: 12, fontWeight: '700' }}>Série {track}</Text>
              </View>
            )}
            {level && (
              <View style={{ backgroundColor: '#eaf2fb', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Zap color="#0857A6" size={12} />
                <Text style={{ color: '#0857A6', fontSize: 12, fontWeight: '600' }}>
                  Niveau {level.level}
                </Text>
              </View>
            )}
            {profile && (
              <View style={{ backgroundColor: '#eaf2fb', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ color: '#0857A6', fontSize: 12, fontWeight: '600' }}>{profile.xp ?? 0} XP</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 2. XP progress bar card ───────────────────────────────────────── */}
        {profile && level && (
          <View
            style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', marginHorizontal: 16, marginTop: 16, marginBottom: 12, padding: 16, shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Zap color="#0857A6" size={16} />
                <Text className="font-bold text-gray-900 text-sm">
                  Niveau {level.level}
                </Text>
              </View>
              <Text className="text-sm font-semibold" style={{ color: '#0857A6' }}>{profile.xp ?? 0} XP</Text>
            </View>
            <ProgressBar
              value={progressPct}
              color="#0857A6"
              height={8}
              showLabel
              label={`Progression niveau ${level.level}`}
            />
          </View>
        )}

        {/* ── 3. Progress Dashboard ("Votre progression") ───────────────────── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: '#0f172a', marginBottom: 12 }}>
            {t('Votre progression', 'Pwogrè ou')}
          </Text>

          {/* KPI stats row */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <KpiCard
              icon={<Target color="#0857A6" size={18} />}
              value={totalQuizzes}
              label={t('Quiz complétés', 'Quiz fini')}
              iconBg="#eaf2fb"
            />
            <KpiCard
              icon={<Award color="#0857A6" size={18} />}
              value={avgScore}
              label={t('Score moyen', 'Mwayèn')}
              iconBg="#eaf2fb"
            />
            <KpiCard
              icon={<BookOpen color="#0857A6" size={18} />}
              value={enrolledCourses.length}
              label={t('Cours suivis', 'Kou swivi')}
              iconBg="#eaf2fb"
            />
            <KpiCard
              icon={<Flame color="#ef4444" size={18} />}
              value={streak?.currentStreak ?? 0}
              label={t('Jours série', 'Jou seri')}
              iconBg="#fef2f2"
            />
          </View>
        </View>

        {/* ── 3b. Readiness card ────────────────────────────────────────────── */}
        <View className="mx-4 mb-4">
          <ReadinessCard />
        </View>

        {/* ── 4. Stats card ─────────────────────────────────────────────────── */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', marginHorizontal: 16, marginBottom: 16, padding: 16, shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
          <Text className="mb-1" style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{t('Statistiques', 'Estatistik')}</Text>
          <StatRow
            label={t('Meilleure série', 'Pi bon seri')}
            value={`${streak?.longestStreak ?? 0} jours`}
            icon={<Trophy color="#0857A6" size={18} />}
            last
          />
        </View>

        {/* ── 4b. Achievements / streak milestones ──────────────────────────── */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', marginHorizontal: 16, marginBottom: 16, padding: 16, shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
          <Text className="mb-3" style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{t('Succès', 'Siksè')}</Text>
          <View className="flex-row flex-wrap gap-3">
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
                <View
                  key={a.label}
                  className="items-center gap-1"
                  style={{ width: '30%' }}
                >
                  <View
                    className="w-14 h-14 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: unlocked ? '#eaf2fb' : '#f3f4f6', borderWidth: 1, borderColor: '#e8edf5' }}
                  >
                    <a.Icon color={unlocked ? '#0857A6' : '#9ca3af'} size={24} />
                  </View>
                  <Text className="text-xs text-center font-medium" style={{ color: unlocked ? '#0f172a' : '#9ca3af' }}>{a.label}</Text>
                  {unlocked && <CheckCircle2 color="#0857A6" size={12} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── 5. Leaderboard section ────────────────────────────────────────── */}
        <View className="mx-4 mb-4">
          <Leaderboard compact={false} maxRows={10} />
        </View>

        {/* ── 6. Settings tile grid ─────────────────────────────────────────── */}
        <View className="mx-4 mb-2">
          <Text className="mb-3" style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{t('Paramètres', 'Paramèt')}</Text>
          <View className="flex-row gap-3">
            <SettingsTile
              label={language === 'fr' ? 'Langue : Français' : 'Lang : Kreyòl'}
              icon={<Languages color="#0857A6" size={22} />}
              onPress={() => handleLanguageChange(language === 'fr' ? 'ht' : 'fr')}
            />
            <SettingsTile
              label={theme === 'light' ? t('Mode nuit', 'Mòd nwit') : t('Mode jour', 'Mòd jou')}
              icon={theme === 'light'
                ? <Moon color="#6b7280" size={22} />
                : <Sun color="#f59e0b" size={22} />}
              onPress={toggleTheme}
            />
          </View>
        </View>

        {/* ── 7. Notifications settings card ───────────────────────────────── */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eaf2fb', marginRight: 12 }}>
                <Bell color="#0857A6" size={18} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: '#0f172a' }}>
                  {t('Notifications', 'Notifikasyon')}
                </Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
                  {t("Rappels d'étude quotidiens", 'Rapèl etid chak jou')}
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: '#e2e8f0', true: '#bfdbfe' }}
                thumbColor={notificationsEnabled ? '#0857A6' : '#94a3b8'}
                ios_backgroundColor="#e2e8f0"
              />
            </View>
          </View>
        </View>

        {/* ── 8. Logout button ─────────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handleLogout}
          activeOpacity={0.75}
          className="mx-4 mt-4 items-center py-3"
        >
          <View className="flex-row items-center gap-2">
            <LogOut color="#dc2626" size={16} />
            <Text className="text-red-600 font-semibold text-sm">{t('Se déconnecter', 'Dekonekte')}</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}
