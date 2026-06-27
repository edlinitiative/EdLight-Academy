import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Search, BookOpen, ChevronRight, SlidersHorizontal } from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { CoursesParamList } from '../navigation/CoursesNavigator';

type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseList'>;

const SUBJECTS = ['Tout', 'MATH', 'PHYS', 'CHEM', 'ECON'];
const LEVELS = ['Tout', 'NSI', 'NSII', 'NSIII', 'NSIV'];

function CourseCard({ course, onPress }: { course: any; onPress: () => void }) {
  const lessonCount = course.modules?.reduce((s: number, u: any) => s + (u.lessons?.length ?? 0), 0) ?? course.videoCount ?? 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3"
    >
      <View className="h-2" style={{ backgroundColor: course.color ?? '#0857A6' }} />
      <View className="p-4 flex-row items-center gap-3">
        <View
          className="w-12 h-12 rounded-xl items-center justify-center"
          style={{ backgroundColor: (course.color ?? '#0857A6') + '15' }}
        >
          <BookOpen color={course.color ?? '#0857A6'} size={22} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base" numberOfLines={2}>{course.name}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{course.subject}</Text>
            <Text className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{course.level}</Text>
            <Text className="text-xs text-gray-400">{lessonCount} leçons</Text>
          </View>
        </View>
        <ChevronRight color="#9ca3af" size={18} />
      </View>
    </TouchableOpacity>
  );
}

export default function CoursesScreen() {
  const navigation = useNavigation<Nav>();
  const { language } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('Tout');
  const [level, setLevel] = useState('Tout');
  const [showFilters, setShowFilters] = useState(false);

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
    <SafeAreaView className="flex-1 bg-gray-50">
      {/* Search bar */}
      <View className="px-5 pt-4 pb-3">
        <Text className="text-2xl font-bold text-gray-900 mb-3">{t('Cours', 'Kou yo')}</Text>
        <View className="flex-row gap-2">
          <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-3">
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
            className={`w-11 h-11 rounded-xl items-center justify-center ${showFilters ? 'bg-primary-600' : 'bg-white border border-gray-200'}`}
          >
            <SlidersHorizontal color={showFilters ? '#fff' : '#6b7280'} size={18} />
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View className="mt-3 gap-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
              {SUBJECTS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSubject(s)}
                  className={`mr-2 px-4 py-2 rounded-full ${subject === s ? 'bg-primary-600' : 'bg-white border border-gray-200'}`}
                >
                  <Text className={`text-sm font-medium ${subject === s ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l}
                  onPress={() => setLevel(l)}
                  className={`mr-2 px-4 py-2 rounded-full ${level === l ? 'bg-primary-600' : 'bg-white border border-gray-200'}`}
                >
                  <Text className={`text-sm font-medium ${level === l ? 'text-white' : 'text-gray-600'}`}>{l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {filtered.length === 0 ? (
          <EmptyState message={t('Aucun cours trouvé.', 'Pa gen kou jwenn.')} />
        ) : (
          <>
            <Text className="text-sm text-gray-500 mb-3">{filtered.length} {t('cours', 'kou')}</Text>
            {filtered.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
