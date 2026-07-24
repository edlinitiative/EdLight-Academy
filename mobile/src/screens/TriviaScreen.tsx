import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Dimensions, FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, SvgUri } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, useAnimatedStyle, withTiming, withRepeat, withSequence, Easing } from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Zap, Flame, Check, X, RefreshCw, ChevronRight, Trophy } from 'lucide-react-native';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { todayStr } from '../services/streakService';
import { getWeeklyTop } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import MathText from '../components/MathText';
import { useColors } from '../theme/theme';
import { success, warn, select, tapMedium, tapLight } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import Confetti from '../components/ui/Confetti';
import PopIn from '../components/ui/PopIn';
import { notifyLeaderboardRank } from '../services/notificationService';
import JeuxHub from '../components/games/JeuxHub';
import DailyChallengeBanner from '../components/games/DailyChallengeBanner';
import VraiFauxGame from '../components/games/VraiFauxGame';
import MemoireGame from '../components/games/MemoireGame';
import MoKacheGame from '../components/games/MoKacheGame';
import CalculGame from '../components/games/CalculGame';
import SuitesGame from '../components/games/SuitesGame';

// ─── Types ───────────────────────────────────────────────────────────────────

// 'hub' = the Jeux arcade landing; 'arcade' = one of the non-trivia games;
// the remaining phases are the classic trivia flow.
type TriviaPhase = 'hub' | 'arcade' | 'categories' | 'roundPicker' | 'playing' | 'results';

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
  const raw: any[] = (TRIVIA_QUESTIONS as Record<string, any[]>)[categoryId] ?? [];
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

/**
 * Prepare today's Daily Challenge: the same 10 questions for everyone,
 * deterministically drawn across ALL categories (seeded by today's date).
 * Option order is still shuffled per-play — only the question *set* is shared.
 */
