import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Search as SearchIcon, RotateCcw } from 'lucide-react-native';
import { courseVideoThumbs, lessonVideoThumbs } from '../utils/videoThumb';
import { FollowInstagramPrompt } from '../components/FollowInstagram';
import WeeklyGoalSheet from '../components/WeeklyGoalSheet';
import SandraFab, { useSandraFabScroll, SANDRA_FAB_CLEARANCE } from '../components/SandraFab';
import useStore from '../contexts/store';
import { useCourses } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { useLeaderboard } from '../hooks/useLeaderboard';
import Avatar from '../components/ui/Avatar';
import { useMyAvatar } from '../hooks/useMyAvatar';
import PageTitle from '../components/ui/PageTitle';
import SectionHeader from '../components/ui/SectionHeader';
import SkeletonCover from '../components/ui/SkeletonCover';
import PressableScale from '../components/ui/PressableScale';
import { type ProgressMap } from '../utils/mastery';
import ReadinessCard from '../components/ReadinessCard';
import { countQuizzesThisWeek, WEEKLY_QUIZ_GOAL } from '../utils/weeklyActivity';
import { gradeProfile, seasonAnchorYear } from '../config/trackConfig';
import Leaderboard from '../components/Leaderboard';
import ResumeBanner from '../components/ResumeBanner';
import NextStepCard from '../components/NextStepCard';
import TournamentCard from '../components/TournamentCard';
import ReviewSession from '../components/ReviewSession';
import { computeNextStep } from '../utils/nextStep';
import { dueQuestionIds } from '../utils/review';
import { TabParamList } from '../navigation/TabNavigator';
import { resetTabToRoot } from '../navigation/navHelpers';
import { useTheme } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { tapLight } from '../utils/haptics';
import { displayLevel } from '../utils/courseName';
import ProgressSummary from '../components/journey/home/ProgressSummary';
import {
  completedByCourse as toCompletedByCourse, progressCourses, locateLesson,
} from '../components/journey/home/homeJourney';
import TodayPair from '../components/home/TodayPair';
import CourseRail, { CourseRailSkeleton } from '../components/home/CourseRail';
import ClassPickerCard, { HowItWorksCard } from '../components/home/ClassPickerCard';
import { railCourses } from '../components/home/homeLayout';
import SpotlightCard, { type SpotlightTarget } from '../components/home/SpotlightCard';
import { useHomeSpotlight } from '../components/home/useHomeSpotlight';

type Nav = BottomTabNavigationProp<TabParamList>;

/** Page gutter and section rhythm (DIRECTION §1: 20 / 28). */
const GUTTER = 20;
const SECTION_GAP = 28;

/**
 * A course section that could not load (audit #5): said locally, with its own
 * retry — the rest of Home (daily activity, Arena, review, shortcuts) stays.
 */
