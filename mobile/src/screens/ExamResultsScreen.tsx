import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CheckCircle2, XCircle, Trophy, RefreshCw, ArrowLeft, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react-native';
import { loadExamResult } from '../services/examResults';
import { fetchSingleExam } from '../utils/examCatalog';
import { flattenQuestions } from '../utils/examUtils';
import useStore from '../contexts/store';
import { useColors, useTheme } from '../theme/theme';
import { LoadingState } from '../components/StateViews';
import ProgressBar from '../components/ProgressBar';
import MathText from '../components/MathText';
import { ExamsParamList } from '../navigation/ExamsNavigator';

type Route = RouteProp<ExamsParamList, 'ExamResults'>;
type Nav = NativeStackNavigationProp<ExamsParamList, 'ExamResults'>;

function ScoreGauge({ percentage }: { percentage: number }) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const color = percentage >= 70 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444';

  // Count the score up from 0 on mount (easeOutCubic over ~0.8s).
  const [display, setDisplay] = useState(0);
  useEffect(() => {
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
  }, [percentage]);

  return (
    <View className="items-center py-8">
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Trophy color={colors.azure} size={32} />
      </View>
      <Text className="text-5xl font-bold" style={{ color }}>{display}%</Text>
      <Text className="text-gray-500 dark:text-slate-400 mt-1">
        {percentage >= 70 ? t('Excellent !', 'Ekselan !') : percentage >= 50 ? t('Bien essayé !', 'Byen eseye !') : t('Continue à réviser !', 'Kontinye revize !')}
      </Text>
    </View>
  );
}

