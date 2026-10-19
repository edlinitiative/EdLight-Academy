import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ChevronLeft, ChevronDown, ChevronUp, Play, Share2, Sparkles, ClipboardList,
} from 'lucide-react-native';
import { useCourses, useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import LessonPractice from '../components/LessonPractice';
import CourseInstructorCard from '../components/CourseInstructorCard';
import ChapterTest from '../components/ChapterTest';
import PressableScale from '../components/ui/PressableScale';
import VideoCover from '../components/ui/VideoCover';
import Button from '../components/ui/Button';
import SectionHeader from '../components/ui/SectionHeader';
import { courseVideoThumbs } from '../utils/videoThumb';
import {
  summarize, lessonMastery, masteryLabel, masteryColor, masteryNextStep,
  courseLessonIds, chapterTestReady, type ProgressMap,
} from '../utils/mastery';
import PracticeSpotlight from '../components/PracticeSpotlight';
import LessonComments from '../components/LessonComments';
import LessonCompletionPanel from '../components/journey/lesson/LessonCompletionPanel';
import LessonPlayer from '../components/journey/lesson/LessonPlayer';
import ChapterOutline from '../components/journey/lesson/ChapterOutline';
import { useLessonCompletion } from '../components/journey/lesson/useLessonCompletion';
import { useOffline } from '../components/journey/lesson/useOnline';
import { chapterPractice } from '../components/journey/lesson/chapterPractice';
import {
  courseStartTarget, locateLesson, summarizeLessons, evidenceLine, lessonEvidence, LEVEL_LABEL,
} from '../components/journey/home/homeJourney';
import {
  chapterMeta, formatMinutes, isGeneratedLessonBlurb, lessonMinutes, positionInChapter,
} from '../components/courses/courseOutline';
import { completeLessonDurably } from '../services/writeOutbox';
import { evidenceLabel, trackJourney } from '../utils/learningJourney';
import { success as hapticSuccess } from '../utils/haptics';
import { SUBJECT_META } from '../utils/subjectMeta';
import { displayCourseName } from '../utils/courseName';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useTheme, courseTint } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';

type Route = RouteProp<CoursesParamList, 'CourseDetail'>;
type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseDetail'>;

export type DescriptionTopic = { label: string; detail?: string };
export type ParsedDescription = { intro: string; topics: DescriptionTopic[] };

// Course descriptions share one shape: a lead sentence, then an enumeration
// clause ("Vous y étudierez A, B (b1, b2), ainsi que C.") listing the topics.
// Rendered raw that is a six-line grey block nobody reads, so it gets split
// into a short intro + a scannable topic list.
const ENUMERATION_MARKERS = [
  /vous\s+y\s+(?:étudierez|apprendrez|découvrirez|verrez)\s*/i,
  /vous\s+(?:étudierez|apprendrez|découvrirez|verrez)\s*/i,
  /(?:w\s+ap|ou\s+pral)\s+(?:etidye|aprann|dekouvri)\s*/i,
  /au\s+programme\s*:\s*/i,
];

