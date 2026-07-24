import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Flame, Zap, ChevronRight, CalendarCheck, BookOpen } from 'lucide-react-native';
import SandraFab from '../components/SandraFab';
import useStore from '../contexts/store';
import { useCourses } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import { Skeleton, ErrorState } from '../components/StateViews';
import Avatar from '../components/ui/Avatar';
import PressableScale from '../components/ui/PressableScale';
import ProgressBar from '../components/ProgressBar';
import ReadinessCard from '../components/ReadinessCard';
import HomeWidgets from '../components/HomeWidgets';
import Leaderboard from '../components/Leaderboard';
import ResumeBanner from '../components/ResumeBanner';
import { TabParamList } from '../navigation/TabNavigator';
import { useColors, useTheme, radius, courseTint } from '../theme/theme';
import { tapLight } from '../utils/haptics';

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

/** Compact XP formatting: 1450 → "1.4k". */
function formatXp(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A small pill in the header showing a single momentum stat (streak, XP). */
function StatChip({ icon, value, tint }: { icon: React.ReactNode; value: string | number; tint: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: tint,
        borderRadius: radius.chip,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      {icon}
      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.ink }}>{value}</Text>
    </View>
  );
}

/** One column of the at-a-glance stats card. */
function StatCol({ value, label }: { value: string | number; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={() => { tapLight(); onAction(); }}
          className="flex-row items-center gap-1"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={{ color: colors.azure, fontSize: 14, fontWeight: '600' }}>{actionLabel}</Text>
          <ChevronRight color={colors.azure} size={14} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function DashboardSkeleton() {
  const colors = useColors();
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View className="px-5 pt-4">
        <View className="flex-row items-center">
          <Skeleton width={46} height={46} radius={23} />
          <View className="flex-1 pl-3 gap-2">
            <Skeleton width={180} height={18} />
            <Skeleton width={130} height={12} />
          </View>
        </View>
        <View className="mt-6"><Skeleton height={64} radius={radius.card} /></View>
        <View className="flex-row gap-3 mt-4">
          <View className="flex-1"><Skeleton height={112} radius={radius.card} /></View>
          <View className="flex-1"><Skeleton height={112} radius={radius.card} /></View>
        </View>
        <View className="mt-4 gap-3">
          <Skeleton height={72} radius={radius.card} />
          <Skeleton height={72} radius={radius.card} />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { colors, cardSurface, shadow } = useTheme();
  const { user, language, enrolledCourses, quizAttempts, lastActivity, setPendingDailyChallenge } = useStore();
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const { streak } = useStreak();
  const { progress: allProgress } = useAllProgress();
  const { myEntry } = useLeaderboard(25);

  const firstName = getFirstName(user);
  const greeting = isCreole ? 'Bonjou' : 'Bonjour';
  const weeklyXp = (myEntry as any)?.xp ?? 0;
  const allAttemptsList = Object.values(quizAttempts as Record<string, any[]>).flat();
  const totalQuizzes = allAttemptsList.length;
  // Each attempt stores { score: correctCount, total: questionCount } — average
  // the per-attempt percentage (score/total), clamped 0-100. (Matches Profile.)
  const avgScore = totalQuizzes > 0
    ? Math.round(
        allAttemptsList.reduce((sum: number, a: any) => {
          const pct = typeof a.percentage === 'number'
            ? a.percentage
            : (a.total > 0 ? (a.score / a.total) * 100 : 0);
          return sum + Math.max(0, Math.min(100, pct));
        }, 0) / totalQuizzes,
      )
    : 0;

  // Brand-new student: nothing done yet. Drives the motivating first-run nudge.
  const isFirstRun = totalQuizzes === 0 && enrolledCourses.length === 0 && (streak?.currentStreak ?? 0) === 0;

  const progressByCourseId = React.useMemo(() => {
    const m = new Map<string, any>();
    for (const p of allProgress || []) {
      if (p?.courseId) m.set(p.courseId, p);
    }
    return m;
  }, [allProgress]);

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

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const goCourse = (course: any) =>
    (navigation as any).navigate('Courses', {
      screen: 'CourseDetail',
      params: { courseId: course.id, courseName: course.name },
    });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={colors.azure}
            colors={[colors.azure]}
          />
        }
      >
        {/* Header — identity + momentum */}
        <View
          style={{ backgroundColor: colors.bg }}
          className="px-5 pt-4 pb-2"
        >
          <View className="flex-row items-center">
            {/* Pixel-art avatar (seeded by uid) — tap to open the profile. */}
            <TouchableOpacity
              onPress={() => { tapLight(); navigation.navigate('Profile'); }}
              activeOpacity={0.8}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Ouvrir le profil', 'Louvri pwofil la')}
            >
              <Avatar name={user?.name || user?.displayName || ''} seed={user?.uid || ''} size={46} />
            </TouchableOpacity>

            <View className="flex-1 px-3">
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                {greeting}, {firstName || t('Étudiant', 'Elèv')} 👋
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 1 }} numberOfLines={1}>
                {t('Prêt à apprendre aujourd\'hui ?', 'Ou pare pou aprann jodi a ?')}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <StatChip
                icon={<Flame color={colors.danger} size={15} />}
                value={streak?.currentStreak ?? 0}
                tint={colors.dangerSoft}
              />
              <StatChip
                icon={<Zap color={colors.azure} size={15} />}
                value={formatXp(weeklyXp)}
                tint={colors.azureSoft}
              />
            </View>
          </View>
        </View>

        {/* Resume banner — the top action when there's an activity to continue */}
        {lastActivity ? (
          <View className="px-5 mt-4">
            <ResumeBanner />
          </View>
        ) : null}

        {/* First-run nudge — a brand-new student (no quiz, course or streak yet)
            sees an inviting starting point instead of a wall of zeros. */}
        {!lastActivity && isFirstRun ? (
          <View className="px-5 mt-4">
            <PressableScale
              onPress={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }}
              accessibilityRole="button"
              accessibilityLabel={t('Commencer', 'Kòmanse')}
              style={{ borderRadius: radius.card, overflow: 'hidden', ...shadow.md }}
            >
              <LinearGradient
                colors={['#2E86F0', '#1B6FE0', '#0857A6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <View
                  style={{
                    width: 44, height: 44, borderRadius: radius.tile,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Zap color="#fff" size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                    {t('Commence ton parcours', 'Kòmanse pakou ou')}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12.5, marginTop: 1 }}>
                    {t('Fais ton premier quiz pour gagner des XP', 'Fè premye quiz ou pou genyen XP')}
                  </Text>
                </View>
                <ChevronRight color="#fff" size={18} />
              </LinearGradient>
            </PressableScale>
          </View>
        ) : null}

        {/* Quick actions */}
        <View className="px-5 mt-4 mb-5">
          <HomeWidgets
            onNavigateExams={() => navigation.navigate('Exams')}
            onNavigateTrivia={() => navigation.navigate('Trivia')}
            onNavigateDaily={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }}
            onNavigateCourses={() => navigation.navigate('Courses')}
            enrolledCount={enrolledCourses.length}
          />
        </View>

        {/* At-a-glance stats */}
        <View className="px-5 mb-5">
          <View style={{ ...cardSurface, flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
            <StatCol value={totalQuizzes} label={t('Quiz', 'Quiz')} />
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: 4 }} />
            <StatCol value={enrolledCourses.length} label={t('Cours', 'Kou')} />
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginVertical: 4 }} />
            <StatCol value={avgScore > 0 ? `${avgScore}%` : '—'} label={t('Moyenne', 'Mwayèn')} />
          </View>
        </View>

        {/* Continue learning */}
        {displayCourses.length > 0 && (
          <View className="px-5 mb-5">
            <SectionHeader
              title={t('Continuer à apprendre', 'Kontinye aprann')}
              actionLabel={t('Voir tout', 'Wè tout')}
              onAction={() => navigation.navigate('Courses')}
            />
            <View className="gap-3">
              {displayCourses.map((course: any) => {
                const tint = courseTint(course.color);
                const totalLessons = countCourseLessons(course);
                const prog = progressByCourseId.get(course.id);
                const pct = calculateCompletionPercentage(prog, totalLessons);

                return (
                  <PressableScale
                    key={course.id}
                    onPress={() => goCourse(course)}
                    accessibilityRole="button"
                    accessibilityLabel={course.name}
                    style={{ ...cardSurface, padding: 16 }}
                  >
                    <View className="flex-row items-center gap-3">
                      <View
                        className="items-center justify-center flex-shrink-0"
                        style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '18' }}
                      >
                        <BookOpen color={tint} size={20} />
                      </View>
                      <View className="flex-1">
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.ink }} numberOfLines={2}>
                          {course.name}
                        </Text>
                        {/* Level pill removed — the course name already carries
                            the level (e.g. "Chimie NS1"), so it was redundant. */}
                        {totalLessons > 0 && (
                          <Text style={{ fontSize: 12, color: colors.faint, marginTop: 2 }}>
                            {totalLessons} {t('leçons', 'leson')}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: tint }}>{pct}%</Text>
                    </View>
                    {pct > 0 && (
                      <View className="mt-3">
                        <ProgressBar value={pct} color={tint} height={5} />
                      </View>
                    )}
                  </PressableScale>
                );
              })}
            </View>
          </View>
        )}

        {/* Readiness — the card renders its own title, so no duplicate heading */}
        <View className="px-5 mb-5">
          <ReadinessCard />
        </View>

        {/* Leaderboard */}
        <View className="px-5 mb-5">
          <SectionHeader
            title={t('Classement', 'Klasman')}
            actionLabel={t('Voir tout', 'Wè tout')}
            onAction={() => navigation.navigate('Profile')}
          />
          <Leaderboard compact maxRows={5} />
        </View>

        {/* Study plan — Sandra builds a personalized révision schedule */}
        <View className="px-5 mb-6">
          <PressableScale
            onPress={() => (navigation as any).navigate('StudyPlan')}
            accessibilityRole="button"
            accessibilityLabel={t("Mon plan d'étude", 'Plan etid mwen')}
            style={{ borderRadius: radius.card, overflow: 'hidden', ...shadow.md }}
          >
            <LinearGradient
              colors={['#2E86F0', '#1B6FE0', '#0857A6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radius.tile,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CalendarCheck color="#fff" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>
                  {t("Mon plan d'étude", 'Plan etid mwen')}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12.5, marginTop: 1 }}>
                  {t('Un programme de révision fait pour vous', 'Yon pwogram revizyon fèt pou ou')}
                </Text>
              </View>
              <ChevronRight color="#fff" size={18} />
            </LinearGradient>
          </PressableScale>
        </View>
      </ScrollView>

      {/* Sandra — AI tutor, always within thumb's reach */}
      <SandraFab onPress={() => (navigation as any).navigate('Sandra')} />
    </SafeAreaView>
  );
}
