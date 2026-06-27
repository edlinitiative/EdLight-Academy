import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Flame, Target, BookOpen, ClipboardList, Zap, BarChart3, ChevronRight } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useCourses } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { getFirstName } from '../utils/shared';
import { LoadingState, ErrorState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import ReadinessCard from '../components/ReadinessCard';
import HomeWidgets from '../components/HomeWidgets';
import Leaderboard from '../components/Leaderboard';
import { TabParamList } from '../navigation/TabNavigator';

type Nav = BottomTabNavigationProp<TabParamList>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countCourseLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  const count = units.reduce((sum: number, u: any) => sum + (u?.lessons?.length || 0), 0);
  return count || units.length || course?.videoCount || 0;
}

function calculateCompletionPercentage(progress: any, totalLessons: number): number {
  if (!progress || totalLessons === 0) return 0;
  const completed = progress?.completedLessons?.length ?? 0;
  return Math.min(100, Math.round((completed / totalLessons) * 100));
}

function initialsOf(user: any): string {
  const name = user?.name || user?.displayName || '';
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p: string) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'EL';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
    <View className="flex-1 bg-white rounded-2xl p-3 shadow-sm items-center gap-1.5">
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </View>
      <Text className="text-xl font-bold text-gray-900">{value}</Text>
      <Text className="text-xs text-gray-500 text-center leading-tight">{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user, language, enrolledCourses, quizAttempts } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const { streak } = useStreak();
  const { progress: allProgress } = useAllProgress();

  const firstName = getFirstName(user);
  const greeting = isCreole ? 'Bonjou' : 'Bonjour';
  const totalQuizzes = Object.values(quizAttempts as Record<string, any[]>).flat().length;
  const initials = initialsOf(user);

  // Build a courseId → progress map
  const progressByCourseId = React.useMemo(() => {
    const m = new Map<string, any>();
    for (const p of allProgress || []) {
      if (p?.courseId) m.set(p.courseId, p);
    }
    return m;
  }, [allProgress]);

  // Up to 3 enrolled (or first 3 catalog) courses
  const displayCourses = React.useMemo(() => {
    if (!courses) return [];
    if (enrolledCourses.length > 0) {
      return enrolledCourses
        .slice(0, 3)
        .map((ec: any) => courses.find((c) => c.id === ec.id) ?? ec);
    }
    return courses.slice(0, 3);
  }, [courses, enrolledCourses]);

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return <LoadingState message={t('Chargement du tableau de bord…', 'Chajman tablo bò…')} />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor="#0857A6"
            colors={['#0857A6']}
          />
        }
      >
        {/* ------------------------------------------------------------------ */}
        {/* Header banner                                                        */}
        {/* ------------------------------------------------------------------ */}
        <View
          style={{ backgroundColor: '#0857A6' }}
          className="px-5 pt-5 pb-7"
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-blue-200 text-sm font-medium">
                {t('Tableau de bord', 'Tablo bò')}
              </Text>
              <Text className="text-white text-2xl font-bold mt-0.5" numberOfLines={1}>
                {greeting}, {firstName || t('Étudiant', 'Elèv')} 👋
              </Text>
              <Text className="text-blue-200 text-sm mt-1">
                {t('Prêt à apprendre aujourd\'hui ?', 'Ou pare pou aprann jodi a ?')}
              </Text>
            </View>

            {/* Avatar initials */}
            <View
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <Text className="text-white font-bold text-base">{initials}</Text>
            </View>
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* KPI strip — overlaps header slightly                                */}
        {/* ------------------------------------------------------------------ */}
        <View className="flex-row gap-3 px-5 -mt-4 mb-5">
          <KpiCard
            icon={<Flame color="#ef4444" size={18} />}
            value={streak?.currentStreak ?? 0}
            label={t('Jours consécutifs', 'Jou d\'afil')}
            iconBg="#fef2f2"
          />
          <KpiCard
            icon={<Target color="#0857A6" size={18} />}
            value={totalQuizzes}
            label={t('Quiz complétés', 'Quiz fini')}
            iconBg="#eff6ff"
          />
          <KpiCard
            icon={<BookOpen color="#10b981" size={18} />}
            value={enrolledCourses.length}
            label={t('Cours inscrits', 'Kou enskri')}
            iconBg="#ecfdf5"
          />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* HomeWidgets — 2×2 tonal grid                                         */}
        {/* ------------------------------------------------------------------ */}
        <View className="px-5 mb-5">
          <HomeWidgets
            onNavigateExams={() => navigation.navigate('Exams')}
            onNavigateTrivia={() => navigation.navigate('Trivia')}
            onNavigateCourses={() => navigation.navigate('Courses')}
            enrolledCount={enrolledCourses.length}
          />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* ReadinessCard — SVG donut + subject bars                             */}
        {/* ------------------------------------------------------------------ */}
        <View className="px-5 mb-5">
          <Text className="text-base font-bold text-gray-900 mb-3">
            {t('Niveau de préparation', 'Nivo preparasyon')}
          </Text>
          <ReadinessCard />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Course progress section                                              */}
        {/* ------------------------------------------------------------------ */}
        {displayCourses.length > 0 && (
          <View className="px-5 mb-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-gray-900">
                {t('Continuer à apprendre', 'Kontinye aprann')}
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Courses')}
                className="flex-row items-center gap-1"
              >
                <Text className="text-primary-600 text-sm font-medium">
                  {t('Voir tout', 'Wè tout')}
                </Text>
                <ChevronRight color="#0857A6" size={14} />
              </TouchableOpacity>
            </View>

            <View className="gap-3">
              {displayCourses.map((course: any) => {
                const courseColor = course.color ?? '#0857A6';
                const totalLessons = countCourseLessons(course);
                const prog = progressByCourseId.get(course.id);
                const pct = calculateCompletionPercentage(prog, totalLessons);

                return (
                  <TouchableOpacity
                    key={course.id}
                    onPress={() => navigation.navigate('Courses')}
                    activeOpacity={0.85}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden"
                  >
                    {/* Colored left border */}
                    <View className="flex-row">
                      <View style={{ width: 3, backgroundColor: courseColor }} />
                      <View className="flex-1 p-4">
                        <View className="flex-row items-center gap-3">
                          <View
                            className="w-11 h-11 rounded-xl items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: courseColor + '18' }}
                          >
                            <BookOpen color={courseColor} size={20} />
                          </View>
                          <View className="flex-1">
                            <Text
                              className="font-semibold text-gray-900 text-sm"
                              numberOfLines={2}
                            >
                              {course.name}
                            </Text>
                            <View className="flex-row items-center gap-2 mt-1">
                              {course.level ? (
                                <View
                                  className="px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: courseColor + '18' }}
                                >
                                  <Text
                                    className="text-xs font-medium"
                                    style={{ color: courseColor }}
                                  >
                                    {course.level}
                                  </Text>
                                </View>
                              ) : null}
                              {totalLessons > 0 && (
                                <Text className="text-xs text-gray-400">
                                  {totalLessons} {t('leçons', 'leson')}
                                </Text>
                              )}
                            </View>
                          </View>
                          <View className="items-end">
                            <Text
                              className="text-sm font-bold"
                              style={{ color: courseColor }}
                            >
                              {pct}%
                            </Text>
                          </View>
                        </View>

                        <View className="mt-3">
                          <ProgressBar value={pct} color={courseColor} height={5} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Leaderboard compact                                                  */}
        {/* ------------------------------------------------------------------ */}
        <View className="px-5 mb-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-base font-bold text-gray-900">
              {t('Classement', 'Klasman')}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              className="flex-row items-center gap-1"
            >
              <Text className="text-primary-600 text-sm font-medium">
                {t('Voir tout', 'Wè tout')}
              </Text>
              <ChevronRight color="#0857A6" size={14} />
            </TouchableOpacity>
          </View>
          <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <Leaderboard compact maxRows={5} />
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Quick actions                                                         */}
        {/* ------------------------------------------------------------------ */}
        <View className="px-5">
          <Text className="text-base font-bold text-gray-900 mb-3">
            {t('Accès rapide', 'Akè rapid')}
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => navigation.navigate('Exams')}
              activeOpacity={0.85}
              className="flex-1 rounded-2xl p-4 items-center gap-2"
              style={{ backgroundColor: '#4338ca' }}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <ClipboardList color="#fff" size={20} />
              </View>
              <Text className="text-white font-semibold text-xs text-center">
                {t('Examens\nBac', 'Egzamen\nBac')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Trivia')}
              activeOpacity={0.85}
              className="flex-1 rounded-2xl p-4 items-center gap-2"
              style={{ backgroundColor: '#d97706' }}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <Zap color="#fff" size={20} />
              </View>
              <Text className="text-white font-semibold text-xs text-center">
                {t('Trivia\nJeux', 'Trivia\nJèt')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              activeOpacity={0.85}
              className="flex-1 rounded-2xl p-4 items-center gap-2"
              style={{ backgroundColor: '#059669' }}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
              >
                <BarChart3 color="#fff" size={20} />
              </View>
              <Text className="text-white font-semibold text-xs text-center">
                {t('Mon\nProfil', 'Pwofil\nMwen')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
