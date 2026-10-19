import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, BackHandler, KeyboardAvoidingView, Platform, Dimensions, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Lightbulb, Check, Clock, LayoutGrid } from 'lucide-react-native';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions, normalizeLevel, normalizeSubject, normalizeExamTitle, normalizeYear, stripExamHallBoilerplate, subjectFromText, parseConsignes } from '../utils/examUtils';
import { gradeExamPendingEssays } from '../../../shared/essayRegrade';
import { startEssayGrading } from '../services/essayGrading';
import { loadExamAttemptDraft, saveExamAttemptDraft, commitExamSubmission } from '../services/examAttempts';
import { recordPlanEvent } from '../services/planEvents';
import { examDraftKey, readLocalExamDraft, pickResumeDraft, draftPosition, settleWithin } from '../../../shared/examDraft';
import { examSubmitOpId } from '../../../shared/offlineExamSync';
import { outbox, queueExamSubmission } from '../services/writeOutbox';
import { hasPackedExam } from '../services/offlinePacks';
import { recordReview } from '../services/reviewService';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../theme/theme';
import { useReduceMotion } from '../utils/motion';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import Button from '../components/ui/Button';
import { select, tapMedium } from '../utils/haptics';
import { mathToText } from '../utils/mathText';
import { normalizeOptions } from '../utils/examOptions';
import { LoadingState, ErrorState } from '../components/StateViews';
import MathText from '../components/MathText';
import ExamFigure from '../components/ExamFigure';
import ExamAnswerInput, { WordCountAnswer, looksMathy } from '../components/ExamAnswerInput';
import ScaffoldAnswer, { usesScaffold, scaffoldNeedsMath, MATH_SUBJECTS } from '../components/ScaffoldAnswer';
import FillBlankAnswer, { InlineFillBlank, countBlanks, numberBlanks } from '../components/FillBlankAnswer';
import ConditionBuilder from '../components/ConditionBuilder';
import QuestionView from '../components/question/QuestionView';
import ExamOverview, { ExamSectionSummary } from '../components/ExamOverview';
import ExamSectionContext from '../components/ExamSectionContext';
import ExamQuestionGrid from '../components/ExamQuestionGrid';
import { MultiSelectAnswer, MatchingAnswer, hasStructuredMatching } from '../components/ExamChoiceInputs';
import { isAnswerFilled } from '../utils/answerFilled';
import { ExamsParamList } from '../navigation/ExamsNavigator';
import { compileQuestion, isSerializable, responseToStored, storedToResponse } from '../utils/question';

type Route = RouteProp<ExamsParamList, 'ExamTake'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamTake'>;

type Answer = string | string[] | null;

/**
 * Live progress strip under the header — rounded track + fill, width animated
 * with reanimated withTiming so it glides instead of jumping between questions.
 */
function ProgressStrip({ progress }: { progress: number }) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const w = useSharedValue(progress);
  useEffect(() => {
    w.value = reduce ? progress : withTiming(progress, { duration: 320 });
  }, [progress, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const fillStyle = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.surfaceAlt, marginHorizontal: 20, marginTop: 4, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 999, backgroundColor: colors.azureFill }, fillStyle]} />
    </View>
  );
}

// Fixed item widths so the auto-scroll offset can be computed without
// measuring: dot 36 + 8 gap, section chip 30 + 8 gap.
const NAV_DOT_W = 44;
/** A section divider: 1pt rule + its 8pt gap. */
const NAV_SEP_W = 9;

function QuestionNav({ current, total, answers, sections, onGoto }: {
  current: number;
  total: number;
  answers: Record<number, Answer>;
  sections: { title: string; start: number; end: number }[];
  onGoto: (i: number) => void;
}) {
  const colors = useColors();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const scrollRef = useRef<ScrollView>(null);

  // Keep the active question centered as the student navigates.
  useEffect(() => {
    // Dividers render for every section EXCEPT the first, so they only shift
    // the centring for boundaries the rail has actually passed.
    const sepsBefore = sections.filter((sec, idx) => idx > 0 && sec.start <= current).length;
    const itemCenter = sepsBefore * NAV_SEP_W + current * NAV_DOT_W + 16 + 18;
    const x = itemCenter - Dimensions.get('window').width / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [current, sections]);

  const items: React.ReactNode[] = [];
  for (let i = 0; i < total; i++) {
    const sectionIdx = sections.findIndex((s) => s.start === i);
    // A section boundary is a DIVIDER, not a token. It used to render the
    // section's numeral in a chip the same size and colour family as a question
    // pill, so a sectioned paper's rail read "1 1 2 2 3 4 5 6 3" — the numbers
    // looked duplicated and meant nothing to the student. The section's identity
    // is already announced above the question by ExamSectionContext ("NOUVELLE
    // SECTION / PARTIE A"); all the rail has to carry is the grouping.
    if (sectionIdx > 0) {
      items.push(
        <View
          key={`sep${sectionIdx}`}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            width: 1,
            height: 18,
            marginRight: 8,
            alignSelf: 'center',
          }}
        />,
      );
    }
    const answered = isAnswerFilled(answers[i]);
    const active = i === current;
    items.push(
      <PressableScale
        key={i}
        onPress={() => onGoto(i)}
        pressedScale={0.97}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${t('Question', 'Kesyon')} ${i + 1}, ${active ? t('active', 'aktif') : answered ? t('répondue', 'reponn') : t('sans réponse', 'san repons')}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 8,
          backgroundColor: active ? colors.azureFill : answered ? colors.azureSoft : colors.surfaceAlt,
        }}
      >
        {answered && !active ? (
          <Check color={colors.azureInk} size={16} strokeWidth={3} />
        ) : (
          <Text style={[typeScale.caption, { color: active ? '#ffffff' : colors.ink, fontFamily: fonts.headingBold }]}>
            {i + 1}
          </Text>
        )}
      </PressableScale>,
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
    >
      {items}
    </ScrollView>
  );
}


