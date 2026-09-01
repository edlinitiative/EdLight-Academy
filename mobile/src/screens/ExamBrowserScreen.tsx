import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useReduceMotion } from '../utils/motion';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft, Search, ChevronRight, CheckCircle2, SlidersHorizontal, X,
  Clock, Layers, Award, GraduationCap,
} from 'lucide-react-native';
import { fetchFullCatalog } from '../utils/examCatalog';
import { normalizeSubject, normalizeLevel, normalizeExamTitle, examTitleParts, subjectColor } from '../utils/examUtils';
import { loadAllExamResultSummaries } from '../services/examResults';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { deriveSignals, selectAdaptiveItems } from '../services/adaptiveEngine';
import { useColors, useTheme } from '../theme/theme';
import { ErrorState, EmptyState, Skeleton } from '../components/StateViews';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamBrowser'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamBrowser'>;

// Screen title per level — [fr, ht], resolved through the screen's `t` helper.
const LEVEL_LABEL: Record<string, [string, string]> = {
  terminale: ['Terminale (Bac)', 'Tèminal (Bak)'],
  '9e': ['9ème Année', '9yèm Ane'],
  university: ['Université', 'Inivèsite'],
};

const LEVEL_FILTER_MAP: Record<string, string[]> = {
  terminale: ['baccalaureat', 'bac', 'terminale'],
  '9e': ['9eme', '9ème', '9e', 'neuvieme', 'neuvième'],
  university: ['universite', 'université', 'university'],
};

// gradeProfile().examLevel → this screen's route-level keys, so a student's
// grade can pick the default pool (POSTBAC → université concours, 9e → 9ème).
const EXAM_LEVEL_TO_ROUTE: Record<string, string> = {
  baccalaureat: 'terminale',
  universite: 'university',
  '9eme_af': '9e',
};

// Short, human labels for the dismissible "level context" chip (FR / HT).
const CURATED_LEVEL_LABEL: Record<string, [string, string]> = {
  terminale: ['Terminale · Bac', 'Tèminal · Bak'],
  '9e': ['9ème année', '9yèm ane'],
  university: ['Préfac · Concours', 'Prefak · Konkou'],
};

function questionCount(exam: any): number {
  if (typeof exam._questionCount === 'number') return exam._questionCount;
  if (typeof exam.question_count === 'number') return exam.question_count;
  const sections = Array.isArray(exam.sections) ? exam.sections : [];
  return sections.reduce((s: number, sec: any) => s + (Array.isArray(sec.questions) ? sec.questions.length : 0), 0);
}

function sectionCount(exam: any): number {
  if (typeof exam._sectionCount === 'number') return exam._sectionCount;
  return Array.isArray(exam.sections) ? exam.sections.length : 0;
}

/** Emoji per canonical subject — the scannable "badge" on each exam card. */
const SUBJECT_EMOJI: Record<string, string> = {
  Mathématiques: '📐',
  Physique: '⚛️',
  Chimie: '⚗️',
  SVT: '🧬',
  Français: '📖',
  Anglais: '🗣️',
  Espagnol: '🗣️',
  'Histoire-Géo': '🌍',
  Philosophie: '💭',
  Kreyòl: '📖',
  Économie: '📊',
  'Art & Musique': '🎨',
  Informatique: '💻',
  Santé: '🩺',
  'Culture Générale': '🧠',
  Mixed: '🧩',
};

function subjectEmoji(subject: string): string {
  return SUBJECT_EMOJI[subject] ?? '📝';
}

