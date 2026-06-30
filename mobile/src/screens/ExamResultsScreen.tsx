import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, XCircle, Trophy, RefreshCw, ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react-native';
import { loadExamResult } from '../services/examResults';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions } from '../utils/examUtils';
import useStore from '../contexts/store';
import { LoadingState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import MathText from '../components/MathText';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamResults'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamResults'>;

function ScoreGauge({ percentage }: { percentage: number }) {
  const color = percentage >= 70 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444';
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

function QuestionReviewItem({ question, index, answer }: { question: any; index: number; answer: any }) {
  const [expanded, setExpanded] = useState(false);
  const correctAnswer = question.correct_answer ?? question.answer ?? question.solution;
  const given = answer?.given ?? answer;
  const isCorrect = given != null && given !== '' && String(given).toLowerCase() === String(correctAnswer ?? '').toLowerCase();
  const isUnanswered = given == null || given === '';

  const borderColor = isUnanswered ? '#d1d5db' : isCorrect ? '#10b981' : '#ef4444';
  const bgColor = isUnanswered ? '#f9fafb' : isCorrect ? '#f0fdf4' : '#fef2f2';

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
      className="rounded-xl mb-2 overflow-hidden"
      style={{ borderWidth: 1.5, borderColor, backgroundColor: bgColor }}
    >
      <View className="flex-row items-center px-4 py-3 gap-3">
        {isUnanswered
          ? <View className="w-5 h-5 rounded-full border-2 border-gray-300" />
          : isCorrect
            ? <CheckCircle2 color="#10b981" size={20} />
            : <XCircle color="#ef4444" size={20} />}
        <Text className="text-xs font-semibold text-gray-500 w-6">Q{index + 1}</Text>
        <Text className="flex-1 text-sm text-gray-800 font-medium" numberOfLines={expanded ? undefined : 2}>
          {question._displayText ?? question.question ?? ''}
        </Text>
        {expanded
          ? <ChevronDown color="#9ca3af" size={16} />
          : <ChevronRightIcon color="#9ca3af" size={16} />}
      </View>
      {expanded && (
        <View className="px-4 pb-3 gap-2">
          <View className="h-px bg-gray-200 mb-1" />
          <View className="flex-row gap-2">
            <Text className="text-xs font-semibold text-gray-400 w-20">Votre réponse</Text>
            <Text className="flex-1 text-xs font-medium" style={{ color: isUnanswered ? '#9ca3af' : isCorrect ? '#10b981' : '#ef4444' }}>
              {isUnanswered ? 'Sans réponse' : String(given)}
            </Text>
          </View>
          {!isCorrect && correctAnswer != null && (
            <View className="flex-row gap-2">
              <Text className="text-xs font-semibold text-gray-400 w-20">Bonne réponse</Text>
              <Text className="flex-1 text-xs font-medium text-emerald-700">{String(correctAnswer)}</Text>
            </View>
          )}
          {question.explanation && (
            <View className="mt-1 p-3 bg-white rounded-lg border border-gray-200">
              <Text className="text-xs text-gray-600 leading-relaxed">{question.explanation}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ExamResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, incrementGuestInteraction } = useStore();

  const [result, setResult] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'correct'>('all');

  useEffect(() => {
    incrementGuestInteraction();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const promises: Promise<any>[] = [
      user?.uid ? loadExamResult(user.uid, examId) : Promise.resolve(null),
      fetchSingleExam(examId),
    ];
    Promise.all(promises)
      .then(([r, exam]) => {
        setResult(r);
        if (exam) setQuestions(flattenQuestions(exam) as any[]);
      })
      .finally(() => setLoading(false));
  }, [user?.uid, examId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState message="Chargement des résultats…" />;

  const summary = result?.summary ?? {};
  const percentage = summary.percentage ?? result?.percentage ?? 0;
  const correct = summary.correct ?? 0;
  const total = summary.total ?? 0;
  const scored = summary.scored ?? 0;
  const maxScore = summary.maxScore ?? 0;
  const answers = result?.answers ?? {};

  const filteredQuestions = questions.filter((q, i) => {
    if (reviewFilter === 'all') return true;
    const given = answers[i]?.given ?? answers[i];
    const correctAnswer = q.correct_answer ?? q.answer ?? q.solution;
    const isCorrect = given != null && given !== '' && String(given).toLowerCase() === String(correctAnswer ?? '').toLowerCase();
    return reviewFilter === 'correct' ? isCorrect : !isCorrect;
  });

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
            { label: 'Score', value: maxScore > 0 ? `${scored}/${maxScore}` : `${Math.round(percentage)}%`, icon: <Trophy color="#f59e0b" size={20} />, color: '#f59e0b' },
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
            <Text className="font-semibold text-gray-900 mb-1">{result.title ?? 'Examen'}</Text>
            {result.subject && <Text className="text-sm text-gray-500">Matière : {result.subject}</Text>}
            {result.level && <Text className="text-sm text-gray-500">Niveau : {result.level}</Text>}
          </View>
        )}

        {/* Question review */}
        {questions.length > 0 && (
          <View className="mx-4 mt-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-gray-900">Revue des questions</Text>
              <Text className="text-xs text-gray-400">{questions.length} questions</Text>
            </View>

            {/* Filter tabs */}
            <View className="flex-row bg-gray-100 rounded-xl p-1 mb-4">
              {([['all', 'Toutes'], ['wrong', 'À revoir'], ['correct', 'Réussies']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setReviewFilter(val)}
                  className={`flex-1 py-2 rounded-lg items-center ${reviewFilter === val ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`text-xs font-semibold ${reviewFilter === val ? 'text-gray-900' : 'text-gray-500'}`}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredQuestions.length === 0 ? (
              <View className="items-center py-6">
                <Text className="text-gray-400 text-sm">Aucune question dans ce filtre.</Text>
              </View>
            ) : (
              filteredQuestions.map((q, i) => {
                const originalIdx = questions.indexOf(q);
                return (
                  <QuestionReviewItem
                    key={originalIdx}
                    question={q}
                    index={originalIdx}
                    answer={answers[originalIdx]}
                  />
                );
              })
            )}
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
