import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, Trophy, ChevronRight, BookOpen } from 'lucide-react-native';
import { usePracticeQuizzes } from '../hooks/useData';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';

type QuizState = 'list' | 'taking' | 'results';

function QuizRunner({ quiz, onFinish }: { quiz: any; onFinish: (score: number, total: number) => void }) {
  const questions = useMemo(() => {
    const qs = quiz.questions ?? [];
    return qs.slice(0, 20);
  }, [quiz]);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);

  if (questions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-gray-500 text-base">Ce quiz n'a pas de questions.</Text>
        <TouchableOpacity onPress={() => onFinish(0, 0)} className="mt-4 bg-primary-600 px-6 py-3 rounded-xl">
          <Text className="text-white font-bold">Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = questions[idx];
  const options: string[] = q.options ?? q.choices ?? [];
  const letters = ['A', 'B', 'C', 'D'];
  const selected = answers[idx];

  function handleSelect(opt: string) {
    setAnswers((prev) => ({ ...prev, [idx]: opt }));
  }

  function handleNext() {
    if (idx < questions.length - 1) {
      setIdx((i) => i + 1);
    } else {
      // Grade
      let correct = 0;
      questions.forEach((question: any, i: number) => {
        const given = answers[i];
        const answer = question.answer ?? question.correct_answer ?? question.correctAnswer ?? '';
        if (given === answer || given === String(answer)) correct++;
      });
      onFinish(correct, questions.length);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: "#f4f6fb" }}>
      <View className="h-1 bg-gray-200">
        <View className="h-1 bg-primary-600" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </View>
      <ScrollView className="flex-1 p-5" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-xs text-gray-400 font-semibold uppercase mb-3">
          Question {idx + 1} / {questions.length}
        </Text>
        <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e8edf5', shadowColor: '#0857A6', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
          <Text className="text-base text-gray-900 leading-6">{q.question ?? q.stem ?? ''}</Text>
        </View>
        {options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleSelect(opt)}
            className="flex-row items-center p-4 rounded-xl mb-3 gap-3"
            style={{
              borderWidth: 1,
              borderColor: selected === opt ? '#0857A6' : '#e8edf5',
              backgroundColor: selected === opt ? '#eaf2fb' : '#ffffff',
            }}
          >
            <View className={`w-8 h-8 rounded-full items-center justify-center ${selected === opt ? 'bg-primary-600' : 'bg-gray-100'}`}>
              <Text className={`text-sm font-bold ${selected === opt ? 'text-white' : 'text-gray-500'}`}>{letters[i]}</Text>
            </View>
            <Text className="flex-1 text-gray-800 text-sm">{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View className="px-5 pb-5 bg-white border-t border-gray-100">
        <TouchableOpacity
          onPress={handleNext}
          disabled={!selected}
          className={`flex-row py-4 rounded-2xl items-center justify-center gap-1 ${selected ? 'bg-primary-600' : 'bg-gray-200'}`}
        >
          <Text className={`font-bold text-base ${selected ? 'text-white' : 'text-gray-400'}`}>
            {idx === questions.length - 1 ? 'Terminer' : 'Suivant'}
          </Text>
          {idx < questions.length - 1 && (
            <ChevronRight color={selected ? '#ffffff' : '#9ca3af'} size={18} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuizResultScreen({ score, total, onRetry, onBack }: {
  score: number; total: number; onRetry: () => void; onBack: () => void;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <View className="flex-1 items-center justify-center p-8" style={{ backgroundColor: "#f4f6fb" }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#eaf2fb', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Trophy color="#0857A6" size={32} />
      </View>
      <Text className="text-4xl font-bold text-gray-900 mb-1">{score}/{total}</Text>
      <Text className="text-xl text-primary-600 font-semibold mb-6">{pct}% correct</Text>
      <TouchableOpacity onPress={onRetry} className="w-full bg-primary-600 py-4 rounded-2xl items-center mb-3">
        <Text className="text-white font-bold text-base">Recommencer</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} className="w-full border border-gray-300 bg-white py-4 rounded-2xl items-center">
        <Text className="text-gray-700 font-semibold text-base">Retour aux quiz</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function QuizzesScreen() {
  const { data, isLoading, isError, refetch, isFetching } = usePracticeQuizzes();
  const { language, recordQuizAttempt } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [state, setState] = useState<QuizState>('list');
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [lastResult, setLastResult] = useState<{ score: number; total: number } | null>(null);

  const quizzes = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data)
      ? data.filter((q: any) => (q.questions?.length ?? 0) > 0)
      : [];
  }, [data]);

  function startQuiz(quiz: any) {
    setActiveQuiz(quiz);
    setState('taking');
  }

  function handleFinish(score: number, total: number) {
    if (activeQuiz) {
      recordQuizAttempt(activeQuiz.id, { score, total, date: Date.now() });
    }
    setLastResult({ score, total });
    setState('results');
  }

  if (state === 'taking' && activeQuiz) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#f4f6fb" }} edges={['top']}>
        <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
          <TouchableOpacity onPress={() => setState('list')} className="p-1 mr-3">
            <ChevronRight color="#374151" size={22} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text className="font-bold text-gray-900 flex-1" numberOfLines={1}>{activeQuiz.title}</Text>
        </View>
        <QuizRunner quiz={activeQuiz} onFinish={handleFinish} />
      </SafeAreaView>
    );
  }

  if (state === 'results' && lastResult) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#f4f6fb" }} edges={['top', 'bottom']}>
        <QuizResultScreen
          score={lastResult.score}
          total={lastResult.total}
          onRetry={() => { setState('taking'); }}
          onBack={() => setState('list')}
        />
      </SafeAreaView>
    );
  }

  if (isLoading) return <LoadingState message={t('Chargement des quiz…', 'Chajman quiz yo…')} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#f4f6fb" }} edges={['top']}>
      <View className="px-5 pt-6 pb-3">
        <Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 }}>{t('Quiz', 'Quiz yo')}</Text>
        <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{quizzes.length} {t('quiz disponibles', 'quiz disponib')}</Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {quizzes.length === 0 ? (
          <EmptyState message={t('Aucun quiz disponible.', 'Pa gen quiz disponib.')} />
        ) : (
          quizzes.map((quiz: any) => (
            <TouchableOpacity
              key={quiz.id}
              onPress={() => startQuiz(quiz)}
              activeOpacity={0.82}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e8edf5',
                shadowColor: '#0857A6',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 6,
                elevation: 2,
                marginBottom: 12,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#eaf2fb', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen color="#0857A6" size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: '#0f172a', fontSize: 14 }} numberOfLines={2}>{quiz.title}</Text>
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{quiz.questions?.length ?? 0} questions</Text>
              </View>
              <ChevronRight color="#cbd5e1" size={18} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
