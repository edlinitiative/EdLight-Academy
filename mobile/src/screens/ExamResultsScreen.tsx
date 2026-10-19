import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, XCircle, Trophy, RefreshCw, ChevronLeft, ChevronDown, ChevronUp, Share2, Circle, HelpCircle } from 'lucide-react-native';
import { loadExamResult } from '../services/examResults';
import { shareScore } from '../services/scoreShare';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions, normalizeLevel, normalizeSubject } from '../utils/examUtils';
import { essayJobsFromDoc, type EssayGradingOutcome } from '../../../shared/essayRegrade';
import { classifyEssayResponse } from '../../../shared/essayGradeCore';
import { examQuestionContext } from '../../../shared/explainContext';
import { essayGradingKey, essayGradingRegistry, startEssayGrading } from '../services/essayGrading';
import { ExplainProvider } from '../components/sandra/ExplainSheet';
import ExplainButton from '../components/sandra/ExplainButton';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, fonts } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import { useContentContainerStyle } from '../components/ui/ContentContainer';
import Button from '../components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import Confetti from '../components/ui/Confetti';
import Segmented from '../components/ui/Segmented';
import { useReduceMotion } from '../utils/motion';
import { success as hapticSuccess, tapMedium, tapLight } from '../utils/haptics';
import { mathToText } from '../utils/mathText';
import MathText from '../components/MathText';
import DefiHandoffCard from '../components/DefiHandoffCard';
import { ExamsParamList } from '../navigation/ExamsNavigator';
import { examStackRoot } from '../navigation/navHelpers';

type Route = RouteProp<ExamsParamList, 'ExamResults'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamResults'>;

/**
 * Correctness for a reviewed question. Prefer the grader's persisted per-item
 * status (`results[]`); fall back to a text comparison against `question.correct`
 * for legacy results saved before the status array was persisted.
 */
function isCorrectResult(item: any, answer: any, question: any): boolean {
  if (item?.status) return item.status === 'correct' || item.status === 'scaffold-complete';
  const given = answer?.given ?? answer;
  const correctAnswer = question?.correct;
  return given != null && given !== '' && String(given).toLowerCase() === String(correctAnswer ?? '').toLowerCase();
}

/** Not graded yet: an essay waiting for (or failed by) the AI grader, or a key-less item. */
function isPendingResult(item: any): boolean {
  return item?.status === 'ungraded' || item?.status === 'manual';
}

function isUnansweredResult(item: any, answer: any): boolean {
  if (item?.status) return item.status === 'unanswered';
  const given = answer?.given ?? answer;
  return given == null || given === '';
}

/**
 * The score card (Stitch 06b register): "Score", a 56pt numeral, the verdict as
 * an azure tonal pill and an 8pt bar. Opaque, no gradient, no glow. Counts up
 * from 0 unless the OS asks for reduced motion.
 */
