import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, XCircle, Trophy, RefreshCw, ArrowLeft } from 'lucide-react-native';
import { loadExamResult } from '../services/examResults';
import useStore from '../contexts/store';
import { LoadingState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamResults'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamResults'>;

function ScoreGauge({ percentage }: { percentage: number }) {
  const color =
    percentage >= 70 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444';
  const emoji = percentage >= 70 ? '🏆' : percentage >= 50 ? '👍' : '💪';
  return (
    <View className="items-center py-8">
      <Text className="text-6xl mb-2">{emoji}</Text>
      <Text className="text-5xl font-bold" style={{ color }}>{percentage}%</Text>
      <Text className="text-gray-500 mt-1">
        {percentage >= 70 ? 'Excellent !' : percentage >= 50 ? 'Bien essayé !' : 'Continue à réviser !'}
      </Text>
    </View>
  );
}

export default function ExamResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user } = useStore();

  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    loadExamResult(user.uid, examId)
      .then((r) => setResult(r))
      .finally(() => setLoading(false));
  }, [user?.uid, examId]);

  if (loading) return <LoadingState message="Chargement des résultats…" />;

  const summary = result?.summary ?? {};
  const percentage = summary.percentage ?? result?.percentage ?? 0;
  const correct = summary.correct ?? 0;
  const total = summary.total ?? 0;
  const scored = summary.scored ?? 0;
  const maxScore = summary.maxScore ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => navigation.popToTop()} className="p-1 mr-3">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <Text className="font-bold text-gray-900 text-base">Résultats</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Score */}
        <View className="bg-white mx-4 mt-4 rounded-2xl shadow-sm overflow-hidden">
          <ScoreGauge percentage={Math.round(percentage)} />
          <View className="px-6 pb-6">
            <ProgressBar
              value={Math.round(percentage)}
              color={percentage >= 70 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444'}
              height={8}
              showLabel
            />
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mx-4 mt-4">
          {[
            { label: 'Correctes', value: String(correct), icon: <CheckCircle2 color="#10b981" size={20} />, color: '#10b981' },
            { label: 'Incorrectes', value: String(total - correct), icon: <XCircle color="#ef4444" size={20} />, color: '#ef4444' },
            { label: 'Score', value: `${scored}/${maxScore}`, icon: <Trophy color="#f59e0b" size={20} />, color: '#f59e0b' },
          ].map((stat) => (
            <View key={stat.label} className="flex-1 bg-white rounded-xl p-3 shadow-sm items-center gap-1">
              {stat.icon}
              <Text className="text-lg font-bold text-gray-900">{stat.value}</Text>
              <Text className="text-xs text-gray-500 text-center">{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Exam info */}
        {result && (
          <View className="bg-white mx-4 mt-4 rounded-2xl shadow-sm p-4">
            <Text className="font-semibold text-gray-900 mb-2">{result.title ?? 'Examen'}</Text>
            {result.subject && <Text className="text-sm text-gray-500">Matière : {result.subject}</Text>}
            {result.level && <Text className="text-sm text-gray-500">Niveau : {result.level}</Text>}
          </View>
        )}

        {/* Actions */}
        <View className="px-4 mt-6 gap-3">
          <TouchableOpacity
            onPress={() => navigation.replace('ExamTake', { level, examId })}
            className="flex-row items-center justify-center gap-2 bg-primary-600 py-4 rounded-2xl"
          >
            <RefreshCw color="#fff" size={18} />
            <Text className="text-white font-bold text-base">Recommencer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('ExamBrowser', { level })}
            className="flex-row items-center justify-center gap-2 border border-gray-300 py-4 rounded-2xl bg-white"
          >
            <Text className="text-gray-700 font-semibold text-base">Voir d'autres examens</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
