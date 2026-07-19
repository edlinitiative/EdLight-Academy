import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Search, BookOpen, BookMarked, ChevronRight, ChevronLeft,
  Calculator, Atom, FlaskConical, TrendingUp, GraduationCap,
} from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import { getSubjectColor } from '../utils/shared';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import { CoursesParamList } from '../navigation/CoursesNavigator';

type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseList'>;

/**
 * Browse flow: pick your grade (NS I–IV) → pick a subject → see only those
 * courses. An NSI student never has to scroll past NSIV material. Search stays
 * global (searches every course, whatever step you're on).
 */
const LEVELS = [
  { code: 'NSI', label: 'NS I', sublabel: '1ère année du secondaire', sublabelHt: 'Premye ane segondè' },
  { code: 'NSII', label: 'NS II', sublabel: '2ème année du secondaire', sublabelHt: 'Dezyèm ane segondè' },
  { code: 'NSIII', label: 'NS III', sublabel: '3ème année du secondaire', sublabelHt: 'Twazyèm ane segondè' },
  { code: 'NSIV', label: 'NS IV', sublabel: 'Terminale — année du Bac', sublabelHt: 'Tèminal — ane Bak la' },
];

const SUBJECT_META: Record<string, { name: string; nameHt: string; Icon: any }> = {
  MATH: { name: 'Mathématiques', nameHt: 'Matematik', Icon: Calculator },
  PHYS: { name: 'Physique', nameHt: 'Fizik', Icon: Atom },
  CHEM: { name: 'Chimie', nameHt: 'Chimi', Icon: FlaskConical },
  ECON: { name: 'Économie', nameHt: 'Ekonomi', Icon: TrendingUp },
};

function subjectMeta(code: string) {
  const meta = SUBJECT_META[code] ?? { name: code, nameHt: code, Icon: BookOpen };
  return { ...meta, color: getSubjectColor(code) };
}

function countLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  return units.reduce((s: number, u: any) => s + (u?.lessons?.length ?? 0), 0) || course?.videoCount || 0;
}

