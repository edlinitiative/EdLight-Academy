import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useScrollToTop, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Search, X, BookOpen } from 'lucide-react-native';
import { useCourses } from '../hooks/useData';
import { SUBJECT_META } from '../utils/subjectMeta';
import useStore from '../contexts/store';
import { ErrorState, EmptyState } from '../components/StateViews';
import { summarize, courseLessonIds, chapterTestReady, type ProgressMap } from '../utils/mastery';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { useTheme } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import PageTitle from '../components/ui/PageTitle';
import SectionHeader from '../components/ui/SectionHeader';
import SearchField from '../components/ui/SearchField';
import SkeletonCover from '../components/ui/SkeletonCover';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { displayCourseName } from '../utils/courseName';
import {
  LevelPill, ChapterCard, CourseShelfCard, CourseResultRow, PracticeTile,
  CHAPTER_CARD_WIDTH, COURSE_CARD_WIDTH,
} from '../components/courses/CourseCards';
import { chapterCards, joinNames, subjectRank } from '../components/courses/courseOutline';

type Nav = NativeStackNavigationProp<CoursesParamList, 'CourseList'>;

/**
 * Cours (DIRECTION §3, Stitch 03-cours).
 *
 * The class is a FILTER, not a destination (TestFlight, 17 août): the title
 * row, the class pills (your class first and preselected), then one shelf per
 * subject of that class. Each shelf is the subject's course for the class,
 * shown as its CHAPTERS — one class plus one subject is one course, so the
 * rail is the course's plan, and a card opens the overview on that chapter.
 * Then the two practice entries, then "Autres niveaux" (one shelf per subject
 * across the other classes: revision below, preview above).
 *
 * No band, no greeting. Courses that are only announced show no card — one
 * honest line names them.
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

const levelLabelOf = (code: string) => LEVELS.find((l) => l.code === code)?.label ?? code;

function subjectName(code: string, isCreole: boolean) {
  const meta = SUBJECT_META[code];
  return meta ? (isCreole ? meta.nameHt : meta.name) : code;
}

function countLessons(course: any): number {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  return units.reduce((s: number, u: any) => s + (u?.lessons?.length ?? 0), 0) || course?.videoCount || 0;
}

export default function CoursesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<CoursesParamList, 'CourseList'>>();
  // Tapping the active tab scrolls this screen back to the top.
  const scrollRef = React.useRef<any>(null);
  useScrollToTop(scrollRef);
  const { language, progress } = useStore();
  const grade = useStore((s) => s.grade);
  const { colors, elevation, fonts } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const centerColumn = useContentContainerStyle('readable');

  const { data: courses, isLoading, isError, refetch, isFetching } = useCourses();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // null = "auto": follow the student's class (or the first level that has
  // courses). Set only by an explicit pill tap, so a grade change in Profile
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

  // Walking every course's modules is the expensive part and does not depend
  // on progress — cached against the catalogue (low-end Android first screen).
  const lessonIdsByCourse = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of courses ?? []) m.set(c.id, courseLessonIds(c));
    return m;
  }, [courses]);

  const all = useMemo(() => courses ?? [], [courses]);
  const searching = search.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = search.toLowerCase();
    return all.filter((c) => !c.comingSoon && (
      c.name?.toLowerCase().includes(q)
      || displayCourseName(c.name).toLowerCase().includes(q)
      || c.subject?.toLowerCase().includes(q)
      || subjectName(c.subject, false).toLowerCase().includes(q)
      || subjectName(c.subject, true).toLowerCase().includes(q)
    ));
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

  // The student's class pill always comes first; the rest keep catalogue order.
  const pillLevels = useMemo(() => {
    if (!myLevelAvailable) return availableLevels;
    return [
      ...availableLevels.filter((l) => l.code === myLevel),
      ...availableLevels.filter((l) => l.code !== myLevel),
    ];
  }, [availableLevels, myLevel, myLevelAvailable]);

  const levelCourses = useMemo(
    () => all
      .filter((c) => c.level === selectedLevel)
      .sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject)),
    [all, selectedLevel],
  );
  const openCourses = useMemo(() => levelCourses.filter((c) => !c.comingSoon), [levelCourses]);
  const soonNames = useMemo(
    () => levelCourses.filter((c) => c.comingSoon).map((c) => subjectName(c.subject, isCreole)),
    [levelCourses, isCreole],
  );

  /** Each open course of the class → its chapter cards, with real progress. */
  const subjectShelves = useMemo(
    () => openCourses
      .map((course) => ({ course, cards: chapterCards(course, progress as ProgressMap) }))
      .filter((s) => s.cards.length > 0),
    [openCourses, progress],
  );

  // "Autres niveaux": every other level's open courses, one shelf per subject.
  // Cards are ordered levels-below-first (revision before preview), nearest first.
  const otherShelves = useMemo(() => {
    if (!selectedLevel) return [];
    const selectedIdx = LEVELS.findIndex((l) => l.code === selectedLevel);
    const cardRank = (levelCode: string) => {
      const i = LEVELS.findIndex((l) => l.code === levelCode);
      return i < selectedIdx ? selectedIdx - i : 100 + (i - selectedIdx);
    };
    const bySubject = new Map<string, any[]>();
    for (const c of all) {
      if (c.level === selectedLevel || c.comingSoon) continue;
      bySubject.set(c.subject, [...(bySubject.get(c.subject) ?? []), c]);
    }
    return Array.from(bySubject.entries())
      .map(([code, group]) => ({ code, courses: group.sort((a, b) => cardRank(a.level) - cardRank(b.level)) }))
      .sort((a, b) => subjectRank(a.code) - subjectRank(b.code));
  }, [all, selectedLevel]);

  // "Tests de chapitre" lands on the syllabus that owns the tests: the class's
  // most-advanced course, or its first open course when nothing is started.
  const chapterTestTarget = useMemo(() => {
    if (openCourses.length === 0) return null;
    let best = openCourses[0];
    let bestPoints = -1;
    for (const c of openCourses) {
      const s = summarize(lessonIdsByCourse.get(c.id) ?? [], progress as ProgressMap);
      if (s.started > 0 && s.points > bestPoints) { best = c; bestPoints = s.points; }
    }
    // Open on the chapter whose test is ready (the first one), not the top
    // of the syllabus: the tile promises a test, so land beside it.
    const modules: any[] = Array.isArray(best?.modules) ? best.modules : [];
    const ready = modules.findIndex((m) => {
      const ids = (Array.isArray(m?.lessons) ? m.lessons : []).map((l: any) => l?.id).filter(Boolean);
      return ids.length > 0 && chapterTestReady(summarize(ids, progress as ProgressMap));
    });
    return { course: best, chapterIndex: ready >= 0 ? ready : undefined };
  }, [openCourses, lessonIdsByCourse, progress]);

  const openCourse = (course: any, chapterIndex?: number) =>
    navigation.navigate('CourseDetail', {
      courseId: course.id,
      courseName: course.name,
      ...(chapterIndex != null ? { chapterIndex } : {}),
    });

  const searchButton = (
    <PressableScale
      onPress={() => {
        if (searchOpen) setSearch('');
        setSearchOpen(!searchOpen);
      }}
      accessibilityRole="button"
      accessibilityLabel={searchOpen ? t('Fermer la recherche', 'Fèmen rechèch la') : t('Rechercher un cours', 'Chèche yon kou')}
      style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, elevation.thumb]}
    >
      {searchOpen ? <X color={colors.ink} size={20} strokeWidth={2.2} /> : <Search color={colors.ink} size={20} strokeWidth={2.2} />}
    </PressableScale>
  );

  const header = (
    <View style={{ backgroundColor: colors.bg }}>
      <PageTitle title={t('Cours', 'Kou')} right={searchButton} style={centerColumn} />
      {searchOpen ? (
        <View style={[{ paddingHorizontal: 20, marginTop: 14 }, centerColumn]}>
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={t('Rechercher un cours…', 'Chèche yon kou…')}
            clearLabel={t('Effacer', 'Efase')}
            autoFocus
          />
        </View>
      ) : null}
    </View>
  );

  // Loading and failure keep the page title (the shell) — a failure is said
  // in place with a retry instead of replacing the whole tab.
  if (!courses && (isLoading || isError)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        {header}
        {isLoading ? (
          <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 16 }}>
            <SkeletonCover width={CHAPTER_CARD_WIDTH} />
            <SkeletonCover width={CHAPTER_CARD_WIDTH} />
          </View>
        ) : <ErrorState onRetry={() => refetch()} />}
      </SafeAreaView>
    );
  }

  const rail = (children: React.ReactNode, width: number) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={width + 12}
      snapToAlignment="start"
      // Vertical padding leaves room for the card shadow inside the clip.
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 2, paddingBottom: 18 }}
    >
      {children}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {header}

      {searching ? (
        <FlatList
          ref={scrollRef}
          data={searchResults}
          keyExtractor={(course) => course.id}
          style={{ flex: 1 }}
          contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 140, gap: 12 }, centerColumn]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          ListHeaderComponent={
            searchResults.length > 0 ? (
              <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>
                {searchResults.length} {t('cours', 'kou')}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Search color={colors.azure} size={34} strokeWidth={1.75} />}
              message={t('Aucun cours trouvé.', 'Nou pa jwenn okenn kou.')}
              description={t('Essaie un autre mot-clé ou explore les cours par classe.', 'Eseye yon lòt mo oswa gade kou yo pa klas.')}
              ctaLabel={t('Effacer la recherche', 'Efase rechèch la')}
              onCta={() => setSearch('')}
            />
          }
          renderItem={({ item: course }) => (
            <CourseResultRow
              course={course}
              levelLabel={levelLabelOf(course.level)}
              lessons={countLessons(course)}
              isCreole={isCreole}
              onPress={() => openCourse(course)}
            />
          )}
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.azure} />}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[0]}
        >
          {/* Class pills — sticky, so the filter stays reachable down the page. */}
          <View style={{ backgroundColor: colors.bg }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingTop: 16, paddingBottom: 10 }}
              accessibilityRole="tablist"
            >
              {pillLevels.map((l) => {
                const mine = l.code === myLevel;
                return (
                  <LevelPill
                    key={l.code}
                    label={mine ? `${l.label} · ${t('Ma classe', 'Klas mwen')}` : l.label}
                    accessibilityLabel={mine ? `${l.label}, ${t('ma classe', 'klas mwen')}` : l.label}
                    active={l.code === selectedLevel}
                    onPress={() => setLevelChoice(l.code)}
                  />
                );
              })}
            </ScrollView>
          </View>

          {subjectShelves.length === 0 ? (
            <View style={[{ paddingHorizontal: 20, marginTop: 16 }, centerColumn]}>
              <EmptyState
                icon={<BookOpen color={colors.azure} size={34} strokeWidth={1.75} />}
                message={t('Pas encore de cours ici', 'Poko gen kou la a')}
                description={t("Cette classe n'a pas encore de cours vidéo. Reviens bientôt !", 'Klas sa a poko gen kou videyo. Tounen talè !')}
              />
            </View>
          ) : null}

          {/* One shelf per subject of the class: the course's chapters. */}
          {subjectShelves.map(({ course, cards }, i) => (
            <View key={course.id}>
              <SectionHeader
                title={displayCourseName(course.name)}
                actionLabel={t('Voir tout', 'Wè tout')}
                onAction={() => openCourse(course)}
                style={[{ paddingHorizontal: 20, marginTop: i === 0 ? 18 : 22, marginBottom: 12 }, centerColumn]}
              />
              {rail(
                cards.map((card) => (
                  <ChapterCard key={card.id} card={card} isCreole={isCreole} onPress={() => openCourse(course, card.index)} />
                )),
                CHAPTER_CARD_WIDTH,
              )}
            </View>
          ))}

          <View style={[{ paddingHorizontal: 20 }, centerColumn]}>
            {soonNames.length > 0 ? (
              <View style={{ marginTop: 8, borderRadius: 14, backgroundColor: colors.surfaceAlt, paddingVertical: 14, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted }}>
                  {soonNames.length > 1
                    ? t(`${joinNames(soonNames, false)} arrivent bientôt`, `${joinNames(soonNames, true)} ap vini talè`)
                    : t(`${soonNames[0]} arrive bientôt`, `${soonNames[0]} ap vini talè`)}
                </Text>
              </View>
            ) : null}

            {/* Practice for the selected class */}
            {openCourses.length > 0 ? (
              <>
                <SectionHeader title={t("S'entraîner", 'Egzèse w')} style={{ marginTop: 24 }} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <PracticeTile
                    title={t('Banque de questions', 'Bank kesyon')}
                    subtitle={t('Par matière et chapitre', 'Pa matyè ak chapit')}
                    onPress={() => navigation.navigate('Quizzes', {})}
                  />
                  {chapterTestTarget ? (
                    <PracticeTile
                      title={t('Tests de chapitre', 'Tès chapit')}
                      subtitle={t('Vise la maîtrise', 'Vize metriz la')}
                      onPress={() => openCourse(chapterTestTarget.course, chapterTestTarget.chapterIndex)}
                    />
                  ) : null}
                </View>
              </>
            ) : null}

            {otherShelves.length > 0 ? (
              <SectionHeader title={t('Autres niveaux', 'Lòt nivo yo')} style={{ marginTop: 36, marginBottom: 0 }} />
            ) : null}
          </View>

          {otherShelves.map(({ code, courses: group }) => (
            <View key={code}>
              <Text
                accessibilityRole="header"
                style={[{ paddingHorizontal: 20, marginTop: 18, marginBottom: 10, fontSize: 17, lineHeight: 22, color: colors.ink, fontFamily: fonts.headingBold }, centerColumn]}
              >
                {subjectName(code, isCreole)}
              </Text>
              {rail(
                group.map((course) => (
                  <CourseShelfCard
                    key={course.id}
                    course={course}
                    levelLabel={levelLabelOf(course.level)}
                    mine={course.level === myLevel}
                    lessons={countLessons(course)}
                    isCreole={isCreole}
                    onPress={() => openCourse(course)}
                  />
                )),
                COURSE_CARD_WIDTH,
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
