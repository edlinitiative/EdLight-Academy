import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trophy, ChevronRight, BookOpen } from 'lucide-react-native';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { usePracticeQuizzes } from '../hooks/useData';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import { useColors, useTheme, typeScale, radius } from '../theme/theme';
import { subjectColor } from '../utils/examUtils';
import { tapLight, tapMedium, success, warn } from '../utils/haptics';
import Confetti from '../components/ui/Confetti';
import PopIn from '../components/ui/PopIn';
import PressableScale from '../components/ui/PressableScale';

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

/**
 * The quiz bank stores the correct answer as a LETTER ("B" from
 * `correct_answer`), while the runner records the selected option TEXT. Map the
 * stored letter → option index → option text before comparing (same approach as
 * LessonPractice), so both surfaces grade identically. Handles letters,
 * already-text answers, and out-of-range values gracefully.
 */
export function isQuizAnswerCorrect(question: any, given: string | undefined): boolean {
  if (given == null || given === '') return false;
  const options: string[] = (question.options ?? question.choices ?? []).map(String);
  const raw = String(question.answer ?? question.correct_answer ?? question.correctAnswer ?? '').trim();
  if (!raw) return false;

  // Case/whitespace/punctuation-insensitive compare (accents kept significant
  // for FR grading). Previously this was an exact, case-sensitive === compare,
  // so "paris" ≠ "Paris" and "42 " ≠ "42" were false negatives.
  const norm = (s: string) => String(s ?? '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^[\s.,;:!?'"()[\]]+|[\s.,;:!?'"()[\]]+$/g, '');

  // Resolve the correct option index — but only treat `raw` as a letter/number
  // key when it truly is one. The old code read the first char of ANY answer as
  // a letter index, so a text answer like "Cellule" was misread as option C.
  let idx = -1;
  if (/^[A-Z]$/i.test(raw)) idx = raw.toUpperCase().charCodeAt(0) - 65;
  else if (/^\d+$/.test(raw)) idx = parseInt(raw, 10) - 1;
  if (idx < 0 || idx >= options.length) {
    const target = norm(raw);
    idx = options.findIndex((o) => norm(o) === target);
  }

  const correctText = idx >= 0 ? options[idx] : raw;
  return norm(given) === norm(correctText) || norm(given) === norm(raw);
}

