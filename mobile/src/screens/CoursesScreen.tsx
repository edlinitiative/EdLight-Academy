import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, FlatList, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Search, X, BookOpen, BookMarked, ClipboardCheck, ChevronRight,
} from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import { getSubjectColor } from '../utils/shared';
import { SUBJECT_META } from '../utils/subjectMeta';
import { courseVideoThumb } from '../utils/videoThumb';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import {
  summarize, courseLessonIds, masteryLabel, type MasterySummary, type ProgressMap,
} from '../utils/mastery';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useColors, radius, typeScale } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';

type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseList'>;

/**
 * The class is a FILTER, not a destination (TestFlight, 17 août: "maybe class
 * should be a filter, then different sections for the student's class").
 * One flat page: level chips on top (your class preselected), the selected
 * level's courses and practice entries beneath, and every other level browsable
 * as one shelf per subject — no drill-down to walk back out of.
 *
 * Estil Klè restyle: white ground, one accent, imagery-forward cards for the
 * student's own class, hairline rows for everything utilitarian, and ONE simple
 * progress statement (lessons done / total) instead of meters on every row.
 */
const LEVELS = [
  { code: 'NSI', label: 'NS I' },
  { code: 'NSII', label: 'NS II' },
  { code: 'NSIII', label: 'NS III' },
  { code: 'NSIV', label: 'NS IV' },
];

/** The student's grade (store) → the catalogue level that is "their" class. */
const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
  // Post-Bac students revise Terminale material.
  POSTBAC: 'NSIV',
};

/** Shelf order: sciences the app is strongest in first, languages last. */
const SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'SVT', 'ECON', 'FR', 'EN'];

function subjectMeta(code: string) {
  const meta = SUBJECT_META[code] ?? { name: code, nameHt: code, Icon: BookOpen };
  return { ...meta, color: getSubjectColor(code) };
}

function countLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  return units.reduce((s: number, u: any) => s + (u?.lessons?.length ?? 0), 0) || course?.videoCount || 0;
}

function countUnits(course: any): number {
  return Array.isArray(course?.modules) ? course.modules.length : 0;
}

/** One thin bar + a fraction — the whole progress language of the restyle. */
function ProgressBar({ done, total }: { done: number; total: number }) {
  const colors = useColors();
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.hairline }}>
        <View style={{ width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: colors.azure }} />
      </View>
      <Text style={[typeScale.label, { color: colors.muted }]}>{done}/{total}</Text>
    </View>
  );
}

/**
 * A course of the student's OWN class: a full-width card led by real imagery
 * (the course's video still), one byline, one progress bar, one next action.
 */
function CourseCard({
  course, summary, lessonsDone, onPress,
}: {
  course: any;
  summary: MasterySummary;
  lessonsDone: number;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const totalLessons = countLessons(course);
  const units = countUnits(course);
  const tint = getSubjectColor(course.subject);
  const thumb = courseVideoThumb(course);
  const [thumbFailed, setThumbFailed] = useState(false);
  const started = lessonsDone > 0 || summary.started > 0;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={started
        ? `${course.name}. ${lessonsDone} ${t('sur', 'sou')} ${totalLessons} ${t('leçons', 'leson')}, ${masteryLabel(summary.level, language === 'ht')}`
        : `${course.name}. ${totalLessons} ${t('leçons', 'leson')}`}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
      }}
    >
      {thumb && !thumbFailed ? (
        <Image
          source={{ uri: thumb }}
          resizeMode="cover"
          onError={() => setThumbFailed(true)}
          style={{ width: '100%', height: 150, backgroundColor: colors.surfaceAlt }}
        />
      ) : (
        <View style={{ width: '100%', height: 150, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: tint, opacity: 0.5 }} />
        </View>
      )}
      <View style={{ padding: 16 }}>
        <Text numberOfLines={2} style={[typeScale.title, { color: colors.ink, fontSize: 17, lineHeight: 22 }]}>{course.name}</Text>
        <Text style={[typeScale.label, { color: colors.muted, marginTop: 3 }]}>
          {units > 0
            ? `${units} ${t('chapitres', 'chapit')} · ${totalLessons} ${t('leçons', 'leson')}`
            : `${totalLessons} ${t('leçons', 'leson')}`}
        </Text>
        {started ? (
          <View style={{ marginTop: 12 }}>
            <ProgressBar done={lessonsDone} total={totalLessons} />
          </View>
        ) : null}
        <Text style={[typeScale.bodyMd, { color: colors.azure, marginTop: started ? 10 : 12 }]}>
          {started ? t('Continuer', 'Kontinye') : t('Commencer', 'Kòmanse')}
        </Text>
      </View>
    </PressableScale>
  );
}

