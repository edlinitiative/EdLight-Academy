import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft, Search, ClipboardList, ChevronRight, CheckCircle2, SlidersHorizontal, X,
} from 'lucide-react-native';
import { fetchFullCatalog } from '../utils/examCatalog';
import { normalizeSubject, normalizeExamTitle, subjectColor } from '../utils/examUtils';
import { loadAllExamResultSummaries } from '../services/examResults';
import useStore from '../contexts/store';
import { useColors, useTheme } from '../theme/theme';
import { ErrorState, EmptyState, Skeleton } from '../components/StateViews';
import PressableScale from '../components/ui/PressableScale';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamBrowser'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamBrowser'>;

const LEVEL_LABEL: Record<string, string> = {
  terminale: 'Terminale (Bac)',
  '9e': '9ème Année',
  university: 'Université',
};

const LEVEL_FILTER_MAP: Record<string, string[]> = {
  terminale: ['baccalaureat', 'bac', 'terminale'],
  '9e': ['9eme', '9ème', '9e', 'neuvieme', 'neuvième'],
  university: ['universite', 'université', 'university'],
};

function questionCount(exam: any): number {
  if (typeof exam._questionCount === 'number') return exam._questionCount;
  if (typeof exam.question_count === 'number') return exam.question_count;
  const sections = Array.isArray(exam.sections) ? exam.sections : [];
  return sections.reduce((s: number, sec: any) => s + (Array.isArray(sec.questions) ? sec.questions.length : 0), 0);
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
  const { cardSurface } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const title = normalizeExamTitle(exam);
  const subject = normalizeSubject(exam.subject ?? '');
  const color = subjectColor(subject);
  const year = exam.year ?? '';
  const qCount = questionCount(exam);
  const done = !!attemptInfo?.attempted;
  const pct = typeof attemptInfo?.percentage === 'number' ? Math.round(attemptInfo.percentage) : null;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      pressedScale={0.98}
      style={[cardSurface, { marginBottom: 12 }]}
    >
      <View className="p-4">
        <View className="flex-row items-start gap-3">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: color + '18' }}
          >
            {done
              ? <CheckCircle2 color="#10b981" size={20} />
              : <ClipboardList color={color} size={20} />}
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-gray-900 dark:text-slate-100 text-sm leading-snug" numberOfLines={2}>{title}</Text>
            <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
              {/* Subject pill removed — the title already leads with the subject
                  (e.g. "Espagnol · Juillet 2025"), so the pill was redundant. */}
              {year ? (
                <Text className="text-xs text-gray-400 dark:text-slate-500 font-medium">{year}</Text>
              ) : null}
              {qCount > 0 ? (
                <Text className="text-xs text-gray-400 dark:text-slate-500">{qCount} {t('question', 'kesyon')}{qCount > 1 ? t('s', '') : ''}</Text>
              ) : null}
              {done && pct !== null ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircle2 color="#10b981" size={12} />
                  <Text className="text-xs text-emerald-700 font-semibold">{pct}%</Text>
                </View>
              ) : done ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircle2 color="#10b981" size={12} />
                  <Text className="text-xs text-emerald-600 font-medium">{t('Terminé', 'Fini')}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <ChevronRight color={colors.faint} size={18} className="mt-0.5" />
        </View>
      </View>
    </PressableScale>
  );
}

