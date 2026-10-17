import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft, ChevronDown, ChevronRight, PlayCircle, ClipboardList,
  CheckCircle2, ChevronLeft, Sparkles, Target, Circle, WifiOff, RotateCcw,
} from 'lucide-react-native';
import { useCourses, useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import LessonPractice from '../components/LessonPractice';
import CourseInstructorCard from '../components/CourseInstructorCard';
import ChapterTest from '../components/ChapterTest';
import PressableScale from '../components/ui/PressableScale';
import { useCourseThumb } from '../hooks/useCourseThumb';
import {
  summarize, lessonMastery, masteryLabel, masteryColor, masteryNextStep,
  courseLessonIds, chapterTestReady, type ProgressMap,
} from '../utils/mastery';
import PracticeSpotlight from '../components/PracticeSpotlight';
import LessonComments from '../components/LessonComments';
import LessonCompletionPanel from '../components/journey/lesson/LessonCompletionPanel';
import { useLessonCompletion } from '../components/journey/lesson/useLessonCompletion';
import { useOffline } from '../components/journey/lesson/useOnline';
import { chapterPractice } from '../components/journey/lesson/chapterPractice';
import {
  courseStartTarget, locateLesson, summarizeLessons, evidenceLine, lessonEvidence, LEVEL_LABEL,
} from '../components/journey/home/homeJourney';
import { confirmLessonComplete } from '../services/progressTracking';
import { evidenceLabel, trackJourney } from '../utils/learningJourney';
import { success as hapticSuccess } from '../utils/haptics';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useColors, typeScale, radius, courseTint } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';