function QuizRunner({ quiz, onFinish, t }: { quiz: any; onFinish: (score: number, total: number) => void; t: Translate }) {
  const colors = useColors();
  const { shadow } = useTheme();
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
        <Text style={[typeScale.body, { color: colors.muted }]}>{t('Ce quiz n\'a pas de questions.', 'Quiz sa a pa gen kesyon.')}</Text>
        <TouchableOpacity onPress={() => onFinish(0, 0)} className="mt-4 px-6 py-3" style={{ backgroundColor: colors.azure, borderRadius: radius.control }}>
          <Text style={[typeScale.title, { color: '#fff' }]}>{t('Retour', 'Tounen')}</Text>
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
    tapMedium();
    if (idx < questions.length - 1) {
      setIdx((i) => i + 1);
    } else {
      // Grade
      let correct = 0;
      questions.forEach((question: any, i: number) => {
        if (isQuizAnswerCorrect(question, answers[i])) correct++;
      });
      onFinish(correct, questions.length);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
        <View className="h-1.5 rounded-full" style={{ width: `${((idx + 1) / questions.length) * 100}%`, backgroundColor: colors.azure }} />
      </View>
      <ScrollView className="flex-1 p-5" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="mb-3" style={[typeScale.overline, { color: colors.faint }]}>
          {t('Question', 'Kesyon')} {idx + 1} / {questions.length}
        </Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.tile, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border, ...shadow.sm }}>
          <Text style={[typeScale.title, { color: colors.ink }]}>{q.question ?? q.stem ?? ''}</Text>
        </View>
        {options.map((opt, i) => (
          <PressableScale
            key={i}
            onPress={() => handleSelect(opt)}
            pressedScale={0.98}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              marginBottom: 12,
              gap: 12,
              borderWidth: 1,
              borderRadius: radius.control,
              borderColor: selected === opt ? colors.azure : colors.border,
              backgroundColor: selected === opt ? colors.azureSoft : colors.surface,
            }}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: selected === opt ? colors.azure : colors.surfaceAlt }}>
              <Text style={[typeScale.label, { color: selected === opt ? '#fff' : colors.muted }]}>{letters[i]}</Text>
            </View>
            <Text className="flex-1" style={[typeScale.body, { color: colors.ink }]}>{opt}</Text>
          </PressableScale>
        ))}
      </ScrollView>
      <View className="px-5 pb-5 pt-3" style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TouchableOpacity
          onPress={handleNext}
          disabled={!selected}
          className="flex-row py-4 items-center justify-center gap-1"
          style={{ backgroundColor: selected ? colors.azure : colors.border, borderRadius: radius.tile }}
        >
          <Text style={[typeScale.title, { color: selected ? '#ffffff' : colors.faint }]}>
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
      {pct >= 60 && <Confetti />}
      <PopIn from={0.6}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Trophy color={colors.azure} size={32} />
        </View>
      </PopIn>
      <Text className="mb-1" style={[typeScale.num, { color: colors.ink }]}>{score}/{total}</Text>
      <Text className="mb-6" style={[typeScale.h2, { color: colors.azure }]}>{pct}% {t('correct', 'kòrèk')}</Text>
      <TouchableOpacity onPress={() => { tapMedium(); onRetry(); }} accessibilityRole="button" accessibilityLabel={t('Recommencer', 'Rekòmanse')} className="w-full py-4 items-center mb-3" style={{ backgroundColor: colors.azure, borderRadius: radius.tile }}>
        <Text style={[typeScale.title, { color: '#fff' }]}>{t('Recommencer', 'Rekòmanse')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { tapLight(); onBack(); }} accessibilityRole="button" accessibilityLabel={t('Retour aux quiz', 'Tounen nan quiz yo')} className="w-full py-4 items-center" style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.tile }}>
        <Text style={[typeScale.title, { color: colors.ink }]}>{t('Retour aux quiz', 'Tounen nan quiz yo')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function QuizzesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CoursesParamList, 'Quizzes'>>();
  const { data, isLoading, isError, refetch, isFetching } = usePracticeQuizzes();
  const { language, recordQuizAttempt, setFocusMode } = useStore();
  const colors = useColors();
  const { shadow } = useTheme();
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
          <TouchableOpacity onPress={() => setState('list')} className="p-1 mr-3" hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Retour', 'Tounen')}>
            <ChevronRight color={colors.muted} size={22} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <Text className="flex-1" numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>{activeQuiz.title}</Text>
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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <ListSkeleton rows={6} />
      </SafeAreaView>
    );
  }
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
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
            <Text style={[typeScale.h1, { color: colors.ink }]}>{activeSubject.name}</Text>
            <Text style={[typeScale.label, { color: colors.muted, marginTop: 2 }]}>
              {activeSubject.chapters.length} {t('chapitres', 'chapit')} · {activeSubject.questionCount} {t('questions', 'kesyon')}
            </Text>
          </View>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
          {activeSubject.chapters.map((quiz: any) => (
            <TouchableOpacity key={quiz.id} onPress={() => startQuiz(quiz)} activeOpacity={0.82} style={cardStyle}>
              <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                <BookOpen color={tint} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={2}>{chapterNameOf(quiz)}</Text>
                <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>{quiz.questions?.length ?? 0} {t('questions', 'kesyon')}</Text>
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
      {/* When pushed onto the Courses stack (from a course) it needs a back
          affordance; as a standalone tab root (Quiz-primary grades) there's
          nowhere to go back to, so the arrow is hidden. */}
      <View className="flex-row items-center px-5 pt-6 pb-3" style={{ gap: 8 }}>
        {navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={8}
            className="p-1 -ml-1"
            accessibilityRole="button"
            accessibilityLabel={t('Retour', 'Tounen')}
          >
            <ChevronRight color={colors.muted} size={24} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        ) : null}
        <View className="flex-1">
          <Text style={[typeScale.display, { color: colors.ink }]}>{t('Banque de questions', 'Bank kesyon')}</Text>
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>{t('Entraîne-toi par matière et chapitre', 'Antrene w pa matyè ak chapit')}</Text>
        </View>
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
                <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen color={tint} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
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
