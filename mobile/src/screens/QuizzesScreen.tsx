import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withSequence, withRepeat, Easing,
} from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, BookOpen, RefreshCw, Check, X } from 'lucide-react-native';
import { CoursesParamList } from '../navigation/CoursesNavigator';
import { usePracticeQuizzes } from '../hooks/useData';
import { logAnswerEvent } from '../services/answerEventsService';
import { useCrowdOrderedQuestions } from '../hooks/useCrowdOrderedQuestions';
import useStore from '../contexts/store';
import { ListSkeleton, ErrorState, EmptyState } from '../components/StateViews';
import { useColors, useTheme, typeScale, radius } from '../theme/theme';
import { subjectColor } from '../utils/examUtils';
import { tapLight, tapMedium, select, success, warn } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import PressableScale from '../components/ui/PressableScale';
import PopIn from '../components/ui/PopIn';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import QuizResultHero, { HeroButton, glass } from '../components/quiz/QuizResultHero';
import DefiHandoffCard from '../components/DefiHandoffCard';

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
 * Split a quiz's subject code ("chem-nsi") into a BASE subject ("Chimie") and a
 * GRADE LEVEL ("NSI"). The base drives the top-level picker; the level is the
 * intermediary step before chapters — so the bank reads Subject → Level →
 * Chapter instead of one flat "Chimie NSI / Chimie NSII / Économie NSI…" wall.
 */
function subjectParts(quiz: any): { baseName: string; baseCode: string; levelLabel: string | null } {
  const fullName = subjectNameOf(quiz);        // e.g. "Chimie nsi"
  const code = String(quiz?.subject ?? '');    // e.g. "chem-nsi"
  const dash = code.indexOf('-');
  const baseCode = (dash >= 0 ? code.slice(0, dash) : code) || fullName.toLowerCase();
  const levelRaw = dash >= 0 ? code.slice(dash + 1) : '';
  const levelLabel = levelRaw ? levelRaw.toUpperCase() : null;
  // Strip the trailing level token from the display name → the base subject.
  const baseName = levelRaw
    ? (fullName.replace(new RegExp(`\\s*${levelRaw}\\s*$`, 'i'), '').trim() || fullName)
    : fullName;
  return { baseName, baseCode, levelLabel };
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

/**
 * Resolve the correct option's TEXT (for the reveal message) using the same
 * letter/index/text resolution as isQuizAnswerCorrect — display only; grading
 * still runs through isQuizAnswerCorrect untouched.
 */
function correctAnswerText(question: any): string {
  const options: string[] = (question.options ?? question.choices ?? []).map(String);
  const raw = String(question.answer ?? question.correct_answer ?? question.correctAnswer ?? '').trim();
  if (!raw) return '';
  const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  let idx = -1;
  if (/^[A-Z]$/i.test(raw)) idx = raw.toUpperCase().charCodeAt(0) - 65;
  else if (/^\d+$/.test(raw)) idx = parseInt(raw, 10) - 1;
  if (idx < 0 || idx >= options.length) idx = options.findIndex((o) => norm(o) === norm(raw));
  return idx >= 0 ? options[idx] : raw;
}

// Animated brand-gradient progress bar — fills smoothly as the runner advances.
function QuizProgressBar({ pct }: { pct: number }) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const w = useSharedValue(pct);
  useEffect(() => {
    w.value = reduceMotion ? pct : withTiming(pct, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [pct, reduceMotion, w]);
  const barStyle = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: colors.border }}>
      <Animated.View style={[barStyle, { height: 6 }]}>
        <LinearGradient colors={[colors.azure, colors.azureDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 999 }} />
      </Animated.View>
    </View>
  );
}

