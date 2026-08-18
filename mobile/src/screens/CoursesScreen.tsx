import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, FlatList, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useScrollToTop, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Search, BookOpen, BookMarked, ChevronRight, ChevronLeft, GraduationCap,
} from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import { getSubjectColor } from '../utils/shared';
import { SUBJECT_META } from '../utils/subjectMeta';
import { courseVideoThumb } from '../utils/videoThumb';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import { MasteryMeter } from '../components/MasteryMeter';
import {
  summarize, courseLessonIds, masteryLabel, type MasterySummary, type ProgressMap,
} from '../utils/mastery';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useColors, radius, typeScale, gradients } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';

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

function subjectMeta(code: string) {
  const meta = SUBJECT_META[code] ?? { name: code, nameHt: code, Icon: BookOpen };
  return { ...meta, color: getSubjectColor(code) };
}

function countLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  return units.reduce((s: number, u: any) => s + (u?.lessons?.length ?? 0), 0) || course?.videoCount || 0;
}

/**
 * A course, as a row rather than a card.
 *
 * The old version was the template shape: a tinted icon tile, a title, a grey
 * caption, a chevron, wrapped in a shadowed white rectangle — repeated down the
 * page until nothing had any weight. What's left here is a real video still
 * (actual content, not decoration), the course name, and the only number worth
 * printing: mastery out of 100.
 */