function ExamCard({
  exam,
  attemptInfo,
  onPress,
}: {
  exam: any;
  attemptInfo?: { percentage: number | null; attempted: boolean } | null;
  onPress: () => void;
}) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const { cardSurface, typeScale } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const parts = examTitleParts(exam);
  const subject = parts.subject || normalizeSubject(exam.subject ?? '') || t('Examen', 'Egzamen');
  const color = subjectColor(subject);
  const yearOrSession = parts.session || (parts.year ? String(parts.year) : '');
  const levelLbl = normalizeLevel(exam.level ?? exam.niveau ?? '');
  // Meta = "Niveau · [topic / série]" — the distinguishing detail so two exams of
  // the same subject/year never read as one.
  const metaBits = [levelLbl, parts.topic || parts.series].filter(Boolean);

  const durationMin = Number(exam.duration_minutes) || 0;
  const totalPoints = Number(exam.total_points) || 0;
  const secCount = sectionCount(exam);
  const qCount = questionCount(exam);

  const done = !!attemptInfo?.attempted;
  const pct = typeof attemptInfo?.percentage === 'number' ? Math.round(attemptInfo.percentage) : null;

  const a11y = `${subject}${yearOrSession ? ' ' + yearOrSession : ''}`;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      pressedScale={0.98}
      style={[cardSurface, { marginBottom: 12, padding: 14 }]}
    >
      <View className="flex-row items-center" style={{ gap: 12 }}>
        {/* Subject badge — the only carrier of the subject color (no left stripe) */}
        <View
          className="items-center justify-center flex-shrink-0"
          style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: color + '1f' }}
        >
          <Text style={{ fontSize: 22 }}>{subjectEmoji(subject)}</Text>
        </View>

        <View className="flex-1" style={{ minWidth: 0 }}>
          {/* Title: "Matière · Année" */}
          <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>
            {subject}
            {yearOrSession ? <Text style={{ color }}>{`  ·  ${yearOrSession}`}</Text> : null}
          </Text>

          {/* Meta: "Niveau · Session/Topic" */}
          {metaBits.length > 0 ? (
            <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]} numberOfLines={1}>
              {metaBits.join('  ·  ')}
            </Text>
          ) : null}

          {/* Stats row: ⏱ min · sections/questions · pts */}
          <View className="flex-row items-center flex-wrap" style={{ gap: 12, marginTop: 7 }}>
            {durationMin > 0 ? (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Clock color={colors.faint} size={13} />
                <Text style={[typeScale.micro, { color: colors.muted }]}>{durationMin} min</Text>
              </View>
            ) : null}
            {secCount > 0 ? (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Layers color={colors.faint} size={13} />
                <Text style={[typeScale.micro, { color: colors.muted }]}>
                  {secCount} {t(secCount > 1 ? 'exercices' : 'exercice', 'egzèsis')}
                </Text>
              </View>
            ) : qCount > 0 ? (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Layers color={colors.faint} size={13} />
                <Text style={[typeScale.micro, { color: colors.muted }]}>
                  {qCount} {t(qCount > 1 ? 'questions' : 'question', 'kesyon')}
                </Text>
              </View>
            ) : null}
            {totalPoints > 0 ? (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Award color={colors.faint} size={13} />
                <Text style={[typeScale.micro, { color: colors.muted }]}>{totalPoints} {t('pts', 'pwen')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Right: completion badge or chevron */}
        {done ? (
          <View className="items-center" style={{ gap: 2 }}>
            <CheckCircle2 color={colors.success} size={20} />
            {pct !== null ? (
              <Text style={[typeScale.micro, { color: colors.success }]}>{pct}%</Text>
            ) : null}
          </View>
        ) : (
          <ChevronRight color={colors.faint} size={18} />
        )}
      </View>
    </PressableScale>
  );
}

