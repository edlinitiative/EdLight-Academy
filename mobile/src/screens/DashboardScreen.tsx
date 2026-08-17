import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useNavigation, useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Zap, ChevronRight, CalendarCheck } from 'lucide-react-native';
import { courseSubjectIcon } from '../utils/subjectMeta';
import { FollowInstagramPrompt } from '../components/FollowInstagram';
import WeeklyGoalSheet from '../components/WeeklyGoalSheet';
import SandraFab from '../components/SandraFab';
import StreakFlame from '../components/ui/StreakFlame';
import useStore from '../contexts/store';
import { useCourses } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import { Skeleton, ErrorState } from '../components/StateViews';
import Avatar from '../components/ui/Avatar';
import PressableScale from '../components/ui/PressableScale';
import ProgressRing from '../components/ui/ProgressRing';
import ReadinessCard from '../components/ReadinessCard';
import VideoCoursesRail from '../components/VideoCoursesRail';
import { countQuizzesThisWeek, WEEKLY_QUIZ_GOAL } from '../utils/weeklyActivity';
import HomeWidgets from '../components/HomeWidgets';
import MissionCard from '../components/MissionCard';
import SmartSuggestion from '../components/SmartSuggestion';
import SeasonCountdown from '../components/SeasonCountdown';
import { gradeProfile } from '../config/trackConfig';
import Leaderboard from '../components/Leaderboard';
import ResumeBanner from '../components/ResumeBanner';
import { TabParamList } from '../navigation/TabNavigator';
import { useColors, useTheme, radius, courseTint, typeScale, gradients } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
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