function ScoreCard({ percentage, scoreLine, pendingOnly = false }: { percentage: number; scoreLine?: string; pendingOnly?: boolean }) {
  const language = useStore((s) => s.language);
  const { colors, cardSurface } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const reduceMotion = useReduceMotion();

  // Celebrate a strong result — this is the emotional peak of the exam flow.
  useEffect(() => { if (percentage >= 70 && !pendingOnly) hapticSuccess(); }, [percentage, pendingOnly]);

  const [display, setDisplay] = useState(reduceMotion ? percentage : 0);
  useEffect(() => {
    if (reduceMotion) { setDisplay(percentage); return; }
    let raf: number;
    const start = Date.now();
    const duration = 800;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(percentage * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [percentage, reduceMotion]);

  const phrase = pendingOnly
    ? t('Correction en attente', 'Koreksyon ap tann')
    : percentage >= 70 ? t('Excellent !', 'Ekselan !') : percentage >= 50 ? t('Bien essayé !', 'Byen eseye !') : t('Continue à réviser !', 'Kontinye revize !');
  // One spoken node for the whole score — "Score : 78 pour cent, Bien essayé".
  // Nothing graded yet is never read (or shown) as 0.
  const scoreA11y = pendingOnly
    ? `${t('Score', 'Nòt')} : ${t('pas encore corrigé', 'poko korije')}`
    : `${t('Score', 'Nòt')} : ${percentage} ${t('pour cent', 'pou san')}, ${phrase}`;

  return (
    <View style={{ ...cardSurface, borderRadius: 24, padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View accessible accessibilityLabel={scoreA11y} style={{ gap: 2 }}>
          <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Score', 'Nòt')}</Text>
          <Text maxFontSizeMultiplier={1.3} style={{ fontFamily: fonts.heading, fontSize: 56, lineHeight: 60, letterSpacing: -2, color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {pendingOnly ? '–' : display}
            {pendingOnly ? null : <Text style={{ fontFamily: fonts.headingBold, fontSize: 22, letterSpacing: 0, color: colors.muted }}> %</Text>}
          </Text>
          {scoreLine ? <Text style={[typeScale.meta, { color: colors.muted }]}>{scoreLine}</Text> : null}
        </View>
        <View importantForAccessibility="no" style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4, flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.azureInk }}>{phrase}</Text>
        </View>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 8, borderRadius: 99, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ height: 8, borderRadius: 99, width: `${pendingOnly ? 0 : Math.max(0, Math.min(100, percentage))}%`, backgroundColor: colors.azureFill }} />
      </View>
    </View>
  );
}

function QuestionReviewItem({ question, index, answer, result, subject, level, examId }: { question: any; index: number; answer: any; result: any; subject?: string; level?: string; examId?: string }) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const { cardSurface, isDark } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [expanded, setExpanded] = useState(false);
  const okInk = isDark ? colors.success : colors.successFill;
  const correctAnswer = question.correct;
  const given = answer?.given ?? answer;
  const isUnanswered = isUnansweredResult(result, answer);
  const isPending = !isUnanswered && isPendingResult(result);
  const isPartial = result?.status === 'partial';
  const isCorrect = !isUnanswered && !isPending && isCorrectResult(result, answer, question);
  // Correctness must not rely on the icon colour alone — state it in the label.
  const statusLabel = isUnanswered
    ? t('sans réponse', 'san repons')
    : isPending
      ? t('pas encore corrigée', 'poko korije')
      : isCorrect ? t('correcte', 'kòrèk') : isPartial ? t('en partie juste', 'yon pati kòrèk') : t('incorrecte', 'pa kòrèk');
  const neutral = isUnanswered || isPending;
  const essay = result?.essayFeedback && classifyEssayResponse(result.essayFeedback) !== 'failed' ? result.essayFeedback : null;
  const explainCtx = !isPending && !isUnanswered && !isCorrect
    ? examQuestionContext({ question, answer: given, status: isPartial ? 'partial' : 'incorrect', subject, level, examId })
    : undefined;
  const questionText = mathToText(String(question._displayText ?? question.question ?? ''));

  return (
    <PressableScale
      onPress={() => setExpanded((v) => !v)}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${t('Question', 'Kesyon')} ${index + 1}, ${statusLabel}. ${questionText}`}
      accessibilityHint={t('Toucher pour voir le détail', 'Manyen pou wè detay')}
      style={{ ...cardSurface, marginBottom: 12, overflow: 'hidden' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: neutral ? colors.surfaceAlt : isCorrect ? colors.successSoft : colors.dangerSoft }}>
          {isUnanswered
            ? <Circle color={colors.muted} size={16} strokeWidth={2.4} />
            : isPending
              ? <HelpCircle color={colors.muted} size={18} strokeWidth={2.4} />
              : isCorrect
              ? <CheckCircle2 color={okInk} size={18} strokeWidth={2.4} />
              : <XCircle color={colors.danger} size={18} strokeWidth={2.4} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={expanded ? undefined : 1}>
            {questionText}
          </Text>
          <Text style={[typeScale.meta, { color: colors.muted }]}>{t(`Question ${index + 1}`, `Kesyon ${index + 1}`)} · {statusLabel}</Text>
        </View>
        {expanded
          ? <ChevronUp color={colors.azureInk} size={18} />
          : <ChevronDown color={colors.azureInk} size={18} />}
      </View>
      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Text style={[typeScale.body, { color: colors.muted }]}>{t('Ta réponse :', 'Repons ou :')}</Text>
            <View style={{ backgroundColor: neutral ? colors.surfaceAlt : isCorrect ? colors.successSoft : colors.dangerSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: isUnanswered ? colors.muted : isPending ? colors.ink : isCorrect ? okInk : colors.danger }}>
                {isUnanswered ? t('Sans réponse', 'San repons') : String(given)}
              </Text>
            </View>
          </View>
          {!isCorrect && correctAnswer != null && (
            <View style={{ gap: 6 }}>
              <Text style={[typeScale.body, { color: colors.muted }]}>{t('Bonne réponse :', 'Bon repons :')}</Text>
              <View style={{ backgroundColor: colors.successSoft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: okInk }}>{String(correctAnswer)}</Text>
              </View>
            </View>
          )}
          {question.explanation && (
            <View style={{ gap: 8 }}>
              <Text style={[typeScale.body, { color: colors.muted }]}>{t('Explication :', 'Eksplikasyon :')}</Text>
              <View style={{ padding: 16, backgroundColor: isDark ? colors.surfaceAlt : colors.bg, borderRadius: 14 }}>
                <MathText text={String(question.explanation)} style={{ fontSize: 16, lineHeight: 24, color: colors.ink }} />
              </View>
            </View>
          )}
          {essay ? <EssayFeedbackBlock feedback={essay} t={t} /> : null}
          {isPending && !essay && (question.type === 'essay' || question.type === 'short_answer') ? (
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {t('Ta rédaction n’est pas encore corrigée : elle ne compte pas encore dans ton score.', 'Redaksyon ou poko korije : li poko konte nan nòt ou.')}
            </Text>
          ) : null}
          <ExplainButton context={explainCtx} />
        </View>
      )}
    </PressableScale>
  );
}

/** The AI grade of a written answer: an estimate, labelled as one. */
function EssayFeedbackBlock({ feedback, t }: { feedback: any; t: (fr: string, ht: string) => string }) {
  const colors = useColors();
  const { isDark } = useTheme();
  const strengths: string[] = Array.isArray(feedback?.strengths) ? feedback.strengths : [];
  const improvements: string[] = Array.isArray(feedback?.improvements) ? feedback.improvements : [];
  return (
    <View style={{ gap: 8, padding: 16, borderRadius: 14, backgroundColor: isDark ? colors.surfaceAlt : colors.bg }}>
      <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
        {t('Note IA (indicative) : ', 'Nòt IA (endikatif) : ')}{String(feedback.score ?? '')}
      </Text>
      {feedback.feedback ? <Text style={[typeScale.body, { color: colors.ink }]}>{String(feedback.feedback)}</Text> : null}
      {strengths.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Text style={[typeScale.label, { color: colors.muted }]}>{t('Points forts', 'Pwen fò')}</Text>
          {strengths.map((x, i) => <Text key={i} style={[typeScale.body, { color: colors.ink }]}>{`• ${x}`}</Text>)}
        </View>
      ) : null}
      {improvements.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Text style={[typeScale.label, { color: colors.muted }]}>{t('Pour progresser', 'Pou pwogrese')}</Text>
          {improvements.map((x, i) => <Text key={i} style={[typeScale.body, { color: colors.ink }]}>{`• ${x}`}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

function computeMastery(questions: any[], answers: Record<string, any>, gradedResults: any[]) {
  const groups: Record<string, { correct: number; total: number }> = {};
  questions.forEach((q, i) => {
    // Not graded yet: out of the score, so out of the section bars too.
    if (gradedResults[i]?.status === 'ungraded') return;
    const section = q.sectionTitle || q.section || 'Général';
    if (!groups[section]) groups[section] = { correct: 0, total: 0 };
    groups[section].total++;
    if (isCorrectResult(gradedResults[i], answers[i], q)) groups[section].correct++;
  });
  return Object.entries(groups)
    .map(([section, { correct, total }]) => ({ section, correct, total, pct: Math.round((correct / total) * 100) }))
    .sort((a, b) => a.pct - b.pct);
}

function MasteryBar({ section, pct, correct, total }: { section: string; pct: number; correct: number; total: number }) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const color = pct >= 75 ? colors.successFill : pct >= 50 ? colors.warn : colors.danger;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]} numberOfLines={1}>{section === 'Général' ? t('Général', 'Jeneral') : section}</Text>
        <Text style={{ marginLeft: 8, color: colors.ink, fontFamily: fonts.headingBold, fontSize: 15, fontVariant: ['tabular-nums'] }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.surfaceAlt, borderRadius: 99, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as any, height: 6, backgroundColor: color, borderRadius: 99 }} />
      </View>
      <Text style={[typeScale.meta, { color: colors.muted, marginTop: 4 }]}>{correct}/{total} {t('correctes', 'kòrèk')}</Text>
    </View>
  );
}

export default function ExamResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, incrementGuestInteraction, language, setShowAuthModal } = useStore();
  const colors = useColors();
  const { cardSurface } = useTheme();
  const centerColumn = useContentContainerStyle('readable');
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [result, setResult] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'correct'>('all');
  const [exam, setExam] = useState<any | null>(null);
  const [gradeOutcome, setGradeOutcome] = useState<EssayGradingOutcome | null>(null);

  // A grading run for this paper, started at submit or by "Corriger maintenant".
  const gradingKey = user?.uid ? essayGradingKey(user.uid, examId) : '';
  const grading = useSyncExternalStore(
    essayGradingRegistry.subscribe,
    () => (gradingKey ? essayGradingRegistry.isRunning(gradingKey) : false),
  );
  // When a run finishes (here or on the take screen), reload the regraded paper.
  useEffect(() => {
    if (!gradingKey) return undefined;
    return essayGradingRegistry.subscribe((key) => {
      if (key !== gradingKey || essayGradingRegistry.isRunning(key)) return;
      const outcome = essayGradingRegistry.lastOutcome(key);
      setGradeOutcome(outcome);
      if (outcome && (outcome.status === 'graded' || outcome.status === 'stale' || outcome.status === 'nothing')) {
        setReloadKey((k) => k + 1);
      }
    });
  }, [gradingKey]);

  useEffect(() => {
    incrementGuestInteraction();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    const promises: Promise<any>[] = [
      user?.uid ? loadExamResult(user.uid, examId) : Promise.resolve(null),
      fetchSingleExam(examId),
    ];
    Promise.all(promises)
      .then(([r, exam]) => {
        if (!alive) return;
        setResult(r);
        if (exam) {
          setExam(exam);
          setQuestions(flattenQuestions(exam) as any[]);
        }
      })
      // Without this, a failed load fell through to percentage = 0 and rendered
      // a real-looking "0%" — a failure was indistinguishable from a bad score.
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.uid, examId, reloadKey]);

  // Same chrome while loading and on error, so the header doesn't pop in once
  // the result arrives and a failed load still has a way back. (The back button
  // judges THIS stack's depth: canGoBack() counts the parent tab navigator too,
  // so it is true even when this is the only route here.)
  const goBack = () => {
    const stackRoutes = navigation.getState()?.routes ?? [];
    if (stackRoutes.length > 1) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: examStackRoot(navigation) as 'ExamLanding' }] });
  };
  const withChrome = (body: React.ReactNode) => (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View className="flex-row items-center px-5 pt-2 pb-3">
        <TouchableOpacity
          onPress={goBack}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10, marginRight: 2 }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink }]}>{t('Résultats', 'Rezilta')}</Text>
      </View>
      {body}
    </SafeAreaView>
  );

  if (loading) return withChrome(<LoadingState message={t('Chargement des résultats…', 'Ap chaje rezilta yo…')} />);
  if (loadError) return withChrome(<ErrorState onRetry={() => setReloadKey((k) => k + 1)} secondaryLabel={t('Retour', 'Retounen')} onSecondary={goBack} />);

  // Guests never get a persisted result (ExamTakeScreen only saves for signed-in
  // users), so `result` is null and every derived number below would be 0. Don't
  // render a fabricated 0% gauge — and never offer to SHARE it. Explain instead.
  if (!result && !user?.uid) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
          <TouchableOpacity
            onPress={() => {
              const stackRoutes = navigation.getState()?.routes ?? [];
              if (stackRoutes.length > 1) navigation.goBack();
              else navigation.reset({ index: 0, routes: [{ name: examStackRoot(navigation) as 'ExamLanding' }] });
            }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10, marginRight: 2 }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Retour', 'Retounen')}
          >
            <ChevronLeft color={colors.ink} size={26} />
          </TouchableOpacity>
          <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink }]}>{t('Résultats', 'Rezilta')}</Text>
        </View>
        <EmptyState
          title={t('Connecte-toi pour voir ton score', 'Konekte pou wè nòt ou')}
          description={t(
            'Sans compte, tes réponses ne sont pas enregistrées. Crée un compte gratuit pour garder tes résultats et suivre ta progression.',
            'San yon kont, repons ou yo pa sove. Kreye yon kont gratis pou kenbe rezilta ou epi swiv pwogrè ou.',
          )}
          ctaLabel={t('Créer un compte', 'Kreye yon kont')}
          onCta={() => setShowAuthModal(true)}
        />
      </SafeAreaView>
    );
  }

  // The grader emits correctCount/incorrectCount/earnedPoints/totalPoints and a
  // per-question `results[]` array (persisted at submit). Read those real field
  // names — the old summary.correct/total/scored/maxScore never existed.
  const summary = result?.summary ?? {};
  const percentage = summary.percentage ?? result?.percentage ?? 0;
  const correct = Math.round(summary.correctCount ?? 0);
  const incorrect = summary.incorrectCount ?? 0;
  const scored = summary.earnedPoints ?? 0;
  const maxScore = summary.totalPoints ?? 0;
  const answers = result?.answers ?? {};
  const gradedResults: any[] = Array.isArray(result?.results) ? result.results : [];

  const filteredQuestions = questions.filter((q, i) => {
    if (reviewFilter === 'all') return true;
    const isCorrect = isCorrectResult(gradedResults[i], answers[i], q);
    if (reviewFilter === 'correct') return isCorrect;
    return !isCorrect && !isPendingResult(gradedResults[i]);
  });

  // Written answers the AI grader can still mark (pending, failed, or an old
  // paper from before the app called the grader). Same rule as the run.
  const regradableCount = result && questions.length > 0 ? essayJobsFromDoc(questions, result).length : 0;
  const pendingPoints = Number(summary.pendingPoints) || 0;
  const pendingOnly = maxScore === 0 && (regradableCount > 0 || pendingPoints > 0);
  const examSubject = exam ? normalizeSubject(exam.subject ?? '') : (result?.subject ?? undefined);
  const examLevel = exam ? normalizeLevel(String(exam.level ?? '')) : undefined;
  const gradeNow = () => {
    if (!user?.uid || questions.length === 0 || grading) return;
    tapMedium();
    setGradeOutcome(null);
    startEssayGrading(user.uid, examId, questions, { subject: examSubject, level: examLevel }).catch(() => {});
  };
  const gradeMessage = (() => {
    const o = gradeOutcome;
    if (!o) return null;
    if (o.status === 'missing') {
      return t('Ta copie n’est pas encore enregistrée sur ton compte. Réessaie quand tu es connecté.', 'Kopi ou poko anrejistre sou kont ou. Eseye ankò lè ou konekte.');
    }
    if (o.status !== 'failed') return null;
    if (o.rateLimited) return t('Trop de corrections demandées pour l’instant. Réessaie dans une heure.', 'Twòp koreksyon mande pou kounye a. Eseye ankò nan inèdtan.');
    if (o.offline) return t('Pas de connexion : la correction n’a pas pu être lancée. Réessaie quand tu es connecté.', 'Pa gen koneksyon : koreksyon an pa t ka fèt. Eseye ankò lè ou konekte.');
    return t('La correction automatique n’a pas abouti. Réessaie dans un moment.', 'Koreksyon otomatik la pa t mache. Eseye ankò talè.');
  })();

  return (
    <ExplainProvider>
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header — shares the page background (no white-bar seam) */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          // canGoBack() also counts the parent TAB navigator, so it was true even
          // when this is the only route here — goBack() then switched tabs and the
          // ExamLanding fallback was dead code. Judge this stack's own depth.
          onPress={() => {
            const stackRoutes = navigation.getState()?.routes ?? [];
            if (stackRoutes.length > 1) navigation.goBack();
            else navigation.reset({ index: 0, routes: [{ name: examStackRoot(navigation) as 'ExamLanding' }] });
          }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10, marginRight: 2 }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink }]}>{t('Résultats', 'Rezilta')}</Text>
      </View>

      {/* Celebration burst for a passing result (skipped under reduce-motion) */}
      {Math.round(percentage) >= 70 && !pendingOnly && <Confetti />}

      <ScrollView className="flex-1" contentContainerStyle={[{ paddingBottom: 100 }, centerColumn]}>
        {/* Score — the 06b score card, opaque */}
        <View style={{ marginHorizontal: 20, marginTop: 8 }}>
          <ScoreCard
            percentage={Math.round(percentage)}
            pendingOnly={pendingOnly}
            scoreLine={maxScore > 0 ? t(`${scored} points sur ${maxScore}`, `${scored} pwen sou ${maxScore}`) : undefined}
          />
        </View>

        {/* Written answers not graded yet: "Correction provisoire", never a 0. */}
        {regradableCount > 0 || grading ? (
          <View style={[cardSurface, { marginHorizontal: 20, marginTop: 16, padding: 18, gap: 12 }]} accessibilityLiveRegion="polite">
            <Text style={[typeScale.cardTitle, { color: colors.ink }]}>{t('Correction provisoire', 'Koreksyon pwovizwa')}</Text>
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {grading
                ? t('Correction de ta rédaction en cours… Ton score se mettra à jour tout seul.', 'N ap korije redaksyon ou… Nòt ou ap mete l ajou poukont li.')
                : regradableCount === 1
                  ? t('Une réponse rédigée n’est pas encore corrigée : elle ne compte pas encore dans ton score.', 'Yon repons ekri poko korije : li poko konte nan nòt ou.')
                  : t(`${regradableCount} réponses rédigées ne sont pas encore corrigées : elles ne comptent pas encore dans ton score.`, `${regradableCount} repons ekri poko korije : yo poko konte nan nòt ou.`)}
            </Text>
            {gradeMessage && !grading ? <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{gradeMessage}</Text> : null}
            {user?.uid && !grading ? (
              <Button
                onPress={gradeNow}
                variant="secondary"
                size="md"
                icon={<RefreshCw color={colors.azureInk} size={18} />}
                label={t('Corriger maintenant', 'Korije kounye a')}
                accessibilityLabel={t('Corriger maintenant', 'Korije kounye a')}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : null}
          </View>
        ) : null}

        {/* Share the score — doubles as a referral invite. Not while nothing is graded. */}
        {pendingOnly ? null : <Button
          onPress={() => shareScore({
            title: t('Bac blanc', 'Bak blan'),
            score: Math.round(percentage),
            asPercent: true,
            lang: isCreole ? 'ht' : 'fr',
          })}
          variant="secondary"
          size="lg"
          fullWidth
          icon={<Share2 color={colors.azureInk} size={18} />}
          accessibilityLabel={t('Partager mon score', 'Pataje nòt mwen')}
          label={t('Partager mon score', 'Pataje nòt mwen')}
          style={{ marginHorizontal: 20, marginTop: 16 }}
        />}

        {/* Handoff into the XP loop — an exam just finished is the moment a
            content-only user is most likely to try the Défi (falls back to
            the ×2 weekly game once today's défi is done). */}
        <View className="mt-4" style={{ marginHorizontal: 20 }}>
          <DefiHandoffCard showWeeklyWhenDone />
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mt-4" style={{ marginHorizontal: 20 }}>
          {[
            { label: t('Correctes', 'Kòrèk'), value: String(correct), icon: <CheckCircle2 color={colors.successFill} size={20} />, color: colors.success },
            { label: t('Incorrectes', 'Pa kòrèk'), value: String(incorrect), icon: <XCircle color={colors.danger} size={20} />, color: colors.danger },
            { label: t('Points', 'Pwen'), value: maxScore > 0 ? `${scored}/${maxScore}` : `${Math.round(percentage)}%`, icon: <Trophy color={colors.azureInk} size={20} />, color: colors.azureInk },
          ].map((stat) => (
            <View
              key={stat.label}
              accessible
              accessibilityLabel={`${stat.label}: ${stat.value}`}
              style={[cardSurface, { flex: 1, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 6 }]}
            >
              {stat.icon}
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.heading, fontSize: 24, lineHeight: 28, color: colors.ink, fontVariant: ['tabular-nums'] }}>{stat.value}</Text>
              <Text style={[typeScale.label, { color: colors.muted, textAlign: 'center' }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Mastery by section */}
        {questions.length > 0 && (() => {
          const mastery = computeMastery(questions, answers, gradedResults);
          if (mastery.length <= 1) return null;
          return (
            <View style={[cardSurface, { marginHorizontal: 20, marginTop: 16, padding: 18 }]}>
              <Text style={[typeScale.cardTitle, { color: colors.ink, marginBottom: 14 }]}>{t('Par section', 'Dapre seksyon')}</Text>
              {mastery.map((m) => (
                <MasteryBar key={m.section} section={m.section} pct={m.pct} correct={m.correct} total={m.total} />
              ))}
            </View>
          );
        })()}

        {/* Exam info */}
        {result && (
          <View style={[cardSurface, { marginHorizontal: 20, marginTop: 16, padding: 18 }]}>
            <Text style={[typeScale.cardTitle, { color: colors.ink, marginBottom: 4 }]} numberOfLines={2}>{result.title ?? t('Examen', 'Egzamen')}</Text>
            {result.subject && <Text style={[typeScale.body, { color: colors.muted }]}>{t('Matière', 'Matyè')} : {result.subject}</Text>}
            {result.level && <Text style={[typeScale.body, { color: colors.muted }]}>{t('Niveau', 'Nivo')} : {result.level}</Text>}
          </View>
        )}

        {/* Question review */}
        {questions.length > 0 && (
          <View className="mt-6" style={{ marginHorizontal: 20 }}>
            <View className="flex-row items-center justify-between mb-3">
              <Text accessibilityRole="header" style={[typeScale.section, { fontSize: 20, lineHeight: 25, color: colors.ink }]}>{t('Revue des questions', 'Revi kesyon yo')}</Text>
              <Text style={[typeScale.meta, { color: colors.muted }]}>{questions.length} {t('questions', 'kesyon')}</Text>
            </View>

            {/* Filter — the shared pill switch */}
            <Segmented<'all' | 'wrong' | 'correct'>
              options={[
                { key: 'all', label: t('Toutes', 'Tout') },
                { key: 'wrong', label: t('À revoir', 'Pou revize') },
                { key: 'correct', label: t('Réussies', 'Reyisi') },
              ]}
              value={reviewFilter}
              onChange={setReviewFilter}
              style={{ marginBottom: 16 }}
            />

            {filteredQuestions.length === 0 ? (
              <View className="items-center py-6">
                <Text style={[typeScale.body, { color: colors.faint }]}>{t('Aucune question dans ce filtre.', 'Pa gen kesyon nan filt sa a.')}</Text>
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
                    result={gradedResults[originalIdx]}
                    subject={examSubject}
                    level={examLevel}
                    examId={examId}
                  />
                );
              })
            )}
          </View>
        )}

        {/* Actions */}
        <View className="mt-6 gap-3" style={{ paddingHorizontal: 20 }}>
          <Button
            onPress={() => { tapMedium(); navigation.replace('ExamTake', { level, examId, autostart: true }); }}
            variant="primary"
            size="lg"
            fullWidth
            icon={<RefreshCw color="#fff" size={18} />}
            accessibilityLabel={t('Recommencer', 'Rekòmanse')}
            label={t('Recommencer', 'Rekòmanse')}
          />
          <Button
            onPress={() => { tapLight(); navigation.navigate('ExamBrowser', { level }); }}
            variant="secondary"
            size="lg"
            fullWidth
            accessibilityLabel={t("Voir d'autres examens", 'Wè lòt egzamen')}
            label={t("Voir d'autres examens", 'Wè lòt egzamen')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
    </ExplainProvider>
  );
}
