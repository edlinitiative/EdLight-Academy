import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, BackHandler, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronLeft, ChevronRight, Send } from 'lucide-react-native';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions, gradeExam, normalizeSubject, normalizeExamTitle } from '../utils/examUtils';
import { loadExamAttemptDraft, saveExamAttemptDraft, markExamAttemptSubmitted } from '../services/examAttempts';
import { saveExamResult } from '../services/examResults';
import useStore from '../contexts/store';
import { LoadingState, ErrorState } from '../components/StateViews';
import MathText from '../components/MathText';
import FigureRenderer from '../components/FigureRenderer';
import ExamOverview, { ExamSectionSummary } from '../components/ExamOverview';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamTake'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamTake'>;

type Answer = string | string[] | null;

const PRIMARY = '#0857A6';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e8edf5';

const cardShadow = {
  shadowColor: PRIMARY,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
} as const;

function QuestionNav({ current, total, answers, onGoto }: {
  current: number;
  total: number;
  answers: Record<number, Answer>;
  onGoto: (i: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
    >
      {Array.from({ length: total }, (_, i) => {
        const answered = answers[i] != null && answers[i] !== '';
        const active = i === current;
        return (
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
              backgroundColor: active ? PRIMARY : answered ? '#e6f0f9' : '#ffffff',
              borderWidth: active ? 0 : 1,
              borderColor: BORDER,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#ffffff' : answered ? PRIMARY : MUTED }}>
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
    <View style={{ gap: 10 }}>
      {options.map((opt, idx) => {
        const selected = answer === opt || answer === letters[idx] || (Array.isArray(answer) && answer.includes(opt));
        return (
          <TouchableOpacity
            key={idx}
            onPress={() => onAnswer(opt)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: selected ? PRIMARY : BORDER,
                backgroundColor: selected ? '#eef4fb' : '#ffffff',
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
                backgroundColor: selected ? PRIMARY : '#f1f5f9',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? '#ffffff' : MUTED }}>{letters[idx]}</Text>
            </View>
            <MathText text={String(opt)} style={{ flex: 1, fontSize: 15, lineHeight: 22, color: TEXT }} />
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
      style={[
        {
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: BORDER,
          borderRadius: 16,
          padding: 16,
          fontSize: 16,
          lineHeight: 24,
          color: TEXT,
          minHeight: 120,
        },
        cardShadow,
      ]}
      value={String(answer ?? '')}
      onChangeText={onAnswer}
      multiline
      textAlignVertical="top"
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
    />
  );
}

function TrueFalseQuestion({ answer, onAnswer }: { answer: Answer; onAnswer: (a: Answer) => void }) {
  const opts = ['Vrai', 'Faux'];
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {opts.map((opt) => {
        const selected = answer === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onAnswer(opt)}
            style={[
              {
                flex: 1,
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: selected ? PRIMARY : BORDER,
                backgroundColor: selected ? '#eef4fb' : '#ffffff',
              },
              selected ? undefined : cardShadow,
            ]}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: selected ? PRIMARY : MUTED }}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ExamTakeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, recordActivity } = useStore();

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
      .then(async (e) => {
        if (!active) return;
        setExam(e);
        const qs = flattenQuestions(e) as any[];
        setQuestions(qs);
        // Record activity so the dashboard can show "Resume where you left off"
        const subject = e?.subject ? normalizeSubject(e.subject) : undefined;
        const lvl: string | undefined = level ?? undefined;
        recordActivity({
          type: 'exam',
          path: examId,
          title: e?.exam_title ?? e?.title ?? e?.name ?? 'Examen',
          subtitle: subject ?? lvl ?? undefined,
          ts: Date.now(),
        });
        // Load draft (in-progress attempts only)
        if (user?.uid) {
          const draft = await loadExamAttemptDraft(user.uid, examId);
          if (!active) return;
          if (draft?.answers && draft.status !== 'submitted') {
            setAnswers(draft.answers);
            if (Object.keys(draft.answers).length > 0) setHasDraft(true);
            if (Number.isFinite(draft.currentIdx)) draftIdxRef.current = draft.currentIdx;
          }
        }
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
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
      'Quitter l\'examen ?',
      'Votre progression est sauvegardée automatiquement.',
      [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: () => navigation.goBack() },
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

  const sectionSummary: ExamSectionSummary[] = useMemo(() => {
    if (!exam) return [];
    return (exam.sections ?? []).map((sec: any, i: number) => ({
      title: String(sec.section_title || sec.title || sec.name || `Section ${i + 1}`).trim(),
      count: (sec.questions ?? []).length,
    }));
  }, [exam]);

  if (loading) return <LoadingState message="Chargement de l'examen…" />;
  if (error || !exam) return <ErrorState />;
  if (questions.length === 0) return <ErrorState message="Cet examen n'a pas de questions." />;

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
  const q = questions[currentIdx];
  const qType = (q?.type ?? '').toLowerCase();
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === questions.length - 1;
  const progress = Math.round((answeredCount / questions.length) * 100);
  const sectionTitle = String(q?.sectionTitle ?? '').trim();
  const points = Number(q?.points) || 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fb' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: BORDER }}>
        <TouchableOpacity onPress={handleBack} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ArrowLeft color={TEXT} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }} numberOfLines={1}>{normalizeExamTitle(exam)}</Text>
          <Text style={{ fontSize: 12, color: MUTED }}>{answeredCount}/{questions.length} réponses</Text>
        </View>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{ backgroundColor: PRIMARY, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: submitting ? 0.6 : 1 }}
        >
          <Send color="#fff" size={14} />
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 13 }}>{submitting ? '…' : 'Soumettre'}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={{ height: 3, backgroundColor: BORDER }}>
        <View style={{ height: 3, backgroundColor: PRIMARY, width: `${progress}%` }} />
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
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, padding: 16 }}>
          {/* Question label */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Question {currentIdx + 1} / {questions.length}
              </Text>
              {sectionTitle ? (
                <View style={{ backgroundColor: '#e6f0f9', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '60%' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: PRIMARY }} numberOfLines={1}>{sectionTitle}</Text>
                </View>
              ) : null}
              {points > 0 ? (
                <Text style={{ fontSize: 11, color: MUTED }}>{points} pt{points > 1 ? 's' : ''}</Text>
              ) : null}
            </View>
            <View style={[{ backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER }, cardShadow]}>
              <MathText text={q._displayText ?? q.question ?? ''} style={{ fontSize: 16, color: TEXT, lineHeight: 24 }} />
              {q.has_figure && q.figure_description ? (
                <FigureRenderer description={q.figure_description} />
              ) : null}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: BORDER }}>
        <TouchableOpacity
          onPress={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, opacity: isFirst ? 0.4 : 1 }}
        >
          <ChevronLeft color={TEXT} size={18} />
          <Text style={{ color: TEXT, fontWeight: '500', fontSize: 13 }}>Préc.</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {isLast ? (
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, opacity: submitting ? 0.6 : 1 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Terminer</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PRIMARY, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '500', fontSize: 13 }}>Suiv.</Text>
            <ChevronRight color="#fff" size={18} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
