import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, XCircle, Trophy, RefreshCw, ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon, Share2, Lightbulb } from 'lucide-react-native';
import { loadExamResult } from '../services/examResults';
import { shareScore } from '../services/scoreShare';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions } from '../utils/examUtils';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale } from '../theme/theme';
import PressableScale from '../components/ui/PressableScale';
import Button from '../components/ui/Button';
import { LoadingState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import Confetti from '../components/ui/Confetti';
import PopIn from '../components/ui/PopIn';
import { useReduceMotion } from '../utils/motion';
import { success as hapticSuccess, tapMedium, tapLight } from '../utils/haptics';
import MathText from '../components/MathText';
import { ExamsParamList } from '../navigation/ExamsNavigator';

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

function isUnansweredResult(item: any, answer: any): boolean {
  if (item?.status) return item.status === 'unanswered';
  const given = answer?.given ?? answer;
  return given == null || given === '';
}

function ScoreGauge({ percentage, onDark = false }: { percentage: number; onDark?: boolean }) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const color = onDark ? '#ffffff' : percentage >= 70 ? colors.success : percentage >= 50 ? colors.warn : colors.danger;
  const trophyBg = onDark ? 'rgba(255,255,255,0.16)' : colors.azureSoft;
  const trophyColor = onDark ? '#ffffff' : colors.azure;
  const reduceMotion = useReduceMotion();

  // Celebrate a strong result — this is the emotional peak of the exam flow.
  useEffect(() => { if (percentage >= 70) hapticSuccess(); }, [percentage]);

  // Count the score up from 0 on mount (easeOutCubic over ~0.8s). Reduced-motion
  // users see the final number immediately.
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

  const phrase = percentage >= 70 ? t('Excellent !', 'Ekselan !') : percentage >= 50 ? t('Bien essayé !', 'Byen eseye !') : t('Continue à réviser !', 'Kontinye revize !');
  // One spoken node for the whole score — "Score : 78 pour cent, Bien essayé".
  const scoreA11y = `${t('Score', 'Nòt')} : ${percentage} ${t('pour cent', 'pou san')}, ${phrase}`;

  return (
    <View className="items-center py-8">
      {/* Decorative trophy — hidden from VoiceOver (the score node speaks it). */}
      <PopIn from={0.6}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: trophyBg, borderWidth: onDark ? 1 : 0, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}
        >
          <Trophy color={trophyColor} size={32} />
        </View>
      </PopIn>
      <Text
        accessible
        accessibilityLabel={scoreA11y}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 52, fontWeight: '900', color, letterSpacing: -1 }}
      >
        {display}%
      </Text>
      {/* Already spoken via the score label above — kept visual only. */}
      <Text importantForAccessibility="no" style={{ marginTop: 4, color: onDark ? 'rgba(255,255,255,0.82)' : colors.muted }}>
        {phrase}
      </Text>
    </View>
  );
}

