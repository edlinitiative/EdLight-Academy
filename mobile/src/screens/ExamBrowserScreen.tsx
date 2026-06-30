import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Search, ClipboardList, ChevronRight, CheckCircle2 } from 'lucide-react-native';
import { fetchFullCatalog } from '../utils/examCatalog';
import { normalizeSubject, normalizeExamTitle, subjectColor } from '../utils/examUtils';
import { loadAllExamResultSummaries } from '../services/examResults';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamBrowser'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamBrowser'>;

// Catalog level values → display labels
const LEVEL_LABEL: Record<string, string> = {
  terminale: 'Terminale (Bac)',
  '9e': '9ème Année',
  university: 'Université',
};

// Each key maps to the substrings we look for in the catalog `level` field.
const LEVEL_FILTER_MAP: Record<string, string[]> = {
  terminale: ['baccalaureat', 'bac', 'terminale'],
  '9e': ['9eme', '9ème', '9e', 'neuvieme', 'neuvième'],
  university: ['universite', 'université', 'university'],
};

function ExamCard({ exam, done, onPress }: { exam: any; done: boolean; onPress: () => void }) {
  const title = normalizeExamTitle(exam);
  const subject = normalizeSubject(exam.subject ?? '');
  const color = subjectColor(subject);
  const year = exam.year ?? '';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl shadow-sm mb-3 overflow-hidden"
    >
      <View style={{ height: 3, backgroundColor: color }} />
      <View className="p-4 flex-row items-center gap-3">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: color + '18' }}
        >
          {done
            ? <CheckCircle2 color="#10b981" size={20} />
            : <ClipboardList color={color} size={20} />}
        </View>
        <View className="flex-1">
          <Text className="font-semibold text-gray-900 text-sm" numberOfLines={2}>{title}</Text>
          <View className="flex-row items-center gap-2 mt-1 flex-wrap">
            {subject ? (
              <Text
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: color + '18', color }}
              >{subject}</Text>
            ) : null}
            {year ? <Text className="text-xs text-gray-400">{year}</Text> : null}
            {done ? <Text className="text-xs text-emerald-600 font-medium">✓ Fait</Text> : null}
          </View>
        </View>
        <ChevronRight color="#9ca3af" size={18} />
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

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    Promise.all([
      fetchFullCatalog(),
      user?.uid ? loadAllExamResultSummaries(user.uid) : Promise.resolve({} as Record<string, any>),
    ])
      .then(([catalog, res]) => {
        if (!active) return;
        const filters = LEVEL_FILTER_MAP[level] ?? [];
        const levelExams = catalog.filter((e: any) => {
          const lvl = String(e.level ?? e.niveau ?? '').toLowerCase();
          return filters.some((f) => lvl.includes(f));
        });
        // Sort by year descending
        levelExams.sort((a: any, b: any) => {
          const ya = parseInt(String(a.year ?? '0'), 10);
          const yb = parseInt(String(b.year ?? '0'), 10);
          return yb - ya;
        });
        setExams(levelExams);
        setResults(res);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
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

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      if (subject !== 'Tout') {
        const subj = normalizeSubject(e.subject ?? '');
        if (subj !== subject) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const title = normalizeExamTitle(e).toLowerCase();
        return (
          title.includes(q) ||
          (e.subject ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [exams, subject, search]);

  if (loading) return <LoadingState message="Chargement des examens…" />;
  if (error) return <ErrorState onRetry={() => setRetryCount((n) => n + 1)} />;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-base">{LEVEL_LABEL[level] ?? level}</Text>
          {exams.length > 0 && (
            <Text className="text-xs text-gray-400">{exams.length} examens disponibles</Text>
          )}
        </View>
      </View>

      {/* Search + subject chips */}
      <View className="px-4 pt-3 pb-2 bg-white border-b border-gray-100">
        <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3 mb-3">
          <Search color="#9ca3af" size={16} />
          <TextInput
            className="flex-1 py-3 ml-2 text-sm text-gray-900"
            placeholder="Rechercher un examen…"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
        </View>
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
              const done = !!results[examId];
              return (
                <ExamCard
                  key={examId}
                  exam={exam}
                  done={done}
                  onPress={() => navigation.navigate('ExamTake', { level, examId })}
                />
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
