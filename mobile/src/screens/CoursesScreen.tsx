import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, FlatList,
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
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useColors, Palette, radius } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';

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

const cardShadowFor = (colors: Palette) => ({
  shadowColor: colors.azure,
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
  borderWidth: 1,
  borderColor: colors.border,
} as const);

function CourseCard({
  course,
  completedCount,
  onPress,
}: {
  course: any;
  completedCount: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const totalLessons = countLessons(course);
  const pct = totalLessons > 0 ? Math.min(100, Math.round((completedCount / totalLessons) * 100)) : 0;
  const color = course.color ?? colors.azure;
  const soon = !!course.comingSoon;

  return (
    <PressableScale
      onPress={soon ? undefined : onPress}
      disabled={soon}
      accessibilityRole="button"
      accessibilityLabel={course.name}
      style={[{ backgroundColor: colors.surface, borderRadius: radius.card, marginBottom: 12 }, cardShadowFor(colors), soon ? { opacity: 0.7 } : null]}
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
            <Text className="font-bold text-gray-900 dark:text-slate-100 text-sm leading-snug" numberOfLines={2}>{course.name}</Text>
            <Text className="text-xs text-gray-500 dark:text-slate-400 mt-1">{soon ? t('Cours en préparation', 'Kou ap prepare') : `${totalLessons} ${t('leçons', 'leson')}`}</Text>
          </View>
          {soon ? (
            <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 }}>
              <Text style={{ color: colors.azure, fontSize: 11, fontWeight: '700' }}>{t('Bientôt', 'Talè')}</Text>
            </View>
          ) : (
            <View className="items-end flex-shrink-0">
              <Text className="text-sm font-bold" style={{ color: pct > 0 ? color : colors.faint }}>
                {pct}%
              </Text>
              <ChevronRight color={colors.faint} size={16} className="mt-1" />
            </View>
          )}
        </View>
        {!soon && pct > 0 && (
          <View className="mt-3">
            <ProgressBar value={pct} color={color} height={4} />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

function DrillCard({
  title, subtitle, badge, color, Icon, onPress, comingSoon = false,
}: {
  title: string; subtitle: string; badge: string; color: string; Icon: any; onPress: () => void; comingSoon?: boolean;
}) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[{ backgroundColor: colors.surface, borderRadius: radius.card, marginBottom: 12 }, cardShadowFor(colors), comingSoon ? { opacity: 0.7 } : null]}
    >
      <View className="flex-row items-center p-4 gap-3">
        <View
          className="w-12 h-12 rounded-xl items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '16' }}
        >
          <Icon color={color} size={22} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 dark:text-slate-100 text-base">{title}</Text>
          <Text className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</Text>
        </View>
        {comingSoon ? (
          <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 }}>
            <Text style={{ color: colors.azure, fontSize: 11, fontWeight: '700' }}>{badge}</Text>
          </View>
        ) : (
          <View className="items-end flex-shrink-0 flex-row items-center gap-2">
            <Text className="text-xs text-gray-500 dark:text-slate-400">{badge}</Text>
            <ChevronRight color={colors.faint} size={18} />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

export default function CoursesScreen() {
  const navigation = useNavigation<Nav>();
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, progress } = useStore();
  const colors = useColors();
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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <ListSkeleton rows={6} />
      </SafeAreaView>
    );
  }
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header + search — shares the page ground (no seam), like the dashboard */}
      <View className="px-5 pt-5 pb-3" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center mb-3">
          {canGoBack && (
            <TouchableOpacity onPress={goBack} className="mr-2 -ml-1 p-1" hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Retour', 'Retounen')}>
              <ChevronLeft color={colors.muted} size={24} />
            </TouchableOpacity>
          )}
          <View className="flex-1">
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{headerSubtitle}</Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-800 border rounded-xl px-3" style={{ borderColor: colors.border }}>
          <Search color={colors.faint} size={18} />
          <TextInput
            className="flex-1 py-3 ml-2 text-gray-900 dark:text-slate-100 text-sm"
            placeholder={t('Rechercher un cours…', 'Chèche kou…')}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.faint}
          />
        </View>
      </View>

      {searching ? (
        <FlatList
          ref={scrollRef}
          data={searchResults}
          keyExtractor={(course) => course.id}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <Text className="text-xs text-gray-500 dark:text-slate-400 mb-3">{searchResults.length} {t('cours', 'kou')}</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              ctaLabel={t('Effacer la recherche', 'Efase rechèch la')}
              onCta={() => setSearch('')}
            />
          }
          renderItem={({ item: course }) => (
            <CourseCard
              course={course}
              completedCount={completedForCourse(course)}
              onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
            />
          )}
        />
      ) : !level ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Banque de Questions banner (top-level only) */}
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => navigation.navigate('Quizzes', {})}
            className="mb-4 bg-white dark:bg-[#131c2e] rounded-2xl"
            style={cardShadowFor(colors)}
          >
            <View className="flex-row items-center p-4 gap-3">
              <View
                className="w-11 h-11 rounded-xl items-center justify-center flex-shrink-0"
                style={{ backgroundColor: colors.azureSoft }}
              >
                <BookMarked color={colors.azure} size={20} />
              </View>
              <View className="flex-1">
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.ink }}>
                  {t('Banque de Questions', 'Bank Kesyon')}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {t('Entraîne-toi par matière et chapitre', 'Pratike pa matyè ak chapit')}
                </Text>
              </View>
              <ChevronRight color={colors.azure} size={20} />
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
        </ScrollView>
      ) : !subject ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {subjectsForLevel.length === 0 ? (
            <EmptyState
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              ctaLabel={t('Retour', 'Retounen')}
              onCta={goBack}
            />
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
          )}
        </ScrollView>
      ) : (
        <FlatList
          ref={scrollRef}
          data={courseList}
          keyExtractor={(course) => course.id}
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          ListHeaderComponent={
            courseList.length > 0 ? (
              <Text className="text-xs text-gray-500 dark:text-slate-400 mb-3">{courseList.length} {t('cours', 'kou')}</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              ctaLabel={t('Retour', 'Retounen')}
              onCta={goBack}
            />
          }
          renderItem={({ item: course }) => (
            <CourseCard
              course={course}
              completedCount={completedForCourse(course)}
              onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