/** A coming-soon course: no imagery, no promises — one quiet row. */
function ComingSoonRow({ course }: { course: any }) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  return (
    <View
      accessibilityLabel={`${course.name}. ${t('Cours en préparation', 'Kou ap prepare')}`}
      style={{
        borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
        paddingVertical: 14, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12, opacity: 0.6,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typeScale.titleSm, { color: colors.ink }]}>{course.name}</Text>
        <Text style={[typeScale.label, { color: colors.muted, marginTop: 2 }]}>{t('Cours en préparation', 'Kou ap prepare')}</Text>
      </View>
      <Text style={[typeScale.label, { color: colors.faint }]}>{t('Bientôt', 'Talè')}</Text>
    </View>
  );
}

/** Search results keep the compact row shape (a list is a list). */
function CourseRow({
  course, summary, onPress,
}: {
  course: any;
  summary: MasterySummary;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const totalLessons = countLessons(course);
  const tint = getSubjectColor(course.subject);
  const soon = !!course.comingSoon;
  const thumb = soon ? null : courseVideoThumb(course);
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <PressableScale
      onPress={soon ? undefined : onPress}
      disabled={soon}
      accessibilityRole="button"
      accessibilityLabel={soon
        ? `${course.name}. ${t('Cours en préparation', 'Kou ap prepare')}`
        : `${course.name}. ${totalLessons} ${t('leçons', 'leson')}`}
      style={{ borderTopWidth: 1, borderTopColor: colors.hairline, opacity: soon ? 0.55 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
        {thumb && !thumbFailed ? (
          <Image
            source={{ uri: thumb }}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
            style={{ width: 84, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt }}
          />
        ) : (
          <View style={{ width: 84, height: 48, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: tint, opacity: 0.5 }} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[typeScale.titleSm, { color: colors.ink }]}>{course.name}</Text>
          <Text style={[typeScale.label, { color: colors.muted, marginTop: 3 }]}>
            {soon
              ? t('Cours en préparation', 'Kou ap prepare')
              : `${LEVELS.find((l) => l.code === course.level)?.label ?? course.level} · ${totalLessons} ${t('leçons', 'leson')}`}
          </Text>
        </View>
        {soon
          ? <Text style={[typeScale.micro, { color: colors.faint }]}>{t('Bientôt', 'Talè')}</Text>
          : <ChevronRight color={colors.faint} size={16} />}
      </View>
    </PressableScale>
  );
}

/** One level pill. The student's own class carries the "Ma classe" tag.
 *  Selected is a tinted outline, not a filled block — the calm variant. */
function LevelChip({
  label, mine, active, onPress,
}: {
  label: string;
  mine: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const text = mine ? `${label} · ${t('Ma classe', 'Klas mwen')}` : label;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={mine ? `${label}, ${t('ma classe', 'klas mwen')}` : label}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.azureSoft : colors.surface,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? colors.azure : colors.border,
      }}
    >
      <Text style={[typeScale.label, { color: active ? colors.azure : colors.muted }]}>{text}</Text>
    </TouchableOpacity>
  );
}

/**
 * A course in a subject shelf: a small quiet card, the level named in the
 * caption. The student's own class keeps an azure border when it shows up
 * while they browse another level.
 */
function ShelfCard({
  course, levelLabel, mine, onPress,
}: {
  course: any;
  levelLabel: string;
  mine: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const soon = !!course.comingSoon;
  const thumb = soon ? null : courseVideoThumb(course);
  const [thumbFailed, setThumbFailed] = useState(false);
  const tint = getSubjectColor(course.subject);
  const lessons = countLessons(course);

  return (
    <PressableScale
      onPress={soon ? undefined : onPress}
      disabled={soon}
      accessibilityRole="button"
      accessibilityLabel={soon
        ? `${course.name}. ${t('Cours en préparation', 'Kou ap prepare')}`
        : `${course.name}. ${levelLabel}, ${lessons} ${t('leçons', 'leson')}`}
      style={{
        width: 150,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: mine ? 1.5 : 1,
        borderColor: mine ? colors.azure : colors.border,
        overflow: 'hidden',
        opacity: soon ? 0.55 : 1,
      }}
    >
      {thumb && !thumbFailed ? (
        <Image
          source={{ uri: thumb }}
          resizeMode="cover"
          onError={() => setThumbFailed(true)}
          style={{ width: '100%', height: 84, backgroundColor: colors.surfaceAlt }}
        />
      ) : (
        <View style={{ width: '100%', height: 84, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: tint, opacity: 0.5 }} />
        </View>
      )}
      <View style={{ padding: 11 }}>
        <Text numberOfLines={1} style={[typeScale.label, { color: colors.ink, fontFamily: typeScale.titleSm.fontFamily }]}>{course.name}</Text>
        <Text style={[typeScale.caption, { color: soon ? colors.faint : colors.muted, marginTop: 2 }]}>
          {soon
            ? t('Bientôt', 'Talè')
            : mine
              ? `${levelLabel} · ${t('ma classe', 'klas mwen')}`
              : `${levelLabel} · ${lessons} ${t('leçons', 'leson')}`}
        </Text>
      </View>
    </PressableScale>
  );
}

/** One of the two "S'entraîner" entries — a plain hairline row. */
function PracticeRow({
  icon, title, subtitle, onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={{ borderBottomWidth: 1, borderBottomColor: colors.hairline }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 }}>
        {icon}
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.titleSm, { color: colors.ink }]}>{title}</Text>
          <Text style={[typeScale.label, { color: colors.muted, marginTop: 1 }]}>{subtitle}</Text>
        </View>
        <ChevronRight color={colors.faint} size={16} />
      </View>
    </PressableScale>
  );
}

