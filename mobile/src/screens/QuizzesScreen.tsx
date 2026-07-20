import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Trophy, ChevronRight, BookOpen } from 'lucide-react-native';
import { usePracticeQuizzes } from '../hooks/useData';
import useStore from '../contexts/store';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import { useColors } from '../theme/theme';
import { subjectColor } from '../utils/examUtils';
import { tapLight, success, warn } from '../utils/haptics';

type Translate = (fr: string, ht: string) => string;

type QuizState = 'list' | 'taking' | 'results';

/** Pretty subject name — the part before " — " in a grouped quiz title. */
function subjectNameOf(quiz: any): string {
  const title = String(quiz?.title ?? '');
  const before = title.split(' — ')[0]?.trim();
  return before || String(quiz?.subject ?? 'Divers');
}
/** Chapter/unit name — the part after " — ", or the raw unit. */
function chapterNameOf(quiz: any): string {
  const title = String(quiz?.title ?? '');
  const after = title.split(' — ').slice(1).join(' — ').trim();
  return after || String(quiz?.unit ?? 'Général');
}

function QuizRunner({ quiz, onFinish, t }: { quiz: any; onFinish: (score: number, total: number) => void; t: Translate }) {
  const colors = useColors();
  const questions = useMemo(() => {
    const qs = quiz.questions ?? [];
    return qs.slice(0, 20);
  }, [quiz]);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);

  if (questions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: colors.bg }}>
        <Text className="text-gray-500 dark:text-slate-400 text-base">{t('Ce quiz n\'a pas de questions.', 'Quiz sa a pa gen kesyon.')}</Text>
        <TouchableOpacity onPress={() => onFinish(0, 0)} className="mt-4 bg-primary-600 px-6 py-3 rounded-xl">
          <Text className="text-white font-bold">{t('Retour', 'Tounen')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = questions[idx];
  const options: string[] = q.options ?? q.choices ?? [];
  const letters = ['A', 'B', 'C', 'D'];
  const selected = answers[idx];

  function handleSelect(opt: string) {
    tapLight();
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
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="h-1 bg-gray-200 dark:bg-slate-700">
        <View className="h-1 bg-primary-600" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </View>
      <ScrollView className="flex-1 p-5" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-xs text-gray-400 dark:text-slate-500 font-semibold uppercase mb-3">
          {t('Question', 'Kesyon')} {idx + 1} / {questions.length}
        </Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border, shadowColor: colors.azure, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}>
          <Text className="text-base text-gray-900 dark:text-slate-100 leading-6">{q.question ?? q.stem ?? ''}</Text>
        </View>
        {options.map((opt, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleSelect(opt)}
            className="flex-row items-center p-4 rounded-xl mb-3 gap-3"
            style={{
              borderWidth: 1,
              borderColor: selected === opt ? colors.azure : colors.border,
              backgroundColor: selected === opt ? colors.azureSoft : colors.surface,
            }}
          >
            <View className={`w-8 h-8 rounded-full items-center justify-center ${selected === opt ? 'bg-primary-600' : 'bg-gray-100 dark:bg-slate-700'}`}>
              <Text className={`text-sm font-bold ${selected === opt ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`}>{letters[i]}</Text>
            </View>
            <Text className="flex-1 text-gray-800 dark:text-slate-200 text-sm">{opt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View className="px-5 pb-5 bg-white dark:bg-[#131c2e] border-t border-gray-100 dark:border-slate-700">
        <TouchableOpacity
          onPress={handleNext}
          disabled={!selected}
          className={`flex-row py-4 rounded-2xl items-center justify-center gap-1 ${selected ? 'bg-primary-600' : 'bg-gray-200 dark:bg-slate-700'}`}
        >
          <Text className={`font-bold text-base ${selected ? 'text-white' : 'text-gray-400 dark:text-slate-500'}`}>
            {idx === questions.length - 1 ? t('Terminer', 'Fini') : t('Suivant', 'Swivan')}
          </Text>
          {idx < questions.length - 1 && (
            <ChevronRight color={selected ? '#ffffff' : colors.faint} size={18} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuizResultScreen({ score, total, onRetry, onBack, t }: {
  score: number; total: number; onRetry: () => void; onBack: () => void; t: Translate;
}) {
  const colors = useColors();
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <View className="flex-1 items-center justify-center p-8" style={{ backgroundColor: colors.bg }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
        <Trophy color={colors.azure} size={32} />
      </View>
      <Text className="text-4xl font-bold text-gray-900 dark:text-slate-100 mb-1">{score}/{total}</Text>
      <Text className="text-xl text-primary-600 dark:text-[#4C9AF5] font-semibold mb-6">{pct}% {t('correct', 'kòrèk')}</Text>
      <TouchableOpacity onPress={onRetry} className="w-full bg-primary-600 py-4 rounded-2xl items-center mb-3">
        <Text className="text-white font-bold text-base">{t('Recommencer', 'Rekòmanse')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} className="w-full border border-gray-300 dark:border-slate-700 bg-white dark:bg-[#131c2e] py-4 rounded-2xl items-center">
        <Text className="text-gray-700 dark:text-slate-300 font-semibold text-base">{t('Retour aux quiz', 'Tounen nan quiz yo')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function QuizzesScreen() {
  const { data, isLoading, isError, refetch, isFetching } = usePracticeQuizzes();
  const { language, recordQuizAttempt, setFocusMode } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [state, setState] = useState<QuizState>('list');

  // Hide the floating tab bar while taking a quiz or viewing results so its
  // bottom action button ("Suivant"/"Terminer"/"Recommencer") isn't overlapped.
  useFocusEffect(
    useCallback(() => {
      setFocusMode(state === 'taking' || state === 'results');
      return () => setFocusMode(false);
    }, [state, setFocusMode]),
  );
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [lastResult, setLastResult] = useState<{ score: number; total: number } | null>(null);
  // Browse drill: null = subject picker, else the chosen subject's chapters.
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const quizzes = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data)
      ? data.filter((q: any) => (q.questions?.length ?? 0) > 0)
      : [];
  }, [data]);

  // Group quizzes by subject → one browsable matière per group.
  const subjects = useMemo(() => {
    const map = new Map<string, { name: string; code: string; chapters: any[]; questionCount: number }>();
    for (const q of quizzes) {
      const name = subjectNameOf(q);
      const key = name.toLowerCase();
      let g = map.get(key);
      if (!g) { g = { name, code: q.subject, chapters: [], questionCount: 0 }; map.set(key, g); }
      g.chapters.push(q);
      g.questionCount += q.questions?.length ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [quizzes]);

  const activeSubject = useMemo(
    () => subjects.find((s) => s.name.toLowerCase() === selectedSubject?.toLowerCase()) ?? null,
    [subjects, selectedSubject],
  );

  function startQuiz(quiz: any) {
    setActiveQuiz(quiz);
    setState('taking');
  }

  function handleFinish(score: number, total: number) {
    if (activeQuiz) {
      recordQuizAttempt(activeQuiz.id, { score, total, date: Date.now() });
    }
    // Celebrate a passing score; a gentle nudge otherwise.
    if (total > 0 && score / total >= 0.6) success();
    else if (total > 0) warn();
    setLastResult({ score, total });
    setState('results');
  }

  if (state === 'taking' && activeQuiz) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
          <TouchableOpacity onPress={() => setState('list')} className="p-1 mr-3">
            <ChevronRight color={colors.muted} size={22} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text className="font-bold text-gray-900 dark:text-slate-100 flex-1" numberOfLines={1}>{activeQuiz.title}</Text>
        </View>
        <QuizRunner quiz={activeQuiz} onFinish={handleFinish} t={t} />
      </SafeAreaView>
    );
  }

  if (state === 'results' && lastResult) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <QuizResultScreen
          score={lastResult.score}
          total={lastResult.total}
          onRetry={() => { setState('taking'); }}
          onBack={() => setState('list')}
          t={t}
        />
      </SafeAreaView>
    );
  }

  if (isLoading) return <LoadingState message={t('Chargement des quiz…', 'Ap chaje quiz yo…')} />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.azure,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
    padding: 16,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  };

  // ── Level 2: chapters within the chosen subject ────────────────────────────
  if (activeSubject) {
    const tint = subjectColor(activeSubject.code);
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-row items-center px-4 pt-6 pb-3" style={{ gap: 8 }}>
          <TouchableOpacity onPress={() => setSelectedSubject(null)} hitSlop={8} className="p-1" accessibilityRole="button" accessibilityLabel={t('Retour', 'Tounen')}>
            <ChevronRight color={colors.muted} size={24} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 }}>{activeSubject.name}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
              {activeSubject.chapters.length} {t('chapitres', 'chapit')} · {activeSubject.questionCount} {t('questions', 'kesyon')}
            </Text>
          </View>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
          {activeSubject.chapters.map((quiz: any) => (
            <TouchableOpacity key={quiz.id} onPress={() => startQuiz(quiz)} activeOpacity={0.82} style={cardStyle}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen color={tint} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: colors.ink, fontSize: 14 }} numberOfLines={2}>{chapterNameOf(quiz)}</Text>
                <Text style={{ color: colors.faint, fontSize: 12, marginTop: 2 }}>{quiz.questions?.length ?? 0} {t('questions', 'kesyon')}</Text>
              </View>
              <ChevronRight color={colors.faint} size={18} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Level 1: subject picker ────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View className="px-5 pt-6 pb-3">
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>{t('Banque de questions', 'Bank kesyon')}</Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>{t('Entraîne-toi par matière et chapitre', 'Antrene w pa matyè ak chapit')}</Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {subjects.length === 0 ? (
          <EmptyState
            message={t('Aucun quiz disponible.', 'Pa gen quiz disponib.')}
            ctaLabel={t('Actualiser', 'Aktyalize')}
            onCta={() => refetch()}
          />
        ) : (
          subjects.map((s) => {
            const tint = subjectColor(s.code);
            return (
              <TouchableOpacity key={s.name} onPress={() => setSelectedSubject(s.name)} activeOpacity={0.82} style={cardStyle}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen color={tint} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 15 }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: colors.faint, fontSize: 12, marginTop: 2 }}>
                    {s.chapters.length} {t('chapitres', 'chapit')} · {s.questionCount} {t('questions', 'kesyon')}
                  </Text>
                </View>
                <ChevronRight color={colors.faint} size={18} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
