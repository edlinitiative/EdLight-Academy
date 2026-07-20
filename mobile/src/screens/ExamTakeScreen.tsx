import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, BackHandler, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronLeft, ChevronRight, Send, Lightbulb } from 'lucide-react-native';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions, gradeExam, normalizeSubject, normalizeExamTitle, normalizeYear } from '../utils/examUtils';
import { loadExamAttemptDraft, saveExamAttemptDraft, markExamAttemptSubmitted } from '../services/examAttempts';
import { saveExamResult } from '../services/examResults';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';
import { LoadingState, ErrorState } from '../components/StateViews';
import MathText from '../components/MathText';
import ExamFigure from '../components/ExamFigure';
import ExamAnswerInput, { WordCountAnswer, looksMathy } from '../components/ExamAnswerInput';
import ScaffoldAnswer, { usesScaffold, scaffoldNeedsMath, MATH_SUBJECTS } from '../components/ScaffoldAnswer';
import ConditionBuilder from '../components/ConditionBuilder';
import ExamOverview, { ExamSectionSummary } from '../components/ExamOverview';
import ExamSectionContext from '../components/ExamSectionContext';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamTake'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamTake'>;

type Answer = string | string[] | null;

const PRIMARY = '#1B6FE0';

const cardShadow = {
  shadowColor: PRIMARY,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
} as const;

// Fixed item widths so the auto-scroll offset can be computed without
// measuring: dot 36 + 8 gap, section chip 30 + 8 gap.
const NAV_DOT_W = 44;
const NAV_CHIP_W = 38;

function sectionNumeral(title: string, fallback: number): string {
  const m = /^\s*(?:section\s+)?([IVXLC]+|\d+)\b/i.exec(String(title ?? ''));
  return m ? m[1].toUpperCase() : String(fallback);
}