function CourseRow({
  course,
  summary,
  onPress,
}: {
  course: any;
  summary: MasterySummary;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const totalLessons = countLessons(course);
  const color = course.color ?? colors.azure;
  const soon = !!course.comingSoon;
  const thumb = soon ? null : courseVideoThumb(course);
  // A dead thumbnail URL must degrade to a plain block, not a blank box.
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <PressableScale
      onPress={soon ? undefined : onPress}
      disabled={soon}
      accessibilityRole="button"
      // The meter itself is decorative, so the level has to be spoken here.
      accessibilityLabel={soon
        ? `${course.name}. ${t('Cours en préparation', 'Kou ap prepare')}`
        : `${course.name}. ${summary.points} ${t('sur', 'sou')} 100, ${masteryLabel(summary.level, language === 'ht')}`}
      style={{ borderTopWidth: 1, borderTopColor: colors.hairline, opacity: soon ? 0.55 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
        {thumb && !thumbFailed ? (
          <Image
            source={{ uri: thumb }}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
            style={{ width: 84, height: 52, borderRadius: 10, backgroundColor: colors.surfaceAlt }}
          />
        ) : (
          <View style={{ width: 84, height: 52, borderRadius: 10, backgroundColor: color + '14' }} />
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={[typeScale.title, { color: colors.ink }]}>{course.name}</Text>
          <Text style={[typeScale.caption, { color: colors.muted, marginTop: 3 }]}>
            {soon
              ? t('Cours en préparation', 'Kou ap prepare')
              : summary.mastered > 0
                ? `${summary.mastered}/${totalLessons} ${t('maîtrisées', 'metrize')}`
                : `${totalLessons} ${t('leçons', 'leson')}`}
          </Text>
        </View>
        {soon ? (
          <Text style={[typeScale.micro, { color: colors.faint }]}>{t('Bientôt', 'Talè')}</Text>
        ) : summary.started > 0 ? (
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={[typeScale.label, { color: colors.ink }]}>{summary.points}</Text>
            <MasteryMeter level={summary.level} size="sm" />
          </View>
        ) : (
          // Untouched course: a grey "0" over four invisible dashes said nothing
          // and looked like a failed render.
          <ChevronRight color={colors.faint} size={16} />
        )}
      </View>
    </PressableScale>
  );
}

/**
 * A grade, as a card in a 2×2 grid.
 *
 * This started as a hairline row like everything else, which left this screen —
 * the entry point to the whole catalogue — as four lines of text above 40% empty
 * grey. Stripping containers is right for a long dense list and wrong for four
 * navigation targets; those need enough weight to fill the page they own.
 */
function LevelCard({
  label, sublabel, courseCount, summary, onPress,
}: {
  label: string;
  sublabel: string;
  courseCount: number;
  summary: MasterySummary;
  onPress: () => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const started = summary.started > 0;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={started
        ? `${label}. ${sublabel}. ${summary.points} ${t('sur', 'sou')} 100`
        : `${label}. ${sublabel}. ${courseCount} ${t('cours', 'kou')}`}
      style={{
        flexGrow: 1, flexBasis: '46%',
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        shadowColor: colors.azureDeep,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <Text style={[typeScale.display, { color: colors.ink, fontSize: 24, lineHeight: 28 }]}>{label}</Text>
      <Text
        numberOfLines={2}
        style={[typeScale.caption, { color: colors.muted, marginTop: 4, minHeight: 32 }]}
      >
        {sublabel}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <Text style={[typeScale.micro, { color: colors.faint }]}>
          {courseCount} {t('cours', 'kou')}
        </Text>
        {/* Nothing started = nothing to report. A "0" over four invisible
            dashes read as a broken widget, not as a starting point. */}
        {started ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={[typeScale.label, { color: colors.ink }]}>{summary.points}</Text>
            <MasteryMeter level={summary.level} size="sm" />
          </View>
        ) : (
          <ChevronRight color={colors.faint} size={16} />
        )}
      </View>
    </PressableScale>
  );
}

/**
 * A subject, in the level → subject step. Keeps a real video still so the row
 * carries the subject's own content rather than a generic tile.
 */
function DrillRow({
  title, subtitle, badge, summary, thumb, tint, onPress, comingSoon = false,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  summary?: MasterySummary;
  /** A still from one of the subject's videos — real content over a generic tile. */
  thumb?: string | null;
  tint?: string;
  onPress: () => void;
  comingSoon?: boolean;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const started = !comingSoon && !!summary && summary.started > 0;
  const [thumbFailed, setThumbFailed] = useState(false);
  const accent = tint ?? colors.azure;

  return (
    <PressableScale
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
      accessibilityRole="button"
      accessibilityLabel={started
        ? `${title}. ${subtitle}. ${summary!.points} ${language === 'ht' ? 'sou' : 'sur'} 100`
        : `${title}. ${subtitle}`}
      style={{ borderTopWidth: 1, borderTopColor: colors.hairline, opacity: comingSoon ? 0.55 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
        {thumb && !thumbFailed ? (
          <Image
            source={{ uri: thumb }}
            resizeMode="cover"
            onError={() => setThumbFailed(true)}
            style={{ width: 76, height: 48, borderRadius: 10, backgroundColor: colors.surfaceAlt }}
          />
        ) : (
          // Fallback keeps the subject's colour rather than going blank.
          <View style={{
            width: 76, height: 48, borderRadius: 10, backgroundColor: accent + '1a',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: accent, opacity: 0.5 }} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[typeScale.title, { color: colors.ink }]}>{title}</Text>
          <Text style={[typeScale.caption, { color: colors.muted, marginTop: 3 }]}>{subtitle}</Text>
        </View>
        {started ? (
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={[typeScale.label, { color: colors.ink }]}>{summary!.points}</Text>
            <MasteryMeter level={summary!.level} size="sm" />
          </View>
        ) : badge ? (
          <Text style={[typeScale.caption, { color: colors.faint }]}>{badge}</Text>
        ) : null}
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
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const centerColumn = useContentContainerStyle('readable');

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);

  // The drill-down (level → subject) is local state on the tab-stack root, so it
  // survives leaving the tab. Callers that mean "show me the whole catalog" send
  // a `resetAt` nonce; without this, Home's "Voir tout" re-showed the last
  // sub-list the student was in (reported as "voir tout opens the chemistry one").
  const resetAt = route.params?.resetAt;
  React.useEffect(() => {
    if (resetAt) {
      setLevel(null);
      setSubject(null);
      setSearch('');
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

  const coursesByLevel = useMemo(() => {
    const m: Record<string, any[]> = {};
    all.forEach((c) => { m[c.level] = [...(m[c.level] ?? []), c]; });
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
            <Text style={[typeScale.display, { color: colors.ink }]}>
              {headerTitle}
            </Text>
            {headerSubtitle ? (
              <Text style={[typeScale.label, { color: colors.muted, marginTop: 2 }]}>{headerSubtitle}</Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-800 border rounded-xl px-3" style={{ borderColor: colors.border }}>
          <Search color={colors.faint} size={18} />
          <TextInput
            className="flex-1 py-3 ml-2"
            style={[typeScale.body, { color: colors.ink }]}
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
              onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
            />
          )}
        />
      ) : !level ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
          showsVerticalScrollIndicator={false}
        >
          {/* Banque de Questions — the one filled block on the page, so it
              reads as an action rather than another row in the list. */}
          <PressableScale
            onPress={() => navigation.navigate('Quizzes', {})}
            pressedScale={0.985}
            style={{
              borderRadius: radius.card, marginBottom: 26, overflow: 'hidden',
              shadowColor: colors.azureDeep, shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.22, shadowRadius: 18, elevation: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Banque de Questions', 'Bank Kesyon')}
          >
            <LinearGradient
              colors={gradients.hero}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ paddingVertical: 18, paddingHorizontal: 18 }}
            >
              {/* No glow circle here. These are hard-edged shapes: on the tall
                  course hero the edge falls outside the frame, but on a short
                  block it cut a visible arc across the card and read as a
                  rendering fault. The gradient alone carries this one. */}
              <BookMarked color="rgba(255,255,255,0.85)" size={20} />
              <Text style={[typeScale.h2, { color: '#fff', marginTop: 12 }]}>
                {t('Banque de Questions', 'Bank Kesyon')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Text style={[typeScale.body, { color: 'rgba(255,255,255,0.85)' }]}>
                  {t('Entraîne-toi par matière et chapitre', 'Pratike pa matyè ak chapit')}
                </Text>
                <ChevronRight color="rgba(255,255,255,0.85)" size={15} />
              </View>
            </LinearGradient>
          </PressableScale>

          <Text style={[typeScale.overline, { color: colors.faint, marginBottom: 12 }]}>
            {t('Ton niveau', 'Nivo ou')}
          </Text>

          {/* A 2×2 grid, not four hairline rows. Four rows of text left the
              bottom 40% of this screen empty, which read as an unfinished page;
              the same four items as cards fill it and look deliberate. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {LEVELS.filter((l) => (coursesByLevel[l.code]?.length ?? 0) > 0).map((l) => (
              <LevelCard
                key={l.code}
                label={l.label}
                sublabel={isCreole ? l.sublabelHt : l.sublabel}
                courseCount={coursesByLevel[l.code].length}
                summary={summaryFor(coursesByLevel[l.code])}
                onPress={() => setLevel(l.code)}
              />
            ))}
          </View>
        </ScrollView>
      ) : !subject ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
          showsVerticalScrollIndicator={false}
        >
          {subjectsForLevel.length === 0 ? (
            <EmptyState
              icon={<GraduationCap color={colors.azure} size={34} strokeWidth={1.75} />}
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              description={t('Ce niveau n\'a pas encore de matières. Reviens bientôt !', 'Nivo sa a poko gen matyè. Tounen talè !')}
              ctaLabel={t('Retour', 'Retounen')}
              onCta={goBack}
            />
          ) : (
            subjectsForLevel.map(([code, group]) => {
              const meta = subjectMeta(code);
              const soon = group.length > 0 && group.every((c: any) => c.comingSoon);
              const lessons = group.reduce((s: number, c: any) => s + countLessons(c), 0);
              return (
                <DrillRow
                  key={code}
                  title={isCreole ? meta.nameHt : meta.name}
                  subtitle={soon ? t('Cours en préparation', 'Kou ap prepare') : `${lessons} ${t('leçons', 'leson')}`}
                  badge={soon ? t('Bientôt', 'Talè') : (group.length > 1 ? `${group.length} ${t('cours', 'kou')}` : undefined)}
                  summary={summaryFor(group)}
                  thumb={soon ? null : courseVideoThumb(group[0])}
                  tint={meta.color}
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
          contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 }, centerColumn]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          ListHeaderComponent={
            courseList.length > 0 ? (
              <Text className="mb-3" style={[typeScale.caption, { color: colors.muted }]}>{courseList.length} {t('cours', 'kou')}</Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<BookOpen color={colors.azure} size={34} strokeWidth={1.75} />}
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              description={t('Aucun cours dans cette matière pour l\'instant.', 'Pa gen kou nan matyè sa a pou kounye a.')}
              ctaLabel={t('Retour', 'Retounen')}
              onCta={goBack}
            />
          }
          renderItem={({ item: course }) => (
            <CourseRow
              course={course}
              summary={summaryFor([course])}
              onPress={() => navigation.navigate('CourseDetail', { courseId: course.id, courseName: course.name })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
