import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import {
  ArrowLeft, BookOpen, ChevronDown, ChevronRight, PlayCircle, ClipboardList, CheckCircle2,
} from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import useStore from '../contexts/store';
import { LoadingState, ErrorState } from '../components/StateViews';
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
  const ytId = extractYouTubeId(videoUrl);
  const embedUrl = ytId
    ? `https://www.youtube.com/embed/${ytId}?playsinline=1`
    : videoUrl;

  return (
    <View className="w-full bg-black" style={{ aspectRatio: 16 / 9 }}>
      <WebView
        source={{ uri: embedUrl }}
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        className="flex-1"
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

function UnitAccordion({ unit, completedIds, onLessonPress }: {
  unit: any;
  completedIds: Set<string>;
  onLessonPress: (lesson: any) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <View className="mb-3">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center bg-gray-100 rounded-xl px-4 py-3 gap-2"
      >
        <Text className="flex-1 font-bold text-gray-800 text-sm">{unit.title}</Text>
        {open ? <ChevronDown color="#6b7280" size={18} /> : <ChevronRight color="#6b7280" size={18} />}
      </TouchableOpacity>
      {open && (
        <View className="mt-1">
          {(unit.lessons ?? []).map((lesson: any) => {
            const done = completedIds.has(lesson.id);
            return (
              <TouchableOpacity
                key={lesson.id}
                onPress={() => onLessonPress(lesson)}
                className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-1 gap-3"
              >
                {lesson.type === 'video' ? (
                  <PlayCircle color={done ? '#10b981' : '#0857A6'} size={20} />
                ) : (
                  <ClipboardList color={done ? '#10b981' : '#f59e0b'} size={20} />
                )}
                <Text className="flex-1 text-gray-800 text-sm" numberOfLines={2}>{lesson.title}</Text>
                {done && <CheckCircle2 color="#10b981" size={16} />}
                {!done && lesson.duration && (
                  <Text className="text-xs text-gray-400">{lesson.duration}min</Text>
                )}
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
  const { progress, updateProgress } = useStore();

  const [activeLesson, setActiveLesson] = useState<any | null>(null);

  const course = React.useMemo(() => courses?.find((c) => c.id === courseId), [courses, courseId]);

  const completedIds = React.useMemo(() => {
    const ids = new Set<string>();
    Object.entries(progress).forEach(([id, p]: [string, any]) => {
      if (p?.completed) ids.add(id);
    });
    return ids;
  }, [progress]);

  if (isLoading) return <LoadingState />;
  if (isError || !course) return <ErrorState />;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Back bar */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <Text className="flex-1 font-bold text-gray-900 text-base" numberOfLines={1}>{course.name}</Text>
      </View>

      {/* Video player or header banner */}
      {activeLesson?.videoUrl ? (
        <VideoPlayer videoUrl={activeLesson.videoUrl} />
      ) : (
        <View className="w-full h-28 items-center justify-center" style={{ backgroundColor: (course.color ?? '#0857A6') + '20' }}>
          <BookOpen color={course.color ?? '#0857A6'} size={48} />
        </View>
      )}

      {/* Active lesson info */}
      {activeLesson && (
        <View className="bg-white px-5 py-3 border-b border-gray-100">
          <Text className="font-bold text-gray-900 text-base">{activeLesson.title}</Text>
          {activeLesson.objectives ? (
            <Text className="text-xs text-gray-500 mt-1" numberOfLines={2}>{activeLesson.objectives}</Text>
          ) : null}
          <TouchableOpacity
            onPress={() => updateProgress(activeLesson.id, { completed: true })}
            className="mt-2 self-start px-3 py-1.5 bg-emerald-100 rounded-lg"
          >
            <Text className="text-emerald-700 text-xs font-semibold">Marquer terminé ✓</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Module list */}
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        <Text className="text-sm text-gray-500 mb-3">
          {course.modules?.length ?? 0} unités • {course.videoCount ?? 0} leçons
        </Text>
        {(course.modules ?? []).map((unit: any) => (
          <UnitAccordion
            key={unit.id}
            unit={unit}
            completedIds={completedIds}
            onLessonPress={setActiveLesson}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