/** Split on commas that sit outside parentheses, so "(masse, volume)" stays whole. */
function splitTopLevel(clause: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of clause) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function toTopic(raw: string): DescriptionTopic | null {
  const cleaned = raw
    .trim()
    // Connectors that only glue the enumeration together.
    .replace(/^(?:ainsi\s+qu[e']|et\s+enfin|puis|enfin|et)\s+/i, '')
    .replace(/^(?:epi|ansanm\s+ak|ak)\s+/i, '')
    .replace(/[.;]+$/, '')
    .trim();
  if (!cleaned) return null;
  // Parenthetical examples become a quieter second line under the topic.
  const withDetail = cleaned.match(/^(.*?)\s*\(([^()]*)\)$/);
  const label = (withDetail?.[1] ?? cleaned).trim();
  const detail = withDetail?.[2]?.trim();
  if (!label) return null;
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    ...(detail ? { detail } : {}),
  };
}

/**
 * Pure parser: returns the lead sentence plus the enumerated topics. Degrades
 * to `{ intro: <whole text>, topics: [] }` — i.e. the old plain paragraph —
 * whenever the shape isn't recognised (no clause, a single item, or prose-long
 * items), and to empty strings for missing/blank input so nothing renders.
 */
export function parseCourseDescription(raw?: string | null): ParsedDescription {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { intro: '', topics: [] };

  let markerStart = -1;
  let markerEnd = -1;
  for (const marker of ENUMERATION_MARKERS) {
    const m = text.match(marker);
    if (m?.index != null) {
      markerStart = m.index;
      markerEnd = m.index + m[0].length;
      break;
    }
  }
  if (markerStart < 0) return { intro: text, topics: [] };

  const clause = text.slice(markerEnd).trim();
  // A single item is not a list — keep the paragraph instead of a lonely bullet.
  if (!clause.includes(',')) return { intro: text, topics: [] };

  const topics = splitTopLevel(clause)
    .map(toTopic)
    .filter((topic): topic is DescriptionTopic => topic != null);
  // Very long items mean this is prose that merely contains commas.
  const looksLikeProse = topics.some((topic) => topic.label.length > 90);
  if (topics.length < 2 || looksLikeProse) return { intro: text, topics: [] };

  const intro = text.slice(0, markerStart).trim();
  return { intro, topics };
}

/**
 * One chapter of "Plan du cours" (DIRECTION §4): a card (radius 18, no ring)
 * with an azure "Chapitre n" label, the title, "5 leçons · 52 min" (or the
 * chapter's evidence once started) and a chevron that flips when open. Open,
 * it lists the lessons (ChapterOutline: no dividers, current row washed) and
 * closes on the chapter test.
 */
function ChapterCard({
  unit, index, progress, currentId, defaultOpen, onLessonPress, onChapterTest, isCreole, onLayoutY,
}: {
  unit: any;
  index: number;
  progress: ProgressMap;
  currentId: string | null;
  defaultOpen: boolean;
  onLessonPress: (lesson: any) => void;
  onChapterTest: (unit: any) => void;
  isCreole: boolean;
  onLayoutY?: (y: number) => void;
}) {
  const { colors, typeScale, fonts, cardSurface } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const lessons: any[] = useMemo(
    () => (Array.isArray(unit?.lessons) ? unit.lessons.filter((l: any) => l?.id) : []),
    [unit?.lessons],
  );
  const holdsCurrent = !!currentId && lessons.some((l) => l.id === currentId);
  const [open, setOpen] = useState(defaultOpen || holdsCurrent);
  // Only ever opens on a transition: a chapter the student closed stays closed.
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  const ids = useMemo(() => lessons.map((l) => l.id), [lessons]);
  const summary = useMemo(() => summarize(ids, progress), [ids, progress]);
  const evidence = useMemo(() => summarizeLessons(ids, progress), [ids, progress]);
  const minutes = useMemo(() => {
    let sum = 0; let known = false;
    for (const l of lessons) { const m = lessonMinutes(l); if (m != null) { sum += m; known = true; } }
    return known ? sum : null;
  }, [lessons]);
  const started = evidence.completed + evidence.practised > 0;
  // The test is worth offering once anything in the chapter is solid.
  const testReady = chapterTestReady(summary);
  const meta = started ? evidenceLine(evidence, isCreole) : chapterMeta({ lessonCount: lessons.length, minutes }, isCreole);

  return (
    <View
      onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
      style={[cardSurface, { paddingHorizontal: 8, paddingVertical: 8 }]}
    >
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        pressedScale={0.99}
        haptic={false}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('Chapitre', 'Chapit')} ${index + 1}, ${unit.title}. ${meta}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.azureInk }}>
            {t('Chapitre', 'Chapit')} {index + 1}
          </Text>
          <Text style={[typeScale.cardTitle, { color: colors.ink, fontSize: 18, lineHeight: 23, marginTop: 2 }]}>{unit.title}</Text>
          <Text style={[typeScale.meta, { color: colors.muted, marginTop: 3 }]}>{meta}</Text>
        </View>
        {open
          ? <ChevronUp color={colors.muted} size={22} strokeWidth={2.2} />
          : <ChevronDown color={colors.muted} size={22} strokeWidth={2.2} />}
      </PressableScale>

      {open ? (
        <View style={{ paddingTop: 4, paddingBottom: 4 }}>
          <ChapterOutline
            lessons={lessons}
            currentId={currentId}
            progress={progress}
            isCreole={isCreole}
            onLessonPress={onLessonPress}
            testReady={testReady}
            onChapterTest={() => onChapterTest(unit)}
          />
        </View>
      ) : null}
    </View>
  );
}

