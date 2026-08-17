import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft, BookOpen, ChevronDown, ChevronRight, PlayCircle, ClipboardList,
  CheckCircle2, ChevronLeft, Trophy, Sparkles,
} from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import LessonPractice from '../components/LessonPractice';
import PracticeSpotlight from '../components/PracticeSpotlight';
import LessonComments from '../components/LessonComments';
import DefiHandoffCard from '../components/DefiHandoffCard';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useColors, typeScale, radius, courseTint } from '../theme/theme';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { courseSubjectIcon } from '../utils/subjectMeta';

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

function UnitAccordion({ unit, index, tint, completedIds, activeLesson, onLessonPress, isCreole }: {
  unit: any;
  index: number;
  tint: string;
  completedIds: Set<string>;
  activeLesson: any | null;
  onLessonPress: (lesson: any) => void;
  isCreole?: boolean;
}) {
  const colors = useColors();
  // Chapters start closed — opening a course used to dump every unit's whole
  // lesson list at once. The one exception is the unit that owns the lesson
  // currently being watched: it must stay open so the chapter never collapses
  // shut around it.
  const holdsActive = useMemo<boolean>(
    () => !!activeLesson && (unit.lessons ?? []).some((l: any) => l.id === activeLesson.id),
    [unit.lessons, activeLesson],
  );
  const [open, setOpen] = useState(holdsActive);
  // `activeLesson` arrives after mount for deep links ("Reprendre" / autoplay)
  // and changes as the student moves through Suiv./Préc., so opening also has
  // to happen on transition — not just in the initial state. Only ever opens:
  // a unit the student closed by hand stays closed once the lesson moves away.
  useEffect(() => {
    if (holdsActive) setOpen(true);
  }, [holdsActive]);
  const unitDone = (unit.lessons ?? []).filter((l: any) => completedIds.has(l.id)).length;
  const unitTotal = (unit.lessons ?? []).length;
  const unitComplete = unitTotal > 0 && unitDone === unitTotal;

  return (
    <View className="mb-2">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center bg-gray-100 dark:bg-slate-800 rounded-xl px-4 py-3 gap-3"
      >
        {/* Unit index badge — flips to a check once the unit is finished */}
        <View
          className="items-center justify-center flex-shrink-0"
          style={{
            width: 30, height: 30, borderRadius: 15,
            backgroundColor: unitComplete ? colors.success + '1e' : tint + '1e',
          }}
        >
          {unitComplete
            ? <CheckCircle2 color={colors.success} size={16} />
            : <Text style={[typeScale.label, { color: tint }]}>{index + 1}</Text>}
        </View>
        <View className="flex-1">
          <Text style={[typeScale.titleSm, { color: colors.ink }]}>{unit.title}</Text>
          <Text className="mt-0.5" style={[typeScale.caption, { color: colors.muted }]}>{unitDone}/{unitTotal} {isCreole ? 'leson' : 'leçons'}</Text>
          {unitDone > 0 && !unitComplete && (
            <View className="mt-2">
              <ProgressBar value={Math.round((unitDone / unitTotal) * 100)} color={tint} height={3} />
            </View>
          )}
        </View>
        {open ? <ChevronDown color={colors.muted} size={18} /> : <ChevronRight color={colors.muted} size={18} />}
      </TouchableOpacity>
      {open && (
        <View className="mt-1">
          {(unit.lessons ?? []).map((lesson: any) => {
            const done = completedIds.has(lesson.id);
            const active = activeLesson?.id === lesson.id;
            return (
              <TouchableOpacity
                key={lesson.id}
                onPress={() => onLessonPress(lesson)}
                className={`flex-row items-center rounded-xl px-4 py-3 mb-1 gap-3 ${active ? 'bg-blue-50 dark:bg-[#1a2436] border border-blue-200 dark:border-slate-700' : 'bg-white dark:bg-[#131c2e]'}`}
              >
                {lesson.type === 'video'
                  ? <PlayCircle color={done ? colors.success : active ? colors.azure : colors.faint} size={20} />
                  : <ClipboardList color={done ? colors.success : active ? colors.warn : colors.faint} size={20} />}
                <Text
                  className="flex-1"
                  style={[active ? typeScale.bodyMd : typeScale.body, { color: active ? colors.azure : colors.ink }]}
                  numberOfLines={2}
                >
                  {lesson.title}
                </Text>
                {done ? (
                  <CheckCircle2 color={colors.success} size={16} />
                ) : lesson.duration ? (
                  <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={[typeScale.micro, { color: colors.faint }]}>{lesson.duration} min</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
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

  const completedCount = useMemo(() => allLessons.filter((l: any) => completedIds.has(l.id)).length, [allLessons, completedIds]);
  const pct = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;

  // Syllabus-state affordances: subject identity + the one lesson to resume on.
  const tint = courseTint(course?.color);
  const SubjectIcon = courseSubjectIcon(course);
  const nextLesson = useMemo(
    () => allLessons.find((l: any) => !completedIds.has(l.id)) ?? allLessons[0] ?? null,
    [allLessons, completedIds],
  );
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Back bar — shares the page ground (no seam), like the dashboard */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          // Stay inside the Courses stack: canGoBack() also counts the parent
          // tab navigator, which sent deep-linked users "back" to Home. If this
          // is the only route in the stack, land on the course list instead.
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
        <View className="flex-1">
          <Text numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>{course.name}</Text>
          <Text style={[typeScale.caption, { color: colors.faint }]}>{completedCount}/{allLessons.length} {t('leçons', 'leson')}</Text>
        </View>
      </View>

      {/* Course progress bar — merges with the header band above (no white seam) */}
      {allLessons.length > 0 && (
        <View className="px-4 pb-3" style={{ backgroundColor: colors.bg }}>
          <ProgressBar value={pct} color={course.color ?? colors.azure} height={4} />
        </View>
      )}

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
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}>
        {/* Per-lesson discussion (shared thread with the web app) */}
        {activeLesson && (
          <LessonComments threadKey={`comments:${course.id}:${activeLesson.id}`} isCreole={isCreole} />
        )}
        {!activeLesson && (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, shadowColor: colors.azure, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
            {/* Course name is already in the header bar above — don't repeat it here. */}
            <View className="flex-row items-center gap-3">
              <View
                className="items-center justify-center flex-shrink-0"
                style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: tint + '18' }}
              >
                <SubjectIcon color={tint} size={24} />
              </View>
              <View className="flex-1">
                <Text style={[typeScale.caption, { color: colors.faint }]}>
                  {allLessons.length} {t('leçons', 'leson')} · {course.modules?.length ?? 0} {t('unités', 'inite')}
                  {completedCount > 0 ? ` · ${pct}% ${t('complété', 'fini')}` : ''}
                </Text>
                {completedCount > 0 && (
                  <View className="mt-2">
                    <ProgressBar value={pct} color={tint} height={4} />
                  </View>
                )}
              </View>
            </View>
            {/* Description, restructured: lead sentence as a short intro, then
                the enumerated topics as a scannable list (see
                parseCourseDescription — unrecognised shapes stay a paragraph). */}
            {description.intro ? (
              <Text className="leading-relaxed mt-3" style={[typeScale.body, { color: colors.muted }]}>{description.intro}</Text>
            ) : null}
            {description.topics.length > 0 && (
              <View className="mt-4">
                <Text style={[typeScale.overline, { color: colors.faint }]}>
                  {t('Ce que tu vas apprendre', 'Sa w ap aprann')}
                </Text>
                <View className="mt-2 gap-2">
                  {description.topics.map((topic, topicIndex) => (
                    <View key={`${topicIndex}-${topic.label}`} className="flex-row gap-2">
                      <View
                        className="flex-shrink-0"
                        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint, marginTop: 7 }}
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
            {/* One obvious way in — the first unfinished lesson, same target as
                the Home card's autoplay. A syllabus alone is a dead end. */}
            {nextLesson && (
              <TouchableOpacity
                onPress={() => onLessonPress(nextLesson)}
                className="flex-row items-center justify-center gap-2 mt-4 py-3 rounded-full"
                style={{ backgroundColor: tint }}
                accessibilityRole="button"
                accessibilityLabel={completedCount > 0 ? t('Continuer le cours', 'Kontinye kou a') : t('Commencer le cours', 'Kòmanse kou a')}
              >
                <PlayCircle color="#fff" size={18} />
                <Text style={[typeScale.titleSm, { color: '#fff' }]}>
                  {completedCount > 0 ? t('Continuer le cours', 'Kontinye kou a') : t('Commencer le cours', 'Kòmanse kou a')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {(course.modules ?? []).map((unit: any, unitIndex: number) => (
          <UnitAccordion
            key={unit.id}
            unit={unit}
            index={unitIndex}
            tint={tint}
            completedIds={completedIds}
            activeLesson={activeLesson}
            onLessonPress={onLessonPress}
            isCreole={isCreole}
          />
        ))}
      </ScrollView>

      {activeLesson && (
        <LessonPractice
          visible={practiceMode != null}
          onClose={() => setPracticeMode(null)}
          subjectCode={course.code}
          unitNo={activeLesson.unit_no}
          lessonNo={activeLesson.lesson_no}
          initialMode={practiceMode ?? 'flashcards'}
          isCreole={isCreole}
        />
      )}

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