/** A frosted momentum pill on the blue hero (streak, XP). */
function HeroPill({
  icon,
  value,
  valueColor = '#ffffff',
}: {
  icon: React.ReactNode;
  value: string | number;
  valueColor?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        borderRadius: radius.chip,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      {icon}
      <Text style={[typeScale.label, { color: valueColor }]} maxFontSizeMultiplier={1.3}>{value}</Text>
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
      <Text style={[typeScale.title, { color: colors.ink }]}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={() => { tapLight(); onAction(); }}
          className="flex-row items-center gap-1"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{actionLabel}</Text>
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
  const { colors, cardSurface } = useTheme();
  const { user, language, enrolledCourses, quizAttempts, lastActivity, grade, setPendingDailyChallenge } = useStore();
  const practiceMode = gradeProfile(grade).primaryTab === 'Quiz' ? 'quiz' : 'exams';
  const themeMode = useStore((s) => s.theme);
  const insets = useSafeAreaInsets();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const [goalSheetOpen, setGoalSheetOpen] = React.useState(false);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // The compact hero is deep blue and runs under the status bar, so its icons
  // must be light while this screen is focused; restore the app default on blur.
  useFocusEffect(
    React.useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(themeMode === 'dark' ? 'light' : 'dark');
    }, [themeMode]),
  );

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const { streak } = useStreak();
  const { progress: allProgress } = useAllProgress();
  const { myEntry } = useLeaderboard(25);

  const firstName = getFirstName(user);
  const greeting = isCreole ? 'Bonjou' : 'Bonjour';
  const weeklyXp = (myEntry as any)?.xp ?? 0;
  const allAttemptsList = Object.values(quizAttempts as Record<string, any[]>).flat();
  const quizzesThisWeek = countQuizzesThisWeek(allAttemptsList);

  // "Has used the app for a while" gate for the one-time Instagram prompt:
  // a 2-day streak, a few quizzes, or a few finished lessons all qualify.
  const lessonsDone = (allProgress ?? []).reduce(
    (sum: number, p: any) => sum + (p?.completedLessons?.length ?? 0), 0);
  const igPromptEligible =
    (streak?.currentStreak ?? 0) >= 2 || allAttemptsList.length >= 3 || lessonsDone >= 3;

  const progressByCourseId = React.useMemo(() => {
    const m = new Map<string, any>();
    for (const p of allProgress || []) {
      if (p?.courseId) m.set(p.courseId, p);
    }
    return m;
  }, [allProgress]);

  // "Continuer à apprendre" shows only ENROLLED courses now. The old fallback
  // (first 4 courses as plain text rows for the un-enrolled) never signalled
  // that these are video courses — the video rail below replaces it.
  const displayCourses = React.useMemo(() => {
    if (!courses || enrolledCourses.length === 0) return [];
    return enrolledCourses
      .slice(0, 4)
      .map((ec: any) => courses.find((c) => c.id === ec.id) ?? ec);
  }, [courses, enrolledCourses]);

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  // initial:false keeps CourseList mounted beneath CourseDetail, so back pops
  // to the course list (not the Home tab) and the Cours tab's pop-to-top works.
  // autoplay opens the first unfinished lesson so the tap lands on a playable page.
  const goCourse = (course: any) =>
    (navigation as any).navigate('Courses', {
      screen: 'CourseDetail',
      initial: false,
      params: { courseId: course.id, courseName: course.name, autoplay: true },
    });
  // "Voir tout" must always land on the course LIST — a bare navigate('Courses')
  // re-shows whatever the stack retained (e.g. a stale CourseDetail).
  const goCourseList = () =>
    (navigation as any).navigate('Courses', { screen: 'CourseList' });

  // ---------------------------------------------------------------------------
  // Grade-aware rail order
  // ---------------------------------------------------------------------------

  // Cours-first grades (NS1–NS3 lead with 'cours') surface "Continuer à
  // apprendre" above the at-a-glance stats; every other grade keeps stats first.
  const coursFirst = gradeProfile(grade).lead[0] === 'cours';
  const isBacTrack = gradeProfile(grade).examLevel === 'baccalaureat';

  // Video-course discovery — real video stills with a play chip, so a new
  // visitor immediately sees the platform HAS video courses. Leads with
  // "Cours en vidéo" for the un-enrolled; reads as discovery once enrolled.
  const videoRailBlock = (
    <VideoCoursesRail
      courses={courses}
      enrolledIds={enrolledCourses.map((c: any) => c.id)}
      onOpenCourse={goCourse}
      onSeeAll={goCourseList}
      title={
        enrolledCourses.length > 0
          ? t('Découvrir en vidéo', 'Dekouvri an videyo')
          : t('Cours en vidéo', 'Kou an videyo')
      }
    />
  );

  // Weekly goal — replaces the old Quiz/Cours/Moyenne stats row, which read as
  // a wall of zeros for new students. A target ("2 quiz sur 5") is motivating
  // at zero in a way a report card never is; lifetime stats live on Profile.
  const goalReached = quizzesThisWeek >= WEEKLY_QUIZ_GOAL;
  const goalSublabel = goalReached
    ? t('Objectif atteint — continue sur ta lancée !', 'Ou rive sou objektif la — kontinye konsa !')
    : quizzesThisWeek === 0
      ? t('Fais ton premier quiz — termine et gagne 1 gel 🧊', 'Fè premye quiz ou — fini epi genyen 1 jèl 🧊')
      : t(`${quizzesThisWeek} quiz sur ${WEEKLY_QUIZ_GOAL} — termine et gagne 1 gel 🧊`, `${quizzesThisWeek} quiz sou ${WEEKLY_QUIZ_GOAL} — fini epi genyen 1 jèl 🧊`);
  const weeklyGoalBlock = (
    <View className="px-5 mb-4">
      <PressableScale
        onPress={() => { tapLight(); setGoalSheetOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={`${t('Objectif de la semaine', 'Objektif semèn nan')}. ${goalSublabel}`}
        style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <ProgressRing
          value={Math.min(100, (quizzesThisWeek / WEEKLY_QUIZ_GOAL) * 100)}
          color={goalReached ? colors.success : colors.azure}
          size={46}
          strokeWidth={5}
          showLabel={false}
        />
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
            {t('Objectif de la semaine', 'Objektif semèn nan')}
          </Text>
          <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]} numberOfLines={1}>
            {goalSublabel}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[typeScale.titleSm, { color: colors.azure }]} maxFontSizeMultiplier={1.3}>
            {formatXp(weeklyXp)}
          </Text>
          <Text style={[typeScale.micro, { color: colors.faint }]}>{t('XP semaine', 'XP semèn')}</Text>
        </View>
      </PressableScale>
    </View>
  );

  const continueLearningBlock = displayCourses.length > 0 ? (
    <View className="px-5 mb-4">
      <SectionHeader
        title={t('Continuer à apprendre', 'Kontinye aprann')}
        actionLabel={t('Voir tout', 'Wè tout')}
        onAction={goCourseList}
      />
      <View className="gap-3">
        {displayCourses.map((course: any) => {
          const tint = courseTint(course.color);
          const SubjectIcon = courseSubjectIcon(course);
          const totalLessons = countCourseLessons(course);
          const prog = progressByCourseId.get(course.id);
          const pct = calculateCompletionPercentage(prog, totalLessons);

          return (
            <PressableScale
              key={course.id}
              onPress={() => goCourse(course)}
              accessibilityRole="button"
              accessibilityLabel={course.name}
              style={{ ...cardSurface, padding: 14 }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="items-center justify-center flex-shrink-0"
                  style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '18' }}
                >
                  <SubjectIcon color={tint} size={20} />
                </View>
                <View className="flex-1">
                  {/* Single subject tag = the course name itself, which already
                      carries the level (e.g. "Chimie NS1") — no redundant pills. */}
                  <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={2}>
                    {course.name}
                  </Text>
                  {totalLessons > 0 && (
                    <Text style={[typeScale.caption, { color: colors.faint, marginTop: 2 }]}>
                      {totalLessons} {t('leçons', 'leson')}
                    </Text>
                  )}
                </View>
                {/* Circular progress ring (conic-style via SVG) */}
                <ProgressRing value={pct} color={tint} size={46} strokeWidth={5} />
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  ) : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: gradients.hero[0] }} edges={[]}>
      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: colors.bg }}
        className="flex-1"
        contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
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
        {/* Overscroll filler — paint the pull-down-past-top region in the hero
            colour so it never reveals a grey gap above the hero. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: -400, left: 0, right: 0, height: 400, backgroundColor: gradients.hero[0] }} />

        {/* Compact gradient hero — identity + momentum as one continuous band.
            Runs under the status bar (paddingTop = safe inset) and rounds off at
            the bottom so the resume banner can overlap it just below. */}
        <LinearGradient
          colors={gradients.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            paddingTop: insets.top + 10,
            paddingHorizontal: 20,
            paddingBottom: 22,
            borderBottomLeftRadius: 26,
            borderBottomRightRadius: 26,
          }}
        >
          <View className="flex-row items-center">
            {/* Real-photo avatar (seeded by uid) — tap to open the profile. */}
            <TouchableOpacity
              onPress={() => { tapLight(); navigation.navigate('Profile'); }}
              activeOpacity={0.8}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Ouvrir le profil', 'Louvri pwofil la')}
            >
              <Avatar
                name={user?.name || user?.displayName || ''}
                seed={user?.uid || ''}
                size={44}
                radius={14}
              />
            </TouchableOpacity>

            <View className="flex-1 px-3">
              <Text style={[typeScale.h2, { color: '#ffffff' }]} numberOfLines={1}>
                {greeting}, {firstName || t('Étudiant', 'Elèv')} 👋
              </Text>
              <Text style={[typeScale.caption, { color: '#bfdbfe', marginTop: 1 }]} numberOfLines={1}>
                {t('Prêt à apprendre ?', 'Ou pare pou aprann ?')}
              </Text>
            </View>

            <View
              className="flex-row items-center gap-2"
              accessible
              accessibilityLabel={`${t('Série', 'Seri')} ${streak?.currentStreak ?? 0} ${t('jours', 'jou')}, ${weeklyXp} XP ${t('cette semaine', 'semèn sa a')}`}
            >
              <HeroPill
                icon={<StreakFlame count={streak?.currentStreak ?? 0} color="#fecaca" size={14} />}
                value={streak?.currentStreak ?? 0}
              />
              <HeroPill
                icon={<Zap color="#fde68a" size={14} />}
                value={formatXp(weeklyXp)}
                valueColor="#fde68a"
              />
            </View>
          </View>
        </LinearGradient>

        {/* Resume banner — overlaps just under the hero as a layered card. Its
            deep-link logic is unchanged; only its placement/elevation here. */}
        {lastActivity ? (
          <View className="px-5" style={{ marginTop: -12, zIndex: 2 }}>
            <ResumeBanner />
          </View>
        ) : null}

        {/* Mission du jour — the page's single "do this now" card. Absorbs the
            old Défi du jour tile and the first-run nudge; flips to a quiet
            success row once today's challenge is done. */}
        <View className="px-5 mt-4">
          <MissionCard onStart={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }} />
        </View>

        {/* Quick actions — one compact row (was a 2×2 grid). */}
        <View className="px-5 mt-4 mb-4">
          <HomeWidgets
            onNavigateExams={() => navigation.navigate('Exams')}
            onNavigateTrivia={() => navigation.navigate('Trivia')}
            onNavigateCourses={goCourseList}
            onNavigateLeaderboard={() => (navigation as any).navigate('Leaderboard')}
            enrolledCount={enrolledCourses.length}
            practiceMode={practiceMode}
          />
        </View>

        {/* Season-aware recommendation — pushes the next step (choose filière,
            switch to Préfac once the Bac is over, or revise for the Bac).
            Self-hides (and takes its margin with it) when there's nothing. */}
        <SmartSuggestion />

        {/* Season/grade countdown — the one date that matters for this grade
            (Bac / 9ème / Préfac prep). Self-hides for grades with no exam. */}
        <SeasonCountdown />

        {/* Weekly goal + Continue learning + video discovery. Order flips by
            grade: cours-first grades (NS1–NS3) lead with courses; all other
            grades keep the goal card first. The video rail always follows the
            course content it advertises. */}
        {coursFirst ? (
          <>
            {continueLearningBlock}
            {videoRailBlock}
            {weeklyGoalBlock}
          </>
        ) : (
          <>
            {weeklyGoalBlock}
            {continueLearningBlock}
            {videoRailBlock}
          </>
        )}

        {/* One-time community nudge — only once the student has real usage
            behind them (streak / quizzes / lessons), never on first open.
            The component self-hides forever after follow or dismiss. */}
        {igPromptEligible && (
          <View className="px-5 mb-4">
            <FollowInstagramPrompt />
          </View>
        )}

        {/* Readiness — Bac-track only. The "Score de préparation" is scored on Bac
            papers, so it's noise for prefac/lower grades (same gate as Profile).
            The card renders its own title, so no duplicate heading. */}
        {isBacTrack && (
          <View className="px-5 mb-4">
            <ReadinessCard
              onFocusPress={(subject) =>
                (navigation as any).navigate('Exams', {
                  screen: 'ExamBrowser',
                  params: { level: 'terminale', subject },
                })
              }
            />
          </View>
        )}

        {/* Leaderboard — compact teaser; "Voir tout" (and the card) open the
            dedicated full-page classement on the root stack. */}
        <View className="px-5 mb-4">
          <SectionHeader
            title={t('Classement', 'Klasman')}
            actionLabel={t('Voir tout', 'Wè tout')}
            onAction={() => (navigation as any).navigate('Leaderboard')}
          />
          <PressableScale
            onPress={() => { tapLight(); (navigation as any).navigate('Leaderboard'); }}
            accessibilityRole="button"
            accessibilityLabel={t('Classement', 'Klasman')}
          >
            <Leaderboard compact maxRows={5} />
          </PressableScale>
        </View>

        {/* Study plan — secondary. De-emphasized now that the Bac is over and
            the daily practice loop (défi, jeux, examens) leads the home. Kept as
            a quiet entry point rather than a prominent gradient CTA; will be
            re-centered around prefac when that content lands. */}
        <View className="px-5 mb-6">
          <PressableScale
            onPress={() => (navigation as any).navigate('StudyPlan')}
            accessibilityRole="button"
            accessibilityLabel={t("Mon plan d'étude", 'Plan etid mwen')}
            style={{ ...cardSurface, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View
              style={{
                width: 38, height: 38, borderRadius: radius.tile,
                backgroundColor: colors.azure + '14',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CalendarCheck color={colors.azure} size={19} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
                {t("Mon plan d'étude", 'Plan etid mwen')}
              </Text>
              <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]}>
                {t('Planifier mes révisions', 'Planifye revizyon mwen')}
              </Text>
            </View>
            <ChevronRight color={colors.faint} size={18} />
          </PressableScale>
        </View>
      </ScrollView>

      {/* Sandra — AI tutor, always within thumb's reach */}
      <SandraFab onPress={() => (navigation as any).navigate('Sandra')} />

      {/* Weekly goal detail — explains the goal + reward before acting */}
      <WeeklyGoalSheet
        visible={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        quizzesThisWeek={quizzesThisWeek}
        weeklyXp={weeklyXp}
        onStartQuiz={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }}
        onSeeLeaderboard={() => (navigation as any).navigate('Leaderboard')}
      />
    </SafeAreaView>
  );
}