export default function CourseDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { courseId, lessonId, autoplay, chapterIndex } = route.params;
  const { data: courses, isLoading, isError, refetch } = useCourses();
  const appQuery = useAppData();
  const {
    user, isAuthenticated, progress, updateProgress, incrementGuestInteraction, recordActivity, language,
    lastActivity, practiceTipSeen, setPracticeTipSeen,
  } = useStore();
  const { colors, typeScale, fonts, cardSurface, featureSurface } = useTheme();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const offline = useOffline();

  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  /** The lesson whose player starts without the facade (pressed play on the cover). */
  const [autoStartId, setAutoStartId] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState<'flashcards' | 'exercices' | null>(null);
  const [testUnit, setTestUnit] = useState<any | null>(null);
  const [showPracticeTip, setShowPracticeTip] = useState(false);
  /** A deep link named a lesson the catalogue no longer has (LJ-02 stale link). */
  const [staleLesson, setStaleLesson] = useState(false);
  const practiceRowRef = useRef<View>(null);
  const landedFor = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Chapter deep link from the Cours tab: scroll there once both offsets are known.
  const planY = useRef<number | null>(null);
  const chapterY = useRef<number | null>(null);
  const scrolledToChapter = useRef(false);

  // First time a lesson is opened, coach-mark the Flashcards/Exercices buttons.
  useEffect(() => {
    if (activeLesson && !practiceTipSeen) {
      const timer = setTimeout(() => setShowPracticeTip(true), 400);
      return () => clearTimeout(timer);
    }
  }, [activeLesson?.id, practiceTipSeen]);

  const course = useMemo(() => courses?.find((c) => c.id === courseId), [courses, courseId]);

  // Flat list of all lessons for prev/next navigation
  const allLessons = useMemo(() => {
    if (!course?.modules) return [];
    return course.modules.flatMap((u: any) => u?.lessons ?? []);
  }, [course]);

  const activeIndex = useMemo(() => {
    if (!activeLesson) return -1;
    return allLessons.findIndex((l: any) => l.id === activeLesson.id);
  }, [allLessons, activeLesson]);
  /** Where the open lesson sits (its chapter), for the title block and practice. */
  const activeRef = useMemo(() => locateLesson(course, activeLesson?.id), [course, activeLesson?.id]);

  // The one start/resume target, on Home's rules (LJ-03): the lesson the
  // student was in if unfinished, else the first unfinished one.
  const lastLessonHere = lastActivity?.type === 'lesson' && lastActivity.path === courseId
    ? lastActivity.lessonId ?? null
    : null;
  const startTarget = useMemo(
    () => (course ? courseStartTarget(course, progress as ProgressMap, null, lastLessonHere) : null),
    [course, progress, lastLessonHere],
  );

  // Deep-link landing, once per distinct request: open the requested lesson
  // (Reprendre), or with autoplay the course's start target — so tapping a
  // course card lands on a playable page. A lesson id the catalogue no longer
  // has is reported, never silently swapped for another lesson.
  useEffect(() => {
    if (allLessons.length === 0) return;
    const key = `${lessonId ?? ''}|${autoplay ? 1 : 0}`;
    if (landedFor.current === key) return;
    landedFor.current = key;
    if (lessonId) {
      const target = allLessons.find((l: any) => l.id === lessonId);
      trackJourney('lesson_resume_resolved', {
        course_id: courseId, lesson_id: lessonId, outcome: target ? 'found' : 'stale',
      });
      if (target) { setActiveLesson(target); setStaleLesson(false); } else setStaleLesson(true);
      return;
    }
    if (autoplay && startTarget) setActiveLesson(startTarget.ref.lesson);
    // Intentionally NOT re-running on progress changes: landing only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLessons, lessonId, autoplay]);

  // A new chapter request from the Cours tab scrolls again.
  useEffect(() => { scrolledToChapter.current = false; chapterY.current = null; }, [chapterIndex]);

  // Whatever lesson is open is the place Home resumes (Préc./Suiv. included).
  useEffect(() => {
    if (!activeLesson || !course) return;
    recordActivity({
      type: 'lesson',
      path: course.id,
      lessonId: activeLesson.id,
      title: activeLesson.title,
      subtitle: course.name,
      ts: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLesson?.id, course?.id]);

  // Mastery, not consumption: still drives the chapter-test gates.
  const summary = useMemo(
    () => summarize(courseLessonIds(course), progress as ProgressMap),
    [course, progress],
  );
  // The course's evidence facts in the shared words (LJ-10).
  const evidence = useMemo(
    () => summarizeLessons(courseLessonIds(course), progress as ProgressMap),
    [course, progress],
  );
  const coverThumbs = useMemo(() => (course ? courseVideoThumbs(course) : []), [course]);

  const tint = courseTint(course?.color);
  const description = useMemo(() => parseCourseDescription(course?.description), [course?.description]);
  const courseMinutes = useMemo(() => {
    let sum = 0; let known = false;
    for (const l of allLessons) { const m = lessonMinutes(l); if (m != null) { sum += m; known = true; } }
    return known ? sum : null;
  }, [allLessons]);

  // ── Completion (LJ-05): acknowledged ONLY after a server-confirmed save ──
  // Queued in the persisted outbox first, so an app kill offline can't lose it (L-3).
  const uid = isAuthenticated ? user?.uid ?? null : null;
  const saveCompletion = useCallback(
    async (u: string, c: string, l: string) => (u ? completeLessonDurably(u, c, l) : 'local' as const),
    [],
  );
  const completion = useLessonCompletion({
    uid,
    courseId: course?.id ?? null,
    offline,
    save: saveCompletion,
    onConfirmed: (id) => {
      // The existing mastery bookkeeping: `completed` earns the `seen` rung
      // and syncs to the shared mastery doc. Never mastery itself.
      updateProgress(id, { completed: true });
      incrementGuestInteraction();
      hapticSuccess();
    },
  });

  // Chapter-wide practice for the open lesson, with its real count (LJ-05/06).
  const rawBank = useMemo<any[] | undefined>(
    () => (appQuery.isError ? [] : appQuery.data?.quizBank?.raw),
    [appQuery.isError, appQuery.data],
  );
  const practice = useMemo(
    () => chapterPractice({ rawBank, courseCode: course?.code, module: activeRef?.unit, lessonId: activeLesson?.id }),
    [rawBank, course?.code, activeRef?.unit, activeLesson?.id],
  );

  const goBack = () => {
    // A lesson open: back returns to the course overview (LJ-04 "clear return").
    if (activeLesson) {
      setActiveLesson(null);
      setAutoStartId(null);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    // Stay inside the Courses stack: canGoBack() also counts the parent tab
    // navigator, which sent deep-linked users "back" to Home. If this is the
    // only route in the stack, land on the course list instead.
    const stackRoutes = navigation.getState()?.routes ?? [];
    if (stackRoutes.length > 1) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'CourseList' }] });
  };

  const name = displayCourseName(course?.name ?? route.params.courseName ?? '');

  const topBar = (label: string, right?: React.ReactNode) => (
    <View style={[{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 8, backgroundColor: colors.bg }, centerColumn]}>
      <PressableScale
        onPress={goBack}
        haptic={false}
        pressedScale={0.97}
        accessibilityRole="button"
        accessibilityLabel={activeLesson ? `${t('Retour au cours', 'Retounen nan kou a')} ${label}` : t('Retour aux cours', 'Retounen nan kou yo')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8, flexShrink: 1 }}
      >
        <ChevronLeft color={colors.ink} size={26} strokeWidth={2.2} />
        <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.ink, flexShrink: 1 }}>{label}</Text>
      </PressableScale>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );

  // Loading and error carry the same back bar as the loaded screen.
  const withChrome = (body: React.ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {topBar(t('Cours', 'Kou'))}
      {body}
    </SafeAreaView>
  );

  if (!course && isLoading) return withChrome(<ListSkeleton rows={6} />);
  if (!course && isError) return withChrome(<ErrorState onRetry={() => refetch()} secondaryLabel={t('Retour', 'Retounen')} onSecondary={goBack} />);
  if (!course) {
    // The catalogue loaded but this course is not in it (stale link / hidden).
    return withChrome(
      <EmptyState
        title={t("Ce cours n'est plus disponible", 'Kou sa a pa disponib ankò')}
        description={t('Il a peut-être été déplacé. Choisis un cours dans la liste.', 'Yo ka te deplase l. Chwazi yon kou nan lis la.')}
        ctaLabel={t('Voir les cours', 'Wè kou yo')}
        onCta={() => navigation.reset({ index: 0, routes: [{ name: 'CourseList' }] })}
      />,
    );
  }

  // A course that loaded fine but has no lessons (empty `modules`): say "not
  // ready yet" instead of rendering "0/0 leçons" and an empty accordion.
  if (allLessons.length === 0) {
    return withChrome(
      <EmptyState
        title={t('Ce cours arrive bientôt', 'Kou sa a ap vini talè')}
        description={t(
          'Les leçons vidéo sont en préparation. Essaie un autre cours en attendant.',
          'Leson videyo yo ap prepare. Eseye yon lòt kou pandan n ap tann.',
        )}
        ctaLabel={t('Voir les autres cours', 'Wè lòt kou yo')}
        onCta={() => navigation.reset({ index: 0, routes: [{ name: 'CourseList' }] })}
      />,
    );
  }

  function onLessonPress(lesson: any, play = false) {
    setStaleLesson(false);
    setActiveLesson(lesson);
    setAutoStartId(play ? lesson.id : null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function startPractice() {
    if (practice.status !== 'ready' || !activeLesson) return;
    trackJourney('practice_handoff_opened', {
      course_id: course!.id, course_code: practice.handoff.course, unit: practice.unit,
      lesson_id: activeLesson.id, count: practice.count, from: 'lesson',
    });
    navigation.navigate('Quizzes', { courseId: course!.id, handoff: practice.handoff });
  }

  const tryScrollToChapter = () => {
    if (scrolledToChapter.current || chapterIndex == null || activeLesson) return;
    if (planY.current == null || chapterY.current == null) return;
    scrolledToChapter.current = true;
    const y = Math.max(0, planY.current + chapterY.current - 12);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
  };

  const isLastLesson = activeIndex === allLessons.length - 1;
  const nextLessonObj = activeIndex >= 0 && !isLastLesson ? allLessons[activeIndex + 1] : null;
  const activeEvidence = activeLesson ? lessonEvidence(activeLesson.id, progress as ProgressMap) : null;
  const isAlreadyDone = activeEvidence === 'completed' || activeEvidence === 'practised' || activeEvidence === 'mastered';
  const entry = completion.entryFor(activeLesson?.id);
  const levelLabel = course.level ? (LEVEL_LABEL[course.level] ?? course.level) : null;
  const subject = SUBJECT_META[course.subject];
  const subjectLabel = subject ? (isCreole ? subject.nameHt : subject.name) : null;
  const started = evidence.completed + evidence.practised > 0;
  const pct = evidence.total > 0 ? Math.min(100, Math.round((evidence.completed / evidence.total) * 100)) : 0;
  // On the overview the resume target reads as the current row once started.
  const overviewCurrent = startTarget?.started ? startTarget.ref.lesson.id : null;
  const openChapter = chapterIndex ?? startTarget?.ref.unitIndex ?? 0;

  // Where the ladder stands for the open lesson, in the shared words.
  const stepLine = (() => {
    if (!activeLesson || !activeEvidence || activeEvidence === 'opened') return null;
    const step = masteryNextStep(lessonMastery((progress as ProgressMap)[activeLesson.id]), isCreole);
    if (activeEvidence === 'completed') return step ? `${t('Prochaine étape', 'Pwochen etap')} : ${step}` : null;
    return step ? `${evidenceLabel(activeEvidence, isCreole)} · ${step}` : evidenceLabel(activeEvidence, isCreole);
  })();

  const shareCourse = () => {
    Share.share({
      message: `${name} · EdLight Academy\nhttps://academy.edlight.org/courses/${course.id}`,
    }).catch(() => { /* dismissed */ });
  };

  const shareButton = (
    <PressableScale
      onPress={shareCourse}
      accessibilityRole="button"
      accessibilityLabel={t('Partager ce cours', 'Pataje kou sa a')}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
    >
      <Share2 color={colors.ink} size={22} strokeWidth={2} />
    </PressableScale>
  );

  // ── Lesson mode (DIRECTION §5, Stitch 05-lesson-v1) ──────────────────────
  if (activeLesson) {
    const pos = positionInChapter(course, activeLesson.id);
    const dur = formatMinutes(lessonMinutes(activeLesson));
    const chapterLessons: any[] = (activeRef?.unit?.lessons ?? []).filter((l: any) => l?.id);
    const unitSummary = summarize(chapterLessons.map((l) => l.id), progress as ProgressMap);
    const objectives = isGeneratedLessonBlurb(activeLesson.objectives) ? null : activeLesson.objectives;
    const lessonMeta = [
      pos ? t(`Leçon ${pos.n} sur ${pos.of}`, `Leson ${pos.n} sou ${pos.of}`) : null,
      dur,
    ].filter(Boolean).join(' · ');

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {topBar(name)}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: 140 }, centerColumn]}
          showsVerticalScrollIndicator={false}
        >
          {/* LJ-04: the lesson's identity BEFORE the player in reading order. */}
          <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={`${activeRef ? `${t('Chapitre', 'Chapit')} ${activeRef.unitIndex + 1}${activeRef.unit?.title ? `, ${activeRef.unit.title}` : ''}. ` : ''}${activeLesson.title}. ${lessonMeta}`}
            style={{ paddingTop: 8, paddingBottom: 20 }}
          >
            {activeRef ? (
              <Text style={[typeScale.meta, { color: colors.muted }]} numberOfLines={1}>
                {t('Chapitre', 'Chapit')} {activeRef.unitIndex + 1}{activeRef.unit?.title ? ` · ${activeRef.unit.title}` : ''}
              </Text>
            ) : null}
            <Text style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 33, letterSpacing: -0.9, color: colors.ink, marginTop: 6 }} numberOfLines={4}>
              {activeLesson.title}
            </Text>
            {lessonMeta ? <Text style={[typeScale.meta, { color: colors.muted, marginTop: 6 }]}>{lessonMeta}</Text> : null}
          </View>

          {activeLesson.videoUrl ? (
            <LessonPlayer
              videoUrl={activeLesson.videoUrl}
              thumbnail={activeLesson.thumbnail}
              isCreole={isCreole}
              offline={offline}
              durationLabel={dur}
              autoStart={autoStartId === activeLesson.id}
              positionKey={courseId && activeLesson.id ? `${courseId}:${activeLesson.id}` : undefined}
              uid={uid}
            />
          ) : (
            <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
              <Text style={[typeScale.bodyMd, { color: colors.muted, textAlign: 'center' }]}>
                {activeLesson.type === 'video'
                  ? t('Vidéo non disponible', 'Videyo pa disponib')
                  : t('Quiz ou exercice : ouvre les exercices ci-dessous', 'Quiz oswa egzèsis : louvri egzèsis yo anba a')}
              </Text>
            </View>
          )}

          {objectives ? (
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 16 }]}>{objectives}</Text>
          ) : null}

          <View style={{ marginTop: 20 }}>
            <LessonCompletionPanel
              entry={entry}
              alreadyDone={isAlreadyDone}
              isGuest={!uid}
              isCreole={isCreole}
              practice={practice}
              nextTitle={nextLessonObj?.title ?? null}
              isLast={isLastLesson}
              stepLine={stepLine}
              onComplete={() => completion.complete(activeLesson.id)}
              onPractice={startPractice}
              onNext={() => nextLessonObj && onLessonPress(nextLessonObj)}
            />
          </View>

          {/* This lesson's own tools — quieter than the region above. */}
          <View ref={practiceRowRef} collapsable={false} style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            {([
              ['flashcards', Sparkles, t('Flashcards', 'Kat etid'), t('Flashcards de cette leçon', 'Kat etid leson sa a')],
              ['exercices', ClipboardList, t('Exercices', 'Egzèsis'), t('Exercices de cette leçon', 'Egzèsis leson sa a')],
            ] as const).map(([mode, Icon, label, a11y]) => (
              <PressableScale
                key={mode}
                onPress={() => setPracticeMode(mode)}
                pressedScale={0.97}
                accessibilityRole="button"
                accessibilityLabel={a11y}
                style={[cardSurface, { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 }]}
              >
                <Icon color={colors.azureInk} size={18} strokeWidth={2.2} />
                <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink }}>{label}</Text>
              </PressableScale>
            ))}
          </View>

          {/* Plan du chapitre (DIRECTION §5.5) */}
          {chapterLessons.length > 0 ? (
            <View style={[featureSurface, { marginTop: 24, paddingHorizontal: 12, paddingTop: 22, paddingBottom: 12 }]}>
              <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, paddingHorizontal: 12, marginBottom: 10 }]}>
                {t('Plan du chapitre', 'Plan chapit la')}
              </Text>
              <ChapterOutline
                lessons={chapterLessons}
                currentId={activeLesson.id}
                progress={progress as ProgressMap}
                isCreole={isCreole}
                onLessonPress={onLessonPress}
                testReady={chapterTestReady(unitSummary)}
                onChapterTest={() => setTestUnit(activeRef?.unit ?? null)}
                rowHeight={56}
              />
            </View>
          ) : null}

          <PressableScale
            onPress={goBack}
            haptic={false}
            pressedScale={0.98}
            accessibilityRole="link"
            style={{ alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.azureInk }}>
              {t('Voir tout le plan du cours', 'Wè tout plan kou a')}
            </Text>
          </PressableScale>

          {/* Per-lesson discussion (shared thread with the web app) */}
          <View style={{ marginTop: 16 }}>
            <LessonComments threadKey={`comments:${course.id}:${activeLesson.id}`} isCreole={isCreole} />
          </View>
        </ScrollView>

        <LessonPractice
          visible={practiceMode != null}
          onClose={() => setPracticeMode(null)}
          subjectCode={course.code}
          unitNo={activeLesson.unit_no}
          lessonNo={activeLesson.lesson_no}
          lessonId={activeLesson.id}
          initialMode={practiceMode ?? 'flashcards'}
          isCreole={isCreole}
        />


        <ChapterTest
          visible={testUnit != null}
          onClose={() => setTestUnit(null)}
          subjectCode={course.code}
          unitNo={testUnit?.lessons?.[0]?.unit_no ?? testUnit?.unit_no}
          unitTitle={testUnit?.title}
          lessons={testUnit?.lessons ?? []}
          isCreole={isCreole}
          tint={tint}
        />

        <PracticeSpotlight
          visible={showPracticeTip && !practiceTipSeen && practiceMode == null}
          targetRef={practiceRowRef}
          onDismiss={() => { setPracticeTipSeen(true); setShowPracticeTip(false); }}
          title={isCreole ? 'Revize leson sa a' : 'Révise cette leçon'}
          body={isCreole
            ? 'Sèvi ak Flashcards pou memorize, epi Egzèsis pou antrene w sou leson sa a.'
            : "Utilise les Flashcards pour mémoriser et les Exercices pour t'entraîner sur cette leçon."}
          cta={isCreole ? 'Konpri' : 'Compris'}
        />
      </SafeAreaView>
    );
  }

  // ── Overview (DIRECTION §4, Stitch 04-course-overview) ───────────────────
  const startLabel = startTarget
    ? `${startTarget.started ? t('Reprendre', 'Kontinye') : t('Commencer', 'Kòmanse')} : ${startTarget.ref.lesson.title}`
    : null;
  const openStart = (play: boolean) => {
    if (!startTarget) return;
    trackJourney('learning_next_action_selected', {
      kind: 'course-start', reason: startTarget.reason, course_id: course.id, lesson_id: startTarget.ref.lesson.id,
    });
    onLessonPress(startTarget.ref.lesson, play);
  };
  const courseMeta = [
    `${course.modules?.length ?? 0} ${t('chapitres', 'chapit')}`,
    `${summary.total} ${t('leçons', 'leson')}`,
    formatMinutes(courseMinutes),
  ].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {topBar(t('Cours', 'Kou'), shareButton)}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 140 }, centerColumn]}
        showsVerticalScrollIndicator={false}
      >
        {staleLesson ? (
          <View accessibilityLiveRegion="polite" style={{ marginBottom: 14, padding: 16, borderRadius: 18, backgroundColor: colors.warnSoft }}>
            <Text style={[typeScale.body, { color: colors.ink }]}>
              {t(
                "La leçon demandée n'est plus dans ce cours. Choisis une leçon dans le plan ci-dessous.",
                'Leson ou te mande a pa nan kou sa a ankò. Chwazi yon leson nan plan ki anba a.',
              )}
            </Text>
          </View>
        ) : null}

        {/* The course's own cover — a cover, not a band: inline at the gutters. */}
        <VideoCover
          uris={coverThumbs}
          playPosition="center"
          play={!!startTarget}
          radiusTop={18}
          radiusBottom={18}
          onPress={startTarget ? () => openStart(true) : undefined}
          accessibilityLabel={startLabel ? `${t('Lire', 'Jwe')} : ${startTarget!.ref.lesson.title}` : undefined}
        />

        <View style={[cardSurface, { borderRadius: 20, padding: 20, marginTop: 16 }]}>
          {levelLabel || subjectLabel ? (
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.azureInk }}>
              {[levelLabel, subjectLabel].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 28, lineHeight: 33, letterSpacing: -0.9, color: colors.ink, marginTop: 4 }}>
            {name}
          </Text>
          <Text style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]}>{courseMeta}</Text>

          {started ? (
            <View style={{ marginTop: 16 }} accessible accessibilityLabel={evidenceLine(evidence, isCreole)}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <Text style={[typeScale.meta, { color: colors.ink, flex: 1 }]}>{evidenceLine(evidence, isCreole)}</Text>
                <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.azureInk }}>{pct}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginTop: 8, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(pct, 3)}%`, height: 6, borderRadius: 3, backgroundColor: colors.azure }} />
              </View>
            </View>
          ) : null}

          {startTarget && startLabel ? (
            <Button
              label={startLabel}
              size="lg"
              fullWidth
              icon={<Play color="#ffffff" size={18} strokeWidth={2.4} fill="#ffffff" />}
              onPress={() => openStart(false)}
              accessibilityLabel={`${startLabel}, ${t('chapitre', 'chapit')} ${startTarget.ref.unitIndex + 1}`}
              style={{ marginTop: 20 }}
            />
          ) : null}
        </View>

        {/* Plan du cours: the real chapters, current/completed marked with a
            symbol AND words. Chapters come before reference material. */}
        <SectionHeader title={t('Plan du cours', 'Plan kou a')} style={{ marginTop: 28 }} />
        <View
          style={{ gap: 12 }}
          onLayout={(e) => { planY.current = e.nativeEvent.layout.y; tryScrollToChapter(); }}
        >
          {(course.modules ?? []).map((unit: any, unitIndex: number) => (
            <ChapterCard
              key={unit.id ?? unitIndex}
              unit={unit}
              index={unitIndex}
              progress={progress as ProgressMap}
              currentId={overviewCurrent}
              defaultOpen={unitIndex === openChapter}
              onLessonPress={onLessonPress}
              onChapterTest={setTestUnit}
              isCreole={isCreole}
              onLayoutY={unitIndex === chapterIndex ? (y) => { chapterY.current = y; tryScrollToChapter(); } : undefined}
            />
          ))}
        </View>

        {/* The person behind the course — real, bound instructors only. */}
        <CourseInstructorCard courseId={courseId} />

        {/* Reference material, after the lessons. */}
        {description.intro || description.topics.length > 0 ? (
          <>
            <SectionHeader title={t('À propos du cours', 'Sou kou a')} />
            <View style={[cardSurface, { padding: 20 }]}>
              {description.intro ? (
                <Text style={[typeScale.body, { color: colors.muted }]}>{description.intro}</Text>
              ) : null}
              {description.topics.length > 0 ? (
                <View style={{ marginTop: description.intro ? 18 : 0 }}>
                  <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t('Ce que tu vas apprendre', 'Sa w ap aprann')}</Text>
                  <View style={{ marginTop: 10, gap: 10 }}>
                    {description.topics.map((topic, topicIndex) => (
                      <View key={`${topicIndex}-${topic.label}`} style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.azure, marginTop: 9 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{topic.label}</Text>
                          {topic.detail ? (
                            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>{topic.detail}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* On a first visit only: how the levels are earned. */}
        {summary.started === 0 ? (
          <>
            <SectionHeader title={t('Comment on progresse', 'Kijan ou avanse')} />
            <View style={[cardSurface, { padding: 20, gap: 12 }]}>
              {([
                ['seen', t('Regarde la leçon', 'Gade leson an')],
                ['familiar', t('Réussis 70% des exercices', 'Reyisi 70% egzèsis yo')],
                ['proficient', t('Réussis-les à 100%', 'Reyisi yo a 100%')],
                ['mastered', t('Confirme-le au test du chapitre', 'Konfime l nan tès chapit la')],
              ] as const).map(([lvl, how]) => (
                <View key={lvl} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: masteryColor(lvl, colors) }} />
                  <Text style={[typeScale.bodyMd, { color: colors.ink, width: 92 }]}>{masteryLabel(lvl, isCreole)}</Text>
                  <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>{how}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <ChapterTest
        visible={testUnit != null}
        onClose={() => setTestUnit(null)}
        subjectCode={course.code}
        unitNo={testUnit?.lessons?.[0]?.unit_no ?? testUnit?.unit_no}
        unitTitle={testUnit?.title}
        lessons={testUnit?.lessons ?? []}
        isCreole={isCreole}
        tint={tint}
      />
    </SafeAreaView>
  );
}