export default function ExamBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, subject: initialSubject } = route.params;
  const { user, language } = useStore();
  const grade = useStore((s) => s.grade);
  const colors = useColors();
  const { typeScale, radius, shadow } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  const reduceMotion = useReduceMotion();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [catalog, setCatalog] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState(initialSubject ?? 'Tout');
  const [yearFilter, setYearFilter] = useState('Tout');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'todo'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // ── Grade-based curation ──────────────────────────────────────────────────
  // Map the student's grade to an exam level; when it differs from the browser's
  // default (terminale) pool, default-filter to it so a post-Bac (or 9e) student
  // isn't dumped into 470 Bac papers. Only ever curates away from the default
  // terminale pool — an explicit level choice (9e / université card) is left as
  // is. Dismissible, never locked (see the level chip below).
  const curatedLevel = useMemo(() => {
    const mapped = EXAM_LEVEL_TO_ROUTE[gradeProfile(grade).examLevel ?? ''] ?? null;
    return level === 'terminale' && mapped && mapped !== 'terminale' ? mapped : null;
  }, [grade, level]);
  const [activeLevel, setActiveLevel] = useState<string>(curatedLevel ?? level);
  const levelTouched = useRef(false);
  // Late store hydration: snap to the curated level once grade resolves, unless
  // the student has already chosen a level via the chip.
  useEffect(() => {
    if (!levelTouched.current && curatedLevel && activeLevel === level && curatedLevel !== level) {
      setActiveLevel(curatedLevel);
    }
  }, [curatedLevel, level, activeLevel]);

  // Re-apply the subject filter when navigated here with a new `subject` param
  // while this screen is already mounted (e.g. the readiness "Focus recommandé"
  // chip or a "Par matière" link tapped from another tab). useState only reads
  // its initial value on first mount, so without this the filter would go stale.
  useEffect(() => {
    if (initialSubject) setSubject(initialSubject);
  }, [initialSubject]);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    // The catalog index is cache-first and drives the list — render as soon
    // as it arrives. The "done / best score" badges come from Firestore and
    // fill in when ready; they must never block the list behind a spinner.
    // The full catalog is kept so the in-browser level filter (grade curation /
    // "tous les niveaux") can switch pools without a re-fetch.
    fetchFullCatalog()
      .then((cat) => { if (active) setCatalog(cat); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });

    if (user?.uid) {
      loadAllExamResultSummaries(user.uid)
        .then((res) => { if (active) setResults(res); })
        .catch(() => {});
    } else {
      setResults({});
    }
    return () => { active = false; };
  }, [user?.uid, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return load();
  }, [load]);

  // Level-filtered, year-sorted pool the list renders. Level comes from the
  // in-browser selector (grade-curated by default); 'all' shows every level.
  const exams = useMemo(() => {
    let pool = catalog;
    if (activeLevel !== 'all') {
      const filters = LEVEL_FILTER_MAP[activeLevel] ?? [];
      pool = catalog.filter((e: any) => {
        const lvl = String(e.level ?? e.niveau ?? '').toLowerCase();
        return filters.some((f) => lvl.includes(f));
      });
    }
    return [...pool].sort((a: any, b: any) => {
      const ya = parseInt(String(a.year ?? '0'), 10);
      const yb = parseInt(String(b.year ?? '0'), 10);
      return yb - ya;
    });
  }, [catalog, activeLevel]);

  // Per-subject ability estimate (Adaptive Engine, Slice 3a): fold the student's
  // past exam results into a 0–100 skill per subject, reusing data already loaded
  // on this screen (catalog → subject, results → percentages). No extra fetch.
  const ability = useMemo(() => {
    const subjectById: Record<string, string> = {};
    catalog.forEach((e: any) => {
      const id = String(e.exam_id ?? e.id ?? '');
      if (id) subjectById[id] = normalizeSubject(e.subject ?? '');
    });
    const attempts = Object.entries(results)
      .map(([examId, r]: [string, any]) => ({
        subject: subjectById[examId] || '',
        quizId: examId,
        percentage: typeof r?.percentage === 'number' ? r.percentage : 0,
        timeSpent: 0,
        attemptedAtMs: typeof r?.submittedAtMs === 'number' ? r.submittedAtMs : 0,
      }))
      .filter((a) => a.attemptedAtMs && a.subject);
    return deriveSignals(attempts).ability;
  }, [catalog, results]);

  const subjects = useMemo(() => {
    const s = new Set<string>();
    exams.forEach((e) => {
      const subj = normalizeSubject(e.subject ?? '');
      if (subj && subj !== 'Autre') s.add(subj);
    });
    return ['Tout', ...Array.from(s).sort()];
  }, [exams]);

  const years = useMemo(() => {
    const y = new Set<string>();
    exams.forEach((e) => { if (e.year) y.add(String(e.year)); });
    return ['Tout', ...Array.from(y).sort((a, b) => parseInt(b) - parseInt(a))];
  }, [exams]);

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      if (subject !== 'Tout') {
        const subj = normalizeSubject(e.subject ?? '');
        if (subj !== subject) return false;
      }
      if (yearFilter !== 'Tout' && String(e.year) !== yearFilter) return false;
      if (statusFilter !== 'all') {
        const examId = String(e.exam_id ?? e.id ?? '');
        const done = !!results[examId];
        if (statusFilter === 'done' && !done) return false;
        if (statusFilter === 'todo' && done) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const title = normalizeExamTitle(e).toLowerCase();
        return title.includes(q) || (e.subject ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [exams, subject, yearFilter, statusFilter, search, results]);

  // When a single subject is in focus and we know the student's level in it,
  // order those papers by challenge fit (stretch the strong, on-ramp the rest);
  // otherwise keep the year-desc default. Cold start (no ability) → unchanged.
  const displayed = useMemo(() => {
    const a = subject !== 'Tout' ? (ability[subject] ?? 0) : 0;
    if (!(a > 0)) return filtered;
    return selectAdaptiveItems(filtered, { ability: a });
  }, [filtered, ability, subject]);
  const adaptiveActive = subject !== 'Tout' && (ability[subject] ?? 0) > 0;

  const doneCount = useMemo(() => exams.filter((e) => !!results[String(e.exam_id ?? e.id ?? '')]).length, [exams, results]);
  const activeFilterCount = [subject !== 'Tout', yearFilter !== 'Tout', statusFilter !== 'all'].filter(Boolean).length;
  const levelLabelPair = LEVEL_LABEL[activeLevel] ?? LEVEL_LABEL[level];
  const screenTitle = activeLevel === 'all'
    ? t('Tous les examens', 'Tout egzamen')
    : (levelLabelPair ? t(levelLabelPair[0], levelLabelPair[1]) : level);
  const curatedChipLabel = activeLevel === 'all'
    ? t('Tous les niveaux', 'Tout nivo')
    : (CURATED_LEVEL_LABEL[activeLevel]
        ? t(CURATED_LEVEL_LABEL[activeLevel][0], CURATED_LEVEL_LABEL[activeLevel][1])
        : activeLevel);

  // Stay inside the Exams stack: canGoBack() also counts the parent tab
  // navigator's history, so it's true even when this screen is the stack's
  // only route (e.g. entered straight from Home's readiness card) — goBack()
  // then switched TABS and landed the student on Accueil. Only pop when this
  // stack really has something underneath; otherwise reset to the level picker.
  const goBackToExams = useCallback(() => {
    const stackRoutes = navigation.getState()?.routes ?? [];
    if (stackRoutes.length > 1) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'ExamLanding' }] });
  }, [navigation]);

  // Toggle the level chip between the grade-curated pool and every level.
  function toggleLevel() {
    levelTouched.current = true;
    setSubject('Tout');
    setYearFilter('Tout');
    setStatusFilter('all');
    setSearch('');
    setActiveLevel((cur) => (cur === curatedLevel ? 'all' : (curatedLevel ?? level)));
  }

  if (loading)
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {/* Header (matches the loaded layout so nothing shifts) */}
        <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
          <TouchableOpacity
            onPress={goBackToExams}
            className="mr-3 p-1"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Retour', 'Retounen')}
          >
            <ArrowLeft color={colors.muted} size={22} />
          </TouchableOpacity>
          <Text style={[typeScale.h1, { color: colors.ink }]}>{screenTitle}</Text>
        </View>
        {/* Search bar placeholder */}
        <View className="px-4 pt-3 pb-1">
          <Skeleton height={44} radius={radius.control} />
        </View>
        {/* Exam card skeletons — match the real ExamCard (radius.card) so cards
            don't resize when the catalog loads. */}
        <View className="px-4 pt-3" style={{ gap: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              className="flex-row items-center"
              style={{ gap: 12, backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadow.sm }}
            >
              <Skeleton width={44} height={44} radius={12} />
              <View className="flex-1" style={{ gap: 8 }}>
                <Skeleton width="80%" height={13} />
                <Skeleton width="45%" height={11} />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  if (error) return <ErrorState onRetry={() => setRetryCount((n) => n + 1)} />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header — shares the page background (no white-bar seam) */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          onPress={goBackToExams}
          className="mr-3 p-1"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ArrowLeft color={colors.muted} size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text style={[typeScale.h1, { color: colors.ink }]}>{screenTitle}</Text>
          {exams.length > 0 && (
            <Text style={[typeScale.caption, { color: colors.faint, marginTop: 2 }]}>
              {exams.length} {t('examens', 'egzamen')} · {doneCount} {t('terminé', 'fini')}{doneCount > 1 ? t('s', '') : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${activeFilterCount > 0 ? 'bg-primary-600 dark:bg-[#4C9AF5]' : 'bg-gray-100 dark:bg-slate-800'}`}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Filtres', 'Filt')}
        >
          <SlidersHorizontal color={activeFilterCount > 0 ? '#fff' : colors.muted} size={16} />
          {activeFilterCount > 0 && (
            <Text className="text-white text-xs font-bold">{activeFilterCount}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Level context — grade-curated by default (e.g. "Préfac · Concours"),
          with a one-tap escape to browse every level. Only shown when the
          student's grade implies a different pool than the default Bac papers. */}
      {curatedLevel ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 4, backgroundColor: colors.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: radius.control,
              backgroundColor: colors.azureSoft,
              borderWidth: 1,
              borderColor: colors.azure + '33',
            }}
          >
            <GraduationCap color={colors.azure} size={17} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[typeScale.label, { color: colors.azure, fontFamily: 'Satoshi-Bold' }]} numberOfLines={1}>
                {curatedChipLabel}
              </Text>
              <Text style={[typeScale.micro, { color: colors.muted }]} numberOfLines={1}>
                {activeLevel === curatedLevel
                  ? t('Adapté à ton profil', 'Adapte pou pwofil ou')
                  : t('Affichage de tous les examens', 'N ap montre tout egzamen')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={toggleLevel}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                activeLevel === curatedLevel
                  ? t('Voir tous les niveaux', 'Wè tout nivo')
                  : t('Revenir à mon niveau', 'Retounen nan nivo mwen')
              }
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={[typeScale.micro, { color: colors.azure, fontFamily: 'Satoshi-Bold' }]}>
                {activeLevel === curatedLevel ? t('Tous les niveaux', 'Tout nivo') : t('Mon niveau', 'Nivo mwen')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Search */}
      <View className="px-4 pt-3 pb-2" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center bg-gray-50 dark:bg-slate-800 border rounded-xl px-3 mb-3" style={{ borderColor: colors.border }}>
          <Search color={colors.faint} size={16} />
          <TextInput
            className="flex-1 py-3 ml-2 text-sm text-gray-900 dark:text-slate-100"
            placeholder={t('Rechercher un examen…', 'Chèche yon egzamen…')}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.faint}
          />
        </View>
        {/* Matière filter pills — active = brand fill, inactive = hairline tint */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {subjects.map((s) => {
            const active = subject === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setSubject(s)}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.azure : colors.border,
                  backgroundColor: active ? colors.azure : colors.surface,
                }}
              >
                <Text style={[typeScale.label, { color: active ? '#ffffff' : colors.muted }]}>
                  {s === 'Tout' ? t('Toutes', 'Tout') : s}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Active filters row */}
      {(yearFilter !== 'Tout' || statusFilter !== 'all') && (
        <View className="flex-row items-center gap-2 px-4 py-2 border-b" style={{ backgroundColor: colors.bg, borderBottomColor: colors.border }}>
          {yearFilter !== 'Tout' && (
            <TouchableOpacity
              onPress={() => setYearFilter('Tout')}
              className="flex-row items-center gap-1 bg-primary-600 dark:bg-[#4C9AF5] px-3 py-1 rounded-full"
            >
              <Text className="text-white text-xs font-semibold">{yearFilter}</Text>
              <X color="#fff" size={12} />
            </TouchableOpacity>
          )}
          {statusFilter !== 'all' && (
            <TouchableOpacity
              onPress={() => setStatusFilter('all')}
              className="flex-row items-center gap-1 bg-primary-600 dark:bg-[#4C9AF5] px-3 py-1 rounded-full"
            >
              <Text className="text-white text-xs font-semibold">{statusFilter === 'done' ? t('Terminés', 'Fini') : t('À faire', 'Pou fè')}</Text>
              <X color="#fff" size={12} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { setYearFilter('Tout'); setStatusFilter('all'); }}>
            <Text className="text-primary-600 dark:text-[#4C9AF5] text-xs font-medium">{t('Effacer tout', 'Efase tout')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        className="flex-1"
        data={displayed}
        keyExtractor={(exam, i) => String(exam.exam_id ?? exam.id ?? i)}
        contentContainerStyle={[{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }, centerColumn]}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => setRetryCount((n) => n + 1)}
            tintColor={colors.azure}
            colors={[colors.azure]}
          />
        }
        ListHeaderComponent={
          displayed.length > 0 ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={[typeScale.caption, { color: colors.faint }]}>{displayed.length} {t('résultat', 'rezilta')}{displayed.length > 1 ? t('s', '') : ''}</Text>
              {adaptiveActive && (
                <Text style={[typeScale.caption, { color: colors.faint, marginTop: 2 }]}>
                  ✨ {t('Trié pour ton niveau', 'Klase pou nivo ou')}
                </Text>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            message={t('Aucun examen trouvé.', 'Nou pa jwenn okenn egzamen.')}
            ctaLabel={activeFilterCount > 0 || search ? t('Effacer les filtres', 'Efase filt yo') : undefined}
            onCta={() => { setSubject('Tout'); setYearFilter('Tout'); setStatusFilter('all'); setSearch(''); }}
          />
        }
        renderItem={({ item: exam, index: i }) => {
          const examId = String(exam.exam_id ?? exam.id ?? i);
          const card = (
            <ExamCard
              exam={exam}
              attemptInfo={results[examId] ?? null}
              onPress={() => navigation.navigate('ExamOverview', { level: activeLevel !== 'all' ? activeLevel : level, examId })}
            />
          );
          if (reduceMotion) return card;
          // Cascade the visible cards in on mount: fade + rise, staggered by
          // index but capped at ~12 so long catalogs don't accrue huge delays.
          return (
            <Animated.View
              entering={FadeInDown.duration(360).delay(Math.min(i, 12) * 45)}
            >
              {card}
            </Animated.View>
          );
        }}
      />

      {/* Filter modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <TouchableOpacity
          className="flex-1 bg-black/40"
          activeOpacity={1}
          onPress={() => setShowFilters(false)}
          accessibilityRole="button"
          accessibilityLabel={t('Fermer', 'Fèmen')}
        />
        <View className="bg-white dark:bg-[#131c2e] rounded-t-3xl px-5 pt-5 pb-10" accessibilityViewIsModal>
          <View className="flex-row items-center justify-between mb-5">
            <Text style={[typeScale.h2, { color: colors.ink }]}>{t('Filtres', 'Filt')}</Text>
            <TouchableOpacity
              onPress={() => setShowFilters(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
            >
              <X color={colors.muted} size={22} />
            </TouchableOpacity>
          </View>

          {/* Year filter */}
          <Text style={[typeScale.label, { color: colors.muted, marginBottom: 8 }]}>{t('Année', 'Ane')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-5">
            {years.map((y) => (
              <TouchableOpacity
                key={y}
                onPress={() => setYearFilter(y)}
                className={`px-4 py-2 rounded-full ${yearFilter === y ? 'bg-primary-600 dark:bg-[#4C9AF5]' : 'bg-gray-100 dark:bg-slate-800'}`}
              >
                <Text className={`text-sm font-semibold ${yearFilter === y ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>{y === 'Tout' ? t('Toutes', 'Tout') : y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Status filter */}
          <Text style={[typeScale.label, { color: colors.muted, marginBottom: 8 }]}>{t('Statut', 'Eta')}</Text>
          <View className="flex-row gap-3 mb-6">
            {([['all', t('Tous', 'Tout')], ['todo', t('À faire', 'Pou fè')], ['done', t('Terminés', 'Fini')]] as const).map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setStatusFilter(val)}
                className={`flex-1 py-3 rounded-xl items-center ${statusFilter === val ? 'bg-primary-600 dark:bg-[#4C9AF5]' : 'bg-gray-100 dark:bg-slate-800'}`}
              >
                <Text className={`text-sm font-semibold ${statusFilter === val ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setShowFilters(false)}
            className="bg-primary-600 dark:bg-[#4C9AF5] py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-bold text-base">{t('Appliquer', 'Aplike')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
