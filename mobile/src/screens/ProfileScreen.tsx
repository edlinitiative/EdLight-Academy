import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Flame, Trophy, Zap, LogOut, Moon, Sun, Languages, GraduationCap,
  BarChart3, Star, Award, CheckCircle2, Target, BookOpen, Bell,
} from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';
import { logoutUser } from '../services/authService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { getFirstName } from '../utils/shared';
import ProgressBar from '../components/ProgressBar';
import ReadinessCard from '../components/ReadinessCard';
import Leaderboard from '../components/Leaderboard';
import { scheduleDailyStudyReminder } from '../services/notificationService';

// ── constants ────────────────────────────────────────────────────────────────

const NOTIF_ENABLED_KEY = '@edlight:notifications_enabled';

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
    <View style={{ flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
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

  // Notifications toggle state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_ENABLED_KEY).then((val) => {
      setNotificationsEnabled(val === 'true');
    }).catch(() => {});
  }, []);

  async function handleNotificationToggle(value: boolean) {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem(NOTIF_ENABLED_KEY, String(value));
    if (value) {
      await scheduleDailyStudyReminder();
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
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
          <View className="w-20 h-20 rounded-2xl items-center justify-center" style={{ backgroundColor: '#0857A6' }}>
            <GraduationCap color="#fff" size={36} />
          </View>
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
            onPress={() => setLanguage(isCreole ? 'fr' : 'ht')}
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
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* ── 1. Blue hero card ─────────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: '#0857A6',
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 44,
          }}
        >
          {/* Initials avatar */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 28, fontWeight: '800' }}>
              {initialsOf(user)}
            </Text>
          </View>

          {/* Name */}
          <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800', lineHeight: 28 }}>
            {displayName}
          </Text>

          {/* Email */}
          <Text style={{ color: '#93c5fd', fontSize: 13, marginTop: 2 }}>
            {user.email}
          </Text>

          {/* Track badge + level chip row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {track && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Série {track}</Text>
              </View>
            )}
            {level && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Zap color="#fbbf24" size={12} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>
                  Niveau {level.level}
                </Text>
              </View>
            )}
            {profile && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ color: '#fde68a', fontSize: 12, fontWeight: '600' }}>{profile.xp ?? 0} XP</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── 2. XP progress bar card (floats up, overlaps hero) ─────────────── */}
        {profile && level && (
          <View
            style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', marginHorizontal: 16, marginTop: -20, marginBottom: 12, padding: 16, shadowColor: '#0857A6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Zap color="#f59e0b" size={16} />
                <Text className="font-bold text-gray-900 text-sm">
                  Niveau {level.level}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-amber-600">{profile.xp ?? 0} XP</Text>
            </View>
            <ProgressBar
              value={progressPct}
              color="#f59e0b"
              height={8}
              showLabel
              label={`Progression niveau ${level.level}`}
            />
          </View>
        )}

        {/* ── 3. Progress Dashboard ("Votre progression") ───────────────────── */}
        <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: '#0f172a', marginBottom: 12 }}>
            {t('Votre progression', 'Pwogrè ou')}
          </Text>

          {/* KPI stats row */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <KpiCard
              icon={<Target color="#0857A6" size={18} />}
              value={totalQuizzes}
              label={t('Quiz complétés', 'Quiz fini')}
              iconBg="#eff6ff"
            />
            <KpiCard
              icon={<Award color="#f59e0b" size={18} />}
              value={avgScore}
              label={t('Score moyen', 'Mwayèn')}
              iconBg="#fffbeb"
            />
            <KpiCard
              icon={<BookOpen color="#10b981" size={18} />}
              value={enrolledCourses.length}
              label={t('Cours suivis', 'Kou swivi')}
              iconBg="#ecfdf5"
            />
            <KpiCard
              icon={<Flame color="#ef4444" size={18} />}
              value={streak?.currentStreak ?? 0}
              label={t('Jours série', 'Jou seri')}
              iconBg="#fef2f2"
            />
          </View>

          {/* Achievement badge pills (horizontal scroll) */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }} contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: 'row' }}>
            {[
              { label: t('1er jour', '1ye jou'), target: 1, icon: '🌱', color: '#10b981', isQuiz: false },
              { label: t('7 jours', '7 jou'), target: 7, icon: '🔥', color: '#ef4444', isQuiz: false },
              { label: t('30 jours', '30 jou'), target: 30, icon: '⚡', color: '#f59e0b', isQuiz: false },
              { label: t('100 jours', '100 jou'), target: 100, icon: '🏆', color: '#0857A6', isQuiz: false },
              { label: t('10 quiz', '10 quiz'), target: 10, icon: '🎯', color: '#8b5cf6', isQuiz: true },
              { label: t('50 quiz', '50 quiz'), target: 50, icon: '🧠', color: '#ec4899', isQuiz: true },
            ].map((a) => {
              const current = a.isQuiz ? totalQuizzes : (streak?.longestStreak ?? 0);
              const unlocked = current >= a.target;
              return (
                <View
                  key={a.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: unlocked ? a.color + '18' : '#f3f4f6',
                    borderWidth: 1,
                    borderColor: unlocked ? a.color + '60' : '#e5e7eb',
                  }}
                >
                  <Text style={{ fontSize: 14, opacity: unlocked ? 1 : 0.4 }}>{a.icon}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: unlocked ? a.color : '#9ca3af' }}>
                    {a.label}
                  </Text>
                  {unlocked && <CheckCircle2 color={a.color} size={12} />}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* ── 3b. Readiness card ────────────────────────────────────────────── */}
        <View className="mx-4 mb-4">
          <ReadinessCard />
        </View>

        {/* ── 4. Stats card ─────────────────────────────────────────────────── */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', marginHorizontal: 16, marginBottom: 16, padding: 16, shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
          <Text className="font-bold text-gray-900 mb-1">{t('Statistiques', 'Estatistik')}</Text>
          <StatRow
            label={t('Série consécutive', 'Seri konsekitif')}
            value={`${streak?.currentStreak ?? 0} jours`}
            icon={<Flame color="#ef4444" size={18} />}
          />
          <StatRow
            label={t('Meilleure série', 'Pi bon seri')}
            value={`${streak?.longestStreak ?? 0} jours`}
            icon={<Trophy color="#f59e0b" size={18} />}
          />
          <StatRow
            label={t('Quiz complétés', 'Quiz fini')}
            value={totalQuizzes}
            icon={<BarChart3 color="#10b981" size={18} />}
            last
          />
        </View>

        {/* ── 4b. Achievements / streak milestones ──────────────────────────── */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', marginHorizontal: 16, marginBottom: 16, padding: 16, shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
          <Text className="font-bold text-gray-900 mb-3">{t('Succès', 'Siksè')}</Text>
          <View className="flex-row flex-wrap gap-3">
            {[
              { label: t('1er jour', '1ye jou'), target: 1, icon: '🌱', color: '#10b981' },
              { label: t('7 jours', '7 jou'), target: 7, icon: '🔥', color: '#ef4444' },
              { label: t('30 jours', '30 jou'), target: 30, icon: '⚡', color: '#f59e0b' },
              { label: t('100 jours', '100 jou'), target: 100, icon: '🏆', color: '#0857A6' },
              { label: t('10 quiz', '10 quiz'), target: 10, isQuiz: true, icon: '🎯', color: '#8b5cf6' },
              { label: t('50 quiz', '50 quiz'), target: 50, isQuiz: true, icon: '🧠', color: '#ec4899' },
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
                    style={{ backgroundColor: unlocked ? a.color + '20' : '#f3f4f6', borderWidth: 1.5, borderColor: unlocked ? a.color : '#e5e7eb' }}
                  >
                    <Text style={{ fontSize: 28, opacity: unlocked ? 1 : 0.35 }}>{a.icon}</Text>
                  </View>
                  <Text className="text-xs text-center font-medium" style={{ color: unlocked ? a.color : '#9ca3af' }}>{a.label}</Text>
                  {unlocked && <CheckCircle2 color={a.color} size={12} />}
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
          <Text className="font-bold text-gray-900 mb-3">{t('Paramètres', 'Paramèt')}</Text>
          <View className="flex-row gap-3">
            <SettingsTile
              label={language === 'fr' ? 'Langue : Français' : 'Lang : Kreyòl'}
              icon={<Languages color="#0857A6" size={22} />}
              onPress={() => setLanguage(language === 'fr' ? 'ht' : 'fr')}
            />
            <SettingsTile
              label={theme === 'light' ? t('Mode nuit', 'Mòd nuit') : t('Mode jour', 'Mòd jou')}
              icon={theme === 'light'
                ? <Moon color="#6b7280" size={22} />
                : <Sun color="#f59e0b" size={22} />}
              onPress={toggleTheme}
            />
          </View>
        </View>

        {/* ── 7. Notifications settings card ───────────────────────────────── */}
        <View style={{ marginHorizontal: 16, marginBottom: 4 }}>
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', marginRight: 12 }}>
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