/**
 * A section's instructions minus the exam-hall rules, the web's way
 * (parseConsignes line by line). Whole-field stripping threw away the task in
 * "1. calculatrice interdite… 2. téléphone… Recopier et compléter judicieusement
 * les phrases suivantes :", so the student never saw what to do.
 */
function sectionTask(raw: string): string {
  if (!raw) return '';
  const { rules, cleanedText } = parseConsignes(raw) as { rules: string[]; cleanedText: string };
  return rules.length ? String(cleanedText ?? '').trim() : stripExamHallBoilerplate(raw);
}

/** h:mm:ss / m:ss, as the web's exam timer prints it. */
export function formatTime(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** 14:05 — the wall-clock time of the last save. */
function clock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function MCQQuestion({ question, answer, onAnswer, isCreole }: {
  question: any;
  answer: Answer;
  onAnswer: (a: Answer) => void;
  isCreole: boolean;
}) {
  const colors = useColors();
  const { elevation, isDark } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const entries = normalizeOptions(question?.options ?? question?.choices);

  // No usable options → let the student type the answer instead of crashing.
  if (entries.length === 0) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={[typeScale.caption, { color: colors.muted }]}>{t('Options non disponibles. Écris ta réponse :', 'Opsyon pa disponib. Ekri repons ou :')}</Text>
        <OpenQuestion answer={answer} onAnswer={onAnswer} isCreole={isCreole} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {entries.map(({ key, label, value }, idx) => {
        const selected =
          answer === value ||
          answer === label ||
          (typeof answer === 'string' && answer.toLowerCase() === key.toLowerCase()) ||
          (Array.isArray(answer) && (answer.includes(value) || answer.includes(label)));
        return (
          <PressableScale
            key={idx}
            onPress={() => { select(); onAnswer(value); }}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: false }}
            accessibilityLabel={`${key.toUpperCase()}. ${label}`}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 14,
                paddingHorizontal: 14,
                minHeight: 64,
                borderRadius: 16,
                backgroundColor: selected ? colors.azureSoft : colors.surface,
              },
              selected || isDark ? undefined : elevation.card,
            ]}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.azureFill : colors.surfaceAlt,
              }}
            >
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 20, color: selected ? '#ffffff' : colors.muted }}>{key.toUpperCase()}</Text>
            </View>
            <MathText text={String(label)} style={{ flex: 1, fontSize: 17, lineHeight: 24, color: colors.ink }} />
          </PressableScale>
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
  const { radius, isDark } = useTheme();
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
          borderRadius: radius.card,
          padding: 16,
          fontSize: 16,
          lineHeight: 24,
          color: colors.ink,
          minHeight,
        },
      ]}
      keyboardAppearance={isDark ? 'dark' : 'light'}
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
  const { elevation, isDark } = useTheme();
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
          <PressableScale
            key={value}
            onPress={() => { select(); onAnswer(value); }}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: false }}
            accessibilityLabel={label}
            style={[
              {
                flex: 1,
                minHeight: 64,
                justifyContent: 'center',
                borderRadius: 16,
                alignItems: 'center',
                backgroundColor: selected ? colors.azureSoft : colors.surface,
              },
              selected || isDark ? undefined : elevation.card,
            ]}
          >
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: selected ? colors.azureInk : colors.ink }}>{label}</Text>
          </PressableScale>
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
  const { isDark } = useTheme();
  const hintInk = isDark ? colors.warn : '#9A5B00';
  if (clean.length === 0) return null;

  if (shown === 0) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onPress={() => setShown(1)}
        label={t("Besoin d'un indice ?", 'Ou bezwen yon endis?')}
        icon={<Lightbulb color={colors.azureInk} size={17} />}
        style={{ marginTop: 18, alignSelf: 'flex-start', minHeight: 44 }}
      />
    );
  }

  return (
    <View style={{ marginTop: 18, backgroundColor: colors.warnSoft, borderRadius: 16, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lightbulb color={hintInk} size={16} />
        <Text style={[typeScale.label, { color: hintInk, fontFamily: fonts.bold }]}>
          {clean.length > 1 ? `${t('Indice', 'Endis')} ${shown} / ${clean.length}` : t('Indice', 'Endis')}
        </Text>
      </View>
      {clean.slice(0, shown).map((h, i) => (
        <MathText key={i} text={clean.length > 1 ? `${i + 1}. ${h}` : h} style={{ fontSize: 16, lineHeight: 23, color: colors.ink }} />
      ))}
      {shown < clean.length ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => setShown((s) => s + 1)} style={{ alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.azureInk }}>{t('Indice suivant', 'Endis swivan')} →</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function ExamTakeScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, recordActivity, clearActivity, setFocusMode, language, track } = useStore();
  const colors = useColors();
  const { cardSurface, isDark } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [exam, setExam] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Bumped by the error-state retry button to re-run the fetch effect.
  const [retryCount, setRetryCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // 'overview' shows the exam intro; 'questions' is the live question flow.
  // Coming from ExamOverviewScreen (or a resume card) sets `autostart` — that
  // intro was already shown as a real page, so we drop straight in.
  const [phase, setPhase] = useState<'overview' | 'questions'>(
    route.params?.autostart ? 'questions' : 'overview',
  );
  const [hasDraft, setHasDraft] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  // The countdown, as on the web (ExamTake `secondsLeft`): it starts at the
  // paper's duration, travels with the draft so a resume (on either device)
  // continues it, and submits the paper at 0:00. Null = untimed paper.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const secondsLeftRef = useRef<number | null>(null);
  secondsLeftRef.current = secondsLeft;
  // Last autosave outcome, shown under the title like the web's save chip.
  const [saveState, setSaveState] = useState<{ kind: 'saved'; at: number } | { kind: 'failed' } | null>(null);
  const draftIdxRef = useRef<number | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Latest answers / position, so the unmount flush saves what's on screen.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const currentIdxRef = useRef(currentIdx);
  currentIdxRef.current = currentIdx;
  // Persisted with the draft so resume surfaces can show "4/10" without
  // refetching the whole paper.
  const questionCountRef = useRef(0);
  questionCountRef.current = questions.length;
  // Set once the exam is submitted so a late autosave can't revert the doc
  // back to `in_progress`.
  const submittedRef = useRef(false);
  // True when this paper opened from a downloaded revision pack (telemetry).
  const fromPackRef = useRef(false);

  // Only a real, playable exam is worth a full-screen takeover.
  const examReady = !loading && !error && !!exam && questions.length > 0;

  // Hide the floating tab bar while taking an exam so it never covers the
  // question navigation / submit controls. Restored when leaving the screen.
  // Gated on `examReady`: entering focus mode unconditionally turned a failed
  // or empty exam into a hard dead end — no tab bar, no back button, nothing
  // but an error message. While the exam can't be taken, the tabs stay up.
  useFocusEffect(
    useCallback(() => {
      if (!examReady) return;
      setFocusMode(true);
      return () => setFocusMode(false);
    }, [setFocusMode, examReady]),
  );

  const localDraftKey = examDraftKey(examId);

  // Save the current draft immediately (used by the 10s timer, the final flush
  // on unmount/blur, and the AppState background handler). No-op after submit or
  // before the question phase. Writes a synchronous-ish AsyncStorage mirror in
  // addition to Firestore: when the OS backgrounds then KILLS the app, the
  // debounced/unmount Firestore write may never complete, but the local mirror
  // persists and is preferred on next load when newer.
  const flushDraft = useCallback(() => {
    if (!user?.uid || submittedRef.current || phaseRef.current !== 'questions') return;
    const payload = {
      // Owner of this mirror: on a shared phone it is only ever restored into
      // this account, never into the next student's (P0 validation).
      uid: user.uid,
      answers: answersRef.current,
      currentIdx: currentIdxRef.current,
      // Stored so a resume surface can say "4/10" without refetching the paper
      // (the Home "Examen en cours" card reads this).
      questionCount: questionCountRef.current,
      ...(secondsLeftRef.current != null ? { secondsLeft: secondsLeftRef.current } : {}),
      status: 'in_progress',
      updated_at_ms: Date.now(),
    };
    AsyncStorage.setItem(localDraftKey, JSON.stringify(payload)).catch(() => {});
    saveExamAttemptDraft(user.uid, examId, {
      answers: answersRef.current,
      currentIdx: currentIdxRef.current,
      // Same index under the web's field name (cross-device resume position).
      currentQ: currentIdxRef.current,
      questionCount: questionCountRef.current,
      // Same field name as the web, so the clock resumes on either device.
      ...(secondsLeftRef.current != null ? { secondsLeft: secondsLeftRef.current } : {}),
      // The web's immediate-mode grades belong to the answers it graded; the
      // answers just changed here, so they must not be reused at submit.
      questionResults: {},
    })
      .then(() => setSaveState({ kind: 'saved', at: Date.now() }))
      .catch(() => setSaveState({ kind: 'failed' }));
  }, [user?.uid, examId, localDraftKey]);

  // Flush when the app is backgrounded/inactivated (iOS/Android): unmount only
  // fires on in-app navigation, NOT when the user swipes the app away or the OS
  // suspends it — the most common way an in-progress exam was lost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') flushDraft();
    });
    return () => sub.remove();
  }, [flushDraft]);

  useEffect(() => {
    let active = true;
    fetchSingleExam(examId)
      .then((e) => {
        if (!active) return;
        setExam(e);
        hasPackedExam(examId).then((v) => { fromPackRef.current = v; }, () => {});
        const qs = flattenQuestions(e) as any[];
        setQuestions(qs);
        const durationMin = Number(e?.duration_minutes) || 0;
        setSecondsLeft(durationMin > 0 ? durationMin * 60 : null);
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
          level: lvl,
          title: subject || normalizeExamTitle(e) || 'Examen',
          subtitle: when || lvl || undefined,
          ts: Date.now(),
        });
        // Load draft (in-progress attempts only)
        if (user?.uid) {
          (async () => {
            let draft: any = null;
            try { draft = await loadExamAttemptDraft(user.uid, examId); } catch { /* ignore */ }
            // Prefer the local mirror when it's newer — a background/app-kill can
            // lose the debounced Firestore write, but the AsyncStorage mirror is
            // written on every flush and holds the true latest state.
            // Only THIS account's mirror is considered (shared phones).
            let local: any = null;
            try {
              local = readLocalExamDraft(await AsyncStorage.getItem(localDraftKey), user.uid);
            } catch { /* storage unavailable */ }
            draft = pickResumeDraft(draft, local);
            if (!active) return;
            // Restore only into a pristine session: the overview phase, or an
            // autostarted question phase where nothing has been touched yet.
            // Never clobber answers the student typed while the read resolved.
            const pristine = phaseRef.current === 'overview'
              || (Object.keys(answersRef.current).length === 0 && currentIdxRef.current === 0);
            if (!pristine) return;
            if (draft) {
              const answerCount = draft.answers ? Object.keys(draft.answers).length : 0;
              if (answerCount > 0) { setAnswers(draft.answers as any); setHasDraft(true); }
              // Restore the saved position even with no answers yet (e.g. read
              // ahead on essay questions), so Reprendre lands on the right one.
              // draftPosition also reads the web's `currentQ`.
              if (typeof draft.secondsLeft === 'number' && draft.secondsLeft >= 0 && Number(e?.duration_minutes) > 0) {
                setSecondsLeft(draft.secondsLeft);
              }
              const pos = draftPosition(draft);
              if (pos != null && pos > 0) {
                draftIdxRef.current = pos;
                setHasDraft(true);
                // With autostart we're already past handleStart (which normally
                // applies the saved position) — jump there directly.
                if (phaseRef.current === 'questions' && pos < qs.length) {
                  setCurrentIdx(pos);
                }
              }
            }
          })();
        }
      })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [examId, user?.uid, retryCount]);

  // Retry from the error/empty state: clear the failure and re-run the fetch.
  const retryLoad = useCallback(() => {
    setError(false);
    setLoading(true);
    setRetryCount((n) => n + 1);
  }, []);

  // Auto-save draft every 10s (only while actually taking the exam)
  useEffect(() => {
    if (!user?.uid || questions.length === 0 || phase !== 'questions') return;
    draftTimer.current = setTimeout(flushDraft, 10000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [answers, currentIdx, user?.uid, examId, questions.length, phase, flushDraft]);

  // The clock runs only while the questions are on screen.
  const timed = secondsLeft != null;
  useEffect(() => {
    if (phase !== 'questions' || !timed) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, timed]);

  // Time is up: hand the paper in as it stands, like the web at 0:00 (no
  // "N unanswered" prompt — there is no time left to act on it).
  const doSubmitRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (phase === 'questions' && secondsLeft === 0 && !submittedRef.current) {
      Alert.alert(t('Temps écoulé', 'Tan an fini'), t('Ta copie est remise automatiquement.', 'Kopi ou remèt otomatikman.'));
      doSubmitRef.current();
    }
  }, [secondsLeft, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Final flush on unmount/blur: the 10s debounce is cleared when leaving, so
  // edits made within 10s of exiting would otherwise be lost.
  useEffect(() => () => { flushDraft(); }, [flushDraft]);

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
    // An emptied answer is not an answer. `answeredCount` counts KEYS, so
    // leaving the key behind after a student clears a field inflates the
    // header count, under-reports the "N unanswered" warning on submit, and
    // makes the resume card claim progress that isn't there.
    const isEmpty = Array.isArray(value)
      ? value.length === 0
      : value == null || String(value).trim() === '';
    setAnswers((prev) => {
      if (!isEmpty) return { ...prev, [idx]: value };
      if (!(idx in prev)) return prev;
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }

  async function handleSubmit() {
    const answeredCount = questions.filter((_, i) => isAnswerFilled(answers[i])).length;
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
    // One submission at a time (double tap / Alert + button).
    if (submittedRef.current) return;
    setSubmitting(true);
    // Block any pending / final autosave from reverting the doc to in_progress.
    submittedRef.current = true;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    // Make sure the local mirror holds the final answers. It is NOT removed
    // until the account acknowledges the result: this app's Firestore cache is
    // memory-only, so a submission queued offline dies with the process, and
    // deleting the mirror first lost the whole finished paper (P0 validation).
    if (user?.uid) {
      AsyncStorage.setItem(localDraftKey, JSON.stringify({
        uid: user.uid,
        answers: answersRef.current,
        currentIdx: currentIdxRef.current,
        questionCount: questionCountRef.current,
        status: 'in_progress',
        updated_at_ms: Date.now(),
      })).catch(() => {});
    }
    try {
      // Pass the raw answers map (index-keyed) straight to the grader — it reads
      // `answers[i]` directly, so wrapping in `{ given }` broke every match.
      // Options drive language fuzzy-matching (subject) + coefficient weighting.
      // Written answers the AI grader can mark are held as `ungraded` (left out
      // of the score) instead of `manual` with 0 points: they are graded right
      // after the paper is saved (startEssayGrading below), never before, so a
      // slow or absent grader can never block the submission.
      const graded = gradeExamPendingEssays(questions, answers, { subject, track: track ?? undefined });

      // Persist a lean per-question result (indexed by question order) so the
      // results screen can render correctness from the grader instead of
      // re-deriving it from field names the data doesn't use.
      const gradedResults = graded.results.map((r: any) => ({
        status: r.status,
        awarded: r.result?.awarded ?? 0,
        maxPoints: r.result?.maxPoints ?? 0,
      }));

      if (user?.uid) {
        // Result + attempt `submitted` mark in ONE atomic batch (they were two
        // awaits, attempt first: a failure between them left a "submitted"
        // attempt with no result). Bounded wait: offline the commit never
        // settles, which used to spin forever.
        // One operation id for this submission, on the direct write AND the
        // queued copy: a replay that finds it already written is done.
        const submittedAtMs = Date.now();
        const opId = examSubmitOpId(examId, submittedAtMs);
        const resultDoc = {
          exam_id: examId,
          level,
          // Save the cleaned short title, not the raw ministry boilerplate.
          title: normalizeExamTitle(exam),
          subject,
          track: track ?? undefined,
          summary: graded.summary,
          results: gradedResults,
          answers,
          submitted_at_ms: submittedAtMs,
          submission_op_id: opId,
        };
        // Queue FIRST (persisted, this account only): this app's Firestore
        // cache is memory-only, so an offline write dies with the process. The
        // queue survives a kill and replays at sign-in / reconnect / foreground.
        const queued = await queueExamSubmission(user.uid, opId, {
          examId,
          submittedAtMs,
          result: JSON.parse(JSON.stringify(resultDoc)),
          attempt: { answers },
          pendingEssays: graded.pending.length,
          subject: subject || undefined,
          level: normalizeLevel(String(exam?.level ?? '')) || undefined,
          source: fromPackRef.current ? 'pack' : 'network',
        });
        const commit = commitExamSubmission(user.uid, examId, resultDoc, { answers });
        const outcome = await settleWithin(commit, 12000);
        const saved = outcome.status === 'confirmed' && !!outcome.value;
        if (saved) {
          await outbox.remove(user.uid, opId).catch(() => undefined);
        } else if (queued && outcome.status !== 'failed') {
          // Graded here, kept on this phone, sent by the outbox when the
          // network returns. The mirror can go: the queue holds the answers.
          AsyncStorage.removeItem(localDraftKey).catch(() => {});
          clearActivity();
          if (subject && (graded.summary?.totalPoints ?? 0) > 0) {
            recordReview(user.uid, subject, { subject, percentage: graded.summary?.percentage ?? 0 }).catch(() => {});
          }
          void recordPlanEvent(user.uid, { kind: 'exam', examId }, graded.summary?.percentage ?? 0);
          navigation.replace('ExamResults', { level, examId });
          return;
        } else if (queued) {
          // The write was refused outright (rules, no auth): nothing to replay.
          await outbox.remove(user.uid, opId).catch(() => undefined);
        }
        if (!saved) {
          // Not on the account yet. Keep everything on this device and let the
          // student retry; the same doc ids make a retry idempotent.
          submittedRef.current = false;
          Alert.alert(
            t('Pas encore envoyé', 'Poko voye'),
            outcome.status === 'pending'
              ? t(
                'La connexion est lente ou absente. Vos réponses sont gardées sur ce téléphone. Réessayez quand vous serez connecté.',
                'Koneksyon an lan oswa li pa la. Repons ou yo rete sou telefòn sa a. Eseye ankò lè ou konekte.',
              )
              : t(
                'Le résultat n’a pas pu être enregistré. Vos réponses sont gardées sur ce téléphone. Réessayez.',
                'Nou pa t ka anrejistre rezilta a. Repons ou yo rete sou telefòn sa a. Eseye ankò.',
              ),
          );
          return;
        }
        // Acknowledged: now the mirror and the Home "Reprendre" card can go.
        AsyncStorage.removeItem(localDraftKey).catch(() => {});
        clearActivity();
        // AI-grade the written answers now that the paper is on the account.
        // Not awaited: the results screen follows the run and offers
        // "Corriger maintenant" if it fails (offline, timeout, rate limit).
        if (graded.pending.length > 0) {
          startEssayGrading(user.uid, examId, questions, {
            subject,
            level: normalizeLevel(String(exam?.level ?? '')),
          }).catch(() => {});
        }
        // Fold this graded round into the spaced-repetition schedule for its
        // subject (Adaptive Engine, Slice 2). Fire-and-forget: a failed schedule
        // write must never block submission or lose the result. Recorded once,
        // here, from the auto-graded part only (a paper of essays still being
        // graded has no score yet): the essay regrade never records it again.
        if (subject && (graded.summary?.totalPoints ?? 0) > 0) {
          recordReview(user.uid, subject, {
            subject,
            percentage: graded.summary?.percentage ?? 0,
          }).catch(() => {});
        }
        // The study plan advances from the app too (P0 validation E-13, P-3).
        // Never throws; queued for replay when it can't reach the server.
        void recordPlanEvent(user.uid, { kind: 'exam', examId }, graded.summary?.percentage ?? 0);
      } else {
        clearActivity();
      }

      navigation.replace('ExamResults', { level, examId });
    } catch (e) {
      submittedRef.current = false; // let the student retry
      Alert.alert(t('Erreur', 'Erè'), t('Impossible de soumettre. Réessayez.', 'Nou pa ka soumèt. Eseye ankò.'));
    } finally {
      setSubmitting(false);
    }
  }

  doSubmitRef.current = doSubmit;

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
        instructions: sectionTask(typeof sec?.instructions === 'string' ? sec.instructions.trim() : ''),
        passage: stripExamHallBoilerplate(typeof sec?.passage === 'string' ? sec.passage.trim() : ''),
        start: cursor,
        end: cursor + count - 1,
      });
      cursor += count;
    });
    return metas;
  }, [exam]);

  // Loading and error keep the screen's own chrome. Returning a bare state view
  // meant the header popped in only after the exam loaded, and — worse — an
  // error left the student on a full-screen message with no back arrow, with
  // only the tab bar or an edge swipe to escape. Same shape in, same shape out.
  const withChrome = (body: React.ReactNode) => (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 16, paddingVertical: 8, gap: 8, backgroundColor: colors.bg }}>
        <TouchableOpacity onPress={handleBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Retour', 'Retounen')}>
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <Text style={[typeScale.titleSm, { color: colors.ink, flex: 1 }]} numberOfLines={1}>
          {exam ? normalizeExamTitle(exam) : t('Examen', 'Egzamen')}
        </Text>
      </View>
      {body}
    </SafeAreaView>
  );

  if (loading) return withChrome(<LoadingState message={t("Chargement de l'examen…", 'Egzamen an ap chaje…')} />);
  if (error || !exam) return withChrome(<ErrorState onRetry={retryLoad} secondaryLabel={t('Retour', 'Retounen')} onSecondary={() => navigation.goBack()} />);
  if (questions.length === 0) return withChrome(<ErrorState message={t("Cet examen n'a pas de questions.", 'Egzamen sa a pa gen kesyon.')} onRetry={retryLoad} secondaryLabel={t('Retour', 'Retounen')} onSecondary={() => navigation.goBack()} />);

  const answeredCount = questions.filter((_, i) => isAnswerFilled(answers[i])).length;

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
  const rawQuestionText = String(q?._displayText ?? q?.question ?? '');
  // A question with several blanks gets each one numbered (①②③…) so the
  // student can tell which input fills which hole.
  const blankCount = String(q?.type ?? '').toLowerCase() === 'fill_blank'
    ? countBlanks(rawQuestionText)
    : 0;
  /*
   * RAW, on purpose — `MathText` does the routing itself.
   *
   * From TestFlight feedback on build 58 ("fix the display"), on a question
   * whose source is properly delimited:
   *   "Simplifier l'expression suivante $A = \sum_{k=1}^{n}\frac{k-e^{k}}{k!}$."
   * It rendered as "∑_(k=1)^n (k-e^(k))/(k!)" — the `mathToText` fallback,
   * on a string that should have been typeset.
   *
   * The cause was a DOUBLE TRANSFORM. This line ran `mathToText` first, which
   * turns the LaTeX into Unicode and strips the `$…$` delimiters; `MathText`
   * then asked `needsKatex()` about a string whose delimiters were already
   * gone, correctly answered no, and faithfully rendered the degraded text.
   * The KaTeX path was unreachable for every delimited question in the app.
   */
  const questionText = blankCount > 1 ? numberBlanks(rawQuestionText) : rawQuestionText;
  const rawAnswer = answers[safeIdx];
  const answerText = Array.isArray(rawAnswer) ? rawAnswer.join(', ') : String(rawAnswer ?? '');

  // Section context for the current question. Prefer the exam-level metadata
  // (which knows about `passage`); fall back to what flattenQuestions attached.
  const section = sectionMeta.find((s) => safeIdx >= s.start && safeIdx <= s.end) ?? null;
  const sectionTitle = section?.title ?? String(q?.sectionTitle ?? '').trim();
  const sectionInstructions = section?.instructions ?? sectionTask(String(q?.sectionInstructions ?? '').trim());
  const sectionPassage = section?.passage ?? '';
  const isSectionStart = section ? safeIdx === section.start : safeIdx === 0;

  // A multi-subject paper ("Mixed", or a comma-joined subject list) has no single
  // subject, so the exam-level value fails every MATH_SUBJECTS check and its
  // maths questions lost the step-by-step scaffold and the math keypad — they
  // fell back to one free-text box despite carrying full `answer_parts`. The
  // section knows better: "Mathématiques - Partie A" resolves to Mathématiques.
  // Only consulted when the exam subject is NOT already specific, so ordinary
  // single-subject papers behave exactly as before.
  // Plain computation, not a hook: this sits after the loading/error early
  // returns, so a useMemo here would be called conditionally.
  const questionSubject = (() => {
    const examSubjectRaw = String(exam?.subject ?? '');
    const isMultiSubject = subject === 'Mixed' || subject === 'Autre' || examSubjectRaw.includes(',');
    if (!isMultiSubject) return subject;
    const fromSection = normalizeSubject(subjectFromText(sectionTitle) || '');
    return fromSection && fromSection !== 'Autre' ? fromSection : subject;
  })();

  // The compiled question decides what inputs to draw. Plain computation for
  // the same reason as questionSubject above: this sits after the loading and
  // error early returns, so a useMemo here would be a conditional hook.
  const compiled = (() => {
    try {
      return compileQuestion(q, { subject: questionSubject });
    } catch {
      return null; // a question we cannot compile falls back to the old inputs
    }
  })();

  // MCQ, true/false, the condition builder and the scaffold have their own
  // well-tested inputs and their own stored formats; the engine takes the rest,
  // and only when the answers survive a round trip through a stored string.
  const hasConditions = Array.isArray(q?.conditions) && q.conditions.length > 0;
  // A fill_blank whose blanks sit IN the sentence is answered in the sentence,
  // before any scaffold — the web's order (ExamTake FillBlankText runs ahead of
  // ScaffoldedAnswer). 815 such questions used to get the numbered ①② step
  // rows on the phone while the web showed the blanks inline.
  const inlineBlanks = qType === 'fill_blank'
    && !!compiled
    && !hasConditions
    && compiled.prompt.some((b) => b.type === 'widget')
    && isSerializable(compiled);
  // The rest of the fill_blanks with authored blanks ("____", "....") still
  // get them in the sentence, split exactly as the web does — never the ①②
  // scaffold rows or one box under the text.
  const regexBlanks = qType === 'fill_blank' && !inlineBlanks && !hasConditions && countBlanks(rawQuestionText) > 0;
  const scaffolded = !inlineBlanks && !regexBlanks && usesScaffold(q, questionSubject);
  // Multiple-select and clean matching get their own inputs, as on the web.
  const multiSelect = qType === 'multiple_select' && normalizeOptions(q?.options).length > 0;
  const structuredMatching = qType === 'matching' && hasStructuredMatching(q);
  const usesEngine = !!compiled
    && !hasConditions
    && !regexBlanks
    && !multiSelect
    && !structuredMatching
    && !['mcq', 'multiple_choice', 'qcm', 'true_false', 'essay'].includes(qType)
    && !scaffolded
    && isSerializable(compiled);

  // Derived from the stored answer on every render, so there is one source of
  // truth and no second copy of the answer to keep in step.
  const response = usesEngine && compiled ? storedToResponse(compiled, rawAnswer) : {};
  const setWidgetValue = (id: string, value: string) => {
    if (!compiled) return;
    setAnswer(safeIdx, responseToStored(compiled, { ...response, [id]: value }));
  };

  const questionHeader = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink }}>
        {t(`Question ${safeIdx + 1}`, `Kesyon ${safeIdx + 1}`)}
        <Text style={[typeScale.meta, { color: colors.muted }]}> / {questions.length}</Text>
      </Text>
      {points > 0 ? (
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 13, lineHeight: 18, color: colors.muted }}>{points} pt{points > 1 ? 's' : ''}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 16, paddingVertical: 8, gap: 8, backgroundColor: colors.bg }}>
        <TouchableOpacity onPress={handleBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('Retour', 'Retounen')}>
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => setGridOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('Voir toutes les questions', 'Wè tout kesyon yo')}
        >
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: colors.ink }} numberOfLines={1}>{normalizeExamTitle(exam)}</Text>
          <Text style={[typeScale.meta, { color: saveState?.kind === 'failed' ? colors.warnInk : colors.muted }]} numberOfLines={1}>
            {answeredCount}/{questions.length} {t('réponses', 'repons')}
            {user?.uid && saveState
              ? ` · ${saveState.kind === 'saved'
                ? t(`enregistré ${clock(saveState.at)}`, `anrejistre ${clock(saveState.at)}`)
                : t('non enregistré', 'pa anrejistre')}`
              : ''}
          </Text>
        </TouchableOpacity>
        {secondsLeft != null ? (
          <View
            accessible
            accessibilityLabel={`${t('Temps restant', 'Tan ki rete')} : ${formatTime(secondsLeft)}`}
            accessibilityLiveRegion={secondsLeft < 300 ? 'polite' : 'none'}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderRadius: 999,
              backgroundColor: secondsLeft < 300 ? colors.warnSoft : colors.ink,
            }}
          >
            <Clock color={secondsLeft < 300 ? colors.warnInk : colors.bg} size={14} />
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, color: secondsLeft < 300 ? colors.warnInk : colors.bg, fontVariant: ['tabular-nums'] }}>
              {formatTime(secondsLeft)}
            </Text>
          </View>
        ) : null}
        <Button
          onPress={() => { tapMedium(); handleSubmit(); }}
          loading={submitting}
          size="sm"
          variant="secondary"
          accessibilityLabel={t('Soumettre', 'Soumèt')}
          label={t('Soumettre', 'Soumèt')}
        />
      </View>

      {/* Progress */}
      <ProgressStrip progress={progress} />

      {/* Question nav — on the header's surface with a hairline under it, so
          content scrolls BEHIND a clear edge instead of looking clipped. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flex: 1 }}>
          <QuestionNav
            current={safeIdx}
            total={questions.length}
            answers={answers}
            sections={sectionMeta}
            onGoto={setCurrentIdx}
          />
        </View>
        <TouchableOpacity
          onPress={() => setGridOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('Voir toutes les questions', 'Wè tout kesyon yo')}
          style={{ width: 44, height: 44, marginRight: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }}
        >
          <LayoutGrid color={colors.ink} size={18} />
        </TouchableOpacity>
      </View>

      <ExamQuestionGrid
        visible={gridOpen}
        onClose={() => setGridOpen(false)}
        sections={sectionMeta}
        total={questions.length}
        current={safeIdx}
        filled={(i) => isAnswerFilled(answers[i])}
        onGoto={setCurrentIdx}
      />

      {/* Question */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ paddingBottom: 32, padding: 20 }, centerColumn]}>
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

          {/* Question card: header row + stem in one card (the web's
              exam-take__question-card). Engine questions draw the same card
              themselves, with their blanks inside the sentence. */}
          {usesEngine || regexBlanks ? null : (
            <View style={{ ...cardSurface, padding: 20, gap: 14, marginBottom: 16 }}>
              {questionHeader}
              <MathText text={questionText} style={{ fontSize: 18, color: colors.ink, lineHeight: 27 }} />
              {q?.has_figure && q?.figure_description ? (
                <ExamFigure description={String(q.figure_description)} />
              ) : null}
            </View>
          )}

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
          ) : regexBlanks ? (
            <View style={{ gap: 12 }}>
              <InlineFillBlank
                header={questionHeader}
                text={rawQuestionText}
                value={answerText}
                onChange={(v) => setAnswer(safeIdx, v)}
              />
              {q?.has_figure && q?.figure_description ? <ExamFigure description={String(q.figure_description)} /> : null}
            </View>
          ) : multiSelect ? (
            <MultiSelectAnswer
              question={q}
              value={typeof answers[safeIdx] === 'string' ? (answers[safeIdx] as string) : ''}
              onChange={(v) => setAnswer(safeIdx, v)}
            />
          ) : structuredMatching ? (
            <MatchingAnswer
              question={q}
              value={typeof answers[safeIdx] === 'string' ? (answers[safeIdx] as string) : ''}
              onChange={(v) => setAnswer(safeIdx, v)}
            />
          ) : qType === 'true_false' ? (
            <TrueFalseQuestion
              answer={answers[safeIdx] ?? null}
              onAnswer={(a) => setAnswer(safeIdx, a)}
              isCreole={isCreole}
            />
          ) : scaffolded ? (
            // Step-by-step scaffold (PWA parity): authored solution text with
            // numbered blanks; persists {scaffold:[…]} through the same
            // answers/autosave/submit flow.
            <ScaffoldAnswer
              question={q}
              value={typeof answers[safeIdx] === 'string' ? (answers[safeIdx] as string) : ''}
              onChange={(v) => setAnswer(safeIdx, v)}
              mathMode={scaffoldNeedsMath(q, questionSubject)}
            />
          ) : qType === 'essay' ? (
            <View style={{ gap: 8 }}>
              <Text style={[typeScale.label, { color: colors.muted }]}>{t('Rédige ta réponse', 'Ekri repons ou an')}</Text>
              <WordCountAnswer
                value={answerText}
                onChangeText={(v) => setAnswer(safeIdx, v)}
                type="essay"
              />
            </View>
          ) : usesEngine && compiled ? (
            // The prompt and its inputs come from the compiled question: a
            // blank mid-sentence is answered in the sentence, and a numeric
            // answer gets a number pad rather than the full keyboard.
            <QuestionView
              header={questionHeader}
              question={compiled}
              response={response}
              onChange={setWidgetValue}
              mathy={
                MATH_SUBJECTS.has(questionSubject) &&
                looksMathy(typeof q?.correct === 'string' ? q.correct : undefined, questionText)
              }
            />
          ) : blankCount > 1 ? (
            // 21 multi-blank questions the engine hands back — an unsplittable
            // key, or an answer containing the "|" it would be stored with.
            // They still get one input per blank rather than one box for two
            // answers, which is the bug this component exists to prevent.
            <FillBlankAnswer
              text={rawQuestionText}
              value={answerText}
              onChange={(v) => setAnswer(safeIdx, v)}
            />
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
                MATH_SUBJECTS.has(questionSubject) &&
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

      {/* Navigation buttons — a white strip, no rule; one solid button. */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12, backgroundColor: colors.surface,
          shadowColor: '#0B296B', shadowOffset: { width: 0, height: -4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 10, elevation: 6,
        }}
      >
        <Button
          onPress={() => setCurrentIdx(Math.max(0, safeIdx - 1))}
          disabled={isFirst}
          variant="secondary"
          accessibilityLabel={t('Question précédente', 'Kesyon anvan')}
          label={t('Préc.', 'Anvan')}
          icon={<ChevronLeft color={colors.azureInk} size={18} />}
        />
        <View style={{ flex: 1 }} />
        {isLast ? (
          <Button
            onPress={() => { tapMedium(); handleSubmit(); }}
            loading={submitting}
            accessibilityLabel={t('Terminer', 'Fini')}
            label={t('Terminer', 'Fini')}
          />
        ) : (
          <Button
            onPress={() => setCurrentIdx(Math.min(questions.length - 1, safeIdx + 1))}
            accessibilityLabel={t('Question suivante', 'Kesyon pwochen')}
            label={t('Suivante', 'Pwochen')}
            trailingIcon={<ChevronRight color="#ffffff" size={18} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
