import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Search, BookOpen, BookMarked, ChevronRight, SlidersHorizontal } from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import { CoursesParamList } from '../navigation/CoursesNavigator';

type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseList'>;

const SUBJECTS = ['Tout', 'MATH', 'PHYS', 'CHEM', 'ECON'];
const LEVELS = ['Tout', 'NSI', 'NSII', 'NSIII', 'NSIV'];

function countLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  return units.reduce((s: number, u: any) => s + (u?.lessons?.length ?? 0), 0) || course?.videoCount || 0;
}

function CourseCard({
  course,
  completedCount,
  onPress,
}: {
  course: any;
  completedCount: number;
  onPress: () => void;
}) {
  const totalLessons = countLessons(course);
  const pct = totalLessons > 0 ? Math.min(100, Math.round((completedCount / totalLessons) * 100)) : 0;
  const color = course.color ?? '#0857A6';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl mb-3"
      style={{ shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e8edf5' }}
    >
      <View className="p-4">
        <View className="flex-row items-center gap-3">
          <View
            className="w-11 h-11 rounded-xl items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color + '18' }}
          >
            <BookOpen color={color} size={20} />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-gray-900 text-sm leading-snug" numberOfLines={2}>{course.name}</Text>
            <View className="flex-row items-center gap-2 mt-1 flex-wrap">
              <View style={{ backgroundColor: color + '18', borderRadius: 100 }} className="px-2 py-0.5">
                <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{course.subject}</Text>
              </View>
              <View style={{ backgroundColor: color + '12', borderRadius: 100 }} className="px-2 py-0.5">
                <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{course.level}</Text>
              </View>
              <Text className="text-xs text-gray-400">{totalLessons} leçons</Text>
            </View>
          </View>
          <View className="items-end flex-shrink-0">
            <Text className="text-sm font-bold" style={{ color: pct > 0 ? color : '#9ca3af' }}>
              {pct}%
            </Text>
            <ChevronRight color="#9ca3af" size={16} className="mt-1" />
          </View>
        </View>
        {pct > 0 && (
          <View className="mt-3">
            <ProgressBar value={pct} color={color} height={4} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function CoursesScreen() {
  const navigation = useNavigation<Nav>();
  const { language, progress } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('Tout');
  const [level, setLevel] = useState('Tout');
  const [showFilters, setShowFilters] = useState(false);

  // Build lessonId → completed map from local progress store
  const completedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(progress).forEach(([id, p]: [string, any]) => {
      if (p?.completed) ids.add(id);
    });
    return ids;
  }, [progress]);

  // Count completed lessons per course (using local progress)
  function completedForCourse(course: any): number {
    const units = Array.isArray(course?.modules) ? course.modules : [];
    let count = 0;
    for (const u of units) {
      for (const l of u?.lessons ?? []) {
        if (completedIds.has(l.id)) count++;
      }
    }
    return count;
  }

  const filtered = useMemo(() => {
    if (!courses) return [];
    return courses.filter((c) => {
      if (subject !== 'Tout' && c.subject !== subject) return false;
      if (level !== 'Tout' && c.level !== level) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name?.toLowerCase().includes(q) || c.subject?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [courses, subject, level, search]);

  if (isLoading) return <LoadingState message={t('Chargement des cours…', 'Chajman kou yo…')} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
      {/* Header + search */}
      <View className="px-5 pt-5 pb-3 bg-white border-b border-gray-100">
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5, marginBottom: 12 }}>{t('Cours', 'Kou yo')}</Text>
        <View className="flex-row gap-2">
          <View className="flex-1 flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3">
            <Search color="#9ca3af" size={18} />
            <TextInput
              className="flex-1 py-3 ml-2 text-gray-900 text-sm"
              placeholder={t('Rechercher un cours…', 'Chèche kou…')}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#9ca3af"
            />
          </View>
          <TouchableOpacity
            onPress={() => setShowFilters((v) => !v)}
            className={`w-11 h-11 rounded-xl items-center justify-center ${showFilters ? 'bg-primary-600' : 'bg-gray-100'}`}
          >
            <SlidersHorizontal color={showFilters ? '#fff' : '#6b7280'} size={18} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View className="mt-3 gap-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {SUBJECTS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSubject(s)}
                  className={`px-4 py-2 rounded-full ${subject === s ? 'bg-primary-600' : 'bg-gray-100'}`}
                >
                  <Text className={`text-sm font-semibold ${subject === s ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l}
                  onPress={() => setLevel(l)}
                  className={`px-4 py-2 rounded-full ${level === l ? 'bg-primary-600' : 'bg-gray-100'}`}
                >
                  <Text className={`text-sm font-semibold ${level === l ? 'text-white' : 'text-gray-600'}`}>{l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0857A6" />}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Banque de Questions banner */}
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => navigation.navigate('Quizzes', {})}
          className="mb-4"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e8edf5',
            shadowColor: '#0857A6',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          <View className="flex-row items-center p-4 gap-3">
            <View
              className="w-11 h-11 rounded-xl items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#7c3aed18' }}
            >
              <BookMarked color="#7c3aed" size={20} />
            </View>
            <View className="flex-1">
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                {t('Banque de Questions', 'Fich Kesyon')}
              </Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {t('Entraîne-toi par matière et chapitre', 'Pratike pa matyè ak chapit')}
              </Text>
            </View>
            <ChevronRight color="#7c3aed" size={20} />
          </View>
        </TouchableOpacity>

        {filtered.length === 0 ? (
          <EmptyState message={t('Aucun cours trouvé.', 'Pa gen kou jwenn.')} />
        ) : (
          <>
            <Text className="text-xs text-gray-400 mb-3">{filtered.length} {t('cours', 'kou')}</Text>
            {filtered.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                completedCount={completedForCourse(course)}
                onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
