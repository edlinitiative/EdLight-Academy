import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Flame, Target, BookOpen, BarChart3, ChevronRight, Award, CalendarCheck } from 'lucide-react-native';
import SandraFab from '../components/SandraFab';
import useStore from '../contexts/store';
import { useCourses } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { getFirstName } from '../utils/shared';
import { LoadingState, ErrorState } from '../components/StateViews';
import Avatar from '../components/ui/Avatar';
import ProgressBar from '../components/ProgressBar';
import ReadinessCard from '../components/ReadinessCard';
import HomeWidgets from '../components/HomeWidgets';
import Leaderboard from '../components/Leaderboard';
import ResumeBanner from '../components/ResumeBanner';
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
    <View className="flex-1 rounded-2xl p-3 items-center gap-1.5" style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
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
  const { user, language, enrolledCourses, quizAttempts, lastActivity, setPendingDailyChallenge } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const { streak } = useStreak();
  const { progress: allProgress } = useAllProgress();

  const firstName = getFirstName(user);
  const greeting = isCreole ? 'Bonjou' : 'Bonjour';
  const allAttemptsList = Object.values(quizAttempts as Record<string, any[]>).flat();
  const totalQuizzes = allAttemptsList.length;
  const avgScore = totalQuizzes > 0
    ? Math.round(allAttemptsList.reduce((sum: number, a: any) => sum + (typeof a.score === 'number' ? a.score * 100 : typeof a.percentage === 'number' ? a.percentage : 0), 0) / totalQuizzes)
    : 0;

  // Build a courseId → progress map
  const progressByCourseId = React.useMemo(() => {
    const m = new Map<string, any>();
    for (const p of allProgress || []) {
      if (p?.courseId) m.set(p.courseId, p);
    }
    return m;
  }, [allProgress]);

  // Up to 4 enrolled (or first 4 catalog) courses
  const displayCourses = React.useMemo(() => {
    if (!courses) return [];
    if (enrolledCourses.length > 0) {
      return enrolledCourses
        .slice(0, 4)
        .map((ec: any) => courses.find((c) => c.id === ec.id) ?? ec);
    }
    return courses.slice(0, 4);
  }, [courses, enrolledCourses]);

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return <LoadingState message={t('Chargement du tableau de bord…', 'Ap chaje tablodbò a…')} />;
  }

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
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
          style={{ backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#eef1f6' }}
          className="px-5 pt-5 pb-5"
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748b' }}>
                {t('Tableau de bord', 'Tablodbò')}
              </Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', marginTop: 2 }} numberOfLines={1}>
                {greeting}, {firstName || t('Étudiant', 'Elèv')}
              </Text>
              <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                {t('Prêt à apprendre aujourd\'hui ?', 'Ou pare pou aprann jodi a ?')}
              </Text>
            </View>

            {/* Avatar photo (falls back to a pixel-art character) */}
            <Avatar
              name={user?.name || user?.displayName || ''}
              uri={user?.picture || user?.profile_picture || ''}
              seed={user?.uid || ''}
              size={48}
            />
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* Resume banner — below header, above KPI strip                        */}
        {/* ------------------------------------------------------------------ */}
        {lastActivity ? (
          <View className="px-5 mt-4 mb-3">
            <ResumeBanner />
          </View>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* KPI strip                                                            */}
        {/* ------------------------------------------------------------------ */}
        <View className="flex-row gap-2 px-5 mb-5" style={lastActivity ? undefined : { marginTop: 16 }}>
          <KpiCard
            icon={<Flame color="#ef4444" size={18} />}
            value={streak?.currentStreak ?? 0}
            label={t('Série', 'Seri')}
            iconBg="#fef2f2"
          />
          <KpiCard
            icon={<Target color="#0857A6" size={18} />}
            value={totalQuizzes}
            label={t('Quiz', 'Quiz')}
            iconBg="#eaf2fb"
          />
          <KpiCard
            icon={<BookOpen color="#0857A6" size={18} />}
            value={enrolledCourses.length}
            label={t('Cours', 'Kou')}
            iconBg="#eaf2fb"
          />
          <KpiCard
            icon={<Award color="#0857A6" size={18} />}
            value={avgScore > 0 ? `${avgScore}%` : '—'}
            label={t('Moy.', 'Moy.')}
            iconBg="#eaf2fb"
          />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* HomeWidgets — 2×2 tonal grid                                         */}
        {/* ------------------------------------------------------------------ */}
        <View className="px-5 mb-5">
          <HomeWidgets
            onNavigateExams={() => navigation.navigate('Exams')}
            onNavigateTrivia={() => navigation.navigate('Trivia')}
            onNavigateDaily={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }}
            onNavigateCourses={() => navigation.navigate('Courses')}
            enrolledCount={enrolledCourses.length}
          />
        </View>

        {/* ------------------------------------------------------------------ */}
        {/* ReadinessCard — SVG donut + subject bars                             */}
        {/* ------------------------------------------------------------------ */}
        <View className="px-5 mb-5">
          <Text className="mb-3" style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
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
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
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
                    activeOpacity={0.82}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: '#e8edf5',
                      shadowColor: '#0857A6',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.06,
                      shadowRadius: 6,
                      elevation: 2,
                    }}
                  >
                    {/* No flex-1 here: the card is auto-height, flex-1 collapses it */}
                    <View className="p-4">
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

                        {pct > 0 && (
                          <View className="mt-3">
                            <ProgressBar value={pct} color={courseColor} height={4} />
                          </View>
                        )}
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
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
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
          <Leaderboard compact maxRows={5} />
        </View>

        {/* Study plan — Sandra builds a personalized révision schedule */}
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('StudyPlan')}
          activeOpacity={0.85}
          className="mx-4 mb-6"
          style={{ backgroundColor: '#0857A6', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            <CalendarCheck color="#fff" size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
              {t("Mon plan d'étude", 'Plan etid mwen')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>
              {t('Un programme de révision fait pour vous', 'Yon pwogram revizyon fèt pou ou')}
            </Text>
          </View>
          <ChevronRight color="#fff" size={18} />
        </TouchableOpacity>

      </ScrollView>

      {/* Sandra — AI tutor, always within thumb's reach */}
      <SandraFab onPress={() => (navigation as any).navigate('Sandra')} />
    </SafeAreaView>
  );
}