function QuestionReviewItem({ question, index, answer }: { question: any; index: number; answer: any }) {
  const language = useStore((s) => s.language);
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [expanded, setExpanded] = useState(false);
  const correctAnswer = question.correct_answer ?? question.answer ?? question.solution;
  const given = answer?.given ?? answer;
  const isCorrect = given != null && given !== '' && String(given).toLowerCase() === String(correctAnswer ?? '').toLowerCase();
  const isUnanswered = given == null || given === '';

  return (
    <TouchableOpacity
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
      className="rounded-xl mb-2 overflow-hidden"
      style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <View className="flex-row items-center px-4 py-3 gap-3">
        {isUnanswered
          ? <View className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-slate-600" />
          : isCorrect
            ? <CheckCircle2 color="#10b981" size={20} />
            : <XCircle color="#ef4444" size={20} />}
        <Text className="text-xs font-semibold text-gray-500 dark:text-slate-400 w-6">Q{index + 1}</Text>
        <Text className="flex-1 text-sm text-gray-800 dark:text-slate-200 font-medium" numberOfLines={expanded ? undefined : 2}>
          {question._displayText ?? question.question ?? ''}
        </Text>
        {expanded
          ? <ChevronDown color={colors.faint} size={16} />
          : <ChevronRightIcon color={colors.faint} size={16} />}
      </View>
      {expanded && (
        <View className="px-4 pb-3 gap-2">
          <View className="h-px bg-gray-200 dark:bg-slate-700 mb-1" />
          <View className="flex-row gap-2">
            <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500 w-20">{t('Votre réponse', 'Repons ou')}</Text>
            <Text className="flex-1 text-xs font-medium" style={{ color: isUnanswered ? colors.faint : isCorrect ? '#10b981' : '#ef4444' }}>
              {isUnanswered ? t('Sans réponse', 'San repons') : String(given)}
            </Text>
          </View>
          {!isCorrect && correctAnswer != null && (
            <View className="flex-row gap-2">
              <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500 w-20">{t('Bonne réponse', 'Bon repons')}</Text>
              <Text className="flex-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{String(correctAnswer)}</Text>
            </View>
          )}
          {question.explanation && (
            <View className="mt-1 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <Text className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">{question.explanation}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function computeMastery(questions: any[], answers: Record<string, any>) {
  const groups: Record<string, { correct: number; total: number }> = {};
  questions.forEach((q, i) => {
    const section = q.sectionTitle || q.section || 'Général';
    if (!groups[section]) groups[section] = { correct: 0, total: 0 };
    groups[section].total++;
    const given = answers[i]?.given ?? answers[i];
    const correctAnswer = q.correct_answer ?? q.answer ?? q.solution;
    const isCorrect = given != null && given !== '' && String(given).toLowerCase() === String(correctAnswer ?? '').toLowerCase();
    if (isCorrect) groups[section].correct++;
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
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.muted, flex: 1 }} numberOfLines={1}>{section === 'Général' ? t('Général', 'Jeneral') : section}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', marginLeft: 8, color }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.hairline, borderRadius: 99, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as any, height: 6, backgroundColor: color, borderRadius: 99 }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.faint, marginTop: 3 }}>{correct}/{total} {t('correctes', 'kòrèk')}</Text>
    </View>
  );
}

export default function ExamResultsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { level, examId } = route.params;
  const { user, incrementGuestInteraction, language } = useStore();
  const colors = useColors();
  const { cardSurface } = useTheme();
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
  }, [user?.uid, examId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingState message={t('Chargement des résultats…', 'Ap chaje rezilta yo…')} />;

  const summary = result?.summary ?? {};
  const percentage = summary.percentage ?? result?.percentage ?? 0;
  const correct = summary.correct ?? 0;
  const total = summary.total ?? 0;
  const scored = summary.scored ?? 0;
  const maxScore = summary.maxScore ?? 0;
  const answers = result?.answers ?? {};

  const filteredQuestions = questions.filter((q, i) => {
    if (reviewFilter === 'all') return true;
    const given = answers[i]?.given ?? answers[i];
    const correctAnswer = q.correct_answer ?? q.answer ?? q.solution;
    const isCorrect = given != null && given !== '' && String(given).toLowerCase() === String(correctAnswer ?? '').toLowerCase();
    return reviewFilter === 'correct' ? isCorrect : !isCorrect;
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Header — shares the page background (no white-bar seam) */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.bg }}>
        <TouchableOpacity
          onPress={() => navigation.popToTop()}
          className="p-1 mr-3"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
        >
          <ArrowLeft color={colors.muted} size={22} />
        </TouchableOpacity>
        <Text className="font-bold text-gray-900 dark:text-slate-100 text-base">{t('Résultats', 'Rezilta')}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Score */}
        <View style={[cardSurface, { marginHorizontal: 16, marginTop: 16, overflow: 'hidden' }]}>
          <ScoreGauge percentage={Math.round(percentage)} />
          <View className="px-6 pb-6">
            <ProgressBar
              value={Math.round(percentage)}
              color={percentage >= 70 ? '#10b981' : percentage >= 50 ? '#f59e0b' : '#ef4444'}
              height={8}
              showLabel
            />
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mx-4 mt-4">
          {[
            { label: t('Correctes', 'Kòrèk'), value: String(correct), icon: <CheckCircle2 color="#10b981" size={20} />, color: '#10b981' },
            { label: t('Incorrectes', 'Pa kòrèk'), value: String(total - correct), icon: <XCircle color="#ef4444" size={20} />, color: '#ef4444' },
            { label: t('Score', 'Nòt'), value: maxScore > 0 ? `${scored}/${maxScore}` : `${Math.round(percentage)}%`, icon: <Trophy color="#f59e0b" size={20} />, color: '#f59e0b' },
          ].map((stat) => (
            <View key={stat.label} style={[cardSurface, { flex: 1, padding: 12, alignItems: 'center', gap: 4 }]}>
              {stat.icon}
              <Text className="text-lg font-bold text-gray-900 dark:text-slate-100">{stat.value}</Text>
              <Text className="text-xs text-gray-500 dark:text-slate-400 text-center">{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Mastery by section */}
        {questions.length > 0 && (() => {
          const mastery = computeMastery(questions, answers);
          if (mastery.length <= 1) return null;
          return (
            <View style={[cardSurface, { marginHorizontal: 16, marginTop: 16, padding: 16 }]}>
              <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 15, marginBottom: 14 }}>{t('Par section', 'Dapre seksyon')}</Text>
              {mastery.map((m) => (
                <MasteryBar key={m.section} section={m.section} pct={m.pct} correct={m.correct} total={m.total} />
              ))}
            </View>
          );
        })()}

        {/* Exam info */}
        {result && (
          <View style={[cardSurface, { marginHorizontal: 16, marginTop: 16, padding: 16 }]}>
            <Text className="font-semibold text-gray-900 dark:text-slate-100 mb-1" numberOfLines={2}>{result.title ?? t('Examen', 'Egzamen')}</Text>
            {result.subject && <Text className="text-sm text-gray-500 dark:text-slate-400">{t('Matière', 'Matyè')} : {result.subject}</Text>}
            {result.level && <Text className="text-sm text-gray-500 dark:text-slate-400">{t('Niveau', 'Nivo')} : {result.level}</Text>}
          </View>
        )}

        {/* Question review */}
        {questions.length > 0 && (
          <View className="mx-4 mt-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-gray-900 dark:text-slate-100">{t('Revue des questions', 'Revi kesyon yo')}</Text>
              <Text className="text-xs text-gray-400 dark:text-slate-500">{questions.length} {t('questions', 'kesyon')}</Text>
            </View>

            {/* Filter tabs */}
            <View className="flex-row bg-gray-100 dark:bg-slate-800 rounded-xl p-1 mb-4">
              {([['all', t('Toutes', 'Tout')], ['wrong', t('À revoir', 'Pou revize')], ['correct', t('Réussies', 'Reyisi')]] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setReviewFilter(val)}
                  className={`flex-1 py-2 rounded-lg items-center`}
                  style={reviewFilter === val ? { backgroundColor: colors.surface, shadowColor: colors.azureDeep, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 } : {}}
                >
                  <Text className={`text-xs font-semibold ${reviewFilter === val ? 'text-gray-900 dark:text-slate-100' : 'text-gray-500 dark:text-slate-400'}`}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {filteredQuestions.length === 0 ? (
              <View className="items-center py-6">
                <Text className="text-gray-400 dark:text-slate-500 text-sm">{t('Aucune question dans ce filtre.', 'Pa gen kesyon nan filt sa a.')}</Text>
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
                  />
                );
              })
            )}
          </View>
        )}

        {/* Actions */}
        <View className="px-4 mt-6 gap-3">
          <TouchableOpacity
            onPress={() => navigation.replace('ExamTake', { level, examId })}
            className="flex-row items-center justify-center gap-2 bg-primary-600 py-4 rounded-2xl"
          >
            <RefreshCw color="#fff" size={18} />
            <Text className="text-white font-bold text-base">{t('Recommencer', 'Rekòmanse')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('ExamBrowser', { level })}
            className="flex-row items-center justify-center gap-2 border border-gray-300 dark:border-slate-700 py-4 rounded-2xl bg-white dark:bg-[#131c2e]"
          >
            <Text className="text-gray-700 dark:text-slate-300 font-semibold text-base">{t("Voir d'autres examens", 'Wè lòt egzamen')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
