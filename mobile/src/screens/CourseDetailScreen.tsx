import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft, ChevronDown, ChevronRight, PlayCircle, ClipboardList,
  CheckCircle2, ChevronLeft, Trophy, Sparkles, Target, Circle,
} from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import LessonPractice from '../components/LessonPractice';
import CourseInstructorCard from '../components/CourseInstructorCard';
import ChapterTest from '../components/ChapterTest';
import PressableScale from '../components/ui/PressableScale';
import { MasteryMeter } from '../components/MasteryMeter';
import { courseVideoThumb } from '../utils/videoThumb';
import {
  summarize, lessonMastery, masteryLabel, masteryColor, masteryNextStep,
  courseLessonIds, type ProgressMap,
} from '../utils/mastery';
import PracticeSpotlight from '../components/PracticeSpotlight';
import LessonComments from '../components/LessonComments';
import DefiHandoffCard from '../components/DefiHandoffCard';
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

function VideoPlayer({ videoUrl, isCreole }: { videoUrl: string; isCreole?: boolean }) {
  const [failed, setFailed] = useState(false);
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

  if (failed) {
    return (
      <View
        className="w-full items-center justify-center gap-2"
        style={{ aspectRatio: 16 / 9, backgroundColor: '#111827' }}
      >
        <PlayCircle color="#9ca3af" size={36} />
        <Text style={[typeScale.caption, { color: '#9ca3af' }]}>{isCreole ? 'Videyo pa disponib pou kounye a' : 'Vidéo indisponible pour le moment'}</Text>
      </View>
    );
  }

  return (
    <View className="w-full bg-black" style={{ aspectRatio: 16 / 9 }}>
      <WebView
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
  // The simple statement the restyle leads with: lessons finished / total.
  const done = useMemo(
    () => lessons.filter((l: any) => {
      const p = progress[l.id];
      return !!p && (p.completed || !!p.masteredAt);
    }).length,
    [lessons, progress],
  );
  const finished = summary.total > 0 && done >= summary.total;
  // The chapter test is worth offering once anything in the chapter is solid —
  // before that there is nothing for it to promote.
  const testReady = summary.counts.proficient > 0 || summary.counts.familiar > 0 || summary.counts.mastered > 0;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${unit.title}. ${done} ${t('sur', 'sou')} ${summary.total} ${t('leçons', 'leson')}`}
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
            {finished
              ? `${summary.total} ${t('leçons', 'leson')} · ${t('Terminé', 'Fini')}`
              : done > 0
                ? `${done}/${summary.total} ${t('leçons', 'leson')}`
                : `${summary.total} ${t('leçons', 'leson')}`}
            {summary.mastered > 0 ? ` · ${summary.mastered} ${t('maîtrisée', 'metrize')}${summary.mastered > 1 && !isCreole ? 's' : ''}` : ''}
          </Text>
        </View>
        {open
          ? <ChevronDown color={colors.faint} size={16} />
          : <ChevronRight color={colors.faint} size={16} />}
      </TouchableOpacity>

      {open && (
        <View style={{ paddingBottom: 14, paddingLeft: 38 }}>
          {lessons.map((lesson: any) => {
            const level = lessonMastery(progress[lesson.id]);
            const p = progress[lesson.id];
            const isDone = !!p && (p.completed || !!p.masteredAt);
            const active = activeLesson?.id === lesson.id;
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
                accessibilityLabel={`${lesson.title}. ${masteryLabel(level, isCreole)}${lesson.duration ? `, ${lesson.duration} min` : ''}`}
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
                <Text
                  style={[
                    active || isDone ? typeScale.bodyMd : typeScale.body,
                    { flex: 1, color: active ? colors.azure : isDone ? colors.muted : colors.ink },
                  ]}
                  numberOfLines={2}
                >
                  {lesson.title}
                </Text>
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
  const { data: courses, isLoading, isError } = useCourses();
  const { progress, updateProgress, incrementGuestInteraction, recordActivity, language,
    practiceTipSeen, setPracticeTipSeen } = useStore();
  const colors = useColors();
  const centerColumn = useContentContainerStyle('readable'); // iPad: center a capped column
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  const [practiceMode, setPracticeMode] = useState<'flashcards' | 'exercices' | null>(null);
  const [testUnit, setTestUnit] = useState<any | null>(null);
  const [showPracticeTip, setShowPracticeTip] = useState(false);
  const practiceRowRef = useRef<View>(null);

  // First time a lesson is opened, coach-mark the Flashcards/Exercices buttons.
  useEffect(() => {
    if (activeLesson && !practiceTipSeen) {
      const t = setTimeout(() => setShowPracticeTip(true), 400);
      return () => clearTimeout(t);
    }
  }, [activeLesson?.id, practiceTipSeen]);

  const course = useMemo(() => courses?.find((c) => c.id === courseId), [courses, courseId]);

  const completedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(progress).forEach(([id, p]: [string, any]) => {
      if (p?.completed) ids.add(id);
    });
    return ids;
  }, [progress]);

  // Flat list of all lessons for prev/next navigation
  const allLessons = useMemo(() => {
    if (!course?.modules) return [];
    return course.modules.flatMap((u: any) => u?.lessons ?? []);
  }, [course]);

  const activeIndex = useMemo(() => {
    if (!activeLesson) return -1;
    return allLessons.findIndex((l: any) => l.id === activeLesson.id);
  }, [allLessons, activeLesson]);

  // Deep-link landing: open the requested lesson (Reprendre), or with autoplay
  // the first unfinished lesson — so tapping a course card starts the video
  // page instead of dropping the student on a bare syllabus.
  useEffect(() => {
    if (allLessons.length === 0) return;
    if (lessonId) {
      // Explicit lesson request wins, including when this screen is already
      // mounted and only the params changed (a second "Reprendre").
      const target = allLessons.find((l: any) => l.id === lessonId);
      if (target && target.id !== activeLesson?.id) setActiveLesson(target);
      return;
    }
    if (!activeLesson && autoplay) {
      setActiveLesson(allLessons.find((l: any) => !completedIds.has(l.id)) ?? allLessons[0]);
    }
    // Intentionally NOT re-running on progress/activeLesson changes: landing only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLessons, lessonId, autoplay]);

  // Mastery, not consumption: this is what the whole screen is organised around.
  const summary = useMemo(
    () => summarize(courseLessonIds(course), progress as ProgressMap),
    [course, progress],
  );
  // The hero's one simple number: lessons finished across the course.
  const courseDone = useMemo(
    () => allLessons.filter((l: any) => {
      const p = (progress as ProgressMap)[l.id];
      return !!p && (p.completed || !!p.masteredAt);
    }).length,
    [allLessons, progress],
  );
  const heroThumb = useMemo(() => (course ? courseVideoThumb(course) : null), [course]);
  const [heroThumbFailed, setHeroThumbFailed] = useState(false);

  const tint = courseTint(course?.color);
  // "Next" is the first lesson that isn't finished learning — which is not the
  // same as the first unwatched video. A lesson you watched but never practised
  // is still the thing to go back to.
  const nextLesson = useMemo(
    () => allLessons.find((l: any) => lessonMastery(progress[l.id]) !== 'mastered') ?? allLessons[0] ?? null,
    [allLessons, progress],
  );
  const nextLevel = nextLesson ? lessonMastery(progress[nextLesson.id]) : 'none';
  const nextStep = masteryNextStep(nextLevel, isCreole);
  const description = useMemo(() => parseCourseDescription(course?.description), [course?.description]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <ListSkeleton rows={6} />
      </SafeAreaView>
    );
  }
  if (isError || !course) return <ErrorState />;

  // A course that loaded fine but has no lessons (empty `modules` — the
  // catalog-migration / orphan-video case) otherwise rendered "0/0 leçons", no
  // player, no start button and an empty accordion: a screen that reads as broken
  // rather than as "not ready yet".
  if (allLessons.length === 0) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
          <TouchableOpacity
            onPress={() => {
              const stackRoutes = navigation.getState()?.routes ?? [];
              if (stackRoutes.length > 1) navigation.goBack();
              else navigation.reset({ index: 0, routes: [{ name: 'CourseList' }] });
            }}
            className="mr-3 p-1"
            accessibilityRole="button"
            accessibilityLabel={t('Retour', 'Retounen')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft color={colors.muted} size={22} />
          </TouchableOpacity>
          <Text numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>{course.name}</Text>
        </View>
        <EmptyState
          title={t('Ce cours arrive bientôt', 'Kou sa a ap vini talè')}
          description={t(
            'Les leçons vidéo sont en préparation. Essaie un autre cours en attendant.',
            'Leson videyo yo ap prepare. Eseye yon lòt kou pandan n ap tann.',
          )}
          ctaLabel={t('Voir les autres cours', 'Wè lòt kou yo')}
          onCta={() => navigation.reset({ index: 0, routes: [{ name: 'CourseList' }] })}
        />
      </SafeAreaView>
    );
  }

  function onLessonPress(lesson: any) {
    setActiveLesson(lesson);
    recordActivity({
      type: 'lesson',
      path: course!.id,
      lessonId: lesson.id,
      title: lesson.title,
      subtitle: course!.name,
      ts: Date.now(),
    });
  }

  function markComplete() {
    if (!activeLesson) return;
    updateProgress(activeLesson.id, { completed: true });
    incrementGuestInteraction();
    // Auto-advance to next lesson
    if (activeIndex < allLessons.length - 1) {
      setActiveLesson(allLessons[activeIndex + 1]);
    }
  }

  const isLastLesson = activeIndex === allLessons.length - 1;
  const isAlreadyDone = activeLesson ? completedIds.has(activeLesson.id) : false;
  // The syllabus gets the aurora hero; once a lesson is open the video owns the
  // screen and the chrome goes quiet.
  const showHero = !activeLesson;

  const goBack = () => {
    // Stay inside the Courses stack: canGoBack() also counts the parent tab
    // navigator, which sent deep-linked users "back" to Home. If this is the
    // only route in the stack, land on the course list instead.
    const stackRoutes = navigation.getState()?.routes ?? [];
    if (stackRoutes.length > 1) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'CourseList' }] });
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Back bar — shares the page ground (no seam). On the syllabus it stays
          minimal (the hero below owns the identity); with a lesson open it
          carries the course name. */}
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
        {showHero ? (
          <Text style={[typeScale.titleSm, { color: colors.muted }]}>{t('Cours', 'Kou')}</Text>
        ) : (
          <View className="flex-1">
            <Text numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>{course.name}</Text>
            <Text style={[typeScale.caption, { color: colors.faint }]}>
              {summary.total} {t('leçons', 'leson')} · {course.modules?.length ?? 0} {t('chapitres', 'chapit')}
            </Text>
          </View>
        )}
      </View>

      {/* Video player (no decorative banner when nothing is playing) */}
      {activeLesson?.videoUrl ? (
        <VideoPlayer videoUrl={activeLesson.videoUrl} isCreole={isCreole} />
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

      {/* Active lesson info + mark complete */}
      {activeLesson && (
        <View className="px-5 py-4" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text style={[typeScale.title, { color: colors.ink }]}>{activeLesson.title}</Text>
          {activeLesson.objectives ? (
            <Text className="mt-1 leading-relaxed" style={[typeScale.caption, { color: colors.muted }]}>{activeLesson.objectives}</Text>
          ) : null}

          {/* Where this lesson stands. Hidden until something is earned: at
              level `none` this was four invisible dashes next to "À découvrir",
              which read as a stray artifact under the description rather than
              as status. */}
          {(() => {
            const level = lessonMastery(progress[activeLesson.id]);
            if (level === 'none') return null;
            const step = masteryNextStep(level, isCreole);
            return (
              <View className="flex-row items-center gap-3 mt-3">
                <MasteryMeter level={level} />
                <Text style={[typeScale.micro, { color: masteryColor(level, colors) }]}>
                  {masteryLabel(level, isCreole)}
                </Text>
                {step ? (
                  <>
                    <Text style={[typeScale.micro, { color: colors.border }]}>·</Text>
                    <Text style={[typeScale.micro, { color: colors.faint, flex: 1 }]} numberOfLines={1}>
                      {step}
                    </Text>
                  </>
                ) : null}
              </View>
            );
          })()}
          <View className="flex-row gap-3 mt-3">
            {isAlreadyDone ? (
              <View className="flex-row items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 color={colors.success} size={16} />
                <Text style={[typeScale.label, { color: colors.success }]}>{t('Terminé', 'Fini')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={markComplete}
                className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: course.color ?? colors.azure }}
              >
                <CheckCircle2 color="#fff" size={16} />
                <Text style={[typeScale.titleSm, { color: '#fff' }]}>{t('Marquer terminé', 'Make kòm fini')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Lesson done → hand off into the XP loop (hidden once today's
              défi is played; compact so the practice row below stays close). */}
          {isAlreadyDone && (
            <View className="mt-3">
              <DefiHandoffCard compact />
            </View>
          )}

          {/* Flashcards + Exercices — per-lesson practice (same quiz bank as web) */}
          <View ref={practiceRowRef} collapsable={false} className="flex-row gap-3 mt-3">
            <TouchableOpacity
              onPress={() => setPracticeMode('flashcards')}
              className="flex-1 flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#131c2e]"
            >
              <Sparkles color={colors.azure} size={16} />
              <Text style={[typeScale.titleSm, { color: colors.ink }]}>{t('Flashcards', 'Kat etid')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPracticeMode('exercices')}
              className="flex-1 flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl"
              style={{ backgroundColor: course.color ?? colors.azure }}
            >
              <ClipboardList color="#fff" size={16} />
              <Text style={[typeScale.titleSm, { color: '#fff' }]}>{isCreole ? 'Egzèsis' : 'Exercices'}</Text>
            </TouchableOpacity>
          </View>

          {/* Prev / Next navigation */}
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              onPress={() => activeIndex > 0 && setActiveLesson(allLessons[activeIndex - 1])}
              disabled={activeIndex <= 0}
              className={`flex-row items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 ${activeIndex <= 0 ? 'opacity-30' : ''}`}
            >
              <ChevronLeft color={colors.muted} size={16} />
              <Text style={[typeScale.micro, { color: colors.muted }]}>{t('Préc.', 'Avan')}</Text>
            </TouchableOpacity>
            <View className="flex-1" />
            {isLastLesson ? (
              <View className="flex-row items-center gap-1 px-3 py-2 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200 dark:border-amber-800">
                <Trophy color={colors.warn} size={16} />
                <Text style={[typeScale.micro, { color: colors.warn }]}>{t('Dernière leçon', 'Dènye leson')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setActiveLesson(allLessons[activeIndex + 1])}
                className="flex-row items-center gap-1 px-3 py-2 rounded-xl"
                style={{ backgroundColor: course.color ?? colors.azure }}
              >
                <Text style={[typeScale.micro, { color: '#fff' }]}>{t('Suiv.', 'Aprè')}</Text>
                <ChevronRight color="#fff" size={16} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Module list */}
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
      >
        {/* Estil Klè hero: the course's own imagery, the name, ONE simple
            progress statement and ONE action. Identity comes from the real
            video still — no gradient ground, no arc. */}
        {showHero && (
          <View style={{ paddingHorizontal: 16 }}>
            {heroThumb && !heroThumbFailed ? (
              <Image
                source={{ uri: heroThumb }}
                resizeMode="cover"
                onError={() => setHeroThumbFailed(true)}
                style={{ width: '100%', height: 180, borderRadius: radius.card, backgroundColor: colors.surfaceAlt }}
              />
            ) : (
              <View style={{ width: '100%', height: 180, borderRadius: radius.card, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 52, height: 4, borderRadius: 2, backgroundColor: tint, opacity: 0.5 }} />
              </View>
            )}
            <Text style={[typeScale.h1, { color: colors.ink, marginTop: 18 }]}>{course.name}</Text>
            <Text style={[typeScale.label, { color: colors.muted, marginTop: 4 }]}>
              {course.modules?.length ?? 0} {t('chapitres', 'chapit')} · {summary.total} {t('leçons', 'leson')}
            </Text>

            {courseDone > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.hairline }}>
                  <View style={{ width: `${Math.min(100, Math.round((courseDone / Math.max(1, summary.total)) * 100))}%`, height: 4, borderRadius: 2, backgroundColor: colors.azure }} />
                </View>
                <Text style={[typeScale.label, { color: colors.muted }]}>
                  {courseDone}/{summary.total} {t('leçons', 'leson')}
                </Text>
              </View>
            )}

            {nextLesson && (
              <PressableScale
                onPress={() => onLessonPress(nextLesson)}
                pressedScale={0.98}
                style={{
                  marginTop: 16, height: 46, borderRadius: radius.control,
                  backgroundColor: colors.azureFill,
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 8,
                }}
                accessibilityRole="button"
                accessibilityLabel={`${summary.started > 0 ? t('Reprendre', 'Kontinye') : t('Commencer', 'Kòmanse')} — ${nextLesson.title}`}
              >
                <PlayCircle color="#ffffff" size={18} />
                <Text numberOfLines={1} style={[typeScale.titleSm, { color: '#ffffff', maxWidth: '85%' }]}>
                  {summary.started > 0
                    ? `${t('Reprendre', 'Kontinye')} — ${nextLesson.title}`
                    : t('Commencer le cours', 'Kòmanse kou a')}
                </Text>
              </PressableScale>
            )}

            {/* Mastery stays — as a quiet statement, not a monument. */}
            {summary.started > 0 && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14,
                borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
                paddingVertical: 12, paddingHorizontal: 14,
              }}>
                <MasteryMeter level={summary.level} size="sm" />
                <Text style={[typeScale.label, { color: colors.muted, flex: 1 }]}>
                  {t('Maîtrise', 'Metriz')} · {summary.points}/100
                  {nextStep ? ` — ${nextStep}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingTop: showHero ? 22 : 16 }}>
        {/* Per-lesson discussion (shared thread with the web app) */}
        {activeLesson && (
          <LessonComments threadKey={`comments:${course.id}:${activeLesson.id}`} isCreole={isCreole} />
        )}
        {/* Chapters come FIRST. They were sitting below the hero, the ladder
            legend, the description AND the topic list — two and a half screens
            of scrolling before a returning student could reach lesson four. All
            of that is reference material; the lessons are the screen. */}
        {!activeLesson && (
          <Text style={[typeScale.overline, { color: colors.faint, marginBottom: 2 }]}>
            {t('Chapitres', 'Chapit yo')} · {course.modules?.length ?? 0}
          </Text>
        )}
        {(course.modules ?? []).map((unit: any, unitIndex: number) => (
          <UnitRow
            key={unit.id}
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
            on a first visit only — how the four levels are earned. */}
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