function CourseFeedError({ onRetry, isCreole }: { onRetry: () => void; isCreole: boolean }) {
  const { colors, cardSurface, typeScale, fonts } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View style={{ ...cardSurface, padding: 20 }} accessibilityLiveRegion="polite">
      <Text style={[typeScale.cardTitle, { color: colors.ink }]}>
        {t("Les cours n'ont pas pu se charger", 'Kou yo pa t ka chaje')}
      </Text>
      <Text style={[typeScale.instruction, { color: colors.muted, marginTop: 4 }]}>
        {t(
          'Vérifie ta connexion. Le reste de ton accueil fonctionne toujours.',
          'Verifye koneksyon ou. Rès paj lakay ou a toujou mache.',
        )}
      </Text>
      <PressableScale
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('Réessayer de charger les cours', 'Eseye chaje kou yo ankò')}
        style={{
          marginTop: 14, minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: colors.azureSoft, borderRadius: 12, paddingHorizontal: 16,
        }}
      >
        <RotateCcw color={colors.azureInk} size={16} strokeWidth={2.4} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.azureInk }}>{t('Réessayer', 'Eseye ankò')}</Text>
      </PressableScale>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  // Sandra's button steps aside while the student scrolls, so it never sits
  // on a card they are reading.
  const fab = useSandraFabScroll();
  const { colors } = useTheme();
  const { user, language, enrolledCourses, quizAttempts, lastActivity, grade, gradeChosen, setPendingDailyChallenge, progress: lessonProgress, review } = useStore();
  const { avatar: myAvatar } = useMyAvatar();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const [goalSheetOpen, setGoalSheetOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const { streak } = useStreak();
  const { progress: allProgress } = useAllProgress();
  const { myEntry } = useLeaderboard(25);
  // Something time-sensitive the student can act on now (the Arène event, a
  // tournament they are in) — when present it is the FIRST content card.
  const spotlight = useHomeSpotlight();

  const weeklyXp = (myEntry as any)?.xp ?? 0;
  const allAttemptsList = Object.values(quizAttempts as Record<string, any[]>).flat();
  const quizzesThisWeek = countQuizzesThisWeek(allAttemptsList);

  // "Has used the app for a while" gate for the one-time Instagram prompt:
  // a 2-day streak, a few quizzes, or a few finished lessons all qualify.
  const completedMap = React.useMemo(() => toCompletedByCourse(allProgress), [allProgress]);
  const lessonsDone = (allProgress ?? []).reduce(
    (sum: number, p: any) => sum + (p?.completedLessons?.length ?? 0), 0);
  const igPromptEligible =
    (streak?.currentStreak ?? 0) >= 2 || allAttemptsList.length >= 3 || lessonsDone >= 3;

  // The one dominant "what now?" answer — resume, review, or the next rung of
  // the mastery ladder (utils/nextStep). Recomputed as the inputs change; the
  // card below the hero renders it.
  const dueReviewCount = React.useMemo(() => dueQuestionIds(review).length, [review]);
  // `courses` is undefined while loading / after a failure: the engine then
  // still resolves exam, review and the saved lesson activity (audit #5).
  const nextStep = React.useMemo(
    () => computeNextStep({
      courses,
      enrolledCourses,
      progress: lessonProgress as ProgressMap,
      lastActivity,
      dueReviewCount,
      now: Date.now(),
      grade,
      gradeChosen,
      completedByCourse: completedMap,
    }),
    [courses, enrolledCourses, lessonProgress, lastActivity, dueReviewCount, grade, gradeChosen, completedMap],
  );

  // The next-step card leads with the LESSON's own still (DIRECTION §0.4:
  // the real thumbnail of what the tap opens), then the course's chosen cover.
  const nextStepThumb = React.useMemo(() => {
    if (!nextStep || !courses) return [];
    const ls = nextStep.kind === 'lesson'
      ? nextStep
      : nextStep.kind === 'welcome-back'
        ? (nextStep.target ?? null)
        : nextStep.kind === 'choose-class' || nextStep.kind === 'uncovered'
          ? (nextStep.suggestion ?? null)
          : null;
    const c = ls?.courseId ? courses.find((x) => x.id === ls.courseId) : null;
    if (!c) return [];
    const at = locateLesson(c, ls?.lessonId);
    const own = at ? lessonVideoThumbs(at.lesson?.videoUrl, at.lesson?.thumbnail) : [];
    const course = courseVideoThumbs(c);
    return [...own, ...course.filter((u) => !own.includes(u))];
  }, [nextStep, courses]);

  // "Mes cours": enrolled, worked-in, then the rest of the class.
  const rail = React.useMemo(
    () => railCourses({
      courses,
      enrolledIds: enrolledCourses.map((c: any) => c.id),
      mastery: lessonProgress as ProgressMap,
      completedByCourse: completedMap,
      grade,
    }),
    [courses, enrolledCourses, lessonProgress, completedMap, grade],
  );
  // Every course with evidence feeds the progression totals (not just 3).
  const evidenceRows = React.useMemo(
    () => progressCourses({ courses, mastery: lessonProgress as ProgressMap, completedByCourse: completedMap, grade, limit: 999 }),
    [courses, lessonProgress, completedMap, grade],
  );

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  // No full-screen guards: the shell, daily activity, Arena and shortcuts
  // never depend on the course feed. Course sections load/fail locally.
  const coursesPending = !courses && isLoading;
  const coursesFailed = !courses && isError;
  // No class yet (skipped the question): Stitch 02's first-visit layout.
  const isNew = !grade;

  // initial:false keeps CourseList mounted beneath CourseDetail, so back pops
  // to the course list (not the Home tab) and the Cours tab's pop-to-top works.
  // autoplay opens the first unfinished lesson so the tap lands on a playable page.
  const goCourse = (course: any) =>
    (navigation as any).navigate('Courses', {
      screen: 'CourseDetail',
      initial: false,
      params: { courseId: course.id, courseName: course.name, autoplay: true },
    });
  // "Voir tout" must always land on the course LIST ROOT. React Navigation 7's
  // `navigate` no longer pops back to a screen already in the stack — it pushes
  // a SECOND CourseList on top of the retained CourseDetail — so we reset the
  // tab's stack instead (see navHelpers). The nonce clears CourseList's own
  // level/subject drill-down too.
  const goCourseList = () =>
    resetTabToRoot(navigation, 'Courses', 'CourseList', { resetAt: Date.now() });
  const startDaily = () => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); };
  // PressableScale already gives the tap its haptic.
  const openSpotlight = (target: SpotlightTarget) =>
    (navigation as any).navigate(target.screen, target.params);
  // Owner feedback (build 61): an open/live event is "the main thing on the
  // page" — a content card, first in the flow (memory: no-hero-bands).
  const spotlightBlock = spotlight ? (
    <SpotlightCard item={spotlight} isCreole={isCreole} onOpen={openSpotlight} />
  ) : null;

  // Require a KNOWN grade: gradeProfile(null) falls through to the NS4/Bac
  // default, so a student who tapped "Passer" was shown Bac readiness.
  const isBacTrack = !!grade && gradeProfile(grade).examLevel === 'baccalaureat';
  const levelBadge = grade && /^NS[1-4]$/.test(grade) ? displayLevel(grade) : null;

  // Momentum, as one quiet line under the weekly meter, only when there is
  // something real to say (memory: no-hero-bands — never a stat strip).
  const streakDays = streak?.currentStreak ?? 0;
  const bacDays = Math.max(0, Math.ceil((new Date(seasonAnchorYear(new Date()), 6, 5).getTime() - Date.now()) / 86_400_000));
  const momentumLine = [
    streakDays > 0 ? t(`Série : ${streakDays} j`, `Seri : ${streakDays} j`) : null,
    isBacTrack ? t(`Bac dans ${bacDays} j`, `Bak nan ${bacDays} j`) : null,
  ].filter(Boolean).join(' · ') || null;

  // ---------------------------------------------------------------------------
  // Blocks
  // ---------------------------------------------------------------------------

  // THE next action (LJ-01) — resume the exact lesson / exam / review / a real
  // first lesson. It survives a course-feed failure when saved state can
  // answer (audit #5); when it can't, the region says so locally.
  const nextStepBlock = nextStep ? (
    <NextStepCard step={nextStep} thumbs={nextStepThumb} reviewDue={dueReviewCount} onOpenReview={() => setReviewOpen(true)} />
  ) : coursesPending ? (
    <SkeletonCover style={{ borderRadius: 24 }} />
  ) : coursesFailed ? (
    <CourseFeedError onRetry={() => refetch()} isCreole={isCreole} />
  ) : lastActivity ? (
    <ResumeBanner />
  ) : null;

  const courseSection = (
    <>
      <SectionHeader
        title={t('Mes cours', 'Kou mwen yo')}
        badge={levelBadge}
        actionLabel={t('Voir tout', 'Wè tout')}
        onAction={() => { tapLight(); goCourseList(); }}
        style={{ marginTop: SECTION_GAP, paddingHorizontal: GUTTER }}
      />
      {coursesPending ? (
        <CourseRailSkeleton />
      ) : coursesFailed ? (
        // Shown here only when the next-step card above did not already say it.
        nextStep ? <View style={{ paddingHorizontal: GUTTER }}><CourseFeedError onRetry={() => refetch()} isCreole={isCreole} /></View> : null
      ) : (
        <CourseRail rows={rail} isCreole={isCreole} onOpenCourse={goCourse} />
      )}
    </>
  );
  const showCourseSection = coursesPending || (coursesFailed && !!nextStep) || rail.length > 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: colors.bg }}
        className="flex-1"
        contentContainerStyle={[{ paddingBottom: 100 + SANDRA_FAB_CLEARANCE }, centerColumn]}
        showsVerticalScrollIndicator={false}
        onScroll={fab.onScroll}
        scrollEventThrottle={16}
        onScrollEndDrag={fab.onRest}
        onMomentumScrollEnd={fab.onRest}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={colors.azure}
            colors={[colors.azure]}
          />
        }
      >
        {/* One confident title row + its controls, then content right away
            (memory: no-hero-bands — no greeting, no stat band). */}
        <PageTitle
          title={t('Accueil', 'Akèy')}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { tapLight(); navigation.getParent()?.navigate('Search'); }}
                activeOpacity={0.8}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('Rechercher', 'Chèche')}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}
              >
                <SearchIcon size={20} color={colors.ink} strokeWidth={2.2} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { tapLight(); navigation.navigate('Profile'); }}
                activeOpacity={0.8}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('Ouvrir le profil', 'Louvri pwofil la')}
              >
                <Avatar name={user?.name || user?.displayName || ''} seed={user?.uid || ''} config={myAvatar} size={44} radius={22} />
              </TouchableOpacity>
            </View>
          }
          style={{ paddingTop: 8, minHeight: 56 }}
        />

        {isNew ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: 16, gap: 20 }}>
            {spotlightBlock}
            {/* Stitch 02: ask the class where the content will appear, then a
                real first lesson, then how the ladder works. */}
            <ClassPickerCard />
            {nextStepBlock}
            <HowItWorksCard />
          </View>
        ) : (
          <>
            {spotlightBlock ? (
              <View style={{ paddingHorizontal: GUTTER, marginTop: 16 }}>{spotlightBlock}</View>
            ) : null}
            <View style={{ paddingHorizontal: GUTTER, marginTop: spotlightBlock ? 20 : 16 }}>{nextStepBlock}</View>

            {/* Aujourd'hui: the daily challenge + the Arène, side by side —
                the Arène tile steps aside while its event is the first card. */}
            <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
              <TodayPair
                onStartDaily={startDaily}
                school={(myEntry as any)?.school ?? null}
                hideArena={spotlight?.kind === 'arena'}
              />
            </View>

            {/* Evidence of progress (LJ-10) + this week's goal. */}
            <View style={{ paddingHorizontal: GUTTER, marginTop: 20 }}>
              <ProgressSummary
                rows={evidenceRows}
                isCreole={isCreole}
                weekDone={quizzesThisWeek}
                weekGoal={WEEKLY_QUIZ_GOAL}
                momentumLine={momentumLine}
                onOpenGoal={() => setGoalSheetOpen(true)}
              />
            </View>

            {showCourseSection ? courseSection : null}
          </>
        )}

        {/* Readiness — Bac-track only (same gate as Profile). */}
        {isBacTrack && (
          <View style={{ paddingHorizontal: GUTTER, marginTop: SECTION_GAP }}>
            <ReadinessCard
              // initial:false keeps ExamLanding mounted beneath ExamBrowser.
              onFocusPress={(subject) =>
                (navigation as any).navigate('Exams', {
                  screen: 'ExamBrowser',
                  initial: false,
                  params: { level: 'terminale', subject },
                })
              }
            />
          </View>
        )}

        {!isNew ? (
          <>
            <View style={{ paddingHorizontal: GUTTER }}>
              <SectionHeader
                title={t('Classement', 'Klasman')}
                actionLabel={t('Voir tout', 'Wè tout')}
                onAction={() => { tapLight(); (navigation as any).navigate('Leaderboard'); }}
                style={{ marginTop: SECTION_GAP }}
              />
              {/* The school race sits directly above the personal board: the
                  collective ranking is what makes students recruit. It
                  self-hides, so it carries its own bottom gap. */}
              <View style={{ gap: 14 }}>
              <TournamentCard />
              <PressableScale
                onPress={() => { tapLight(); (navigation as any).navigate('Leaderboard'); }}
                pressedScale={0.99}
                accessibilityRole="button"
                accessibilityLabel={t('Classement', 'Klasman')}
              >
                <Leaderboard compact maxRows={3} />
              </PressableScale>
              </View>
            </View>
          </>
        ) : null}

        {/* One-time community nudge — only once there is real usage behind it.
            The component self-hides forever after follow or dismiss. */}
        {igPromptEligible && (
          <View style={{ paddingHorizontal: GUTTER, marginTop: SECTION_GAP }}>
            <FollowInstagramPrompt />
          </View>
        )}
      </ScrollView>

      {/* Sandra — AI tutor, always within thumb's reach */}
      <SandraFab hidden={fab.hidden} onPress={() => (navigation as any).navigate('Sandra')} />

      {/* Revizyon — a quiz built from the student's own missed questions */}
      <ReviewSession
        visible={reviewOpen}
        onClose={() => setReviewOpen(false)}
        isCreole={isCreole}
      />

      {/* Weekly goal detail — explains the goal + reward before acting */}
      <WeeklyGoalSheet
        visible={goalSheetOpen}
        onClose={() => setGoalSheetOpen(false)}
        quizzesThisWeek={quizzesThisWeek}
        weeklyXp={weeklyXp}
        onStartQuiz={startDaily}
        onSeeLeaderboard={() => (navigation as any).navigate('Leaderboard')}
      />
    </SafeAreaView>
  );
}
