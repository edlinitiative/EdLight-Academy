import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, Modal,
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
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
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
  const title = normalizeExamTitle(exam);
  const subject = normalizeSubject(exam.subject ?? '');
  const color = subjectColor(subject);
  const year = exam.year ?? '';
  const qCount = questionCount(exam);
  const done = !!attemptInfo?.attempted;
  const pct = typeof attemptInfo?.percentage === 'number' ? Math.round(attemptInfo.percentage) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      className="bg-white rounded-2xl mb-3"
      style={{ shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e8edf5' }}
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
            <Text className="font-semibold text-gray-900 text-sm leading-snug" numberOfLines={2}>{title}</Text>
            <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
              {subject ? (
                <Text
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: color + '18', color }}
                >{subject}</Text>
              ) : null}
              {year ? (
                <Text className="text-xs text-gray-400 font-medium">{year}</Text>
              ) : null}
              {qCount > 0 ? (
                <Text className="text-xs text-gray-400">{qCount} question{qCount > 1 ? 's' : ''}</Text>
              ) : null}
              {done && pct !== null ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircle2 color="#10b981" size={12} />
                  <Text className="text-xs text-emerald-700 font-semibold">{pct}%</Text>
                </View>
              ) : done ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircle2 color="#10b981" size={12} />
                  <Text className="text-xs text-emerald-600 font-medium">Terminé</Text>
                </View>
              ) : null}
            </View>
          </View>
          <ChevronRight color="#9ca3af" size={18} className="mt-0.5" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ExamBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, subject: initialSubject } = route.params;
  const { user } = useStore();

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

  if (loading) return <LoadingState message="Chargement des examens…" />;
  if (error) return <ErrorState onRetry={() => setRetryCount((n) => n + 1)} />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#f4f6fb' }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base">{LEVEL_LABEL[level] ?? level}</Text>
          {exams.length > 0 && (
            <Text className="text-xs text-gray-400">
              {exams.length} examens · {doneCount} terminé{doneCount > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl ${activeFilterCount > 0 ? 'bg-primary-600' : 'bg-gray-100'}`}
        >
          <SlidersHorizontal color={activeFilterCount > 0 ? '#fff' : '#6b7280'} size={16} />
          {activeFilterCount > 0 && (
            <Text className="text-white text-xs font-bold">{activeFilterCount}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View className="px-4 pt-3 pb-2 bg-white border-b border-gray-100">
        <View className="flex-row items-center bg-gray-50 border rounded-xl px-3 mb-3" style={{ borderColor: '#e8edf5' }}>
          <Search color="#9ca3af" size={16} />
          <TextInput
            className="flex-1 py-3 ml-2 text-sm text-gray-900"
            placeholder="Rechercher un examen…"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
        </View>
        {/* Subject chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {subjects.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSubject(s)}
              className={`px-3 py-1.5 rounded-full ${subject === s ? 'bg-primary-600' : 'bg-gray-100'}`}
            >
              <Text className={`text-xs font-semibold ${subject === s ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Active filters row */}
      {(yearFilter !== 'Tout' || statusFilter !== 'all') && (
        <View className="flex-row items-center gap-2 px-4 py-2 border-b" style={{ backgroundColor: '#f4f6fb', borderBottomColor: '#e8edf5' }}>
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
              <Text className="text-white text-xs font-semibold">{statusFilter === 'done' ? 'Terminés' : 'À faire'}</Text>
              <X color="#fff" size={12} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => { setYearFilter('Tout'); setStatusFilter('all'); }}>
            <Text className="text-primary-600 text-xs font-medium">Effacer tout</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        className="flex-1 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRetryCount((n) => n + 1)} />}
      >
        {filtered.length === 0 ? (
          <EmptyState message="Aucun examen trouvé." />
        ) : (
          <>
            <Text className="text-xs text-gray-400 mb-3">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</Text>
            {filtered.map((exam, i) => {
              const examId = String(exam.exam_id ?? exam.id ?? i);
              return (
                <ExamCard
                  key={examId}
                  exam={exam}
                  attemptInfo={results[examId] ?? null}
                  onPress={() => navigation.navigate('ExamTake', { level, examId })}
                />
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Filter modal */}
      <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <TouchableOpacity
          className="flex-1 bg-black/40"
          activeOpacity={1}
          onPress={() => setShowFilters(false)}
        />
        <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
          <View className="flex-row items-center justify-between mb-5">
            <Text className="text-lg font-bold text-gray-900">Filtres</Text>
            <TouchableOpacity onPress={() => setShowFilters(false)}>
              <X color="#6b7280" size={22} />
            </TouchableOpacity>
          </View>

          {/* Year filter */}
          <Text className="text-sm font-semibold text-gray-700 mb-2">Année</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-5">
            {years.map((y) => (
              <TouchableOpacity
                key={y}
                onPress={() => setYearFilter(y)}
                className={`px-4 py-2 rounded-full ${yearFilter === y ? 'bg-primary-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-semibold ${yearFilter === y ? 'text-white' : 'text-gray-600'}`}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Status filter */}
          <Text className="text-sm font-semibold text-gray-700 mb-2">Statut</Text>
          <View className="flex-row gap-3 mb-6">
            {([['all', 'Tous'], ['todo', 'À faire'], ['done', 'Terminés']] as const).map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setStatusFilter(val)}
                className={`flex-1 py-3 rounded-xl items-center ${statusFilter === val ? 'bg-primary-600' : 'bg-gray-100'}`}
              >
                <Text className={`text-sm font-semibold ${statusFilter === val ? 'text-white' : 'text-gray-600'}`}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setShowFilters(false)}
            className="bg-primary-600 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-bold text-base">Appliquer</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
