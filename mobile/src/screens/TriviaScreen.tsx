import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Zap, Flame, Check, X, RefreshCw, ChevronRight, Trophy } from 'lucide-react-native';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { addWeeklyXp } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { getFirstName } from '../utils/shared';
import MathText from '../components/MathText';

// ─── Types ───────────────────────────────────────────────────────────────────

type TriviaPhase = 'categories' | 'roundPicker' | 'playing' | 'results';

interface PreparedQuestion {
  q: string;
  qHt: string;
  options: string[];
  correctAnswer: string;
  flag?: string;
  explanation?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Prepare questions for a round.
 * Raw question shape: { q, qHt, options: string[], answer: number (index), flag?, explanation? }
 * count=0 → use all questions.
 */
function prepareQuestions(categoryId: string, count: number): PreparedQuestion[] {
  const raw: any[] = TRIVIA_QUESTIONS[categoryId] ?? [];
  const pool = shuffle(raw).slice(0, count === 0 ? raw.length : count);
  return pool.map((q: any) => {
    const correctAnswer: string = q.options[q.answer];
    // Re-shuffle options so the correct answer appears at a random position
    const options = shuffle([...q.options]);
    return {
      q: q.q,
      qHt: q.qHt ?? q.q,
      options,
      correctAnswer,
      flag: q.flag ?? null,
      explanation: q.explanation ?? null,
    };
  });
}

const LETTER_LABELS = ['A', 'B', 'C', 'D'];
const CIRC = 327; // 2 * π * 52

// ─── TriviaHeader ─────────────────────────────────────────────────────────────

function TriviaHeader() {
  const { profile, level } = useTrivia();
  const { streak } = useStreak();

  return (
    <View className="flex-row items-center bg-white border-b border-gray-100 px-4 gap-3" style={{ height: 44 }}>
      {/* XP section */}
      <Zap color="#f59e0b" size={16} />
      <View className="flex-1 flex-row items-center gap-2">
        <Text className="text-xs font-bold text-amber-500 w-10">
          {profile?.xp ?? 0} XP
        </Text>
        {/* Level progress bar */}
        <View className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <View
            className="h-2 bg-amber-400 rounded-full"
            style={{ width: `${Math.min(100, (level?.progress ?? 0) * 100)}%` }}
          />
        </View>
        <Text className="text-xs text-gray-400 font-semibold">
          Niv.{level?.level ?? 1}
        </Text>
      </View>

      {/* Streak section */}
      <View className="flex-row items-center gap-1">
        <Flame color="#ef4444" size={16} />
        <Text className="text-sm font-bold text-red-500">{streak?.currentStreak ?? 0}</Text>
        <Text className="text-xs text-gray-400 ml-0.5">jours</Text>
      </View>
    </View>
  );
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────

function CategoryPicker({
  onSelect,
  isCreole,
}: {
  onSelect: (id: string) => void;
  isCreole: boolean;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-gray-900">
          {isCreole ? 'Jèt Trivia' : 'Trivia Games'}
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          {isCreole ? 'Chwazi yon kategori' : 'Choisissez une catégorie'}
        </Text>
      </View>

      <View className="px-4 gap-3">
        {TRIVIA_CATEGORIES.map((cat: any) => {
          const questionCount = TRIVIA_QUESTIONS[cat.id]?.length ?? 0;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => onSelect(cat.id)}
              activeOpacity={0.82}
              className="bg-white rounded-2xl overflow-hidden"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              {/* Colored top accent bar */}
              <View style={{ height: 4, backgroundColor: cat.color }} />

              <View className="p-4 flex-row items-center gap-3">
                {/* Icon badge */}
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center"
                  style={{ backgroundColor: cat.color + '22' }}
                >
                  <Text style={{ fontSize: 24 }}>{cat.icon ?? '🎯'}</Text>
                </View>

                {/* Text block */}
                <View className="flex-1">
                  <Text className="font-bold text-gray-900 text-base leading-tight">
                    {isCreole ? (cat.nameHt ?? cat.name) : cat.name}
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5 leading-tight" numberOfLines={2}>
                    {isCreole ? (cat.descriptionHt ?? cat.description) : cat.description}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-1">
                    {questionCount} question{questionCount !== 1 ? 's' : ''}
                  </Text>
                </View>

                <ChevronRight color="#9ca3af" size={18} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── RoundPicker ──────────────────────────────────────────────────────────────

const ROUND_OPTIONS = [
  { count: 10,  label: '10 questions',   time: '~2 min',  desc: 'Rapide' },
  { count: 25,  label: '25 questions',   time: '~5 min',  desc: 'Standard' },
  { count: 50,  label: '50 questions',   time: '~10 min', desc: 'Long' },
  { count: 0,   label: 'Tout',           time: 'Complet', desc: 'Toutes les questions' },
];

function RoundPicker({
  category,
  onPick,
  onBack,
  isCreole,
}: {
  category: any;
  onPick: (count: number) => void;
  onBack: () => void;
  isCreole: boolean;
}) {
  const totalQuestions = TRIVIA_QUESTIONS[category.id]?.length ?? 0;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Mini header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={onBack} className="p-1 mr-3">
          <X color="#374151" size={22} />
        </TouchableOpacity>
        <View
          className="w-8 h-8 rounded-lg items-center justify-center mr-2"
          style={{ backgroundColor: category.color + '22' }}
        >
          <Text style={{ fontSize: 16 }}>{category.icon}</Text>
        </View>
        <Text className="font-bold text-gray-900 flex-1" numberOfLines={1}>
          {isCreole ? (category.nameHt ?? category.name) : category.name}
        </Text>
      </View>

      <View className="px-4 pt-6 pb-3">
        <Text className="text-xl font-bold text-gray-900">
          {isCreole ? 'Konbyen kesyon ?' : 'Combien de questions ?'}
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          {totalQuestions} questions disponibles
        </Text>
      </View>

      <View className="px-4 gap-3">
        {ROUND_OPTIONS.map((opt) => {
          const actualCount = opt.count === 0 ? totalQuestions : Math.min(opt.count, totalQuestions);
          const disabled = actualCount === 0;
          return (
            <TouchableOpacity
              key={opt.count}
              onPress={() => !disabled && onPick(opt.count)}
              disabled={disabled}
              activeOpacity={0.82}
              className="bg-white rounded-2xl px-5 py-4 flex-row items-center"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 1,
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <View className="flex-1">
                <Text className="font-bold text-gray-900 text-lg">
                  {opt.count === 0 ? `Tout (${totalQuestions})` : opt.label}
                </Text>
                <Text className="text-sm text-gray-500 mt-0.5">{opt.desc}</Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-amber-500">{opt.time}</Text>
                <ChevronRight color="#d1d5db" size={16} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── TriviaQuiz ───────────────────────────────────────────────────────────────

function TimerRing({ timeLeft }: { timeLeft: number }) {
  const progress = timeLeft / 15;
  const fill = progress * CIRC;

  const color = timeLeft > 8 ? '#10b981' : timeLeft > 5 ? '#f59e0b' : '#ef4444';

  return (
    <Svg width={52} height={52} viewBox="0 0 120 120">
      {/* Track */}
      <Circle
        cx={60}
        cy={60}
        r={52}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={10}
      />
      {/* Countdown arc — starts at top (rotation -90) */}
      <Circle
        cx={60}
        cy={60}
        r={52}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeDasharray={`${fill} ${CIRC}`}
        strokeLinecap="round"
        rotation="-90"
        origin="60, 60"
      />
    </Svg>
  );
}

function QuizPlayer({
  questions,
  category,
  isCreole,
  onFinish,
}: {
  questions: PreparedQuestion[];
  category: any;
  isCreole: boolean;
  onFinish: (score: number, total: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const q = questions[idx];
  const isCorrect = confirmed && selected === q?.correctAnswer;

  // --- Timer ---
  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const confirmAnswer = useCallback(
    (currentSelected: string | null, currentScore: number) => {
      stopTimer();
      setConfirmed(true);
      if (currentSelected === questions[idx]?.correctAnswer) {
        setScore(currentScore + 1);
      }
    },
    [idx, questions, stopTimer],
  );

  // Reset timer whenever the question changes
  useEffect(() => {
    setTimeLeft(15);
    setSelected(null);
    setConfirmed(false);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up — auto-confirm (with whatever is currently selected)
          // We use a ref pattern to read latest selected inside interval
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return stopTimer;
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for timer reaching 0 and auto-confirm
  useEffect(() => {
    if (timeLeft === 0 && !confirmed) {
      // Read selected via state updater to get latest value
      setSelected((currentSelected) => {
        setConfirmed(true);
        if (currentSelected !== null && currentSelected === questions[idx]?.correctAnswer) {
          setScore((s) => s + 1);
        }
        return currentSelected;
      });
      stopTimer();
    }
  }, [timeLeft, confirmed, idx, questions, stopTimer]);

  const handleSelect = (opt: string) => {
    if (!confirmed) setSelected(opt);
  };

  const handleConfirm = () => {
    if (confirmed) return;
    stopTimer();
    setConfirmed(true);
    if (selected === q.correctAnswer) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    const newScore = confirmed && selected === q.correctAnswer ? score : score;
    if (idx + 1 >= questions.length) {
      onFinish(newScore, questions.length);
    } else {
      setIdx((i) => i + 1);
    }
  };

  if (!q) return null;

  const questionText = isCreole ? q.qHt : q.q;

  return (
    <View className="flex-1 bg-gray-50">
      {/* Top bar: nav circles + score badge */}
      <View className="bg-white border-b border-gray-100 px-4 py-2">
        <View className="flex-row items-center gap-2">
          {/* Scrollable question nav */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ gap: 6, paddingRight: 8 }}
          >
            {questions.map((_, i) => {
              const isAnswered = i < idx;
              const isCurrent = i === idx;
              return (
                <View
                  key={i}
                  className="w-6 h-6 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: isCurrent
                      ? '#3b82f6'
                      : isAnswered
                      ? '#10b981'
                      : '#e5e7eb',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '700',
                      color: isCurrent || isAnswered ? '#fff' : '#9ca3af',
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Star score badge */}
          <View className="flex-row items-center bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 gap-1">
            <Text style={{ fontSize: 13 }}>⭐</Text>
            <Text className="text-amber-600 font-bold text-sm">{score}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View className="h-1 bg-gray-100 rounded-full mt-2 overflow-hidden">
          <View
            className="h-1 rounded-full"
            style={{
              width: `${((idx + 1) / questions.length) * 100}%`,
              backgroundColor: category.color,
            }}
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Timer + question number */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm text-gray-400 font-semibold">
            {idx + 1} / {questions.length}
          </Text>

          {/* SVG ring timer */}
          <View className="items-center justify-center" style={{ width: 52, height: 52 }}>
            <TimerRing timeLeft={timeLeft} />
            {/* Number overlay */}
            <View className="absolute items-center justify-center">
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: timeLeft > 8 ? '#10b981' : timeLeft > 5 ? '#f59e0b' : '#ef4444',
                }}
              >
                {timeLeft}
              </Text>
            </View>
          </View>
        </View>

        {/* Flag (for flags category) */}
        {q.flag != null && (
          <View className="items-center mb-4">
            <Text style={{ fontSize: 64 }}>{q.flag}</Text>
          </View>
        )}

        {/* Question card */}
        <View
          className="bg-white rounded-2xl p-5 mb-5"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <MathText text={questionText} />
        </View>

        {/* Answer options */}
        <View className="gap-3">
          {q.options.map((opt, i) => {
            const label = LETTER_LABELS[i] ?? String(i + 1);
            const isSelected = opt === selected;
            const isCorrectOpt = opt === q.correctAnswer;

            let borderColor = '#e5e7eb';
            let bgColor = '#fff';
            let labelBg = '#f3f4f6';
            let labelText = '#6b7280';
            let textColor = '#111827';

            if (confirmed) {
              if (isCorrectOpt) {
                borderColor = '#10b981';
                bgColor = '#f0fdf4';
                labelBg = '#10b981';
                labelText = '#fff';
              } else if (isSelected) {
                borderColor = '#ef4444';
                bgColor = '#fef2f2';
                labelBg = '#ef4444';
                labelText = '#fff';
              }
            } else if (isSelected) {
              borderColor = '#f59e0b';
              bgColor = '#fffbeb';
              labelBg = '#f59e0b';
              labelText = '#fff';
            }

            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleSelect(opt)}
                disabled={confirmed}
                activeOpacity={0.8}
                className="flex-row items-center rounded-xl overflow-hidden"
                style={{
                  borderWidth: 2,
                  borderColor,
                  backgroundColor: bgColor,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 2,
                  elevation: 1,
                }}
              >
                {/* Letter badge */}
                <View
                  className="w-10 h-10 items-center justify-center m-2 rounded-lg"
                  style={{ backgroundColor: labelBg }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: labelText }}>
                    {label}
                  </Text>
                </View>

                <Text
                  className="flex-1 text-sm font-medium pr-3"
                  style={{ color: textColor, lineHeight: 20 }}
                >
                  {opt}
                </Text>

                {/* Check/X icon when confirmed */}
                {confirmed && isCorrectOpt && (
                  <View className="pr-3">
                    <Check color="#10b981" size={18} />
                  </View>
                )}
                {confirmed && isSelected && !isCorrectOpt && (
                  <View className="pr-3">
                    <X color="#ef4444" size={18} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Feedback panel */}
        {confirmed && (
          <View
            className="mt-4 bg-white rounded-xl p-4"
            style={{
              borderLeftWidth: 4,
              borderLeftColor: isCorrect ? '#10b981' : '#ef4444',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 1,
            }}
          >
            <View className="flex-row items-center gap-2 mb-1">
              {isCorrect ? (
                <Check color="#10b981" size={18} />
              ) : (
                <X color="#ef4444" size={18} />
              )}
              <Text
                className="font-bold text-base"
                style={{ color: isCorrect ? '#059669' : '#dc2626' }}
              >
                {isCorrect ? 'Correct !' : 'Incorrect'}
              </Text>
            </View>

            {!isCorrect && (
              <Text className="text-sm text-gray-600 mt-1">
                Bonne réponse :{' '}
                <Text className="font-semibold text-emerald-700">{q.correctAnswer}</Text>
              </Text>
            )}

            {q.explanation ? (
              <Text className="text-sm text-gray-500 mt-2 leading-5">{q.explanation}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Action button */}
      <View className="px-4 pb-5 pt-3 bg-white border-t border-gray-100">
        {!confirmed ? (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!selected}
            activeOpacity={0.85}
            className="py-4 rounded-2xl items-center"
            style={{ backgroundColor: selected ? '#f59e0b' : '#e5e7eb' }}
          >
            <Text
              className="font-bold text-base"
              style={{ color: selected ? '#fff' : '#9ca3af' }}
            >
              {isCreole ? 'Konfime' : 'Confirmer'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.85}
            className="py-4 rounded-2xl items-center"
            style={{ backgroundColor: category.color }}
          >
            <Text className="text-white font-bold text-base">
              {idx + 1 >= questions.length
                ? isCreole
                  ? 'Wè rezilta yo'
                  : 'Voir les résultats'
                : isCreole
                ? 'Swivan →'
                : 'Suivant →'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── TriviaResults ─────────────────────────────────────────────────────────────

function ScoreRing({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? score / total : 0;
  const fill = pct * CIRC;
  const color = pct >= 0.8 ? '#10b981' : pct >= 0.6 ? '#f59e0b' : '#ef4444';

  return (
    <View className="items-center justify-center" style={{ width: 140, height: 140 }}>
      <Svg width={140} height={140} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <Circle
          cx={60}
          cy={60}
          r={52}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${fill} ${CIRC}`}
          strokeLinecap="round"
          rotation="-90"
          origin="60, 60"
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>
          {score}/{total}
        </Text>
        <Text style={{ fontSize: 13, color, fontWeight: '700' }}>
          {total > 0 ? Math.round(pct * 100) : 0}%
        </Text>
      </View>
    </View>
  );
}

function TriviaResults({
  score,
  total,
  category,
  onRetry,
  onChooseCategory,
  isCreole,
}: {
  score: number;
  total: number;
  category: any;
  onRetry: () => void;
  onChooseCategory: () => void;
  isCreole: boolean;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const xpEarned = score * 10;
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '⭐' : '💪';

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ alignItems: 'center', padding: 24, paddingTop: 40, paddingBottom: 48 }}
    >
      <Text style={{ fontSize: 48, marginBottom: 16 }}>{emoji}</Text>

      <ScoreRing score={score} total={total} />

      <Text className="text-2xl font-bold text-gray-900 mt-6 mb-1">
        {pct >= 80
          ? isCreole ? 'Ekselan !' : 'Excellent !'
          : pct >= 60
          ? isCreole ? 'Bon travay !' : 'Bon travail !'
          : isCreole ? 'Kontinye pratike !' : 'Continue à pratiquer !'}
      </Text>

      {/* XP earned badge */}
      <View className="flex-row items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-2 mt-3 mb-8">
        <Zap color="#f59e0b" size={16} />
        <Text className="text-amber-600 font-bold text-sm">
          +{xpEarned} XP {isCreole ? 'ou genyen' : 'gagnés'}
        </Text>
      </View>

      {/* Category tag */}
      <View
        className="flex-row items-center gap-2 rounded-xl px-4 py-2 mb-8"
        style={{ backgroundColor: category.color + '18' }}
      >
        <Text style={{ fontSize: 18 }}>{category.icon}</Text>
        <Text className="font-semibold text-sm" style={{ color: category.color }}>
          {isCreole ? (category.nameHt ?? category.name) : category.name}
        </Text>
      </View>

      {/* Buttons */}
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.85}
        className="w-full flex-row items-center justify-center gap-2 py-4 rounded-2xl mb-3 bg-amber-500"
      >
        <RefreshCw color="#fff" size={18} />
        <Text className="text-white font-bold text-base">
          {isCreole ? 'Jwe ankò' : 'Rejouer'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onChooseCategory}
        activeOpacity={0.85}
        className="w-full items-center justify-center py-4 rounded-2xl border border-gray-300 bg-white"
      >
        <Text className="text-gray-700 font-semibold text-base">
          {isCreole ? 'Chwazi yon kategori' : 'Choisir une catégorie'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Main TriviaScreen ────────────────────────────────────────────────────────

export default function TriviaScreen() {
  const { user, language, incrementGuestInteraction } = useStore();
  const isCreole = language === 'ht';

  const { level } = useTrivia();
  const { recordActivity } = useStreak();

  const [phase, setPhase] = useState<TriviaPhase>('categories');
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [roundSize, setRoundSize] = useState(10);
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });

  // Start from category selection
  const handleSelectCategory = useCallback((categoryId: string) => {
    const cat = TRIVIA_CATEGORIES.find((c: any) => c.id === categoryId);
    setSelectedCategory(cat ?? null);
    setPhase('roundPicker');
  }, []);

  // Start the actual quiz after picking round size
  const handlePickRound = useCallback(
    (count: number) => {
      if (!selectedCategory) return;
      const qs = prepareQuestions(selectedCategory.id, count);
      setQuestions(qs);
      setRoundSize(count);
      setPhase('playing');
    },
    [selectedCategory],
  );

  // Called when QuizPlayer completes all questions
  const handleGameFinish = useCallback(
    (score: number, total: number) => {
      setFinalScore({ score, total });
      setPhase('results');
      incrementGuestInteraction();

      // Record streak activity
      recordActivity().catch(console.warn);

      // Add XP to weekly leaderboard
      const xp = score * 10;
      if (user?.uid && xp > 0) {
        addWeeklyXp(user.uid, xp, {
          displayName: getFirstName(user),
          level: level?.level,
        }).catch(console.warn);
      }
    },
    [recordActivity, user, level, incrementGuestInteraction],
  );

  // "Rejouer" — replay with same category + round size
  const handleRetry = useCallback(() => {
    if (!selectedCategory) {
      setPhase('categories');
      return;
    }
    const qs = prepareQuestions(selectedCategory.id, roundSize);
    setQuestions(qs);
    setPhase('playing');
  }, [selectedCategory, roundSize]);

  const handleChooseCategory = useCallback(() => {
    setPhase('categories');
    setSelectedCategory(null);
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Persistent XP + streak header */}
      <TriviaHeader />

      {/* Phase router */}
      {phase === 'categories' && (
        <CategoryPicker onSelect={handleSelectCategory} isCreole={isCreole} />
      )}

      {phase === 'roundPicker' && selectedCategory && (
        <RoundPicker
          category={selectedCategory}
          onPick={handlePickRound}
          onBack={() => setPhase('categories')}
          isCreole={isCreole}
        />
      )}

      {phase === 'playing' && selectedCategory && questions.length > 0 && (
        <View className="flex-1">
          {/* In-game nav bar */}
          <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
            <TouchableOpacity
              onPress={() => setPhase('categories')}
              className="p-1 mr-3"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X color="#374151" size={22} />
            </TouchableOpacity>
            <View
              className="w-7 h-7 rounded-lg items-center justify-center mr-2"
              style={{ backgroundColor: selectedCategory.color + '22' }}
            >
              <Text style={{ fontSize: 14 }}>{selectedCategory.icon}</Text>
            </View>
            <Text className="font-bold text-gray-900 flex-1" numberOfLines={1}>
              {isCreole
                ? (selectedCategory.nameHt ?? selectedCategory.name)
                : selectedCategory.name}
            </Text>
            <Trophy color="#f59e0b" size={18} />
          </View>

          <QuizPlayer
            questions={questions}
            category={selectedCategory}
            isCreole={isCreole}
            onFinish={handleGameFinish}
          />
        </View>
      )}

      {phase === 'results' && selectedCategory && (
        <View className="flex-1">
          {/* Results nav bar */}
          <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
            <Trophy color="#f59e0b" size={18} />
            <Text className="font-bold text-gray-900 ml-2">
              {isCreole ? 'Rezilta' : 'Résultats'}
            </Text>
          </View>

          <TriviaResults
            score={finalScore.score}
            total={finalScore.total}
            category={selectedCategory}
            onRetry={handleRetry}
            onChooseCategory={handleChooseCategory}
            isCreole={isCreole}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
