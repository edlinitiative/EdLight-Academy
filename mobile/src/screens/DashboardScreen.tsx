import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ChevronRight, CalendarCheck, Search as SearchIcon, RotateCcw } from 'lucide-react-native';
import { courseVideoThumb, courseVideoThumbs } from '../utils/videoThumb';
import { FollowInstagramPrompt } from '../components/FollowInstagram';
import WeeklyGoalSheet from '../components/WeeklyGoalSheet';
import SandraFab from '../components/SandraFab';
import useStore from '../contexts/store';
import { useCourses } from '../hooks/useData';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { Skeleton } from '../components/StateViews';
import Avatar from '../components/ui/Avatar';
import PressableScale from '../components/ui/PressableScale';
import ProgressRing from '../components/ui/ProgressRing';
import { type ProgressMap } from '../utils/mastery';
import ReadinessCard from '../components/ReadinessCard';
import VideoCoursesRail from '../components/VideoCoursesRail';
import { countQuizzesThisWeek, WEEKLY_QUIZ_GOAL } from '../utils/weeklyActivity';
import MissionCard from '../components/MissionCard';
import { gradeProfile, seasonAnchorYear } from '../config/trackConfig';
import Leaderboard from '../components/Leaderboard';
import ResumeBanner from '../components/ResumeBanner';
import NextStepCard from '../components/NextStepCard';
import TournamentCard from '../components/TournamentCard';
import ArenaAnnounceCard from '../components/ArenaAnnounceCard';
import StreakFlame from '../components/celebration/StreakFlame';
import ReviewCard from '../components/ReviewCard';
import ReviewSession from '../components/ReviewSession';
import { computeNextStep } from '../utils/nextStep';
import { dueQuestionIds } from '../utils/review';
import { TabParamList } from '../navigation/TabNavigator';
import { resetTabToRoot } from '../navigation/navHelpers';
import { useColors, useTheme, radius, courseTint, typeScale, displayScale } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { tapLight } from '../utils/haptics';
import ProgressSummary from '../components/journey/home/ProgressSummary';
import {
  completedByCourse as toCompletedByCourse, progressCourses, summarizeCourse, evidenceLine,
} from '../components/journey/home/homeJourney';

type Nav = BottomTabNavigationProp<TabParamList>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countCourseLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  const count = units.reduce((sum: number, u: any) => sum + (u?.lessons?.length || 0), 0);
  return count || units.length || course?.videoCount || 0;
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

/** Placeholder for a course-backed section while the catalogue loads. */
function SectionSkeleton({ height }: { height: number }) {
  return <Skeleton height={height} radius={radius.card} />;
}

/**
 * A course section that could not load (audit #5): said locally, with its own
 * retry — the rest of Home (daily activity, Arena, review, shortcuts) stays.
 */