const cardShadow = {
  shadowColor: '#1B6FE0',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
  borderWidth: 1,
  borderColor: '#e8edf5',
} as const;

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
  const color = course.color ?? '#1B6FE0';
  const soon = !!course.comingSoon;

  return (
    <TouchableOpacity
      onPress={soon ? undefined : onPress}
      disabled={soon}
      activeOpacity={0.85}
      className="bg-white rounded-2xl mb-3"
      style={[cardShadow, soon ? { opacity: 0.7 } : null]}
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
            <Text className="text-xs text-gray-400 mt-1">{soon ? 'Cours en préparation' : `${totalLessons} leçons`}</Text>
          </View>
          {soon ? (
            <View style={{ backgroundColor: '#eaf2fb', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 }}>
              <Text style={{ color: '#1B6FE0', fontSize: 11, fontWeight: '700' }}>Bientôt</Text>
            </View>
          ) : (
            <View className="items-end flex-shrink-0">
              <Text className="text-sm font-bold" style={{ color: pct > 0 ? color : '#9ca3af' }}>
                {pct}%
              </Text>
              <ChevronRight color="#9ca3af" size={16} className="mt-1" />
            </View>
          )}
        </View>
        {!soon && pct > 0 && (
          <View className="mt-3">
            <ProgressBar value={pct} color={color} height={4} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function DrillCard({
  title, subtitle, badge, color, Icon, onPress, comingSoon = false,
}: {
  title: string; subtitle: string; badge: string; color: string; Icon: any; onPress: () => void; comingSoon?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
      activeOpacity={0.85}
      className="bg-white rounded-2xl mb-3"
      style={[cardShadow, comingSoon ? { opacity: 0.7 } : null]}
    >
      <View className="flex-row items-center p-4 gap-3">
        <View
          className="w-12 h-12 rounded-xl items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '16' }}
        >
          <Icon color={color} size={22} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base">{title}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">{subtitle}</Text>
        </View>
        {comingSoon ? (
          <View style={{ backgroundColor: '#eaf2fb', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 }}>
            <Text style={{ color: '#1B6FE0', fontSize: 11, fontWeight: '700' }}>{badge}</Text>
          </View>
        ) : (
          <View className="items-end flex-shrink-0 flex-row items-center gap-2">
            <Text className="text-xs text-gray-400">{badge}</Text>
            <ChevronRight color="#9ca3af" size={18} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function CoursesScreen() {
  const navigation = useNavigation<Nav>();
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, progress } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);

  const completedIds = useMemo(() => {
    const ids = new Set<string>();
    Object.entries(progress).forEach(([id, p]: [string, any]) => {
      if (p?.completed) ids.add(id);
    });
    return ids;
  }, [progress]);

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

  const all = courses ?? [];
  const searching = search.trim().length > 0;

  // Global search: flat results across every level and subject.
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = search.toLowerCase();
    return all.filter((c) =>
      c.name?.toLowerCase().includes(q)
      || c.subject?.toLowerCase().includes(q)
      || subjectMeta(c.subject).name.toLowerCase().includes(q),
    );
  }, [all, search, searching]);

  const levelCounts = useMemo(() => {
    const m: Record<string, number> = {};
    all.forEach((c) => { m[c.level] = (m[c.level] ?? 0) + 1; });
    return m;
  }, [all]);

  const subjectsForLevel = useMemo(() => {
    if (!level) return [];
    const m = new Map<string, any[]>();
    all.forEach((c) => {
      if (c.level === level) m.set(c.subject, [...(m.get(c.subject) ?? []), c]);
    });
    return Array.from(m.entries()).sort((a, b) =>
      subjectMeta(a[0]).name.localeCompare(subjectMeta(b[0]).name, 'fr'));
  }, [all, level]);

  // One course in the subject (the common case) → open it directly instead of
  // showing a redundant single-card list.
  const openSubject = (code: string, group: any[]) => {
    if (group.length === 1) {
      const course = group[0];
      navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name });
      return;
    }
    setSubject(code);
  };

  const courseList = useMemo(() => {
    if (!level || !subject) return [];
    return all.filter((c) => c.level === level && c.subject === subject);
  }, [all, level, subject]);

  if (isLoading) return <LoadingState message={t('Chargement des cours…', 'Ap chaje kou yo…')} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const levelInfo = LEVELS.find((l) => l.code === level);
  const subjInfo = subject ? subjectMeta(subject) : null;

  // Contextual header: title + back affordance per drill step.
  const headerTitle = searching
    ? t('Recherche', 'Rechèch')
    : !level
      ? t('Cours', 'Kou yo')
      : !subject
        ? (levelInfo?.label ?? level)
        : (isCreole ? subjInfo?.nameHt : subjInfo?.name) ?? subject;

  const headerSubtitle = searching
    ? null
    : !level
      ? t('Choisis ton niveau pour commencer', 'Chwazi nivo ou pou kòmanse')
      : !subject
        ? t('Choisis une matière', 'Chwazi yon matyè')
        : (levelInfo?.label ?? level);

  const canGoBack = !searching && (level !== null);
  const goBack = () => {
    if (subject) setSubject(null);
    else setLevel(null);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
      {/* Header + search */}
      <View className="px-5 pt-5 pb-3 bg-white border-b border-gray-100">
        <View className="flex-row items-center mb-3">
          {canGoBack && (
            <TouchableOpacity onPress={goBack} className="mr-2 -ml-1 p-1">
              <ChevronLeft color="#374151" size={24} />
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 }}>
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{headerSubtitle}</Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center bg-gray-50 border rounded-xl px-3" style={{ borderColor: '#e8edf5' }}>
          <Search color="#9ca3af" size={18} />
          <TextInput
            className="flex-1 py-3 ml-2 text-gray-900 text-sm"
            placeholder={t('Rechercher un cours…', 'Chèche kou…')}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#1B6FE0" />}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {searching ? (
          searchResults.length === 0 ? (
            <EmptyState message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')} />
          ) : (
            <>
              <Text className="text-xs text-gray-400 mb-3">{searchResults.length} {t('cours', 'kou')}</Text>
              {searchResults.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  completedCount={completedForCourse(course)}
                  onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
                />
              ))}
            </>
          )
        ) : !level ? (
          <>
            {/* Banque de Questions banner (top-level only) */}
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => navigation.navigate('Quizzes', {})}
              className="mb-4 bg-white rounded-2xl"
              style={cardShadow}
            >
              <View className="flex-row items-center p-4 gap-3">
                <View
                  className="w-11 h-11 rounded-xl items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#eaf2fb' }}
                >
                  <BookMarked color="#1B6FE0" size={20} />
                </View>
                <View className="flex-1">
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                    {t('Banque de Questions', 'Bank Kesyon')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {t('Entraîne-toi par matière et chapitre', 'Pratike pa matyè ak chapit')}
                  </Text>
                </View>
                <ChevronRight color="#1B6FE0" size={20} />
              </View>
            </TouchableOpacity>

            {LEVELS.filter((l) => (levelCounts[l.code] ?? 0) > 0).map((l) => (
              <DrillCard
                key={l.code}
                title={l.label}
                subtitle={isCreole ? l.sublabelHt : l.sublabel}
                badge={`${levelCounts[l.code]} ${t('cours', 'kou')}`}
                color="#1B6FE0"
                Icon={GraduationCap}
                onPress={() => setLevel(l.code)}
              />
            ))}
          </>
        ) : !subject ? (
          subjectsForLevel.length === 0 ? (
            <EmptyState message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')} />
          ) : (
            subjectsForLevel.map(([code, group]) => {
              const meta = subjectMeta(code);
              const soon = group.length > 0 && group.every((c: any) => c.comingSoon);
              const lessons = group.reduce((s: number, c: any) => s + countLessons(c), 0);
              return (
                <DrillCard
                  key={code}
                  title={isCreole ? meta.nameHt : meta.name}
                  subtitle={soon ? t('Cours en préparation', 'Kou ap prepare') : `${lessons} ${t('leçons', 'leson')}`}
                  badge={soon ? t('Bientôt', 'Talè') : (group.length > 1 ? `${group.length} ${t('cours', 'kou')}` : '')}
                  color={meta.color}
                  Icon={meta.Icon}
                  comingSoon={soon}
                  onPress={() => openSubject(code, group)}
                />
              );
            })
          )
        ) : courseList.length === 0 ? (
          <EmptyState message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')} />
        ) : (
          <>
            <Text className="text-xs text-gray-400 mb-3">{courseList.length} {t('cours', 'kou')}</Text>
            {courseList.map((course) => (
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