type Route = RouteProp<CoursesParamList, 'CourseDetail'>;
type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseDetail'>;

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m =
    url.match(/youtube\.com\/embed\/([^?&]+)/) ||
    url.match(/youtu\.be\/([^?&]+)/) ||
    url.match(/youtube\.com\/watch\?v=([^&]+)/);
  return m?.[1] ?? null;
}

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
 * The lesson player. Video is the one part of a lesson that ALWAYS needs the
 * network (audit #16): offline it says so — the outline, the lesson text and
 * saved progress stay on screen — and a failure keeps the lesson in place
 * with a retry. The lesson title sits ABOVE this, so identity survives either.
 */
function VideoPlayer({ videoUrl, isCreole, offline }: { videoUrl: string; isCreole?: boolean; offline: boolean }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const wasOffline = useRef(offline);
  // Coming back online retries a player that failed for lack of network.
  useEffect(() => {
    if (wasOffline.current && !offline) { setFailed(false); setAttempt((n) => n + 1); }
    wasOffline.current = offline;
  }, [offline]);
  useEffect(() => { setFailed(false); }, [videoUrl]);

  const ytId = extractYouTubeId(videoUrl);
  const embedUrl = ytId
    ? `https://www.youtube.com/embed/${ytId}?playsinline=1`
    : videoUrl;

  // Embed via an HTML shell with baseUrl set to the web app's origin: many
  // course videos are embed-restricted by domain, and YouTube rejects players
  // with no/unknown referrer ("Error 153"). WKWebView ignores custom Referer
  // headers, but baseUrl makes the iframe's parent document — and therefore
  // the referrer YouTube sees — the EdLight origin, same as the PWA.
  const html = `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}</style>
    </head><body>
    <iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    </body></html>`;

  if (offline || failed) {
    return (
      <View
        accessibilityLiveRegion="polite"
        style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 }}
      >
        {offline ? <WifiOff color="#cbd5e1" size={30} /> : <PlayCircle color="#cbd5e1" size={32} />}
        <Text style={[typeScale.status, { color: '#f1f5f9', textAlign: 'center' }]}>
          {offline
            ? t('La vidéo a besoin d\'une connexion internet.', 'Videyo a bezwen koneksyon entènèt.')
            : t('La vidéo ne s\'est pas chargée.', 'Videyo a pa chaje.')}
        </Text>
        <Text style={[typeScale.caption, { color: '#cbd5e1', textAlign: 'center' }]}>
          {offline
            ? t('Le plan du cours et ta progression enregistrée restent disponibles.', 'Plan kou a ak pwogrè ou anrejistre yo rete disponib.')
            : t('Ta leçon reste ouverte ici.', 'Leson ou an rete louvri la a.')}
        </Text>
        {!offline ? (
          <TouchableOpacity
            onPress={() => { setFailed(false); setAttempt((n) => n + 1); }}
            accessibilityRole="button"
            accessibilityLabel={t('Réessayer la vidéo', 'Eseye videyo a ankò')}
            style={{ marginTop: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }}
          >
            <RotateCcw color="#ffffff" size={16} />
            <Text style={[typeScale.action, { color: '#ffffff' }]}>{t('Réessayer', 'Eseye ankò')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <View className="w-full bg-black" style={{ aspectRatio: 16 / 9 }}>
      <WebView
        key={attempt}
        source={{ html, baseUrl: 'https://edlight-academy.web.app' }}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        // WebView needs a real style — className is not applied to native views
        // from react-native-webview, which left the player blank.
        style={{ flex: 1, backgroundColor: '#000000' }}
        containerStyle={{ flex: 1 }}
        originWhitelist={['*']}
        javaScriptEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' }}>
            <ActivityIndicator color="#ffffff" />
          </View>
        )}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
      />
    </View>
  );
}

/**
 * One chapter of the syllabus.
 *
 * There is deliberately no card here — no tinted icon tile, no shadow, no
 * chevron column. Chapters are separated by a hairline and told apart by type
 * weight and their mastery ladder, so a course reads as one continuous document
 * instead of a stack of identical rounded rectangles.
 */
function UnitRow({
  unit, index, tint, progress, activeLesson, onLessonPress, onChapterTest, isCreole,
}: {
  unit: any;
  index: number;
  tint: string;
  progress: ProgressMap;
  activeLesson: any | null;
  onLessonPress: (lesson: any) => void;
  onChapterTest: (unit: any) => void;
  isCreole?: boolean;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const lessons: any[] = useMemo(
    () => (Array.isArray(unit?.lessons) ? unit.lessons : []),
    [unit?.lessons],
  );

  // Chapters start closed — opening a course used to dump every unit's whole
  // lesson list at once. The one exception is the unit that owns the lesson
  // currently being watched: it must stay open so the chapter never collapses
  // shut around it.
  const holdsActive = useMemo<boolean>(
    () => !!activeLesson && lessons.some((l: any) => l.id === activeLesson.id),
    [lessons, activeLesson],
  );
  const [open, setOpen] = useState(holdsActive);
  // `activeLesson` arrives after mount for deep links ("Reprendre" / autoplay)
  // and changes as the student moves through Suiv./Préc., so opening also has
  // to happen on transition — not just in the initial state. Only ever opens:
  // a unit the student closed by hand stays closed once the lesson moves away.
  useEffect(() => {
    if (holdsActive) setOpen(true);
  }, [holdsActive]);

  const summary = useMemo(
    () => summarize(lessons.map((l: any) => l.id).filter(Boolean), progress),
    [lessons, progress],
  );
  // The chapter's evidence in the shared words (LJ-10): terminées /
  // pratiquées / maîtrisées over its real lesson count.
  const evidence = useMemo(
    () => summarizeLessons(lessons.map((l: any) => l.id).filter(Boolean), progress),
    [lessons, progress],
  );
  const done = evidence.completed;
  const finished = summary.total > 0 && done >= summary.total;
  // The chapter test is worth offering once anything in the chapter is solid —
  // before that there is nothing for it to promote.
  const testReady = chapterTestReady(summary);

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('Chapitre', 'Chapit')} ${index + 1}, ${unit.title}. ${evidenceLine(evidence, !!isCreole)}`}
      >
        {/* Chapter state at a glance: finished / in progress / untouched. */}
        {finished ? (
          <CheckCircle2 color="#ffffff" fill={colors.azure} size={24} />
        ) : done > 0 || holdsActive ? (
          <PlayCircle color={colors.azure} size={24} strokeWidth={1.8} />
        ) : (
          <Circle color={colors.border} size={24} strokeWidth={1.8} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.overline, { color: done > 0 && !finished ? colors.azure : colors.faint }]}>
            {t('Chapitre', 'Chapit')} {index + 1}{done > 0 && !finished ? ` · ${t('En cours', 'An kou')}` : ''}
          </Text>
          <Text style={[typeScale.title, { color: colors.ink, marginTop: 3 }]}>{unit.title}</Text>
          <Text style={[typeScale.caption, { color: colors.muted, marginTop: 3 }]}>
            {done > 0 || evidence.practised > 0
              ? evidenceLine(evidence, !!isCreole)
              : `${summary.total} ${t('leçons', 'leson')}`}
          </Text>
        </View>
        {open
          ? <ChevronDown color={colors.faint} size={16} />
          : <ChevronRight color={colors.faint} size={16} />}
      </TouchableOpacity>

      {open && (
        <View style={{ paddingBottom: 14, paddingLeft: 38 }}>
          {lessons.map((lesson: any) => {
            const ev = lessonEvidence(lesson.id, progress);
            const isDone = ev === 'completed' || ev === 'practised' || ev === 'mastered';
            const active = activeLesson?.id === lesson.id;
            // State in words, never colour alone (LJ-04).
            const stateWords = [
              active ? t('Leçon actuelle', 'Leson kounye a') : null,
              ev ? evidenceLabel(ev, !!isCreole) : t('À faire', 'Pou fè'),
            ].filter(Boolean).join(', ');
            return (
              <TouchableOpacity
                key={lesson.id}
                onPress={() => onLessonPress(lesson)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 10, paddingRight: 8, paddingLeft: active ? 10 : 0,
                  marginLeft: active ? -10 : 0,
                  borderRadius: active ? radius.tile : 0,
                  backgroundColor: active ? colors.azureSoft : 'transparent',
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${lesson.title}. ${stateWords}${lesson.duration ? `, ${lesson.duration} min` : ''}`}
              >
                {/* The checklist: done = filled check, current = play, to do =
                    an empty circle. The content TYPE stays legible for the
                    untouched ones — on a metered connection video vs quiz (and
                    the duration) is what a student picks on. */}
                {isDone ? (
                  <CheckCircle2 color="#ffffff" fill={colors.azure} size={19} />
                ) : active ? (
                  <PlayCircle color={colors.azure} size={19} />
                ) : lesson.type === 'video' ? (
                  <PlayCircle color={colors.faint} size={19} strokeWidth={1.8} />
                ) : (
                  <ClipboardList color={colors.faint} size={19} strokeWidth={1.8} />
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      active || isDone ? typeScale.bodyMd : typeScale.body,
                      { color: active ? colors.azure : isDone ? colors.muted : colors.ink },
                    ]}
                    numberOfLines={2}
                  >
                    {lesson.title}
                  </Text>
                  {active || (ev && ev !== 'completed') ? (
                    <Text style={[typeScale.caption, { color: active ? colors.azure : colors.muted, marginTop: 1 }]}>
                      {active ? t('En cours', 'An kou') : evidenceLabel(ev!, !!isCreole)}
                    </Text>
                  ) : null}
                </View>
                {lesson.duration ? (
                  <Text style={[typeScale.micro, { color: colors.faint }]}>{lesson.duration} min</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}

          {/* The chapter test closes the chapter — the only way to "maîtrisé". */}
          <TouchableOpacity
            onPress={() => onChapterTest(unit)}
            disabled={!testReady}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              marginTop: 10, paddingVertical: 13, paddingHorizontal: 14,
              borderRadius: radius.control, borderWidth: 1,
              borderColor: testReady ? tint : colors.border,
              opacity: testReady ? 1 : 0.55,
            }}
            accessibilityRole="button"
          >
            <Target color={testReady ? tint : colors.faint} size={17} />
            <View style={{ flex: 1 }}>
              <Text style={[typeScale.titleSm, { color: testReady ? colors.ink : colors.muted }]}>
                {t('Test du chapitre', 'Tès chapit la')}
              </Text>
              <Text style={[typeScale.micro, { color: colors.faint, marginTop: 2 }]}>
                {testReady
                  ? t('Passe tes leçons au niveau maîtrisé', 'Pote leson ou yo nan nivo metrize')
                  : t('Fais d\'abord les exercices d\'une leçon', 'Fè egzèsis yon leson anvan')}
              </Text>
            </View>
            {testReady ? <ChevronRight color={colors.faint} size={16} /> : null}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function CourseDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { courseId, lessonId, autoplay } = route.params;
  const { data: courses, isLoading, isError, refetch } = useCourses();
  const appQuery = useAppData();
  const {
    user, isAuthenticated, progress, updateProgress, incrementGuestInteraction, recordActivity, language,
    lastActivity, practiceTipSeen, setPracticeTipSeen,
  } = useStore();
  const colors = useColors();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const offline = useOffline();

  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  const [practiceMode, setPracticeMode] = useState<'flashcards' | 'exercices' | null>(null);
  const [testUnit, setTestUnit] = useState<any | null>(null);
  const [showPracticeTip, setShowPracticeTip] = useState(false);
  /** A deep link named a lesson the catalogue no longer has (LJ-02 stale link). */
  const [staleLesson, setStaleLesson] = useState(false);
  const practiceRowRef = useRef<View>(null);
  const landedFor = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
  // Full-width 180pt hero — the sharp hq720 still, walking down the candidates
  // on failure.
  const { uri: heroThumb, onError: onHeroThumbError } = useCourseThumb(course);

  const tint = courseTint(course?.color);
  const description = useMemo(() => parseCourseDescription(course?.description), [course?.description]);

  // ── Completion (LJ-05): acknowledged ONLY after a server-confirmed save ──
  const uid = isAuthenticated ? user?.uid ?? null : null;
  const saveCompletion = useCallback(
    async (u: string, c: string, l: string) => (u ? confirmLessonComplete(u, c, l) : 'local' as const),
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

  // Loading and error carry the same back arrow as the loaded screen.
  const withChrome = (body: React.ReactNode) => (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          onPress={goBack}
          className="mr-3 p-1"
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft color={colors.ink} size={22} />
        </TouchableOpacity>
        <Text style={[typeScale.titleSm, { color: colors.muted }]}>{t('Cours', 'Kou')}</Text>
      </View>
      {body}
    </SafeAreaView>
  );

  if (!course && isLoading) return withChrome(<ListSkeleton rows={6} />);
  if (!course && isError) return withChrome(<ErrorState onRetry={() => refetch()} />);
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

  function onLessonPress(lesson: any) {
    setStaleLesson(false);
    setActiveLesson(lesson);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function openChapterPractice() {
    if (practice.status !== 'ready' || !activeLesson) return;
    trackJourney('practice_handoff_opened', {
      course_id: course!.id, course_code: practice.handoff.course, unit: practice.unit,
      lesson_id: activeLesson.id, count: practice.count, from: 'lesson',
    });
    navigation.navigate('Quizzes', { courseId: course!.id, handoff: practice.handoff });
  }

  const isLastLesson = activeIndex === allLessons.length - 1;
  const nextLessonObj = activeIndex >= 0 && !isLastLesson ? allLessons[activeIndex + 1] : null;
  const activeEvidence = activeLesson ? lessonEvidence(activeLesson.id, progress as ProgressMap) : null;
  const isAlreadyDone = activeEvidence === 'completed' || activeEvidence === 'practised' || activeEvidence === 'mastered';
  const entry = completion.entryFor(activeLesson?.id);
  const levelLabel = course.level ? (LEVEL_LABEL[course.level] ?? course.level) : null;
  const showHero = !activeLesson;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Back bar. On the overview it stays minimal (the hero owns the
          identity); with a lesson open it carries the course, and back
          returns to the course overview. */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          onPress={goBack}
          className="mr-3 p-1"
          accessibilityRole="button"
          accessibilityLabel={activeLesson ? t('Retour au cours', 'Retounen nan kou a') : t('Retour', 'Retounen')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft color={colors.ink} size={22} />
        </TouchableOpacity>
        {showHero ? (
          <Text style={[typeScale.titleSm, { color: colors.muted }]}>{t('Cours', 'Kou')}</Text>
        ) : (
          <TouchableOpacity
            className="flex-1"
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={`${t('Retour au cours', 'Retounen nan kou a')} ${course.name}`}
          >
            <Text numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>{course.name}</Text>
            <Text style={[typeScale.caption, { color: colors.muted }]}>
              {levelLabel ? `${levelLabel} · ` : ''}{t('Plan du cours', 'Plan kou a')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* LJ-04: the lesson's identity BEFORE the player in reading order. */}
      {activeLesson && (
        <View className="px-5 pb-3" style={{ backgroundColor: colors.bg }} accessible accessibilityRole="header"
          accessibilityLabel={`${activeRef ? `${t('Chapitre', 'Chapit')} ${activeRef.unitIndex + 1}${activeRef.unit?.title ? `, ${activeRef.unit.title}` : ''}. ` : ''}${activeLesson.title}`}
        >
          {activeRef ? (
            <Text style={[typeScale.overline, { color: tint }]} numberOfLines={1}>
              {t('Chapitre', 'Chapit')} {activeRef.unitIndex + 1}{activeRef.unit?.title ? ` · ${activeRef.unit.title}` : ''}
            </Text>
          ) : null}
          <Text style={[typeScale.title, { color: colors.ink, fontSize: 18, lineHeight: 23, marginTop: 2 }]} numberOfLines={3}>
            {activeLesson.title}
          </Text>
        </View>
      )}

      {activeLesson?.videoUrl ? (
        <VideoPlayer videoUrl={activeLesson.videoUrl} isCreole={isCreole} offline={offline} />
      ) : activeLesson ? (
        <View
          className="w-full items-center justify-center"
          style={{ height: 80, backgroundColor: colors.surfaceAlt }}
        >
          <Text style={[typeScale.body, { color: colors.muted }]}>
            {activeLesson.type === 'video' ? t('Vidéo non disponible', 'Videyo pa disponib') : t('Quiz / Exercice', 'Quiz / Egzèsis')}
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
      >
        {/* The open lesson: status, the one completion/continuation region,
            then the lesson's own practice tools and Préc./Suiv. */}
        {activeLesson && (
          <View className="px-5 py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
            {activeLesson.objectives ? (
              <Text className="leading-relaxed" style={[typeScale.body, { color: colors.muted }]}>{activeLesson.objectives}</Text>
            ) : null}

            {(() => {
              // Where this lesson stands, in the shared evidence words + what
              // the ladder still asks. Hidden until something is recorded.
              if (!activeEvidence) return null;
              const step = masteryNextStep(lessonMastery((progress as ProgressMap)[activeLesson.id]), isCreole);
              return (
                <Text style={[typeScale.status, { color: colors.ink, marginTop: 10 }]}>
                  {evidenceLabel(activeEvidence, isCreole)}
                  {step ? <Text style={{ color: colors.muted }}>{` · ${step}`}</Text> : null}
                </Text>
              );
            })()}

            <LessonCompletionPanel
              entry={entry}
              alreadyDone={isAlreadyDone}
              isGuest={!uid}
              isCreole={isCreole}
              practice={practice}
              nextTitle={nextLessonObj?.title ?? null}
              isLast={isLastLesson}
              onComplete={() => completion.complete(activeLesson.id)}
              onPractice={openChapterPractice}
              onNext={() => nextLessonObj && onLessonPress(nextLessonObj)}
            />

            {/* This lesson's own tools — quieter than the region above. */}
            <View ref={practiceRowRef} collapsable={false} className="flex-row gap-3 mt-4">
              <TouchableOpacity
                onPress={() => setPracticeMode('flashcards')}
                accessibilityRole="button"
                accessibilityLabel={t('Flashcards de cette leçon', 'Kat etid leson sa a')}
                style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border }}
              >
                <Sparkles color={colors.azure} size={16} />
                <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{t('Flashcards', 'Kat etid')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPracticeMode('exercices')}
                accessibilityRole="button"
                accessibilityLabel={t('Exercices de cette leçon', 'Egzèsis leson sa a')}
                style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border }}
              >
                <ClipboardList color={colors.azure} size={16} />
                <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{t('Exercices', 'Egzèsis')}</Text>
              </TouchableOpacity>
            </View>

            {/* Prev / Next */}
            <View className="flex-row gap-2 mt-3">
              <TouchableOpacity
                onPress={() => activeIndex > 0 && onLessonPress(allLessons[activeIndex - 1])}
                disabled={activeIndex <= 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: activeIndex <= 0 }}
                accessibilityLabel={t('Leçon précédente', 'Leson anvan an')}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, opacity: activeIndex <= 0 ? 0.35 : 1 }}
              >
                <ChevronLeft color={colors.muted} size={16} />
                <Text style={[typeScale.bodyMd, { color: colors.muted }]}>{t('Précédente', 'Anvan')}</Text>
              </TouchableOpacity>
              <View className="flex-1" />
              {nextLessonObj ? (
                <TouchableOpacity
                  onPress={() => onLessonPress(nextLessonObj)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Leçon suivante', 'Pwochen leson')} : ${nextLessonObj.title}`}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 }}
                >
                  <Text style={[typeScale.bodyMd, { color: colors.muted }]}>{t('Suivante', 'Apre')}</Text>
                  <ChevronRight color={colors.muted} size={16} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {/* LJ-03 overview: the course's own imagery, its class, the real
            evidence, and ONE start/resume action that names the lesson. */}
        {showHero && (
          <View style={{ paddingHorizontal: 16 }}>
            {staleLesson ? (
              <View accessibilityLiveRegion="polite" style={{ marginBottom: 14, padding: 12, borderRadius: radius.card, backgroundColor: colors.warnSoft }}>
                <Text style={[typeScale.status, { color: colors.ink }]}>
                  {t(
                    "La leçon demandée n'est plus dans ce cours. Choisis une leçon dans le plan ci-dessous.",
                    'Leson ou te mande a pa nan kou sa a ankò. Chwazi yon leson nan plan ki anba a.',
                  )}
                </Text>
              </View>
            ) : null}
            {heroThumb ? (
              <Image
                source={{ uri: heroThumb }}
                resizeMode="cover"
                onError={onHeroThumbError}
                accessibilityIgnoresInvertColors
                style={{ width: '100%', height: 180, borderRadius: radius.card, backgroundColor: colors.surfaceAlt }}
              />
            ) : (
              <View style={{ width: '100%', height: 180, borderRadius: radius.card, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 52, height: 4, borderRadius: 2, backgroundColor: tint, opacity: 0.5 }} />
              </View>
            )}
            <Text style={[typeScale.h1, { color: colors.ink, marginTop: 18 }]} accessibilityRole="header">{course.name}</Text>
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>
              {levelLabel ? `${levelLabel} · ` : ''}{course.modules?.length ?? 0} {t('chapitres', 'chapit')} · {summary.total} {t('leçons', 'leson')}
            </Text>

            {evidence.completed + evidence.practised > 0 && (
              <View style={{ marginTop: 14 }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.hairline }}>
                  <View style={{ width: `${Math.min(100, Math.round((evidence.completed / Math.max(1, evidence.total)) * 100))}%`, height: 4, borderRadius: 2, backgroundColor: colors.azure }} />
                </View>
                <Text style={[typeScale.status, { color: colors.ink, marginTop: 8 }]}>
                  {evidenceLine(evidence, isCreole)}
                </Text>
              </View>
            )}

            {startTarget && (
              <PressableScale
                onPress={() => {
                  trackJourney('learning_next_action_selected', {
                    kind: 'course-start', reason: startTarget.reason, course_id: course.id, lesson_id: startTarget.ref.lesson.id,
                  });
                  onLessonPress(startTarget.ref.lesson);
                }}
                pressedScale={0.98}
                style={{
                  marginTop: 16, minHeight: 48, borderRadius: radius.control,
                  backgroundColor: colors.azureFill, paddingHorizontal: 14,
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
                accessibilityRole="button"
                accessibilityLabel={`${startTarget.started ? t('Reprendre', 'Kontinye') : t('Commencer', 'Kòmanse')} : ${startTarget.ref.lesson.title}, ${t('chapitre', 'chapit')} ${startTarget.ref.unitIndex + 1}`}
              >
                <PlayCircle color="#ffffff" size={18} />
                <Text numberOfLines={1} style={[typeScale.action, { color: '#ffffff', flexShrink: 1 }]}>
                  {startTarget.started ? t('Reprendre', 'Kontinye') : t('Commencer', 'Kòmanse')} : {startTarget.ref.lesson.title}
                </Text>
              </PressableScale>
            )}
            {startTarget ? (
              <Text style={[typeScale.caption, { color: colors.muted, marginTop: 6, textAlign: 'center' }]} numberOfLines={1}>
                {t('Chapitre', 'Chapit')} {startTarget.ref.unitIndex + 1}{startTarget.ref.unit?.title ? ` · ${startTarget.ref.unit.title}` : ''}
              </Text>
            ) : null}
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingTop: showHero ? 22 : 16 }}>
        {/* Per-lesson discussion (shared thread with the web app) */}
        {activeLesson && (
          <LessonComments threadKey={`comments:${course.id}:${activeLesson.id}`} isCreole={isCreole} />
        )}
        {/* The outline — the real chapters, current/completed marked with a
            symbol AND words. Chapters come before reference material. */}
        <Text style={[typeScale.overline, { color: colors.faint, marginBottom: 2 }]}>
          {activeLesson ? t('Plan du cours', 'Plan kou a') : t('Chapitres', 'Chapit yo')} · {course.modules?.length ?? 0}
        </Text>
        {(course.modules ?? []).map((unit: any, unitIndex: number) => (
          <UnitRow
            key={unit.id ?? unitIndex}
            unit={unit}
            index={unitIndex}
            tint={tint}
            progress={progress as ProgressMap}
            activeLesson={activeLesson}
            onLessonPress={onLessonPress}
            onChapterTest={setTestUnit}
            isCreole={isCreole}
          />
        ))}

        {/* The person behind the course — real, bound instructors only. */}
        {!activeLesson && <CourseInstructorCard courseId={courseId} />}

        {/* Reference material, after the lessons: what the course covers, and —
            on a first visit only — how the levels are earned. */}
        {!activeLesson && (description.intro || description.topics.length > 0 || summary.started === 0) && (
          <View style={{ marginTop: 34, paddingTop: 22, borderTopWidth: 1, borderTopColor: colors.hairline }}>
            {description.intro ? (
              <Text style={[typeScale.body, { color: colors.muted, lineHeight: 21 }]}>
                {description.intro}
              </Text>
            ) : null}

            {description.topics.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={[typeScale.overline, { color: colors.faint }]}>
                  {t('Ce que tu vas apprendre', 'Sa w ap aprann')}
                </Text>
                <View className="mt-2 gap-2">
                  {description.topics.map((topic, topicIndex) => (
                    <View key={`${topicIndex}-${topic.label}`} className="flex-row gap-2">
                      <View
                        className="flex-shrink-0"
                        style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 }}
                      />
                      <View className="flex-1">
                        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{topic.label}</Text>
                        {topic.detail ? (
                          <Text className="mt-0.5" style={[typeScale.caption, { color: colors.faint }]}>{topic.detail}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {summary.started === 0 && (
              <View style={{ marginTop: 26 }}>
                <Text style={[typeScale.overline, { color: colors.faint, marginBottom: 12 }]}>
                  {t('Comment on progresse', 'Kijan ou avanse')}
                </Text>
                {([
                  ['seen', t('Regarde la leçon', 'Gade leson an')],
                  ['familiar', t('Réussis 70% des exercices', 'Reyisi 70% egzèsis yo')],
                  ['proficient', t('Réussis-les à 100%', 'Reyisi yo a 100%')],
                  ['mastered', t('Confirme-le au test du chapitre', 'Konfime l nan tès chapit la')],
                ] as const).map(([lvl, how]) => (
                  <View key={lvl} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: masteryColor(lvl, colors) }} />
                    <Text style={[typeScale.bodyMd, { color: colors.ink, width: 84 }]}>
                      {masteryLabel(lvl, isCreole)}
                    </Text>
                    <Text style={[typeScale.caption, { color: colors.muted, flex: 1 }]}>{how}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
        </View>
      </ScrollView>

      {activeLesson && (
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
      )}

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