export default function ExamBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, subject: initialSubject } = route.params;
  const { user, language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [exams, setExams] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState(initialSubject ?? 'Tout');
  const [yearFilter, setYearFilter] = useState('Tout');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'todo'>('all');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    // The catalog index is cache-first and drives the list — render as soon
    // as it arrives. The "done / best score" badges come from Firestore and
    // fill in when ready; they must never block the list behind a spinner.
    fetchFullCatalog()
      .then((catalog) => {
        if (!active) return;
        const filters = LEVEL_FILTER_MAP[level] ?? [];
        const levelExams = catalog.filter((e: any) => {
          const lvl = String(e.level ?? e.niveau ?? '').toLowerCase();
          return filters.some((f) => lvl.includes(f));
        });
        levelExams.sort((a: any, b: any) => {
          const ya = parseInt(String(a.year ?? '0'), 10);
          const yb = parseInt(String(b.year ?? '0'), 10);
          return yb - ya;
        });
        setExams(levelExams);
      })
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
  }, [level, user?.uid, retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return load();
  }, [load]);

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

  const doneCount = useMemo(() => exams.filter((e) => !!results[String(e.exam_id ?? e.id ?? '')]).length, [exams, results]);
  const activeFilterCount = [subject !== 'Tout', yearFilter !== 'Tout', statusFilter !== 'all'].filter(Boolean).length;

  if (loading)
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        {/* Header (matches the loaded layout so nothing shifts) */}
        <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mr-3 p-1"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Retour', 'Retounen')}
          >
            <ArrowLeft color={colors.muted} size={22} />
          </TouchableOpacity>
          <Text className="font-bold text-gray-900 dark:text-slate-100 text-base">{LEVEL_LABEL[level] ?? level}</Text>
        </View>
        {/* Search bar placeholder */}
        <View className="px-4 pt-3 pb-1">
          <Skeleton height={44} radius={12} />
        </View>
        {/* Exam card skeletons */}
        <View className="px-4 pt-3" style={{ gap: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              className="bg-white dark:bg-[#131c2e] rounded-2xl p-4 border border-gray-100 dark:border-slate-700 flex-row items-center"
              style={{ gap: 12 }}
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
          onPress={() => navigation.goBack()}
          className="mr-3 p-1"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ArrowLeft color={colors.muted} size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 dark:text-slate-100 text-base">{LEVEL_LABEL[level] ?? level}</Text>
          {exams.length > 0 && (
            <Text className="text-xs text-gray-400 dark:text-slate-500">
              {exams.length} {t('examens', 'egzamen')} · {doneCount} {t('terminé', 'fini')}{doneCount > 1 ? t('s', '') : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${activeFilterCount > 0 ? 'bg-primary-600' : 'bg-gray-100 dark:bg-slate-800'}`}
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
        {/* Subject chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {subjects.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSubject(s)}
              className={`px-3 py-1.5 rounded-full ${subject === s ? 'bg-primary-600' : 'bg-gray-100 dark:bg-slate-800'}`}
            >
              <Text className={`text-xs font-semibold ${subject === s ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>{s === 'Tout' ? t('Toutes', 'Tout') : s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Active filters row */}
      {(yearFilter !== 'Tout' || statusFilter !== 'all') && (
        <View className="flex-row items-center gap-2 px-4 py-2 border-b" style={{ backgroundColor: colors.bg, borderBottomColor: colors.border }}>
          {yearFilter !== 'Tout' && (
            <TouchableOpacity
              onPress={() => setYearFilter('Tout')}
              className="flex-row items-center gap-1 bg-primary-600 px-3 py-1 rounded-full"
            >
              <Text className="text-white text-xs font-semibold">{yearFilter}</Text>
              <X color="#fff" size={12} />
            </TouchableOpacity>
          )}
          {statusFilter !== 'all' && (
            <TouchableOpacity
              onPress={() => setStatusFilter('all')}
              className="flex-row items-center gap-1 bg-primary-600 px-3 py-1 rounded-full"
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
        data={filtered}
        keyExtractor={(exam, i) => String(exam.exam_id ?? exam.id ?? i)}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRetryCount((n) => n + 1)} />}
        ListHeaderComponent={
          filtered.length > 0 ? (
            <Text className="text-xs text-gray-400 dark:text-slate-500 mb-3">{filtered.length} {t('résultat', 'rezilta')}{filtered.length > 1 ? t('s', '') : ''}</Text>
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
          return (
            <ExamCard
              exam={exam}
              attemptInfo={results[examId] ?? null}
              onPress={() => navigation.navigate('ExamTake', { level, examId })}
            />
          );
        }}
      />

      {/* Filter modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <TouchableOpacity
          className="flex-1 bg-black/40"
          activeOpacity={1}
          onPress={() => setShowFilters(false)}
        />
        <View className="bg-white dark:bg-[#131c2e] rounded-t-3xl px-5 pt-5 pb-10">
          <View className="flex-row items-center justify-between mb-5">
            <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">{t('Filtres', 'Filt')}</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <X color={colors.muted} size={22} />
            </TouchableOpacity>
          </View>

          {/* Year filter */}
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">{t('Année', 'Ane')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-5">
            {years.map((y) => (
              <TouchableOpacity
                key={y}
                onPress={() => setYearFilter(y)}
                className={`px-4 py-2 rounded-full ${yearFilter === y ? 'bg-primary-600' : 'bg-gray-100 dark:bg-slate-800'}`}
              >
                <Text className={`text-sm font-semibold ${yearFilter === y ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>{y === 'Tout' ? t('Toutes', 'Tout') : y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Status filter */}
          <Text className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">{t('Statut', 'Eta')}</Text>
          <View className="flex-row gap-3 mb-6">
            {([['all', t('Tous', 'Tout')], ['todo', t('À faire', 'Pou fè')], ['done', t('Terminés', 'Fini')]] as const).map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setStatusFilter(val)}
                className={`flex-1 py-3 rounded-xl items-center ${statusFilter === val ? 'bg-primary-600' : 'bg-gray-100 dark:bg-slate-800'}`}
              >
                <Text className={`text-sm font-semibold ${statusFilter === val ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setShowFilters(false)}
            className="bg-primary-600 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-bold text-base">{t('Appliquer', 'Aplike')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
