import React, { useState, useMemo } from 'react';
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
import { CoursesParamList } from '../navigation/CoursesNavigator';

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

function VideoPlayer({ videoUrl }: { videoUrl: string }) {
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
        <Text className="text-gray-400 text-xs">Vidéo indisponible pour le moment</Text>
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

function UnitAccordion({ unit, completedIds, activeLesson, onLessonPress }: {
  unit: any;
  completedIds: Set<string>;
  activeLesson: any | null;
  onLessonPress: (lesson: any) => void;
}) {
  const [open, setOpen] = useState(true);
  const unitDone = (unit.lessons ?? []).filter((l: any) => completedIds.has(l.id)).length;
  const unitTotal = (unit.lessons ?? []).length;

  return (
    <View className="mb-2">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3 gap-2"
      >
        <View className="flex-1">
          <Text className="font-bold text-gray-800 text-sm">{unit.title}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">{unitDone}/{unitTotal} leçons</Text>
        </View>
        {open ? <ChevronDown color="#6b7280" size={18} /> : <ChevronRight color="#6b7280" size={18} />}
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
                className={`flex-row items-center rounded-xl px-4 py-3 mb-1 gap-3 ${active ? 'bg-blue-50 border border-blue-200' : 'bg-white'}`}
              >
                {lesson.type === 'video'
                  ? <PlayCircle color={done ? '#10b981' : active ? '#0857A6' : '#9ca3af'} size={20} />
                  : <ClipboardList color={done ? '#10b981' : active ? '#f59e0b' : '#9ca3af'} size={20} />}
                <Text
                  className="flex-1 text-sm"
                  style={{ color: active ? '#0857A6' : '#1f2937', fontWeight: active ? '600' : '400' }}
                  numberOfLines={2}
                >
                  {lesson.title}
                </Text>
                {done
                  ? <CheckCircle2 color="#10b981" size={16} />
                  : lesson.duration
                    ? <Text className="text-xs text-gray-400">{lesson.duration}min</Text>
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
  const { progress, updateProgress, incrementGuestInteraction, recordActivity, language } = useStore();
  const isCreole = language === 'ht';

  const [activeLesson, setActiveLesson] = useState<any | null>(null);
  const [practiceMode, setPracticeMode] = useState<'flashcards' | 'exercices' | null>(null);

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
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
      {/* Back bar */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base" numberOfLines={1}>{course.name}</Text>
          <Text className="text-xs text-gray-400">{completedCount}/{allLessons.length} leçons</Text>
        </View>
      </View>

      {/* Course progress bar */}
      {allLessons.length > 0 && (
        <View className="bg-white px-4 pb-3">
          <ProgressBar value={pct} color={course.color ?? '#0857A6'} height={4} />
        </View>
      )}

      {/* Video player (no decorative banner when nothing is playing) */}
      {activeLesson?.videoUrl ? (
        <VideoPlayer videoUrl={activeLesson.videoUrl} />
      ) : activeLesson ? (
        <View
          className="w-full items-center justify-center"
          style={{ height: 80, backgroundColor: (course.color ?? '#0857A6') + '15' }}
        >
          <Text className="text-gray-500 text-sm">{activeLesson.type === 'video' ? 'Vidéo non disponible' : 'Quiz / Exercice'}</Text>
        </View>
      ) : null}

      {/* Active lesson info + mark complete */}
      {activeLesson && (
        <View className="bg-white px-5 py-4 border-b border-gray-100">
          <Text className="font-bold text-gray-900 text-base">{activeLesson.title}</Text>
          {activeLesson.objectives ? (
            <Text className="text-xs text-gray-500 mt-1 leading-relaxed">{activeLesson.objectives}</Text>
          ) : null}
          <View className="flex-row gap-3 mt-3">
            {isAlreadyDone ? (
              <View className="flex-row items-center gap-2 px-4 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                <CheckCircle2 color="#10b981" size={16} />
                <Text className="text-emerald-700 text-sm font-semibold">Terminé</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={markComplete}
                className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: course.color ?? '#0857A6' }}
              >
                <CheckCircle2 color="#fff" size={16} />
                <Text className="text-white text-sm font-bold">Marquer terminé</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Flashcards + Exercices — per-lesson practice (same quiz bank as web) */}
          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              onPress={() => setPracticeMode('flashcards')}
              className="flex-1 flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <Sparkles color="#0857A6" size={16} />
              <Text className="text-gray-800 text-sm font-semibold">Flashcards</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPracticeMode('exercices')}
              className="flex-1 flex-row items-center justify-center gap-2 px-4 py-2.5 rounded-xl"
              style={{ backgroundColor: course.color ?? '#0857A6' }}
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
              className={`flex-row items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 ${activeIndex <= 0 ? 'opacity-30' : ''}`}
            >
              <ChevronLeft color="#374151" size={16} />
              <Text className="text-gray-700 text-xs font-medium">Préc.</Text>
            </TouchableOpacity>
            <View className="flex-1" />
            {isLastLesson ? (
              <View className="flex-row items-center gap-1 px-3 py-2 bg-amber-50 rounded-xl border border-amber-200">
                <Trophy color="#f59e0b" size={16} />
                <Text className="text-amber-700 text-xs font-semibold">Dernière leçon</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setActiveLesson(allLessons[activeIndex + 1])}
                className="flex-row items-center gap-1 px-3 py-2 rounded-xl"
                style={{ backgroundColor: course.color ?? '#0857A6' }}
              >
                <Text className="text-white text-xs font-medium">Suiv.</Text>
                <ChevronRight color="#fff" size={16} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Module list */}
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {!activeLesson && (
          <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }}>
            <Text className="font-semibold text-gray-900 mb-1">{course.name}</Text>
            {course.description ? (
              <Text className="text-sm text-gray-500 leading-relaxed">{course.description}</Text>
            ) : null}
            <Text className="text-xs text-gray-400 mt-3">{allLessons.length} leçons · {course.modules?.length ?? 0} unités</Text>
          </View>
        )}
        {(course.modules ?? []).map((unit: any) => (
          <UnitAccordion
            key={unit.id}
            unit={unit}
            completedIds={completedIds}
            activeLesson={activeLesson}
            onLessonPress={onLessonPress}
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
    </SafeAreaView>
  );
}