function CourseFeedError({ onRetry, isCreole }: { onRetry: () => void; isCreole: boolean }) {
  const { colors, cardSurface } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View style={{ ...cardSurface, padding: 16 }} accessibilityLiveRegion="polite">
      <Text style={[typeScale.title, { color: colors.ink }]}>
        {t("Les cours n'ont pas pu se charger", 'Kou yo pa t ka chaje')}
      </Text>
      <Text style={[typeScale.instruction, { color: colors.muted, marginTop: 4 }]}>
        {t(
          'Vérifie ta connexion. Le reste de ton accueil fonctionne toujours.',
          'Verifye koneksyon ou. Rès paj lakay ou a toujou mache.',
        )}
      </Text>
      <TouchableOpacity
        onPress={() => { tapLight(); onRetry(); }}
        accessibilityRole="button"
        accessibilityLabel={t('Réessayer de charger les cours', 'Eseye chaje kou yo ankò')}
        style={{
          marginTop: 12, minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
          borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: 14,
        }}
      >
        <RotateCcw color={colors.azure} size={16} />
        <Text style={[typeScale.action, { color: colors.azure }]}>{t('Réessayer', 'Eseye ankò')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { colors, cardSurface } = useTheme();
  const { user, language, enrolledCourses, quizAttempts, lastActivity, grade, gradeChosen, setPendingDailyChallenge, progress: lessonProgress, review } = useStore();
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

  // "Continuer à apprendre" shows only ENROLLED courses now. The old fallback
  // (first 4 courses as plain text rows for the un-enrolled) never signalled
  // that these are video courses — the video rail below replaces it.
  const displayCourses = React.useMemo(() => {
    if (!courses || enrolledCourses.length === 0) return [];
    return enrolledCourses
      .slice(0, 4)
      .map((ec: any) => courses.find((c) => c.id === ec.id) ?? ec);
  }, [courses, enrolledCourses]);

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

  // LJ-10: evidence per course, real denominators, only where work exists.
  const progressRows = React.useMemo(
    () => progressCourses({ courses, mastery: lessonProgress as ProgressMap, completedByCourse: completedMap, grade }),
    [courses, lessonProgress, completedMap, grade],
  );

  // The next-step card leads with the course's own video still when it points
  // at a course (a lesson, or a welcome-back resume of one).
  const nextStepThumb = React.useMemo(() => {
    if (!nextStep || !courses) return [];
    const courseId = nextStep.kind === 'lesson'
      ? nextStep.courseId
      : nextStep.kind === 'welcome-back'
        ? (nextStep.target?.courseId ?? null)
        : nextStep.kind === 'choose-class'
          ? (nextStep.suggestion?.courseId ?? null)
          : null;
    const c = courseId ? courses.find((x) => x.id === courseId) : null;
    return c ? courseVideoThumbs(c) : [];
  }, [nextStep, courses]);

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  // No full-screen guards: the shell, daily activity, Arena and shortcuts
  // never depend on the course feed. Course sections load/fail locally.
  const coursesPending = !courses && isLoading;
  const coursesFailed = !courses && isError;

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
  // tab's stack instead (see navHelpers). CourseList also keeps its own
  // level/subject drill-down in local state, so the nonce tells it to clear that
  // too — otherwise this re-showed the last sub-list ("voir tout opens the
  // chemistry one").
  const goCourseList = () =>
    resetTabToRoot(navigation, 'Courses', 'CourseList', { resetAt: Date.now() });

  // ---------------------------------------------------------------------------
  // Grade-aware rail order
  // ---------------------------------------------------------------------------

  // Cours-first grades (NS1–NS3 lead with 'cours') surface "Continuer à
  // apprendre" above the at-a-glance stats; every other grade keeps stats first.
  const coursFirst = gradeProfile(grade).lead[0] === 'cours';
  // Require a KNOWN grade: gradeProfile(null) falls through to the NS4/Bac
  // default, so a student who tapped "Passer" on the class question was shown
  // Bac readiness scoring regardless of what year they're actually in.
  const isBacTrack = !!grade && gradeProfile(grade).examLevel === 'baccalaureat';

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
    ? t('Objectif atteint, continue sur ta lancée !', 'Ou rive sou objektif la, kontinye konsa !')
    : quizzesThisWeek === 0
      ? t('Fais ton premier quiz, gagne 1 gel de série', 'Fè premye quiz ou, genyen 1 jèl seri')
      : t(`${quizzesThisWeek}/${WEEKLY_QUIZ_GOAL} quiz, gagne 1 gel de série`, `${quizzesThisWeek}/${WEEKLY_QUIZ_GOAL} quiz, genyen 1 jèl seri`);
  // Momentum lives INSIDE this card now: the separate stat strip was a band
  // (memory: no-hero-bands). Streak and, for the Bac track, the one date that
  // matters — as one quiet line, only when there is something to say.
  const streakDays = streak?.currentStreak ?? 0;
  const bacDays = Math.max(0, Math.ceil((new Date(seasonAnchorYear(new Date()), 6, 5).getTime() - Date.now()) / 86_400_000));
  const momentumLine = [
    streakDays > 0 ? t(`Série : ${streakDays} j`, `Seri : ${streakDays} j`) : null,
    isBacTrack ? t(`Bac dans ${bacDays} j`, `Bak nan ${bacDays} j`) : null,
  ].filter(Boolean).join(' · ');
  const weeklyGoalBlock = (
    <View className="px-5 mb-4">
      <PressableScale
        onPress={() => { tapLight(); setGoalSheetOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={`${t('Objectif de la semaine', 'Objektif semèn nan')}. ${goalSublabel}${momentumLine ? `. ${momentumLine}` : ''}`}
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
          {/* Two lines: at one line the reward ("gagne 1 gel 🧊") — the whole
              reason to act — was being truncated away on an iPhone-width card. */}
          <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]} numberOfLines={2}>
            {goalSublabel}
          </Text>
          {momentumLine ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              {streakDays > 0 ? <StreakFlame size={14} alive leapKey={streakDays} /> : null}
              <Text style={[typeScale.caption, { color: colors.muted }]} numberOfLines={1}>{momentumLine}</Text>
            </View>
          ) : null}
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
      {/* "Continuer" now belongs to the NextStepCard; this list is the shelf. */}
      <SectionHeader
        title={t('Mes cours', 'Kou mwen yo')}
        actionLabel={t('Voir tout', 'Wè tout')}
        onAction={goCourseList}
      />
      <View>
        {displayCourses.map((course: any) => {
          const tint = courseTint(course.color);
          const totalLessons = countCourseLessons(course);
          // Same source as the Cours tab: lessons finished, one thin bar.
          const ev = summarizeCourse(course, lessonProgress as ProgressMap, completedMap.get(course.id));
          const done = ev.completed;
          const thumb = courseVideoThumb(course);

          return (
            <PressableScale
              key={course.id}
              onPress={() => goCourse(course)}
              accessibilityRole="button"
              accessibilityLabel={done > 0 ? `${course.name}. ${evidenceLine(ev, isCreole)}` : course.name}
              style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}
            >
              <View className="flex-row items-center gap-3" style={{ paddingVertical: 13 }}>
                {thumb ? (
                  <Image
                    source={{ uri: thumb }}
                    resizeMode="cover"
                    style={{ width: 84, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt }}
                  />
                ) : (
                  <View style={{ width: 84, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: tint, opacity: 0.5 }} />
                  </View>
                )}
                <View className="flex-1">
                  {/* Single subject tag = the course name itself, which already
                      carries the level (e.g. "Chimie NS1") — no redundant pills. */}
                  <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={1}>
                    {course.name}
                  </Text>
                  {done > 0 && totalLessons > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
                      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.hairline }}>
                        <View style={{ width: `${Math.min(100, Math.round((done / totalLessons) * 100))}%`, height: 4, borderRadius: 2, backgroundColor: colors.azure }} />
                      </View>
                    </View>
                  ) : null}
                  {done > 0 && totalLessons > 0 ? (
                    <Text style={[typeScale.caption, { color: colors.muted, marginTop: 4 }]} numberOfLines={1}>
                      {evidenceLine(ev, isCreole)}
                    </Text>
                  ) : (
                    <Text style={[typeScale.caption, { color: colors.faint, marginTop: 4 }]}>
                      {totalLessons > 0
                        ? `${totalLessons} ${t('leçons', 'leson')}`
                        : t('Pas encore commencé', 'Poko kòmanse')}
                    </Text>
                  )}
                </View>
                <ChevronRight color={colors.faint} size={16} />
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
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
        {/* One confident title row + its controls, then content right away
            (memory: no-hero-bands — no greeting, no stat band). */}
        <View className="px-5 pt-5 flex-row items-center justify-between">
          <Text style={[displayScale.xl, { color: colors.ink, flex: 1, paddingRight: 12 }]} numberOfLines={1} accessibilityRole="header">
            {t('Accueil', 'Akèy')}
          </Text>
          <TouchableOpacity
            onPress={() => { tapLight(); navigation.getParent()?.navigate('Search'); }}
            activeOpacity={0.8}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Rechercher', 'Chèche')}
            style={{
              width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: 10,
            }}
          >
            <SearchIcon size={19} color={colors.muted} />
          </TouchableOpacity>
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
              size={40}
              radius={20}
            />
          </TouchableOpacity>
        </View>

        {/* 1. THE next action (LJ-01) — resume the exact lesson / exam / review
            / a real first lesson for the class, from real state. It survives a
            course-feed failure when saved state can answer (audit #5); when it
            can't, the region says so locally with a retry. */}
        <View className="px-5" style={{ marginTop: 16 }}>
          {nextStep ? (
            <NextStepCard step={nextStep} thumbs={nextStepThumb} onOpenReview={() => setReviewOpen(true)} />
          ) : coursesPending ? (
            <SectionSkeleton height={220} />
          ) : coursesFailed ? (
            <CourseFeedError onRetry={() => refetch()} isCreole={isCreole} />
          ) : lastActivity ? (
            <ResumeBanner />
          ) : null}
        </View>

        {/* 2. The competitive opportunity, secondary to learning. Owned by the
            Arena work; self-hides when nothing is open. */}
        <View className="px-5 mt-4">
          <ArenaAnnounceCard />
        </View>

        {/* Daily activity — the défi du jour, independent of the course feed. */}
        <View className="px-5 mt-4">
          <MissionCard onStart={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }} />
        </View>

        {/* The compact review alternative; steps aside when the next action
            above already IS review, and self-hides at zero. */}
        {nextStep?.kind !== 'review' ? (
          <ReviewCard onOpen={() => setReviewOpen(true)} />
        ) : null}

        {/* 3. Evidence of progress (LJ-10) — terminées / pratiquées /
            maîtrisées per course, real denominators, only where work exists. */}
        {progressRows.length > 0 ? (
          <View className="px-5 mt-5 mb-1">
            <ProgressSummary
              rows={progressRows}
              isCreole={isCreole}
              // The overview (outline + evidence per chapter), not autoplay.
              onOpenCourse={(course) => (navigation as any).navigate('Courses', {
                screen: 'CourseDetail', initial: false, params: { courseId: course.id, courseName: course.name },
              })}
            />
          </View>
        ) : null}

        <View className="mt-4" />

        {/* 4. Lower-priority discovery. Course-backed sections load and fail
            locally; the weekly goal never depends on them. */}
        {coursesPending ? (
          <View className="px-5 mb-4"><SectionSkeleton height={130} /></View>
        ) : coursesFailed && nextStep ? (
          <View className="px-5 mb-4"><CourseFeedError onRetry={() => refetch()} isCreole={isCreole} /></View>
        ) : null}
        {coursFirst ? (
          <>
            {continueLearningBlock}
            {courses ? videoRailBlock : null}
            {weeklyGoalBlock}
          </>
        ) : (
          <>
            {weeklyGoalBlock}
            {continueLearningBlock}
            {courses ? videoRailBlock : null}
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
              // initial:false keeps ExamLanding mounted beneath ExamBrowser, so
              // Back pops to the level picker instead of exiting to this tab.
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

        {/* The school tournament sits directly above the personal board: the
            individual ranking is what a student cares about, and the collective
            one is what makes them recruit. Seeing them together is the point. */}
        <View className="px-5 mb-4">
          <TournamentCard />
        </View>

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
        onStartQuiz={() => { setPendingDailyChallenge(true); navigation.navigate('Trivia'); }}
        onSeeLeaderboard={() => (navigation as any).navigate('Leaderboard')}
      />
    </SafeAreaView>
  );
}