function prepareDailyQuestions(count = 10): PreparedQuestion[] {
  const pool = getDailyChallengeQuestions(TRIVIA_QUESTIONS as Record<string, any[]>, todayStr(), count);
  return pool.map((q: any) => {
    const correctAnswer: string = q.options[q.answer];
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
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── TriviaHeader ─────────────────────────────────────────────────────────────

function TriviaHeader() {
  const colors = useColors();
  const { profile, level } = useTrivia();
  const { streak } = useStreak();
  const isCreole = useStore((s) => s.language) === 'ht';
  const reduceMotion = useReduceMotion();

  // Gentle flame flicker so the streak feels alive (skipped for reduce-motion).
  const flame = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || (streak?.currentStreak ?? 0) <= 0) {
      flame.value = 1;
      return;
    }
    flame.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, streak?.currentStreak, flame]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));

  return (
    <View className="flex-row items-center px-4 gap-3" style={{ paddingVertical: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {/* XP section */}
      <Zap color={colors.azure} size={16} />
      <View className="flex-1 flex-row items-center gap-2">
        <Text className="text-xs font-bold w-10" style={{ color: colors.azure }}>
          {profile?.xp ?? 0} XP
        </Text>
        {/* Level progress bar */}
        <View className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
          <View
            className="h-2 rounded-full"
            style={{ width: `${Math.min(100, level?.progressPct ?? 0)}%`, backgroundColor: colors.azure }}
          />
        </View>
        <Text className="text-xs font-semibold" style={{ color: colors.faint }}>
          Niv.{level?.level ?? 1}
        </Text>
      </View>

      {/* Streak section */}
      <View className="flex-row items-center gap-1">
        <Animated.View style={flameStyle}>
          <Flame color="#ef4444" size={16} />
        </Animated.View>
        <Text className="text-sm font-bold text-red-500">{streak?.currentStreak ?? 0}</Text>
        <Text className="text-xs ml-0.5" style={{ color: colors.faint }}>{isCreole ? 'jou' : 'jours'}</Text>
      </View>
    </View>
  );
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────

// Two-column illustrated card grid. Cards share ONE calm neutral treatment
// (clean white surface, soft slate shadow, hairline border); only the SVG
// illustration carries colour — no per-category background tints.
const GRID_PAD = 12; // grid outer horizontal padding
const COL_GAP = 10;  // gutter between the three columns
const TILE_SIZE = Math.floor(
  (Dimensions.get('window').width - GRID_PAD * 2 - COL_GAP * 2) / 3,
);
const ASSET_BASE_URL = 'https://edlight-academy.web.app';

function CategoryPicker({
  onSelect,
  isCreole,
}: {
  onSelect: (id: string) => void;
  isCreole: boolean;
}) {
  const colors = useColors();
  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      data={TRIVIA_CATEGORIES as any[]}
      keyExtractor={(cat: any) => cat.id}
      numColumns={3}
      // gap → column gutters + side padding; the extra marginBottom + the tile's
      // own marginBottom reproduce the original wrapped grid's row spacing.
      columnWrapperStyle={{ gap: COL_GAP, paddingHorizontal: GRID_PAD, marginBottom: COL_GAP }}
      ListHeaderComponent={
        <View className="px-4 pt-4 pb-3">
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            {isCreole ? 'Jwèt Trivia' : 'Jeu Trivia'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
            {isCreole ? 'Chwazi yon kategori' : 'Choisissez une catégorie'}
          </Text>
        </View>
      }
      renderItem={({ item: cat }: { item: any }) => (
        <TouchableOpacity
          onPress={() => onSelect(cat.id)}
          activeOpacity={0.8}
          style={{ width: TILE_SIZE, alignItems: 'center', marginBottom: 6 }}
        >
          {/* Shadow on the outer view; clipped illustration on the inner. */}
          <View
            style={{
              borderRadius: 22,
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <View
              style={{
                width: TILE_SIZE,
                height: TILE_SIZE,
                borderRadius: 22,
                overflow: 'hidden',
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {cat.image ? (
                <SvgUri
                  uri={`${ASSET_BASE_URL}${cat.image}`}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <Text style={{ fontSize: 38 }}>{cat.icon ?? '🎯'}</Text>
              )}
            </View>
          </View>

          {/* Name (reserve 2 lines so tiles align) */}
          <Text
            numberOfLines={2}
            style={{ fontSize: 12, fontWeight: '700', color: colors.ink, textAlign: 'center', marginTop: 8, lineHeight: 15, minHeight: 30, letterSpacing: -0.2 }}
          >
            {isCreole ? (cat.nameHt ?? cat.name) : cat.name}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

// ─── RoundPicker ──────────────────────────────────────────────────────────────

const ROUND_OPTIONS = [
  { count: 10,  label: '10 questions', labelHt: '10 kesyon', time: '~2 min',  timeHt: '~2 min',  desc: 'Rapide',   descHt: 'Rapid' },
  { count: 25,  label: '25 questions', labelHt: '25 kesyon', time: '~5 min',  timeHt: '~5 min',  desc: 'Standard', descHt: 'Estanda' },
  { count: 50,  label: '50 questions', labelHt: '50 kesyon', time: '~10 min', timeHt: '~10 min', desc: 'Long',     descHt: 'Long' },
  { count: 0,   label: 'Tout',         labelHt: 'Tout',      time: 'Complet', timeHt: 'Konplè',  desc: 'Toutes les questions', descHt: 'Tout kesyon yo' },
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
  const colors = useColors();
  const totalQuestions = (TRIVIA_QUESTIONS as Record<string, any[]>)[category.id]?.length ?? 0;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Mini header */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={onBack} className="p-1 mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={isCreole ? 'Tounen' : 'Retour'}>
          <X color={colors.muted} size={22} />
        </TouchableOpacity>
        <View
          className="w-8 h-8 rounded-lg items-center justify-center mr-2"
          style={{ backgroundColor: colors.azureSoft }}
        >
          <Text style={{ fontSize: 16 }}>{category.icon}</Text>
        </View>
        <Text className="font-bold flex-1" numberOfLines={1} style={{ color: colors.ink }}>
          {isCreole ? (category.nameHt ?? category.name) : category.name}
        </Text>
      </View>

      <View className="px-4 pt-6 pb-3">
        <Text className="text-xl font-bold" style={{ color: colors.ink }}>
          {isCreole ? 'Konbyen kesyon ?' : 'Combien de questions ?'}
        </Text>
        <Text className="text-sm mt-1" style={{ color: colors.muted }}>
          {totalQuestions} {isCreole ? 'kesyon disponib' : 'questions disponibles'}
        </Text>
      </View>

      <View className="px-4 gap-3">
        {ROUND_OPTIONS.filter((opt) => opt.count === 0 || opt.count <= totalQuestions).map((opt) => {
          const actualCount = opt.count === 0 ? totalQuestions : Math.min(opt.count, totalQuestions);
          const disabled = actualCount === 0;
          return (
            <TouchableOpacity
              key={opt.count}
              onPress={() => !disabled && onPick(opt.count)}
              disabled={disabled}
              activeOpacity={0.82}
              className="rounded-2xl px-5 py-4 flex-row items-center"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                shadowColor: '#1B6FE0',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 6,
                elevation: 1,
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <View className="flex-1">
                <Text className="font-bold text-lg" style={{ color: colors.ink }}>
                  {opt.count === 0 ? `${isCreole ? 'Tout' : 'Tout'} (${totalQuestions})` : (isCreole ? opt.labelHt : opt.label)}
                </Text>
                <Text className="text-sm mt-0.5" style={{ color: colors.muted }}>{isCreole ? opt.descHt : opt.desc}</Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold" style={{ color: colors.azure }}>{isCreole ? opt.timeHt : opt.time}</Text>
                <ChevronRight color={colors.faint} size={16} />
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
  const colors = useColors();
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
        stroke={colors.border}
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
  const colors = useColors();
  const insets = useSafeAreaInsets();
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
          success();
          setScore((s) => s + 1);
        } else {
          warn();
        }
        return currentSelected;
      });
      stopTimer();
    }
  }, [timeLeft, confirmed, idx, questions, stopTimer]);

  const handleSelect = (opt: string) => {
    if (!confirmed) {
      select();
      setSelected(opt);
    }
  };

  const handleConfirm = () => {
    if (confirmed) return;
    tapMedium();
    stopTimer();
    setConfirmed(true);
    if (selected === q.correctAnswer) {
      success();
      setScore((s) => s + 1);
    } else {
      warn();
    }
  };

  const handleNext = () => {
    tapMedium();
    if (idx + 1 >= questions.length) {
      onFinish(score, questions.length);
    } else {
      setIdx((i) => i + 1);
    }
  };

  if (!q) return null;

  const questionText = isCreole ? q.qHt : q.q;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Top bar: nav circles + score badge */}
      <View className="px-4 py-2" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
                      ? colors.azure
                      : isAnswered
                      ? '#10b981'
                      : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '700',
                      color: isCurrent || isAnswered ? '#fff' : colors.faint,
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          {/* Score badge */}
          <View className="flex-row items-center rounded-full px-2.5 py-1 gap-1" style={{ backgroundColor: colors.azureSoft }}>
            <Trophy color={colors.azure} size={13} />
            <Text className="font-bold text-sm" style={{ color: colors.azure }}>{score}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View className="h-1 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: colors.border }}>
          <View
            className="h-1 rounded-full"
            style={{
              width: `${((idx + 1) / questions.length) * 100}%`,
              backgroundColor: colors.azure,
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
          <Text className="text-sm font-semibold" style={{ color: colors.faint }}>
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
          className="rounded-2xl p-5 mb-5"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#1B6FE0',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
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

            // Feedback stays quiet: no colored fills or borders — the answer
            // state is carried by text color and the check/cross icon only.
            let borderColor = colors.border;
            let bgColor = colors.surface;
            let labelBg = colors.surfaceAlt;
            let labelText = colors.muted;
            let textColor = colors.ink;

            if (confirmed) {
              if (isCorrectOpt) {
                textColor = '#059669';
                labelText = '#059669';
              } else if (isSelected) {
                textColor = '#dc2626';
                labelText = '#dc2626';
              }
            } else if (isSelected) {
              borderColor = colors.azure;
              bgColor = colors.azureSoft;
              labelBg = colors.azure;
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
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: bgColor,
                  shadowColor: '#1B6FE0',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 6,
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

        {/* Feedback — just the verdict word, no box, border or fill */}
        {confirmed && (
          <PopIn style={{ marginTop: 16, paddingHorizontal: 4 }} from={0.85}>
            <View className="flex-row items-center gap-2 mb-1">
              {isCorrect ? (
                <Check color="#059669" size={18} />
              ) : (
                <X color="#dc2626" size={18} />
              )}
              <Text
                className="font-bold text-base"
                style={{ color: isCorrect ? '#059669' : '#dc2626' }}
              >
                {isCorrect ? (isCreole ? 'Kòrèk !' : 'Correct !') : (isCreole ? 'Pa kòrèk' : 'Incorrect')}
              </Text>
            </View>

            {!isCorrect && (
              <Text className="text-sm mt-1" style={{ color: colors.muted }}>
                {isCreole ? 'Bon repons :' : 'Bonne réponse :'}{' '}
                <Text className="font-semibold text-emerald-700 dark:text-emerald-400">{q.correctAnswer}</Text>
              </Text>
            )}

            {q.explanation ? (
              <Text className="text-sm mt-2 leading-5" style={{ color: colors.muted }}>{q.explanation}</Text>
            ) : null}
          </PopIn>
        )}
      </ScrollView>

      {/* Action button — safe-area aware so it clears the home indicator /
          Android gesture bar (the floating tab bar is hidden here via focus mode). */}
      <View
        className="px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        {!confirmed ? (
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={!selected}
            activeOpacity={0.85}
            className="py-4 rounded-2xl items-center"
            style={{ backgroundColor: selected ? colors.azure : colors.border }}
          >
            <Text
              className="font-bold text-base"
              style={{ color: selected ? '#fff' : colors.faint }}
            >
              {isCreole ? 'Konfime' : 'Confirmer'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.85}
            className="flex-row py-4 rounded-2xl items-center justify-center gap-1"
            style={{ backgroundColor: colors.azure }}
          >
            <Text className="text-white font-bold text-base">
              {idx + 1 >= questions.length
                ? isCreole
                  ? 'Wè rezilta yo'
                  : 'Voir les résultats'
                : isCreole
                ? 'Swivan'
                : 'Suivant'}
            </Text>
            {idx + 1 < questions.length && <ChevronRight color="#ffffff" size={18} />}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── TriviaResults ─────────────────────────────────────────────────────────────

function ScoreRing({ score, total }: { score: number; total: number }) {
  const colors = useColors();
  const pct = total > 0 ? score / total : 0;
  const fill = pct * CIRC;
  const color = pct >= 0.8 ? '#10b981' : pct >= 0.6 ? '#f59e0b' : '#ef4444';
  const reduceMotion = useReduceMotion();

  // Sweep the arc up to its final value on mount so the score feels earned.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = reduceMotion
      ? fill
      : withTiming(fill, { duration: 850, easing: Easing.out(Easing.cubic) });
  }, [fill, progress, reduceMotion]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value} ${CIRC}`,
  }));

  return (
    <View className="items-center justify-center" style={{ width: 140, height: 140 }}>
      <Svg width={140} height={140} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill="none" stroke={colors.border} strokeWidth={10} />
        <AnimatedCircle
          cx={60}
          cy={60}
          r={52}
          fill="none"
          stroke={color}
          strokeWidth={10}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin="60, 60"
        />
      </Svg>
      <View className="absolute items-center justify-center">
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>
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
  const colors = useColors();
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const xpEarned = score * 10;

  // Fire the celebration once for a strong round (the emotional payoff).
  useEffect(() => { if (pct >= 80) success(); }, [pct]);

  return (
    <ScrollView
      className="flex-1" style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ alignItems: 'center', padding: 24, paddingTop: 40, paddingBottom: 48 }}
    >
      {pct >= 80 && <Confetti />}
      <PopIn from={0.6}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Trophy color={colors.azure} size={32} />
        </View>
      </PopIn>

      <ScoreRing score={score} total={total} />

      <Text className="text-2xl font-bold mt-6 mb-1" style={{ color: colors.ink }}>
        {pct >= 80
          ? isCreole ? 'Ekselan !' : 'Excellent !'
          : pct >= 60
          ? isCreole ? 'Bon travay !' : 'Bon travail !'
          : isCreole ? 'Kontinye pratike !' : 'Continue à pratiquer !'}
      </Text>

      {/* XP earned badge */}
      <PopIn delay={450} style={{ marginTop: 12, marginBottom: 32 }}>
        <View className="flex-row items-center gap-2 rounded-full px-4 py-2" style={{ backgroundColor: colors.azureSoft }}>
          <Zap color={colors.azure} size={16} />
          <Text className="font-bold text-sm" style={{ color: colors.azure }}>
            +{xpEarned} XP {isCreole ? 'ou genyen' : 'gagnés'}
          </Text>
        </View>
      </PopIn>

      {/* Category tag */}
      <View
        className="flex-row items-center gap-2 rounded-xl px-4 py-2 mb-8"
        style={{ backgroundColor: colors.azureSoft }}
      >
        <Text style={{ fontSize: 18 }}>{category.icon}</Text>
        <Text className="font-semibold text-sm" style={{ color: colors.azure }}>
          {isCreole ? (category.nameHt ?? category.name) : category.name}
        </Text>
      </View>

      {/* Buttons */}
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.85}
        className="w-full flex-row items-center justify-center gap-2 py-4 rounded-2xl mb-3"
        style={{ backgroundColor: colors.azure }}
      >
        <RefreshCw color="#fff" size={18} />
        <Text className="text-white font-bold text-base">
          {isCreole ? 'Jwe ankò' : 'Rejouer'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onChooseCategory}
        activeOpacity={0.85}
        className="w-full items-center justify-center py-4 rounded-2xl border"
        style={{ borderColor: colors.border, backgroundColor: colors.surface }}
      >
        <Text className="font-semibold text-base" style={{ color: colors.muted }}>
          {isCreole ? 'Chwazi yon kategori' : 'Choisir une catégorie'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Main TriviaScreen ────────────────────────────────────────────────────────

export default function TriviaScreen() {
  const colors = useColors();
  const { user, language, incrementGuestInteraction, setFocusMode, pendingDailyChallenge, setPendingDailyChallenge } = useStore();
  const isCreole = language === 'ht';

  const { profile, recordResult, recordGameResult, daily } = useTrivia();
  const { recordActivity } = useStreak();
  const navigation = useNavigation<any>();

  const [phase, setPhase] = useState<TriviaPhase>('hub');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [roundSize, setRoundSize] = useState(10);
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });
  // True while the active round is today's Daily Challenge (drives the +50 XP
  // bonus + completedToday tracking, via recordResult({ isDaily: true })).
  const [isDailyRound, setIsDailyRound] = useState(false);

  // Hide the floating tab bar during an active game / results so it never
  // covers the answer & confirm buttons. Reset when leaving the Trivia tab.
  useFocusEffect(
    useCallback(() => {
      setFocusMode(phase === 'playing' || phase === 'results' || phase === 'arcade');
      return () => setFocusMode(false);
    }, [phase, setFocusMode]),
  );

  // Tapping the "Jeux" tab returns to the hub. This screen is phase-based (not
  // a navigation stack), so there's nothing for the default pop-to-top to reset
  // — we reset the local phase ourselves.
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', () => {
      setPhase('hub');
      setSelectedGame(null);
      setSelectedCategory(null);
      setIsDailyRound(false);
    });
    return unsub;
  }, [navigation]);

  const highScores: Record<string, number> = (profile as any)?.games?.highScores || {};

  // Launch today's Daily Challenge: a fixed, shared 10-question round drawn
  // across all categories. Uses a synthetic 'daily' category so the existing
  // play/results UI (header icon + name) works unchanged.
  const startDaily = useCallback(() => {
    const qs = prepareDailyQuestions(10);
    if (!qs.length) return;
    setSelectedCategory({
      id: 'daily',
      name: isCreole ? 'Defi jodi a' : 'Défi du jour',
      nameHt: 'Defi jodi a',
      icon: '🎯',
    });
    setQuestions(qs);
    setRoundSize(qs.length);
    setIsDailyRound(true);
    setPhase('playing');
  }, [isCreole]);

  // Deep-link from the home "Défi du jour" widget: it sets a transient store
  // flag, then navigates to this tab. Consume it on focus (once), skipping if
  // today's challenge is already done.
  useFocusEffect(
    useCallback(() => {
      if (pendingDailyChallenge) {
        setPendingDailyChallenge(false);
        if (!daily?.completedToday) startDaily();
      }
    }, [pendingDailyChallenge, setPendingDailyChallenge, daily, startDaily]),
  );

  // Start from category selection
  const handleSelectCategory = useCallback((categoryId: string) => {
    select();
    const cat = TRIVIA_CATEGORIES.find((c: any) => c.id === categoryId);
    setSelectedCategory(cat ?? null);
    setIsDailyRound(false);
    setPhase('roundPicker');
  }, []);

  // Start the actual quiz after picking round size
  const handlePickRound = useCallback(
    (count: number) => {
      if (!selectedCategory) return;
      tapMedium();
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

      // Note: daily-quiz re-engagement nudges are handled centrally by
      // scheduleEngagementReminders (recurring), so no per-round scheduling here.

      // Persist XP/profile via the shared gamification service. Leaderboard
      // submission happens inside recordResult and ONLY for opted-in players
      // with their chosen pseudo — never the raw account name (the previous
      // direct addWeeklyXp call here published first names without opt-in).
      recordResult({ category: selectedCategory?.id, score, total, isDaily: isDailyRound })
        .then(() => {
          if (!user?.uid) return null;
          return getWeeklyTop(50).then((top) => {
            const entry = top.find((e: any) => e.id === user.uid);
            if (entry && entry.rank <= 10) notifyLeaderboardRank(entry.rank).catch(() => {});
          });
        })
        .catch(console.warn);
    },
    [recordActivity, user, incrementGuestInteraction, recordResult, selectedCategory, isDailyRound],
  );

  // Arcade wiring — shared reward contract with the classic flow.
  const exitToHub = useCallback(() => {
    setPhase('hub');
    setSelectedGame(null);
    setSelectedCategory(null);
    setIsDailyRound(false);
  }, []);

  const arcadeProps = {
    isCreole,
    onExit: exitToHub,
    onRecord: recordGameResult,
  };

  // "Rejouer" — replay with same category + round size. For the Daily
  // Challenge this replays today's fixed set (the +50 XP bonus is only
  // awarded once/day; the service dedupes further attempts).
  const handleRetry = useCallback(() => {
    tapMedium();
    if (isDailyRound) {
      const qs = prepareDailyQuestions(roundSize || 10);
      if (qs.length) {
        setQuestions(qs);
        setPhase('playing');
      }
      return;
    }
    if (!selectedCategory) {
      setPhase('categories');
      return;
    }
    const qs = prepareQuestions(selectedCategory.id, roundSize);
    setQuestions(qs);
    setPhase('playing');
  }, [isDailyRound, selectedCategory, roundSize]);

  const handleChooseCategory = useCallback(() => {
    tapLight();
    setPhase('categories');
    setSelectedCategory(null);
    setIsDailyRound(false);
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      {/* Phase router */}
      {phase === 'hub' && (
        <JeuxHub
          onSelectGame={(id) => { setSelectedGame(id); setPhase('arcade'); }}
          onStartTrivia={() => setPhase('categories')}
          onStartDaily={startDaily}
        />
      )}

      {phase === 'arcade' && selectedGame && (
        <View className="flex-1">
          <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={exitToHub} className="p-1 mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={isCreole ? 'Fèmen' : 'Fermer'}>
              <X color={colors.muted} size={20} />
            </TouchableOpacity>
            <Text className="font-bold" style={{ color: colors.ink }}>
              {isCreole ? 'Jwèt yo' : 'Les jeux'}
            </Text>
          </View>
          {selectedGame === 'vrai-faux' && (
            <VraiFauxGame questionsMap={TRIVIA_QUESTIONS as any} highScore={highScores['vrai-faux'] ?? null} {...arcadeProps} />
          )}
          {selectedGame === 'memoire' && <MemoireGame highScore={highScores['memoire'] ?? null} {...arcadeProps} />}
          {selectedGame === 'mo-kache' && <MoKacheGame highScore={highScores['mo-kache'] ?? null} {...arcadeProps} />}
          {selectedGame === 'calcul' && <CalculGame highScore={highScores['calcul'] ?? null} {...arcadeProps} />}
          {selectedGame === 'suites' && <SuitesGame highScore={highScores['suites'] ?? null} {...arcadeProps} />}
        </View>
      )}

      {/* Persistent XP + streak header (classic trivia flow only) */}
      {phase !== 'hub' && phase !== 'arcade' && <TriviaHeader />}

      {phase === 'categories' && (
        <>
          <TouchableOpacity
            onPress={exitToHub}
            className="flex-row items-center px-4 pt-1 pb-2"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isCreole ? 'Jwèt yo' : 'Les jeux'}
          >
            <ChevronRight color={colors.azure} size={16} style={{ transform: [{ rotate: '180deg' }] }} />
            <Text style={{ color: colors.azure, fontWeight: '700', fontSize: 13 }}>
              {isCreole ? 'Jwèt yo' : 'Les jeux'}
            </Text>
          </TouchableOpacity>
          <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={startDaily} style={{ marginHorizontal: 16, marginBottom: 14 }} />
          <CategoryPicker onSelect={handleSelectCategory} isCreole={isCreole} />
        </>
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
          <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity
              onPress={() => setPhase('categories')}
              className="p-1 mr-3"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isCreole ? 'Kite' : 'Quitter'}
            >
              <X color={colors.muted} size={22} />
            </TouchableOpacity>
            <View
              className="w-7 h-7 rounded-lg items-center justify-center mr-2"
              style={{ backgroundColor: colors.azureSoft }}
            >
              <Text style={{ fontSize: 14 }}>{selectedCategory.icon}</Text>
            </View>
            <Text className="font-bold flex-1" numberOfLines={1} style={{ color: colors.ink }}>
              {isCreole
                ? (selectedCategory.nameHt ?? selectedCategory.name)
                : selectedCategory.name}
            </Text>
            <Trophy color={colors.azure} size={18} />
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
          <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Trophy color={colors.azure} size={18} />
            <Text className="font-bold ml-2" style={{ color: colors.ink }}>
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
