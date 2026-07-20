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
import { LoadingState, ErrorState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import LessonPractice from '../components/LessonPractice';
import PracticeSpotlight from '../components/PracticeSpotlight';
import LessonComments from '../components/LessonComments';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useColors } from '../theme/theme';

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
        <Text className="text-gray-400 text-xs">{isCreole ? 'Videyo pa disponib pou kounye a' : 'Vidéo indisponible pour le moment'}</Text>
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

function UnitAccordion({ unit, completedIds, activeLesson, onLessonPress, isCreole }: {
  unit: any;
  completedIds: Set<string>;
  activeLesson: any | null;
  onLessonPress: (lesson: any) => void;
  isCreole?: boolean;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(true);
  const unitDone = (unit.lessons ?? []).filter((l: any) => completedIds.has(l.id)).length;
  const unitTotal = (unit.lessons ?? []).length;

  return (
    <View className="mb-2">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center bg-gray-100 dark:bg-slate-800 rounded-xl px-4 py-3 gap-2"
      >
        <View className="flex-1">
          <Text className="font-bold text-gray-800 dark:text-slate-200 text-sm">{unit.title}</Text>
          <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{unitDone}/{unitTotal} {isCreole ? 'leson' : 'leçons'}</Text>
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
                  className="flex-1 text-sm"
                  style={{ color: active ? colors.azure : colors.ink, fontWeight: active ? '600' : '400' }}
                  numberOfLines={2}
                >
                  {lesson.title}
                </Text>
                {done
                  ? <CheckCircle2 color={colors.success} size={16} />
                  : lesson.duration
                    ? <Text className="text-xs text-gray-400 dark:text-slate-500">{lesson.duration}min</Text>
                    : null}
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
  const { courseId } = route.params;
  const { data: courses, isLoading, isError } = useCourses();
  const { progress, updateProgress, incrementGuestInteraction, recordActivity, language,
    practiceTipSeen, setPracticeTipSeen } = useStore();
  const colors = useColors();
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

  const completedCount = useMemo(() => allLessons.filter((l: any) => completedIds.has(l.id)).length, [allLessons, completedIds]);
  const pct = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;

  if (isLoading) return <LoadingState />;
  if (isError || !course) return <ErrorState />;

  function onLessonPress(lesson: any) {
    setActiveLesson(lesson);
    recordActivity({
      type: 'lesson',
      path: course!.id,
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
          onPress={() => navigation.goBack()}
          className="mr-3 p-1"
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft color={colors.muted} size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 dark:text-slate-100 text-base" numberOfLines={1}>{course.name}</Text>
          <Text className="text-xs text-gray-400 dark:text-slate-500">{completedCount}/{allLessons.length} {t('leçons', 'leson')}</Text>
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
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            {activeLesson.type === 'video' ? t('Vidéo non disponible', 'Videyo pa disponib') : t('Quiz / Exercice', 'Quiz / Egzèsis')}
          </Text>
        </View>
      ) : null}

      {/* Active lesson info + mark complete */}
      {activeLesson && (
        <View className="px-5 py-4" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
          <Text className="font-bold text-gray-900 dark:text-slate-100 text-base">{activeLesson.title}</Text>
          {activeLesson.objectives ? (
            <Text className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">{activeLesson.objectives}</Text>
          ) : null}
          <View className="flex-row gap-3 mt-3">
            {isAlreadyDone ? (
              <View className="flex-row items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 color={colors.success} size={16} />
                <Text className="text-emerald-700 dark:text-emerald-300 text-sm font-semibold">{t('Terminé', 'Fini')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={markComplete}
                className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: course.color ?? colors.azure }}
              >
                <CheckCircle2 color="#fff" size={16} />
                <Text className="text-white text-sm font-bold">{t('Marquer terminé', 'Make kòm fini')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Flashcards + Exercices — per-lesson practice (same quiz bank as web) */}
          <View ref={practiceRowRef} collapsable={false} className="flex-row gap-3 mt-3">
            <TouchableOpacity
              onPress={() => setPracticeMode('flashcards')}
              className="flex-1 flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#131c2e]"
            >
              <Sparkles color={colors.azure} size={16} />
              <Text className="text-gray-800 dark:text-slate-200 text-sm font-semibold">{t('Flashcards', 'Flashcards')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPracticeMode('exercices')}
              className="flex-1 flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl"
              style={{ backgroundColor: course.color ?? colors.azure }}
            >
              <ClipboardList color="#fff" size={16} />
              <Text className="text-white text-sm font-bold">{isCreole ? 'Egzèsis' : 'Exercices'}</Text>
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
              <Text className="text-gray-700 dark:text-slate-300 text-xs font-medium">{t('Préc.', 'Avan')}</Text>
            </TouchableOpacity>
            <View className="flex-1" />
            {isLastLesson ? (
              <View className="flex-row items-center gap-1 px-3 py-2 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200 dark:border-amber-800">
                <Trophy color={colors.warn} size={16} />
                <Text className="text-amber-700 dark:text-amber-300 text-xs font-semibold">{t('Dernière leçon', 'Dènye leson')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setActiveLesson(allLessons[activeIndex + 1])}
                className="flex-row items-center gap-1 px-3 py-2 rounded-xl"
                style={{ backgroundColor: course.color ?? colors.azure }}
              >
                <Text className="text-white text-xs font-medium">{t('Suiv.', 'Aprè')}</Text>
                <ChevronRight color="#fff" size={16} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Module list */}
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Per-lesson discussion (shared thread with the web app) */}
        {activeLesson && (
          <LessonComments threadKey={`comments:${course.id}:${activeLesson.id}`} isCreole={isCreole} />
        )}
        {!activeLesson && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, shadowColor: colors.azure, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
            <Text className="font-semibold text-gray-900 dark:text-slate-100 mb-1">{course.name}</Text>
            {course.description ? (
              <Text className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{course.description}</Text>
            ) : null}
            <Text className="text-xs text-gray-400 dark:text-slate-500 mt-3">{allLessons.length} {t('leçons', 'leson')} · {course.modules?.length ?? 0} {t('unités', 'inite')}</Text>
          </View>
        )}
        {(course.modules ?? []).map((unit: any) => (
          <UnitAccordion
            key={unit.id}
            unit={unit}
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