function QuestionReviewItem({ question, index, answer, result }: { question: any; index: number; answer: any; result: any }) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const { radius, shadow } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [expanded, setExpanded] = useState(false);
  const correctAnswer = question.correct;
  const given = answer?.given ?? answer;
  const isUnanswered = isUnansweredResult(result, answer);
  const isCorrect = !isUnanswered && isCorrectResult(result, answer, question);
  // Correctness must not rely on the icon colour alone — state it in the label.
  const statusLabel = isUnanswered ? t('sans réponse', 'san repons') : isCorrect ? t('correcte', 'kòrèk') : t('incorrecte', 'pa kòrèk');
  const questionText = String(question._displayText ?? question.question ?? '');

  return (
    <PressableScale
      onPress={() => setExpanded((v) => !v)}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${t('Question', 'Kesyon')} ${index + 1}, ${statusLabel}. ${questionText}`}
      accessibilityHint={t('Toucher pour voir le détail', 'Manyen pou wè detay')}
      style={[{ borderRadius: radius.card, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, shadow.sm]}
    >
      <View className="flex-row items-center px-4 py-3 gap-3">
        {isUnanswered
          ? <View style={{ width: 20, height: 20, borderRadius: 999, borderWidth: 2, borderColor: colors.border }} />
          : isCorrect
            ? <CheckCircle2 color={colors.success} size={20} />
            : <XCircle color={colors.danger} size={20} />}
        <Text style={[typeScale.caption, { width: 24, color: colors.muted, fontFamily: 'Satoshi-Bold' }]}>Q{index + 1}</Text>
        <Text style={[typeScale.bodyMd, { flex: 1, color: colors.ink }]} numberOfLines={expanded ? undefined : 2}>
          {question._displayText ?? question.question ?? ''}
        </Text>
        {expanded
          ? <ChevronDown color={colors.faint} size={16} />
          : <ChevronRightIcon color={colors.faint} size={16} />}
      </View>
      {expanded && (
        <View className="px-4 pb-3 gap-2">
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 4 }} />
          <View className="flex-row gap-2">
            <Text style={[typeScale.caption, { width: 80, color: colors.faint, fontFamily: 'Satoshi-Bold' }]}>{t('Votre réponse', 'Repons ou')}</Text>
            <Text style={[typeScale.caption, { flex: 1, fontFamily: 'Satoshi-Medium', color: isUnanswered ? colors.faint : isCorrect ? colors.success : colors.danger }]}>
              {isUnanswered ? t('Sans réponse', 'San repons') : String(given)}
            </Text>
          </View>
          {!isCorrect && correctAnswer != null && (
            <View className="flex-row gap-2">
              <Text style={[typeScale.caption, { width: 80, color: colors.faint, fontFamily: 'Satoshi-Bold' }]}>{t('Bonne réponse', 'Bon repons')}</Text>
              <Text style={[typeScale.caption, { flex: 1, color: colors.success, fontFamily: 'Satoshi-Medium' }]}>{String(correctAnswer)}</Text>
            </View>
          )}
          {question.explanation && (
            <View style={{ marginTop: 4, flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.border }}>
              <Lightbulb color={colors.azure} size={15} style={{ marginTop: 1 }} />
              <Text style={[typeScale.caption, { flex: 1, lineHeight: 18, color: colors.muted }]}>{question.explanation}</Text>
            </View>
          )}
        </View>
      )}
    </PressableScale>
  );
}

function computeMastery(questions: any[], answers: Record<string, any>, gradedResults: any[]) {
  const groups: Record<string, { correct: number; total: number }> = {};
  questions.forEach((q, i) => {
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
  const color = pct >= 75 ? colors.success : pct >= 50 ? colors.warn : colors.danger;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <Text style={[typeScale.label, { flex: 1, color: colors.muted }]} numberOfLines={1}>{section === 'Général' ? t('Général', 'Jeneral') : section}</Text>
        <Text style={[typeScale.caption, { marginLeft: 8, color, fontFamily: 'Satoshi-Bold' }]}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.hairline, borderRadius: 99, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as any, height: 6, backgroundColor: color, borderRadius: 99 }} />
      </View>
      <Text style={[typeScale.micro, { color: colors.faint, marginTop: 3 }]}>{correct}/{total} {t('correctes', 'kòrèk')}</Text>
    </View>
  );
}

export default function ExamResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, incrementGuestInteraction, language } = useStore();
  const colors = useColors();
  const { cardSurface, shadow } = useTheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

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
  }, [user?.uid, examId]);

  if (loading) return <LoadingState message={t('Chargement des résultats…', 'Ap chaje rezilta yo…')} />;

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
    return reviewFilter === 'correct' ? isCorrect : !isCorrect;
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header — shares the page background (no white-bar seam) */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ExamLanding'))}
          className="p-1 mr-3"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ArrowLeft color={colors.muted} size={22} />
        </TouchableOpacity>
        <Text style={[typeScale.title, { color: colors.ink }]}>{t('Résultats', 'Rezilta')}</Text>
      </View>

      {/* Celebration burst for a passing result (skipped under reduce-motion) */}
      {Math.round(percentage) >= 70 && <Confetti />}

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Score — Aurora Depth hero */}
        <View style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 22, overflow: 'hidden', shadowColor: '#0A1F52', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 8 }}>
          <LinearGradient colors={['#2E6FE6', '#123A86', '#0A1F52']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: -50, left: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: '#3B82F6', opacity: 0.3 }} />
            <View pointerEvents="none" style={{ position: 'absolute', bottom: -40, right: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: '#7C3AED', opacity: 0.28 }} />
            <ScoreGauge percentage={Math.round(percentage)} onDark />
            <View style={{ paddingHorizontal: 24, paddingBottom: 22 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={{ height: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
                <View style={{ height: 8, borderRadius: 99, width: `${Math.round(percentage)}%`, backgroundColor: '#ffffff' }} />
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Share the score — doubles as a referral invite. */}
        <Button
          onPress={() => shareScore({
            title: t('Bac blanc', 'Bak blan'),
            score: Math.round(percentage),
            asPercent: true,
            lang: isCreole ? 'ht' : 'fr',
          })}
          variant="success"
          size="lg"
          fullWidth
          icon={<Share2 color="#fff" size={18} />}
          accessibilityLabel={t('Partager mon score', 'Pataje nòt mwen')}
          label={t('Partager mon score', 'Pataje nòt mwen')}
          style={{ marginHorizontal: 16, marginTop: 20 }}
        />

        {/* Stats */}
        <View className="flex-row gap-3 mx-4 mt-4">
          {[
            { label: t('Correctes', 'Kòrèk'), value: String(correct), icon: <CheckCircle2 color={colors.success} size={20} />, color: colors.success },
            { label: t('Incorrectes', 'Pa kòrèk'), value: String(incorrect), icon: <XCircle color={colors.danger} size={20} />, color: colors.danger },
            { label: t('Score', 'Nòt'), value: maxScore > 0 ? `${scored}/${maxScore}` : `${Math.round(percentage)}%`, icon: <Trophy color={colors.warn} size={20} />, color: colors.warn },
          ].map((stat) => (
            <View
              key={stat.label}
              accessible
              accessibilityLabel={`${stat.label}: ${stat.value}`}
              style={[cardSurface, { flex: 1, padding: 12, alignItems: 'center', gap: 4 }]}
            >
              {stat.icon}
              <Text maxFontSizeMultiplier={1.3} style={[typeScale.h2, { color: colors.ink }]}>{stat.value}</Text>
              <Text style={[typeScale.caption, { color: colors.muted, textAlign: 'center' }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Mastery by section */}
        {questions.length > 0 && (() => {
          const mastery = computeMastery(questions, answers, gradedResults);
          if (mastery.length <= 1) return null;
          return (
            <View style={[cardSurface, { marginHorizontal: 16, marginTop: 16, padding: 16 }]}>
              <Text style={[typeScale.titleSm, { color: colors.ink, marginBottom: 14 }]}>{t('Par section', 'Dapre seksyon')}</Text>
              {mastery.map((m) => (
                <MasteryBar key={m.section} section={m.section} pct={m.pct} correct={m.correct} total={m.total} />
              ))}
            </View>
          );
        })()}

        {/* Exam info */}
        {result && (
          <View style={[cardSurface, { marginHorizontal: 16, marginTop: 16, padding: 16 }]}>
            <Text style={[typeScale.title, { color: colors.ink, marginBottom: 4 }]} numberOfLines={2}>{result.title ?? t('Examen', 'Egzamen')}</Text>
            {result.subject && <Text style={[typeScale.body, { color: colors.muted }]}>{t('Matière', 'Matyè')} : {result.subject}</Text>}
            {result.level && <Text style={[typeScale.body, { color: colors.muted }]}>{t('Niveau', 'Nivo')} : {result.level}</Text>}
          </View>
        )}

        {/* Question review */}
        {questions.length > 0 && (
          <View className="mx-4 mt-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text style={[typeScale.title, { color: colors.ink }]}>{t('Revue des questions', 'Revi kesyon yo')}</Text>
              <Text style={[typeScale.caption, { color: colors.faint }]}>{questions.length} {t('questions', 'kesyon')}</Text>
            </View>

            {/* Filter tabs */}
            <View className="flex-row rounded-xl p-1 mb-4" style={{ backgroundColor: colors.surfaceAlt }}>
              {([['all', t('Toutes', 'Tout')], ['wrong', t('À revoir', 'Pou revize')], ['correct', t('Réussies', 'Reyisi')]] as const).map(([val, label]) => (
                <PressableScale
                  key={val}
                  onPress={() => setReviewFilter(val)}
                  pressedScale={0.97}
                  haptic={false}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reviewFilter === val }}
                  accessibilityLabel={label}
                  className={`flex-1 py-2 rounded-lg items-center`}
                  style={reviewFilter === val ? { backgroundColor: colors.surface, ...shadow.sm } : {}}
                >
                  <Text style={[typeScale.label, { color: reviewFilter === val ? colors.ink : colors.muted, fontFamily: 'Satoshi-Bold' }]}>{label}</Text>
                </PressableScale>
              ))}
            </View>

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
                  />
                );
              })
            )}
          </View>
        )}

        {/* Actions */}
        <View className="px-4 mt-6 gap-3">
          <Button
            onPress={() => { tapMedium(); navigation.replace('ExamTake', { level, examId }); }}
            variant="primary"
            size="lg"
            fullWidth
            icon={<RefreshCw color="#fff" size={18} />}
            accessibilityLabel={t('Recommencer', 'Rekòmanse')}
            label={t('Recommencer', 'Rekòmanse')}
          />
          <Button
            onPress={() => { tapLight(); navigation.navigate('ExamBrowser', { level }); }}
            variant="ghost"
            size="lg"
            fullWidth
            accessibilityLabel={t("Voir d'autres examens", 'Wè lòt egzamen')}
            label={t("Voir d'autres examens", 'Wè lòt egzamen')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
