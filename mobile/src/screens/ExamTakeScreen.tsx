import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, BackHandler, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronLeft, ChevronRight, Send } from 'lucide-react-native';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions, gradeExam, normalizeSubject } from '../utils/examUtils';
import { loadExamAttemptDraft, saveExamAttemptDraft, markExamAttemptSubmitted } from '../services/examAttempts';
import { saveExamResult } from '../services/examResults';
import useStore from '../contexts/store';
import { LoadingState, ErrorState } from '../components/StateViews';
import MathText from '../components/MathText';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamTake'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamTake'>;

type Answer = string | string[] | null;

function QuestionNav({ current, total, answers, onGoto }: {
  current: number;
  total: number;
  answers: Record<number, Answer>;
  onGoto: (i: number) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 py-2">
      {Array.from({ length: total }, (_, i) => {
        const answered = answers[i] != null && answers[i] !== '';
        const active = i === current;
        return (
          <TouchableOpacity
            key={i}
            onPress={() => onGoto(i)}
            className={`w-9 h-9 rounded-full items-center justify-center mr-2 ${
              active ? 'bg-primary-600' : answered ? 'bg-emerald-100' : 'bg-gray-100'
            }`}
          >
            <Text className={`text-xs font-bold ${active ? 'text-white' : answered ? 'text-emerald-700' : 'text-gray-500'}`}>
              {i + 1}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function MCQQuestion({ question, answer, onAnswer }: {
  question: any;
  answer: Answer;
  onAnswer: (a: Answer) => void;
}) {
  const options: string[] = question.options ?? question.choices ?? [];
  const letters = ['A', 'B', 'C', 'D', 'E'];

  return (
    <View className="gap-3">
      {options.map((opt, idx) => {
        const selected = answer === opt || answer === letters[idx] || (Array.isArray(answer) && answer.includes(opt));
        return (
          <TouchableOpacity
            key={idx}
            onPress={() => onAnswer(opt)}
            className={`flex-row items-center p-4 rounded-xl border-2 gap-3 ${
              selected ? 'border-primary-600 bg-blue-50' : 'border-gray-200 bg-white'
            }`}
          >
            <View className={`w-8 h-8 rounded-full items-center justify-center ${selected ? 'bg-primary-600' : 'bg-gray-100'}`}>
              <Text className={`text-sm font-bold ${selected ? 'text-white' : 'text-gray-500'}`}>{letters[idx]}</Text>
            </View>
            <MathText text={String(opt)} style={{ flex: 1, fontSize: 14, color: '#374151' }} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function OpenQuestion({ answer, onAnswer, placeholder = 'Votre réponse…' }: {
  answer: Answer;
  onAnswer: (a: Answer) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      className="bg-white border-2 border-gray-200 rounded-xl p-4 text-gray-900 text-base min-h-[100px]"
      value={String(answer ?? '')}
      onChangeText={onAnswer}
      multiline
      textAlignVertical="top"
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
    />
  );
}

function TrueFalseQuestion({ answer, onAnswer }: { answer: Answer; onAnswer: (a: Answer) => void }) {
  const opts = ['Vrai', 'Faux'];
  return (
    <View className="flex-row gap-3">
      {opts.map((opt) => (
        <TouchableOpacity
          key={opt}
          onPress={() => onAnswer(opt)}
          className={`flex-1 py-4 rounded-xl items-center border-2 ${
            answer === opt ? 'border-primary-600 bg-blue-50' : 'border-gray-200 bg-white'
          }`}
        >
          <Text className={`font-bold text-base ${answer === opt ? 'text-primary-600' : 'text-gray-600'}`}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ExamTakeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user } = useStore();

  const [exam, setExam] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    fetchSingleExam(examId)
      .then(async (e) => {
        if (!active) return;
        setExam(e);
        const qs = flattenQuestions(e) as any[];
        setQuestions(qs);
        // Load draft
        if (user?.uid) {
          const draft = await loadExamAttemptDraft(user.uid, examId);
          if (draft?.answers) setAnswers(draft.answers);
        }
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [examId, user?.uid]);

  // Auto-save draft every 10s
  useEffect(() => {
    if (!user?.uid || questions.length === 0) return;
    const save = () => {
      saveExamAttemptDraft(user.uid, examId, { answers, currentIdx }).catch(console.warn);
    };
    draftTimer.current = setTimeout(save, 10000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [answers, currentIdx, user?.uid, examId, questions.length]);

  // Android back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [answers]);

  function handleBack() {
    Alert.alert(
      'Quitter l\'examen ?',
      'Votre progression est sauvegardée automatiquement.',
      [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: () => navigation.goBack() },
      ],
    );
  }

  function setAnswer(idx: number, value: Answer) {
    setAnswers((prev) => ({ ...prev, [idx]: value }));
  }

  async function handleSubmit() {
    const answeredCount = Object.keys(answers).length;
    const unanswered = questions.length - answeredCount;

    if (unanswered > 0) {
      Alert.alert(
        `${unanswered} question${unanswered > 1 ? 's' : ''} sans réponse`,
        'Voulez-vous quand même soumettre ?',
        [
          { text: 'Continuer à répondre', style: 'cancel' },
          { text: 'Soumettre', onPress: doSubmit },
        ],
      );
    } else {
      doSubmit();
    }
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      const gradedAnswers = Object.fromEntries(
        Object.entries(answers).map(([idx, ans]) => [idx, { given: ans }]),
      );
      const graded = gradeExam(questions, gradedAnswers);

      if (user?.uid) {
        await markExamAttemptSubmitted(user.uid, examId, { answers });
        await saveExamResult(user.uid, examId, {
          exam_id: examId,
          level,
          title: exam?.exam_title ?? exam?.title ?? '',
          subject: normalizeSubject(exam?.subject ?? ''),
          summary: graded.summary,
          answers,
        });
      }

      navigation.replace('ExamResults', { level, examId });
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de soumettre. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState message="Chargement de l'examen…" />;
  if (error || !exam) return <ErrorState />;
  if (questions.length === 0) return <ErrorState message="Cet examen n'a pas de questions." />;

  const q = questions[currentIdx];
  const qType = (q?.type ?? '').toLowerCase();
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const progress = Math.round((answeredCount / questions.length) * 100);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100 gap-3">
        <TouchableOpacity onPress={handleBack} className="p-1">
          <ArrowLeft color="#374151" size={22} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="font-bold text-gray-900 text-sm" numberOfLines={1}>{exam?.exam_title ?? exam?.title ?? 'Examen'}</Text>
          <Text className="text-xs text-gray-500">{answeredCount}/{questions.length} réponses</Text>
        </View>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          className="bg-primary-600 px-4 py-2 rounded-xl flex-row items-center gap-1"
        >
          <Send color="#fff" size={14} />
          <Text className="text-white font-semibold text-sm">{submitting ? '…' : 'Soumettre'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View className="h-1 bg-gray-200">
        <View className="h-1 bg-primary-600" style={{ width: `${progress}%` }} />
      </View>

      {/* Question nav */}
      <QuestionNav
        current={currentIdx}
        total={questions.length}
        answers={answers}
        onGoto={setCurrentIdx}
      />

      {/* Question */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32, padding: 16 }}>
          {/* Question label */}
          <View className="mb-4">
            <Text className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">
              Question {currentIdx + 1} / {questions.length}
            </Text>
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <MathText text={q._displayText ?? q.question ?? ''} style={{ fontSize: 15, color: '#111827', lineHeight: 22 }} />
            </View>
          </View>

          {/* Answer area */}
          {['mcq', 'multiple_choice', 'qcm'].includes(qType) ? (
            <MCQQuestion
              question={q}
              answer={answers[currentIdx] ?? null}
              onAnswer={(a) => setAnswer(currentIdx, a)}
            />
          ) : qType === 'true_false' ? (
            <TrueFalseQuestion
              answer={answers[currentIdx] ?? null}
              onAnswer={(a) => setAnswer(currentIdx, a)}
            />
          ) : (
            <OpenQuestion
              answer={answers[currentIdx] ?? null}
              onAnswer={(a) => setAnswer(currentIdx, a)}
              placeholder={qType === 'essay' ? 'Rédigez votre réponse…' : 'Votre réponse…'}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Navigation buttons */}
      <View className="flex-row items-center px-4 py-3 bg-white border-t border-gray-100 gap-3">
        <TouchableOpacity
          onPress={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={`flex-row items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 ${isFirst ? 'opacity-40' : ''}`}
        >
          <ChevronLeft color="#374151" size={18} />
          <Text className="text-gray-700 font-medium text-sm">Préc.</Text>
        </TouchableOpacity>
        <View className="flex-1" />
        {isLast ? (
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            className="flex-row items-center gap-1 bg-primary-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white font-bold text-sm">Terminer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
            className="flex-row items-center gap-1 bg-primary-600 px-4 py-2.5 rounded-xl"
          >
            <Text className="text-white font-medium text-sm">Suiv.</Text>
            <ChevronRight color="#fff" size={18} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
