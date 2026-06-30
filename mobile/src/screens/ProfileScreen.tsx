import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Flame, Trophy, Zap, LogOut, Moon, Sun, Languages, GraduationCap,
  BarChart3, Star, Award, CheckCircle2,
} from 'lucide-react-native';
import useStore from '../contexts/store';
import { logoutUser } from '../services/authService';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { getFirstName } from '../utils/shared';
import ProgressBar from '../components/ProgressBar';
import ReadinessCard from '../components/ReadinessCard';
import Leaderboard from '../components/Leaderboard';

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
    track,
    toggleAuthModal,
  } = useStore();

  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();

  const totalQuizzes = Object.values(quizAttempts).flat().length;
  const firstName = getFirstName(user);

  // Progress value: level.progress is a 0–1 fraction; ProgressBar expects 0–100
  const progressPct = Math.round((level?.progress ?? 0) * 100);

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
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }}>
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
            className="rounded-xl py-4 px-10 mt-1"
            style={{ backgroundColor: '#0857A6' }}
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold text-base">{t('Se connecter', 'Konekte')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Authenticated state ──────────────────────────────────────────────────────
  const displayName = user.name || user.displayName || firstName || 'Étudiant';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }}>
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
            className="bg-white rounded-2xl shadow-md p-4 mx-4"
            style={{ marginTop: -20, marginBottom: 12 }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center gap-2">
                <Zap color="#f59e0b" size={16} />
                <Text className="font-bold text-gray-900 text-sm">
                  Niveau {level.level}
                  {level.label ? ` · ${level.label}` : ''}
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

        {/* ── 3. Readiness card ─────────────────────────────────────────────── */}
        <View className="mx-4 mb-4">
          <ReadinessCard />
        </View>

        {/* ── 4. Stats card ─────────────────────────────────────────────────── */}
        <View className="bg-white mx-4 rounded-2xl shadow-sm p-4 mb-4">
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
        <View className="bg-white mx-4 rounded-2xl shadow-sm p-4 mb-4">
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

        {/* ── 7. Logout button ─────────────────────────────────────────────── */}
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