// One answer option — Trivia-grade tonal states: selected = azure, and after
// confirm, green (correct) / red (wrong) with a Check/X icon + spoken state so
// correctness is never conveyed by colour alone. Correct pops, wrong shakes.
function QuizAnswerOption({
  opt, label, isSelected, isCorrectOpt, confirmed, onPress, colors, reduceMotion, t,
}: {
  opt: string;
  label: string;
  isSelected: boolean;
  isCorrectOpt: boolean;
  confirmed: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  reduceMotion: boolean;
  t: Translate;
}) {
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!confirmed || reduceMotion) return;
    if (isCorrectOpt) {
      scale.value = withSequence(
        withTiming(1.04, { duration: 130, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 220, mass: 0.6 }),
      );
    } else if (isSelected) {
      shake.value = withSequence(
        withTiming(-6, { duration: 50, easing: Easing.linear }),
        withRepeat(withTiming(6, { duration: 70, easing: Easing.linear }), 4, true),
        withTiming(0, { duration: 50, easing: Easing.linear }),
      );
    }
  }, [confirmed, isCorrectOpt, isSelected, reduceMotion, scale, shake]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shake.value }],
  }));

  let borderColor = colors.border;
  let bgColor = colors.surface;
  let labelBg = colors.surfaceAlt;
  let labelText = colors.muted;

  if (confirmed) {
    if (isCorrectOpt) { borderColor = colors.success; bgColor = colors.successSoft; labelBg = colors.success; labelText = '#ffffff'; }
    else if (isSelected) { borderColor = colors.danger; bgColor = colors.dangerSoft; labelBg = colors.danger; labelText = '#ffffff'; }
  } else if (isSelected) {
    borderColor = colors.azure; bgColor = colors.azureSoft; labelBg = colors.azure; labelText = '#ffffff';
  }

  // Non-visual cue for VoiceOver so state isn't colour-only.
  const stateWord = confirmed
    ? isCorrectOpt ? t('réponse correcte', 'bon repons') : isSelected ? t('réponse incorrecte', 'move repons') : ''
    : '';

  return (
    <Animated.View style={animStyle}>
      <PressableScale
        onPress={onPress}
        disabled={confirmed}
        haptic={false}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: confirmed }}
        accessibilityLabel={`${label}. ${opt}${stateWord ? `. ${stateWord}` : ''}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          overflow: 'hidden',
          borderWidth: 1.5,
          borderColor,
          backgroundColor: bgColor,
          borderRadius: 15,
          marginBottom: 12,
        }}
      >
        <View className="items-center justify-center m-2" style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: labelBg }}>
          <Text style={{ fontFamily: typeScale.title.fontFamily, fontSize: 14, color: labelText }}>{label}</Text>
        </View>
        <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink, paddingVertical: 10, paddingRight: 12 }]}>{opt}</Text>
        {confirmed && isCorrectOpt && (
          <View className="pr-3"><Check color={colors.success} size={18} /></View>
        )}
        {confirmed && isSelected && !isCorrectOpt && (
          <View className="pr-3"><X color={colors.danger} size={18} /></View>
        )}
      </PressableScale>
    </Animated.View>
  );
}

function QuizRunner({ quiz, onFinish, t }: { quiz: any; onFinish: (score: number, total: number) => void; t: Translate }) {
  const colors = useColors();
  const { shadow } = useTheme();
  const reduceMotion = useReduceMotion();
  const centerColumn = useContentContainerStyle('readable');
  const baseQuestions = useMemo(() => {
    const qs = quiz.questions ?? [];
    return qs.slice(0, 20);
  }, [quiz]);
  // Crowd-difficulty ordering (Adaptive Engine, Slice 3b). Auto-gated + frozen at
  // mount — a pure pass-through until the pipeline has enough data (see hook).
  const canonicalStemOf = useCallback((q: any) => q?.question ?? q?.stem ?? '', []);
  const questions = useCrowdOrderedQuestions(baseQuestions, canonicalStemOf);

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  // Confirm-then-reveal: options grade only after the learner confirms.
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setConfirmed(false); }, [idx]);

  if (questions.length === 0) {
    return (
      <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: colors.bg }}>
        <Text style={[typeScale.body, { color: colors.muted }]}>{t('Ce quiz n\'a pas de questions.', 'Quiz sa a pa gen kesyon.')}</Text>
        <TouchableOpacity onPress={() => onFinish(0, 0)} accessibilityRole="button" accessibilityLabel={t('Retour', 'Tounen')} className="mt-4 px-6 py-3" style={{ backgroundColor: colors.azure, borderRadius: radius.control }}>
          <Text style={[typeScale.title, { color: '#fff' }]}>{t('Retour', 'Tounen')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = questions[idx];
  const options: string[] = q.options ?? q.choices ?? [];
  const letters = ['A', 'B', 'C', 'D'];
  const selected = answers[idx];
  const isLast = idx === questions.length - 1;
  const selectedCorrect = confirmed && isQuizAnswerCorrect(q, selected);
  const pct = ((idx + 1) / questions.length) * 100;

  function handleSelect(opt: string) {
    if (confirmed) return;
    select();
    setAnswers((prev) => ({ ...prev, [idx]: opt }));
  }

  function handleConfirm() {
    if (confirmed || !selected) return;
    tapMedium();
    setConfirmed(true);
    const correct = isQuizAnswerCorrect(q, selected);
    if (correct) success(); else warn();
    // Crowd-difficulty logging (Adaptive Engine, Slice 3b).
    logAnswerEvent(q.question ?? q.stem, correct);
  }

  function handleNext() {
    tapMedium();
    if (!isLast) {
      setIdx((i) => i + 1);
    } else {
      // Grade — unchanged: isQuizAnswerCorrect over the recorded answers.
      let correct = 0;
      questions.forEach((question: any, i: number) => {
        if (isQuizAnswerCorrect(question, answers[i])) correct++;
      });
      onFinish(correct, questions.length);
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header: "Question X / N" + animated gradient progress bar */}
      <View className="px-4 pt-3 pb-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text className="mb-2" style={[typeScale.label, { color: colors.ink }]}>
          {t('Question', 'Kesyon')} {idx + 1} / {questions.length}
        </Text>
        <QuizProgressBar pct={pct} />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={[{ padding: 16, paddingBottom: 24 }, centerColumn]} showsVerticalScrollIndicator={false}>
        {/* Lifted question card — subtle top→bottom surface gradient (Trivia feel) */}
        <View style={{ borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 16, ...shadow.md }}>
          <LinearGradient colors={[colors.surface, colors.surfaceAlt]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ padding: 18 }}>
            <Text style={[typeScale.h2, { color: colors.ink }]}>{q.question ?? q.stem ?? ''}</Text>
          </LinearGradient>
        </View>

        {options.map((opt, i) => (
          <QuizAnswerOption
            key={i}
            opt={opt}
            label={letters[i] ?? String(i + 1)}
            isSelected={opt === selected}
            isCorrectOpt={isQuizAnswerCorrect(q, opt)}
            confirmed={confirmed}
            onPress={() => handleSelect(opt)}
            colors={colors}
            reduceMotion={reduceMotion}
            t={t}
          />
        ))}

        {/* Verdict after confirm — icon + word so it's not colour-only */}
        {confirmed && (
          <PopIn style={{ marginTop: 16, paddingHorizontal: 4 }} from={0.85}>
            <View className="flex-row items-center gap-2 mb-1">
              {selectedCorrect ? <Check color={colors.success} size={18} /> : <X color={colors.danger} size={18} />}
              <Text style={[typeScale.title, { color: selectedCorrect ? colors.success : colors.danger }]}>
                {selectedCorrect ? t('Correct !', 'Kòrèk !') : t('Incorrect', 'Pa kòrèk')}
              </Text>
            </View>
            {!selectedCorrect && (
              <Text className="mt-1" style={[typeScale.body, { color: colors.muted }]}>
                {t('Bonne réponse :', 'Bon repons :')}{' '}
                <Text style={[typeScale.bodyMd, { color: colors.success }]}>{correctAnswerText(q)}</Text>
              </Text>
            )}
          </PopIn>
        )}
      </ScrollView>

      <View className="px-5 pb-5 pt-3" style={{ backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        {!confirmed ? (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!selected}
            accessibilityRole="button"
            accessibilityState={{ disabled: !selected }}
            accessibilityLabel={t('Confirmer', 'Konfime')}
            className="py-4 items-center"
            style={{ backgroundColor: selected ? colors.azure : colors.border, borderRadius: radius.tile }}
          >
            <Text style={[typeScale.title, { color: selected ? '#ffffff' : colors.faint }]}>{t('Confirmer', 'Konfime')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('Terminer', 'Fini') : t('Suivant', 'Swivan')}
            className="flex-row py-4 items-center justify-center gap-1"
            style={{ backgroundColor: colors.azure, borderRadius: radius.tile }}
          >
            <Text style={[typeScale.title, { color: '#ffffff' }]}>
              {isLast ? t('Terminer', 'Fini') : t('Suivant', 'Swivan')}
            </Text>
            {!isLast && <ChevronRight color="#ffffff" size={18} />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function QuizResultScreen({ score, total, onRetry, onBack, t, isCreole }: {
  score: number; total: number; onRetry: () => void; onBack: () => void; t: Translate; isCreole: boolean;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const title = pct >= 80
    ? t('Excellent !', 'Ekselan !')
    : pct >= 60
      ? t('Bon travail !', 'Bon travay !')
      : t('Continue à t’entraîner !', 'Kontinye antrene w !');

  return (
    <QuizResultHero
      score={score}
      total={total}
      isCreole={isCreole}
      title={title}
      showConfetti={pct >= 60}
      footer={
        <>
          <HeroButton
            variant="glass"
            icon={<RefreshCw color="#fff" size={18} />}
            label={t('Recommencer', 'Rekòmanse')}
            onPress={onRetry}
            style={{ marginBottom: 10 }}
          />
          <HeroButton
            variant="ghost"
            label={t('Retour aux quiz', 'Tounen nan quiz yo')}
            onPress={onBack}
          />
        </>
      }
    >
      {/* Glass stat row — score + accuracy */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
        <View style={{ ...glass, flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: typeScale.num.fontFamily, color: '#fff' }}>{score}/{total}</Text>
          <Text style={{ fontSize: 10, fontFamily: typeScale.overline.fontFamily, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>{t('SCORE', 'NÒT')}</Text>
        </View>
        <View style={{ ...glass, flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: typeScale.num.fontFamily, color: '#fff' }}>{pct}%</Text>
          <Text style={{ fontSize: 10, fontFamily: typeScale.overline.fontFamily, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>{t('CORRECT', 'KÒRÈK')}</Text>
        </View>
      </View>

      {/* Handoff into the XP loop — practice quizzes award no XP, so this is
          where a content-only user discovers the Défi (hidden once done). */}
      <View style={{ width: '100%', marginTop: 12 }}>
        <DefiHandoffCard variant="glass" />
      </View>
    </QuizResultHero>
  );
}

export default function QuizzesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<CoursesParamList, 'Quizzes'>>();
  const { data, isLoading, isError, refetch, isFetching } = usePracticeQuizzes();
  const { language, recordQuizAttempt, setFocusMode } = useStore();
  const colors = useColors();
  const { shadow } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
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
  // Browse drill: Subject (baseName) → Level (full code) → Chapters.
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  const quizzes = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data)
      ? data.filter((q: any) => (q.questions?.length ?? 0) > 0)
      : [];
  }, [data]);

  // Nest quizzes: base subject → grade levels → chapters. The base subject is
  // the top-level picker; each base drills into its NSI/NSII/… levels, and each
  // level lists its chapters (the playable quizzes).
  type QuizLevel = { levelLabel: string | null; name: string; code: string; chapters: any[]; questionCount: number };
  type QuizSubject = { baseName: string; baseCode: string; levels: QuizLevel[]; questionCount: number; chapterCount: number };
  const subjectGroups = useMemo<QuizSubject[]>(() => {
    const bases = new Map<string, { baseName: string; baseCode: string; levels: Map<string, QuizLevel> }>();
    for (const q of quizzes) {
      const { baseName, baseCode, levelLabel } = subjectParts(q);
      const bKey = baseName.toLowerCase();
      let base = bases.get(bKey);
      if (!base) { base = { baseName, baseCode, levels: new Map() }; bases.set(bKey, base); }
      const lKey = String(q.subject ?? levelLabel ?? baseName).toLowerCase();
      let lvl = base.levels.get(lKey);
      if (!lvl) { lvl = { levelLabel, name: subjectNameOf(q), code: q.subject, chapters: [], questionCount: 0 }; base.levels.set(lKey, lvl); }
      lvl.chapters.push(q);
      lvl.questionCount += q.questions?.length ?? 0;
    }
    return Array.from(bases.values())
      .map((b) => {
        const levels = Array.from(b.levels.values()).sort((a, c) => a.name.localeCompare(c.name, 'fr'));
        return {
          baseName: b.baseName,
          baseCode: b.baseCode,
          levels,
          questionCount: levels.reduce((s, l) => s + l.questionCount, 0),
          chapterCount: levels.reduce((s, l) => s + l.chapters.length, 0),
        };
      })
      .sort((a, c) => a.baseName.localeCompare(c.baseName, 'fr'));
  }, [quizzes]);

  const activeBase = useMemo(
    () => subjectGroups.find((b) => b.baseName.toLowerCase() === selectedSubject?.toLowerCase()) ?? null,
    [subjectGroups, selectedSubject],
  );
  const activeLevel = useMemo(
    () => activeBase?.levels.find((l) => l.code === selectedLevel) ?? null,
    [activeBase, selectedLevel],
  );

  // Open a base subject → skip the level step when there's only one level.
  const openBase = useCallback((b: QuizSubject) => {
    tapLight();
    setSelectedSubject(b.baseName);
    setSelectedLevel(b.levels.length === 1 ? b.levels[0].code : null);
  }, []);
  // Back out of chapters: to the level picker, or straight to the subject
  // picker when we auto-skipped a single-level subject.
  const backFromChapters = useCallback(() => {
    tapLight();
    if (activeBase && activeBase.levels.length === 1) setSelectedSubject(null);
    setSelectedLevel(null);
  }, [activeBase]);

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
          isCreole={isCreole}
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

  // ── Level 3: chapters within the chosen grade level ────────────────────────
  if (activeLevel) {
    const tint = subjectColor(activeBase?.baseName ?? '');
    const headerTitle = activeBase
      ? `${activeBase.baseName}${activeLevel.levelLabel ? ` · ${activeLevel.levelLabel}` : ''}`
      : activeLevel.name;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-row items-center px-4 pt-6 pb-3" style={{ gap: 8 }}>
          <TouchableOpacity onPress={backFromChapters} hitSlop={8} className="p-1" accessibilityRole="button" accessibilityLabel={t('Retour', 'Tounen')}>
            <ChevronRight color={colors.muted} size={24} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text style={[typeScale.h1, { color: colors.ink }]}>{headerTitle}</Text>
            <Text style={[typeScale.label, { color: colors.muted, marginTop: 2 }]}>
              {activeLevel.chapters.length} {t('chapitres', 'chapit')} · {activeLevel.questionCount} {t('questions', 'kesyon')}
            </Text>
          </View>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}>
          {activeLevel.chapters.map((quiz: any) => (
            <TouchableOpacity
              key={quiz.id}
              onPress={() => startQuiz(quiz)}
              activeOpacity={0.82}
              style={cardStyle}
              accessibilityRole="button"
              accessibilityLabel={`${chapterNameOf(quiz)}, ${quiz.questions?.length ?? 0} ${t('questions', 'kesyon')}`}
            >
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

  // ── Level 2: grade levels within the chosen subject ────────────────────────
  if (activeBase) {
    const tint = subjectColor(activeBase.baseName);
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-row items-center px-4 pt-6 pb-3" style={{ gap: 8 }}>
          <TouchableOpacity onPress={() => { tapLight(); setSelectedSubject(null); setSelectedLevel(null); }} hitSlop={8} className="p-1" accessibilityRole="button" accessibilityLabel={t('Retour', 'Tounen')}>
            <ChevronRight color={colors.muted} size={24} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text style={[typeScale.h1, { color: colors.ink }]}>{activeBase.baseName}</Text>
            <Text style={[typeScale.label, { color: colors.muted, marginTop: 2 }]}>{t('Choisis un niveau', 'Chwazi yon nivo')}</Text>
          </View>
        </View>
        <ScrollView className="flex-1 px-5" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}>
          {activeBase.levels.map((lvl) => (
            <TouchableOpacity
              key={lvl.code}
              onPress={() => { tapLight(); setSelectedLevel(lvl.code); }}
              activeOpacity={0.82}
              style={cardStyle}
              accessibilityRole="button"
              accessibilityLabel={`${lvl.levelLabel ?? lvl.name}, ${lvl.chapters.length} ${t('chapitres', 'chapit')}`}
            >
              <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: typeScale.overline.fontFamily, fontSize: 13, color: tint }}>{lvl.levelLabel ?? '•'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>{lvl.levelLabel ?? lvl.name}</Text>
                <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
                  {lvl.chapters.length} {t('chapitres', 'chapit')} · {lvl.questionCount} {t('questions', 'kesyon')}
                </Text>
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
          nowhere to go back to, so the arrow is hidden.
          Gate on THIS stack's depth, not canGoBack(): canGoBack() also counts
          the parent tab navigator's history, so it stays true even when this
          screen is its stack's only route — the arrow then threw Quiz-primary
          students out to Accueil. */}
      <View className="flex-row items-center px-5 pt-6 pb-3" style={{ gap: 8 }}>
        {(navigation.getState()?.routes?.length ?? 1) > 1 ? (
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
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>{t('Entraîne-toi par matière et niveau', 'Antrene w pa matyè ak nivo')}</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
        contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}
      >
        {subjectGroups.length === 0 ? (
          <EmptyState
            message={t('Aucun quiz disponible.', 'Pa gen quiz disponib.')}
            ctaLabel={t('Actualiser', 'Aktyalize')}
            onCta={() => refetch()}
          />
        ) : (
          subjectGroups.map((b) => {
            const tint = subjectColor(b.baseName);
            const levelSummary = b.levels.length > 1 ? `${b.levels.length} ${t('niveaux', 'nivo')} · ` : '';
            return (
              <TouchableOpacity
                key={b.baseName}
                onPress={() => openBase(b)}
                activeOpacity={0.82}
                style={cardStyle}
                accessibilityRole="button"
                accessibilityLabel={`${b.baseName}, ${b.levels.length} ${t('niveaux', 'nivo')}`}
              >
                <View style={{ width: 44, height: 44, borderRadius: radius.tile, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen color={tint} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[typeScale.titleSm, { color: colors.ink }]} numberOfLines={1}>{b.baseName}</Text>
                  <Text style={[typeScale.caption, { color: colors.muted, marginTop: 2 }]}>
                    {levelSummary}{b.chapterCount} {t('chapitres', 'chapit')} · {b.questionCount} {t('questions', 'kesyon')}
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
