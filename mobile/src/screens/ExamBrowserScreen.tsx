import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Search, ClipboardList, ChevronRight, CheckCircle2 } from 'lucide-react-native';
import { fetchFullCatalog } from '../utils/examCatalog';
import { normalizeSubject, normalizeLevel } from '../utils/examUtils';
import { loadAllExamResultSummaries } from '../services/examResults';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamBrowser'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamBrowser'>;

const LEVEL_FILTER_MAP: Record<string, string[]> = {
  terminale: ['Terminale', 'terminale', 'TERMINALE'],
  '9e': ['9ème', '9e', '9eme', 'neuvième', 'neuvieme'],
  university: ['université', 'universite', 'university'],
};

function ExamCard({ exam, done, onPress }: { exam: any; done: boolean; onPress: () => void }) {
  const subject = normalizeSubject(exam.subject ?? exam.matiere ?? '');
  const year = exam.year ?? exam.annee ?? '';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="bg-white rounded-2xl shadow-sm p-4 mb-3 flex-row items-center gap-3"
    >
      <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
        {done ? <CheckCircle2 color="#10b981" size={20} /> : <ClipboardList color="#0857A6" size={20} />}
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-gray-900 text-sm" numberOfLines={2}>
          {exam.title ?? exam.titre ?? 'Examen'}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          {subject ? <Text className="text-xs text-gray-500 bg-blue-50 px-2 py-0.5 rounded-full">{subject}</Text> : null}
          {year ? <Text className="text-xs text-gray-400">{year}</Text> : null}
          {exam.level || exam.niveau ? (
            <Text className="text-xs text-gray-400">{normalizeLevel(exam.level ?? exam.niveau)}</Text>
          ) : null}
        </View>
      </View>
      <ChevronRight color="#9ca3af" size={18} />
    </TouchableOpacity>
  );
}

export default function ExamBrowserScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level } = route.params;
  const { user } = useStore();

  const [exams, setExams] = useState<any[]>([]);
  const [results, setResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('Tout');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchFullCatalog(),
      user?.uid ? loadAllExamResultSummaries(user.uid) : Promise.resolve({}),
    ])
      .then(([catalog, res]) => {
        if (!active) return;
        const filters = LEVEL_FILTER_MAP[level] ?? [];
        const levelExams = catalog.filter((e: any) => {
          const lvl = String(e.level ?? e.niveau ?? '').toLowerCase();
          return filters.some((f) => lvl.includes(f.toLowerCase()));
        });
        setExams(levelExams);
        setResults(res);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [level, user?.uid]);

  const subjects = useMemo(() => {
    const s = new Set<string>();
    exams.forEach((e) => {
      const subj = normalizeSubject(e.subject ?? e.matiere ?? '');
      if (subj) s.add(subj);
    });
    return ['Tout', ...Array.from(s).sort()];
  }, [exams]);

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      if (subject !== 'Tout') {
        const subj = normalizeSubject(e.subject ?? e.matiere ?? '');
        if (subj !== subject) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          (e.title ?? e.titre ?? '').toLowerCase().includes(q) ||
          (e.subject ?? e.matiere ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [exams, subject, search]);

  const levelLabel: Record<string, string> = {
    terminale: 'Terminale (Bac)',
    '9e': '9ème Année',
    university: 'Université',
  };

  if (loading) return <LoadingState message="Chargement des examens…" />;
  if (error) return <ErrorState onRetry={() => setError(false)} />;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-3 p-1">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <Text className="flex-1 font-bold text-gray-900 text-base">{levelLabel[level] ?? level}</Text>
      </View>

      {/* Search */}
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-3 mb-3">
          <Search color="#9ca3af" size={16} />
          <TextInput
            className="flex-1 py-3 ml-2 text-sm text-gray-900"
            placeholder="Rechercher un examen…"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#9ca3af"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {subjects.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSubject(s)}
              className={`mr-2 px-3 py-1.5 rounded-full ${subject === s ? 'bg-primary-600' : 'bg-white border border-gray-200'}`}
            >
              <Text className={`text-xs font-medium ${subject === s ? 'text-white' : 'text-gray-600'}`}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 32 }}>
        {filtered.length === 0 ? (
          <EmptyState message="Aucun examen trouvé." />
        ) : (
          <>
            <Text className="text-sm text-gray-500 mb-3">{filtered.length} examens</Text>
            {filtered.map((exam, i) => {
              const examId = String(exam.id ?? exam.exam_id ?? i);
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