function QuestionNav({ current, total, answers, sections, onGoto }: {
  current: number;
  total: number;
  answers: Record<number, Answer>;
  sections: { title: string; start: number; end: number }[];
  onGoto: (i: number) => void;
}) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  // Keep the active question centered as the student navigates.
  useEffect(() => {
    const chipsBefore = sections.filter((s) => s.start <= current).length;
    const itemCenter = chipsBefore * NAV_CHIP_W + current * NAV_DOT_W + 16 + 18;
    const x = itemCenter - Dimensions.get('window').width / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [current, sections]);

  const items: React.ReactNode[] = [];
  for (let i = 0; i < total; i++) {
    const sectionIdx = sections.findIndex((s) => s.start === i);
    if (sectionIdx >= 0) {
      const s = sections[sectionIdx];
      const inSection = current >= s.start && current <= s.end;
      items.push(
        <TouchableOpacity
          key={`s${sectionIdx}`}
          onPress={() => onGoto(s.start)}
          hitSlop={{ top: 6, bottom: 6 }}
          style={{
            width: 30,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            backgroundColor: inSection ? colors.azureSoft : colors.bg,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '800', color: inSection ? colors.azure : colors.muted }}>
            {sectionNumeral(s.title, sectionIdx + 1)}
          </Text>
        </TouchableOpacity>,
      );
    }
    const answered = answers[i] != null && answers[i] !== '';
    const active = i === current;
    items.push(
      <TouchableOpacity
        key={i}
        onPress={() => onGoto(i)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 8,
          backgroundColor: active ? colors.azure : answered ? colors.azureSoft : colors.surface,
          borderWidth: active ? 0 : 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#ffffff' : answered ? colors.azure : colors.muted }}>
          {i + 1}
        </Text>
      </TouchableOpacity>,
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
    >
      {items}
    </ScrollView>
  );
}

/**
 * Real exam data ships `options` in several shapes:
 *   - an object keyed by letter: { a: "both", b: "either", … }  (most common)
 *   - an array of strings
 *   - null / missing
 * Normalize everything to [{ key, label, value }] where `value` is what gets
 * stored as the answer (the letter key for object options — matching the
 * grader, which compares against `question.correct` like "c" — and the label
 * text for legacy array options).
 */
function normalizeOptions(raw: any): { key: string; label: string; value: string }[] {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  if (Array.isArray(raw)) {
    return raw
      .filter((opt) => opt != null)
      .map((opt, i) => {
        const label = typeof opt === 'string' ? opt : String(opt?.text ?? opt?.label ?? opt);
        return { key: letters[i] ?? String(i + 1), label, value: label };
      });
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .filter(([, v]) => v != null)
      .map(([k, v]) => {
        const label = typeof v === 'string' ? v : String(v);
        return { key: String(k), label, value: String(k) };
      });
  }
  return [];
}

function MCQQuestion({ question, answer, onAnswer, isCreole }: {
  question: any;
  answer: Answer;
  onAnswer: (a: Answer) => void;
  isCreole: boolean;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const entries = normalizeOptions(question?.options ?? question?.choices);

  // No usable options → let the student type the answer instead of crashing.
  if (entries.length === 0) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>{t('Options non disponibles — écris ta réponse :', 'Opsyon pa disponib — ekri repons ou :')}</Text>
        <OpenQuestion answer={answer} onAnswer={onAnswer} isCreole={isCreole} />
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {entries.map(({ key, label, value }, idx) => {
        const selected =
          answer === value ||
          answer === label ||
          (typeof answer === 'string' && answer.toLowerCase() === key.toLowerCase()) ||
          (Array.isArray(answer) && (answer.includes(value) || answer.includes(label)));
        return (
          <TouchableOpacity
            key={idx}
            onPress={() => onAnswer(value)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: selected ? colors.azure : colors.border,
                backgroundColor: selected ? colors.azureSoft : colors.surface,
              },
              selected ? undefined : cardShadow,
            ]}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.azure : colors.surfaceAlt,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#ffffff' : colors.muted }}>{key.toUpperCase()}</Text>
            </View>
            <MathText text={String(label)} style={{ flex: 1, fontSize: 15, lineHeight: 22, color: colors.ink }} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function OpenQuestion({ answer, onAnswer, placeholder, minHeight = 120, isCreole = false }: {
  answer: Answer;
  onAnswer: (a: Answer) => void;
  placeholder?: string;
  minHeight?: number;
  isCreole?: boolean;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const resolvedPlaceholder = placeholder ?? t('Votre réponse…', 'Repons ou…');
  const value = Array.isArray(answer) ? answer.join(', ') : String(answer ?? '');
  return (
    <TextInput
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          padding: 16,
          fontSize: 16,
          lineHeight: 24,
          color: colors.ink,
          minHeight,
        },
        cardShadow,
      ]}
      value={value}
      onChangeText={onAnswer}
      multiline
      textAlignVertical="top"
      placeholder={resolvedPlaceholder}
      placeholderTextColor={colors.faint}
    />
  );
}

function TrueFalseQuestion({ answer, onAnswer, isCreole }: { answer: Answer; onAnswer: (a: Answer) => void; isCreole: boolean }) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  // `value` is the stored/graded answer (kept in French so grading is unaffected);
  // `label` is display-only.
  const opts = [
    { value: 'Vrai', label: t('Vrai', 'Vre') },
    { value: 'Faux', label: t('Faux', 'Fo') },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {opts.map(({ value, label }) => {
        const selected = answer === value;
        return (
          <TouchableOpacity
            key={value}
            onPress={() => onAnswer(value)}
            style={[
              {
                flex: 1,
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: selected ? colors.azure : colors.border,
                backgroundColor: selected ? colors.azureSoft : colors.surface,
              },
              selected ? undefined : cardShadow,
            ]}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: selected ? colors.azure : colors.muted }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function cleanHint(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Progressive hint reveal. The authored `hints` are the real guidance for a
 * question (the "démarche"), shown on demand so students try first — one hint
 * at a time. Reset per question via a `key` on the caller side.
 */
function ExamHint({ hints, isCreole }: { hints?: any; isCreole: boolean }) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const clean = (Array.isArray(hints) ? hints : []).map(cleanHint).filter(Boolean);
  const [shown, setShown] = useState(0);
  if (clean.length === 0) return null;

  if (shown === 0) {
    return (
      <TouchableOpacity
        onPress={() => setShown(1)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
      >
        <Lightbulb color={colors.azure} size={16} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.azure }}>{t("Besoin d'un indice ?", 'Ou bezwen yon endis?')}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ marginTop: 16, backgroundColor: '#fffdf5', borderRadius: 16, borderWidth: 1, borderColor: '#f1e6c4', padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lightbulb color="#b7791f" size={15} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#b7791f', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {clean.length > 1 ? `${t('Indice', 'Endis')} ${shown} / ${clean.length}` : t('Indice', 'Endis')}
        </Text>
      </View>
      {clean.slice(0, shown).map((h, i) => (
        <MathText key={i} text={clean.length > 1 ? `${i + 1}. ${h}` : h} style={{ fontSize: 14, lineHeight: 21, color: '#0f172a' }} />
      ))}
      {shown < clean.length ? (
        <TouchableOpacity onPress={() => setShown((s) => s + 1)} style={{ alignSelf: 'flex-start', marginTop: 4 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: PRIMARY }}>{t('Indice suivant', 'Endis swivan')} →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function ExamTakeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, recordActivity, setFocusMode, language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Hide the floating tab bar while taking an exam so it never covers the
  // question navigation / submit controls. Restored when leaving the screen.
  useFocusEffect(
    useCallback(() => {
      setFocusMode(true);
      return () => setFocusMode(false);
    }, [setFocusMode]),
  );

  const [exam, setExam] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 'overview' shows the exam intro; 'questions' is the live question flow
  const [phase, setPhase] = useState<'overview' | 'questions'>('overview');
  const [hasDraft, setHasDraft] = useState(false);
  const draftIdxRef = useRef<number | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    let active = true;
    fetchSingleExam(examId)
      .then((e) => {
        if (!active) return;
        setExam(e);
        const qs = flattenQuestions(e) as any[];
        setQuestions(qs);
        // Show the overview NOW — the draft (a Firestore read, slow on cold
        // start) loads in the background and must not hold the spinner.
        setLoading(false);
        // Record activity so the dashboard can show "Resume where you left off".
        // Use subject + session/year (not the raw ministry header) — the year is
        // more useful and matches how the exam browser labels exams.
        const subject = e?.subject ? normalizeSubject(e.subject) : undefined;
        const lvl: string | undefined = level ?? undefined;
        const { session, year } = normalizeYear(e?.year);
        const when = session || (year ? String(year) : '');
        recordActivity({
          type: 'exam',
          path: examId,
          title: subject || normalizeExamTitle(e) || 'Examen',
          subtitle: when || lvl || undefined,
          ts: Date.now(),
        });
        // Load draft (in-progress attempts only)
        if (user?.uid) {
          loadExamAttemptDraft(user.uid, examId)
            .then((draft) => {
              if (!active) return;
              // Only apply while still on the overview: a late-arriving draft
              // must never clobber answers the user has started entering.
              if (phaseRef.current !== 'overview') return;
              if (draft?.answers && draft.status !== 'submitted') {
                setAnswers(draft.answers);
                if (Object.keys(draft.answers).length > 0) setHasDraft(true);
                if (Number.isFinite(draft.currentIdx)) draftIdxRef.current = draft.currentIdx;
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [examId, user?.uid]);

  // Auto-save draft every 10s (only while actually taking the exam)
  useEffect(() => {
    if (!user?.uid || questions.length === 0 || phase !== 'questions') return;
    const save = () => {
      saveExamAttemptDraft(user.uid, examId, { answers, currentIdx }).catch(console.warn);
    };
    draftTimer.current = setTimeout(save, 10000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [answers, currentIdx, user?.uid, examId, questions.length, phase]);

  // Android back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phaseRef.current === 'overview') {
        navigation.goBack();
      } else {
        handleBack();
      }
      return true;
    });
    return () => sub.remove();
  }, [answers]);

  function handleBack() {
    Alert.alert(
      t('Quitter l\'examen ?', 'Kite egzamen an?'),
      t('Votre progression est sauvegardée automatiquement.', 'Pwogrè ou konsève otomatikman.'),
      [
        { text: t('Continuer', 'Kontinye'), style: 'cancel' },
        { text: t('Quitter', 'Kite'), style: 'destructive', onPress: () => navigation.goBack() },
      ],
    );
  }

  function handleStart() {
    const idx = draftIdxRef.current;
    if (hasDraft && idx != null && idx >= 0 && idx < questions.length) {
      setCurrentIdx(idx);
    }
    setPhase('questions');
  }

  function setAnswer(idx: number, value: Answer) {
    setAnswers((prev) => ({ ...prev, [idx]: value }));
  }

  async function handleSubmit() {
    const answeredCount = Object.keys(answers).length;
    const unanswered = questions.length - answeredCount;

    if (unanswered > 0) {
      Alert.alert(
        t(
          `${unanswered} question${unanswered > 1 ? 's' : ''} sans réponse`,
          `${unanswered} kesyon san repons`,
        ),
        t('Voulez-vous quand même soumettre ?', 'Èske ou vle soumèt kanmèm?'),
        [
          { text: t('Continuer à répondre', 'Kontinye reponn'), style: 'cancel' },
          { text: t('Soumettre', 'Soumèt'), onPress: doSubmit },
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
          // Save the cleaned short title, not the raw ministry boilerplate.
          title: normalizeExamTitle(exam),
          subject: normalizeSubject(exam?.subject ?? ''),
          summary: graded.summary,
          answers,
        });
      }

      navigation.replace('ExamResults', { level, examId });
    } catch (e) {
      Alert.alert(t('Erreur', 'Erè'), t('Impossible de soumettre. Réessayez.', 'Nou pa ka soumèt. Eseye ankò.'));
    } finally {
      setSubmitting(false);
    }
  }

  // Normalized subject drives the scaffold / math-input routing (PWA parity).
  const subject = useMemo(() => normalizeSubject(exam?.subject ?? ''), [exam?.subject]);

  const sectionSummary: ExamSectionSummary[] = useMemo(() => {
    if (!exam) return [];
    return (exam.sections ?? []).map((sec: any, i: number) => ({
      title: String(sec?.section_title || sec?.title || sec?.name || `Section ${i + 1}`).trim(),
      count: Array.isArray(sec?.questions) ? sec.questions.length : 0,
    }));
  }, [exam]);

  // Per-section context (title, instructions, passage) mapped onto the flat
  // question index range, so we know which section each question belongs to
  // and whether it is the section's first question.
  const sectionMeta = useMemo(() => {
    const metas: { title: string; instructions: string; passage: string; start: number; end: number }[] = [];
    let cursor = 0;
    const sections: any[] = Array.isArray(exam?.sections) ? exam.sections : [];
    sections.forEach((sec: any, i: number) => {
      const count = Array.isArray(sec?.questions) ? sec.questions.length : 0;
      if (count === 0) return;
      metas.push({
        title: String(sec?.section_title || sec?.title || sec?.name || `Section ${i + 1}`).trim(),
        instructions: typeof sec?.instructions === 'string' ? sec.instructions.trim() : '',
        passage: typeof sec?.passage === 'string' ? sec.passage.trim() : '',
        start: cursor,
        end: cursor + count - 1,
      });
      cursor += count;
    });
    return metas;
  }, [exam]);

  if (loading) return <LoadingState message={t("Chargement de l'examen…", 'Egzamen an ap chaje…')} />;
  if (error || !exam) return <ErrorState />;
  if (questions.length === 0) return <ErrorState message={t("Cet examen n'a pas de questions.", 'Egzamen sa a pa gen kesyon.')} />;

  const answeredCount = Object.keys(answers).length;

  // ── Overview / intro step (before the first question) ──────────────────────
  if (phase === 'overview') {
    return (
      <ExamOverview
        exam={exam}
        sections={sectionSummary}
        questionCount={questions.length}
        hasProgress={hasDraft}
        answeredCount={answeredCount}
        onStart={handleStart}
        onBack={() => navigation.goBack()}
      />
    );
  }

  // ── Question flow ───────────────────────────────────────────────────────────
  // Clamp the index so a stale draft index (or any out-of-range value) can
  // never make `q` undefined.
  const safeIdx = Math.min(Math.max(currentIdx, 0), questions.length - 1);
  const q = questions[safeIdx] ?? {};
  const qType = String(q?.type ?? '').toLowerCase();
  const isFirst = safeIdx === 0;
  const isLast = safeIdx === questions.length - 1;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const points = Number(q?.points) || 0;
  const questionText = String(q?._displayText ?? q?.question ?? '');
  const rawAnswer = answers[safeIdx];
  const answerText = Array.isArray(rawAnswer) ? rawAnswer.join(', ') : String(rawAnswer ?? '');

  // Section context for the current question. Prefer the exam-level metadata
  // (which knows about `passage`); fall back to what flattenQuestions attached.
  const section = sectionMeta.find((s) => safeIdx >= s.start && safeIdx <= s.end) ?? null;
  const sectionTitle = section?.title ?? String(q?.sectionTitle ?? '').trim();
  const sectionInstructions = section?.instructions ?? String(q?.sectionInstructions ?? '').trim();
  const sectionPassage = section?.passage ?? '';
  const isSectionStart = section ? safeIdx === section.start : safeIdx === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={handleBack} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft color={colors.ink} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{normalizeExamTitle(exam)}</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>{answeredCount}/{questions.length} {t('réponses', 'repons')}</Text>
        </View>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{ backgroundColor: colors.azure, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: submitting ? 0.6 : 1 }}
        >
          <Send color="#fff" size={14} />
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>{submitting ? '…' : t('Soumettre', 'Soumèt')}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={{ height: 3, backgroundColor: colors.border }}>
        <View style={{ height: 3, backgroundColor: colors.azure, width: `${progress}%` }} />
      </View>

      {/* Question nav */}
      <QuestionNav
        current={safeIdx}
        total={questions.length}
        answers={answers}
        sections={sectionMeta}
        onGoto={setCurrentIdx}
      />

      {/* Question */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, padding: 16 }}>
          {/* Section context — full intro on the section's first question,
              compact chip + "Consignes" toggle on the following ones. Keyed by
              question index so the toggle resets when navigating. */}
          <ExamSectionContext
            key={safeIdx}
            title={sectionTitle}
            instructions={sectionInstructions}
            passage={sectionPassage}
            isSectionStart={isSectionStart}
          />

          {/* Question label */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {t('Question', 'Kesyon')} {safeIdx + 1} / {questions.length}
              </Text>
              {points > 0 ? (
                <Text style={{ fontSize: 11, color: colors.muted }}>{points} pt{points > 1 ? 's' : ''}</Text>
              ) : null}
            </View>
            <View style={[{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border }, cardShadow]}>
              <MathText text={questionText} style={{ fontSize: 16, color: colors.ink, lineHeight: 24 }} />
              {q?.has_figure && q?.figure_description ? (
                <ExamFigure description={String(q.figure_description)} />
              ) : null}
            </View>
          </View>

          {/* Answer area */}
          {Array.isArray(q?.conditions) && q.conditions.length > 0 ? (
            // Guided condition builder (domain / sign / inequality) — pre-filled
            // left expr + operator picker + value; graded by gradeConditionsAnswer.
            <ConditionBuilder
              question={q}
              value={typeof answers[safeIdx] === 'string' ? (answers[safeIdx] as string) : ''}
              onChange={(v) => setAnswer(safeIdx, v)}
            />
          ) : ['mcq', 'multiple_choice', 'qcm'].includes(qType) ? (
            <MCQQuestion
              question={q}
              answer={answers[safeIdx] ?? null}
              onAnswer={(a) => setAnswer(safeIdx, a)}
              isCreole={isCreole}
            />
          ) : qType === 'true_false' ? (
            <TrueFalseQuestion
              answer={answers[safeIdx] ?? null}
              onAnswer={(a) => setAnswer(safeIdx, a)}
              isCreole={isCreole}
            />
          ) : usesScaffold(q, subject) ? (
            // Step-by-step scaffold (PWA parity): authored solution text with
            // numbered blanks; persists {scaffold:[…]} through the same
            // answers/autosave/submit flow.
            <ScaffoldAnswer
              question={q}
              value={typeof answers[safeIdx] === 'string' ? (answers[safeIdx] as string) : ''}
              onChange={(v) => setAnswer(safeIdx, v)}
              mathMode={scaffoldNeedsMath(q, subject)}
            />
          ) : qType === 'essay' || qType === 'short_answer' ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>{t('Rédige ta réponse', 'Ekri repons ou an')}</Text>
              <WordCountAnswer
                value={answerText}
                onChangeText={(v) => setAnswer(safeIdx, v)}
                type={qType === 'short_answer' ? 'short_answer' : 'essay'}
              />
            </View>
          ) : (
            <ExamAnswerInput
              value={answerText}
              onChangeText={(v) => setAnswer(safeIdx, v)}
              placeholder={
                qType === 'fill_blank'
                  ? t('Complétez le blanc…', 'Ranpli espas vid la…')
                  : qType === 'calculation'
                    ? t('Entrez votre résultat…', 'Antre rezilta ou…')
                    : t('Votre réponse…', 'Repons ou…')
              }
              mathy={
                MATH_SUBJECTS.has(subject) &&
                looksMathy(typeof q?.correct === 'string' ? q.correct : undefined, questionText)
              }
            />
          )}

          {/* Progressive hints (the authored "démarche" as on-demand help).
              Keyed distinctly from ExamSectionContext (same parent) + per
              question so the reveal state resets when navigating. */}
          <ExamHint key={`hint-${safeIdx}`} hints={q?.hints} isCreole={isCreole} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Navigation buttons */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TouchableOpacity
          onPress={() => setCurrentIdx(Math.max(0, safeIdx - 1))}
          disabled={isFirst}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, opacity: isFirst ? 0.4 : 1 }}
        >
          <ChevronLeft color={colors.ink} size={18} />
          <Text style={{ color: colors.ink, fontWeight: '500', fontSize: 13 }}>{t('Préc.', 'Anvan')}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {isLast ? (
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.azure, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, opacity: submitting ? 0.6 : 1 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>{t('Terminer', 'Fini')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setCurrentIdx(Math.min(questions.length - 1, safeIdx + 1))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.azure, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '500', fontSize: 13 }}>{t('Suiv.', 'Pwochen')}</Text>
            <ChevronRight color="#fff" size={18} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