export default function CoursesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<CoursesParamList, 'CourseList'>>();
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, progress } = useStore();
  const grade = useStore((s) => s.grade);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const centerColumn = useContentContainerStyle('readable');

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // null = "auto": follow the student's class (or the first level that has
  // courses). Set only by an explicit chip tap, so a grade change in Profile
  // re-anchors the tab without fighting a stale choice.
  const [levelChoice, setLevelChoice] = useState<string | null>(null);

  // Entry points that mean "show me the whole catalog" (Home's "Voir tout")
  // send a `resetAt` nonce: back to the student's own class, search cleared.
  const resetAt = route.params?.resetAt;
  React.useEffect(() => {
    if (resetAt) {
      setLevelChoice(null);
      setSearch('');
      setSearchOpen(false);
    }
  }, [resetAt]);

  // Walking every course's modules to collect lesson ids is the expensive part,
  // and it does not depend on progress — so it is cached against the catalogue
  // rather than redone for every row on every render. This list is the first
  // screen of the app on low-end Android phones; the allocation churn showed.
  const lessonIdsByCourse = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of courses ?? []) m.set(c.id, courseLessonIds(c));
    return m;
  }, [courses]);

  /** Mastery across any set of courses — one course, a subject, a whole level. */
  const summaryFor = React.useCallback(
    (group: any[]) => summarize(
      group.flatMap((c) => lessonIdsByCourse.get(c.id) ?? []),
      progress as ProgressMap,
    ),
    [lessonIdsByCourse, progress],
  );

  /** Lessons finished in a course — the simple number the progress bar states. */
  const lessonsDoneIn = React.useCallback(
    (course: any) => (lessonIdsByCourse.get(course.id) ?? [])
      .filter((id) => {
        const p = (progress as ProgressMap)[id];
        return !!p && (p.completed || !!p.masteredAt);
      }).length,
    [lessonIdsByCourse, progress],
  );

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

  const availableLevels = useMemo(
    () => LEVELS.filter((l) => all.some((c) => c.level === l.code)),
    [all],
  );

  const myLevel = GRADE_TO_LEVEL[grade ?? ''] ?? null;
  const myLevelAvailable = myLevel !== null && availableLevels.some((l) => l.code === myLevel);
  // 7e–9e students have no NS class yet: NS I (what they're headed into) leads.
  const selectedLevel = levelChoice
    ?? (myLevelAvailable ? myLevel : availableLevels[0]?.code ?? null);
  const selectedInfo = LEVELS.find((l) => l.code === selectedLevel);

  // The student's class chip always comes first; the rest keep catalogue order.
  const chipLevels = useMemo(() => {
    if (!myLevelAvailable) return availableLevels;
    return [
      ...availableLevels.filter((l) => l.code === myLevel),
      ...availableLevels.filter((l) => l.code !== myLevel),
    ];
  }, [availableLevels, myLevel, myLevelAvailable]);

  /** Subjects in shelf order — sciences first, unknown codes last. */
  const subjectRank = (code: string) => {
    const i = SUBJECT_ORDER.indexOf(code);
    return i === -1 ? SUBJECT_ORDER.length : i;
  };

  const selectedCourses = useMemo(
    () => all
      .filter((c) => c.level === selectedLevel)
      .sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject)),
    [all, selectedLevel],
  );

  // "Autres niveaux": every other level's courses, one shelf per subject (option
  // D — students think in subjects; NS3 revision sits naturally under NS4).
  // Cards are ordered levels-below-first (revision before preview), nearest first.
  const shelves = useMemo(() => {
    if (!selectedLevel) return [];
    const selectedIdx = LEVELS.findIndex((l) => l.code === selectedLevel);
    const cardRank = (levelCode: string) => {
      const i = LEVELS.findIndex((l) => l.code === levelCode);
      return i < selectedIdx ? selectedIdx - i : 100 + (i - selectedIdx);
    };
    const bySubject = new Map<string, any[]>();
    for (const c of all) {
      if (c.level === selectedLevel) continue;
      bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), c]);
    }
    return Array.from(bySubject.entries())
      .map(([code, group]) => ({
        code,
        meta: subjectMeta(code),
        courses: group.sort((a, b) => cardRank(a.level) - cardRank(b.level)),
      }))
      .sort((a, b) => subjectRank(a.code) - subjectRank(b.code));
  }, [all, selectedLevel]);

  // "Tests de chapitre" lands on the syllabus that owns the tests: the selected
  // level's most-advanced course, or its first open course when nothing is
  // started yet.
  const chapterTestTarget = useMemo(() => {
    const open = selectedCourses.filter((c) => !c.comingSoon);
    if (open.length === 0) return null;
    let best = open[0];
    let bestPoints = -1;
    for (const c of open) {
      const s = summaryFor([c]);
      if (s.started > 0 && s.points > bestPoints) { best = c; bestPoints = s.points; }
    }
    return best;
  }, [selectedCourses, summaryFor]);

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <ListSkeleton rows={6} />
      </SafeAreaView>
    );
  }
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const openCourse = (course: any) =>
    navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header — title + a search toggle. The permanent search field gave the
          page two competing entry points; a magnifier that expands on demand
          keeps the chips (the real navigation) on the first screen. */}
      <View className="px-5 pt-5 pb-1" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between">
          <Text style={[typeScale.display, { color: colors.ink }]}>{t('Cours', 'Kou')}</Text>
          <TouchableOpacity
            onPress={() => {
              if (searchOpen) setSearch('');
              setSearchOpen(!searchOpen);
            }}
            hitSlop={8}
            className="p-1"
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? t('Fermer la recherche', 'Fèmen rechèch la') : t('Rechercher', 'Chèche')}
          >
            {searchOpen
              ? <X color={colors.muted} size={22} />
              : <Search color={colors.muted} size={20} />}
          </TouchableOpacity>
        </View>
        {searchOpen && (
          <View
            className="flex-row items-center border rounded-xl px-3 mt-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surfaceAlt }}
          >
            <Search color={colors.faint} size={18} />
            <TextInput
              className="flex-1 py-3 ml-2"
              style={[typeScale.body, { color: colors.ink }]}
              placeholder={t('Rechercher un cours…', 'Chèche kou…')}
              value={search}
              onChangeText={setSearch}
              autoFocus
              placeholderTextColor={colors.faint}
            />
          </View>
        )}
      </View>

      {searching ? (
        <FlatList
          ref={scrollRef}
          data={searchResults}
          keyExtractor={(course) => course.id}
          className="flex-1"
          contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }, centerColumn]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <Text className="mb-3" style={[typeScale.caption, { color: colors.muted }]}>{searchResults.length} {t('cours', 'kou')}</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Search color={colors.azure} size={34} strokeWidth={1.75} />}
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              description={t('Essaie un autre mot-clé ou explore les cours par niveau.', 'Eseye yon lòt mo oswa gade kou yo pa nivo.')}
              ctaLabel={t('Effacer la recherche', 'Efase rechèch la')}
              onCta={() => setSearch('')}
            />
          }
          renderItem={({ item: course }) => (
            <CourseRow
              course={course}
              summary={summaryFor([course])}
              onPress={() => openCourse(course)}
            />
          )}
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          {/* Level chips — sticky, so the filter stays reachable down the page. */}
          <View style={{ backgroundColor: colors.bg, paddingVertical: 10 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {chipLevels.map((l) => (
                <LevelChip
                  key={l.code}
                  label={l.label}
                  mine={l.code === myLevel}
                  active={l.code === selectedLevel}
                  onPress={() => setLevelChoice(l.code)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={[{ paddingHorizontal: 20 }, centerColumn]}>
            {/* The selected level's courses */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14 }}>
              <Text style={[typeScale.h2, { color: colors.ink }]}>
                {t(`Tes cours · ${selectedInfo?.label ?? ''}`, `Kou ou · ${selectedInfo?.label ?? ''}`)}
              </Text>
              <Text style={[typeScale.caption, { color: colors.faint }]}>
                {selectedCourses.length} {t('cours', 'kou')}
              </Text>
            </View>
            <View style={{ gap: 14, marginTop: 14 }}>
              {selectedCourses.length === 0 ? (
                <EmptyState
                  icon={<BookOpen color={colors.azure} size={34} strokeWidth={1.75} />}
                  message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
                  description={t("Ce niveau n'a pas encore de cours. Reviens bientôt !", 'Nivo sa a poko gen kou. Tounen talè !')}
                />
              ) : (
                selectedCourses.map((course) => (
                  course.comingSoon ? (
                    <ComingSoonRow key={course.id} course={course} />
                  ) : (
                    <CourseCard
                      key={course.id}
                      course={course}
                      summary={summaryFor([course])}
                      lessonsDone={lessonsDoneIn(course)}
                      onPress={() => openCourse(course)}
                    />
                  )
                ))
              )}
            </View>

            {/* Practice for the selected level */}
            {selectedCourses.length > 0 && (
              <>
                <Text style={[typeScale.h2, { color: colors.ink, marginTop: 30 }]}>
                  {t("S'entraîner", 'Egzèse w')}
                </Text>
                <View style={{ marginTop: 4 }}>
                  <PracticeRow
                    icon={<BookMarked color={colors.azure} size={22} strokeWidth={2} />}
                    title={t('Banque de questions', 'Bank kesyon')}
                    subtitle={t('Par matière et chapitre', 'Pa matyè ak chapit')}
                    onPress={() => navigation.navigate('Quizzes', {})}
                  />
                  {chapterTestTarget && (
                    <PracticeRow
                      icon={<ClipboardCheck color={colors.azure} size={22} strokeWidth={2} />}
                      title={t('Tests de chapitre', 'Tès chapit')}
                      subtitle={t('Vise la maîtrise', 'Vize metriz la')}
                      onPress={() => openCourse(chapterTestTarget)}
                    />
                  )}
                </View>
              </>
            )}

            {/* Other levels, shelved by subject — revision below, preview above */}
            {shelves.length > 0 && (
              <Text style={[typeScale.h2, { color: colors.ink, marginTop: 30 }]}>
                {t('Autres niveaux', 'Lòt nivo yo')}
              </Text>
            )}
          </View>

          {shelves.map(({ code, meta, courses: group }) => (
            <View key={code} style={{ marginTop: 18 }}>
              <Text style={[[typeScale.titleSm, { color: colors.ink, paddingHorizontal: 20 }], centerColumn]}>
                {isCreole ? meta.nameHt : meta.name}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 10 }}
              >
                {group.map((course) => (
                  <ShelfCard
                    key={course.id}
                    course={course}
                    levelLabel={LEVELS.find((l) => l.code === course.level)?.label ?? course.level}
                    mine={course.level === myLevel}
                    onPress={() => openCourse(course)}
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
