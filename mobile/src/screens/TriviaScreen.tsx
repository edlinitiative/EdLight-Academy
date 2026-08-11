import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Dimensions, FlatList, Alert,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, SvgUri } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withSpring, Easing } from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Zap, Flame, Check, X, RefreshCw, ChevronRight, Trophy, Share2, Crown, Snowflake, Swords } from 'lucide-react-native';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { todayStr, awardStreakFreeze } from '../services/streakService';
import { xpBreakdown } from '../services/triviaService';
import { countQuizzesThisWeek, WEEKLY_QUIZ_GOAL } from '../utils/weeklyActivity';
import { getWeeklyTop } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import MathText from '../components/MathText';
import PressableScale from '../components/ui/PressableScale';
import { useColors, useTheme, typeScale, radius } from '../theme/theme';
import { success, warn, select, tapMedium, tapLight } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import { shuffleAligned } from '../utils/shuffleAligned';
import PopIn from '../components/ui/PopIn';
import QuizResultHero, { HeroButton, glass } from '../components/quiz/QuizResultHero';
import { notifyLeaderboardRank } from '../services/notificationService';
import { logAnswerEvent } from '../services/answerEventsService';
import JeuxHub from '../components/games/JeuxHub';
import DailyChallengeBanner from '../components/games/DailyChallengeBanner';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../components/share/ShareCardCapture';
import { createChallenge, shareChallenge } from '../services/challengeService';
import VraiFauxGame from '../components/games/VraiFauxGame';
import MemoireGame from '../components/games/MemoireGame';
import MoKacheGame from '../components/games/MoKacheGame';
import CalculGame from '../components/games/CalculGame';
import SuitesGame from '../components/games/SuitesGame';

// ─── Types ───────────────────────────────────────────────────────────────────

// 'hub' = the Jeux arcade landing; 'arcade' = one of the non-trivia games;
// the remaining phases are the classic trivia flow.
type TriviaPhase = 'hub' | 'arcade' | 'categories' | 'roundPicker' | 'playing' | 'results';

export interface PreparedQuestion {
  q: string;
  qHt: string;
  options: string[];
  correctAnswer: string;
  /** Kreyòl option strings, index-aligned with `options` (same shuffle). */
  optionsHt?: string[];
  correctAnswerHt?: string;
  flag?: string;
  explanation?: string;
  explanationHt?: string;
  /** Bank index of the source question — lets a category round be reproduced
      exactly for "Défi d'un ami" (utils/seededDraw). Absent in daily rounds,
      whose draw spans banks. */
  idx?: number;
}

/** A missed question captured during play for the end-of-round review. */
export interface RoundMistake {
  q: PreparedQuestion;
  /** What the player picked — null when the timer ran out with nothing selected. */
  chosen: string | null;
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
/** Map a raw bank question to its playable form (options re-shuffled).
 *  FR and HT option arrays get the SAME permutation so they stay paired. */
function toPrepared(q: any, idx?: number): PreparedQuestion {
  const { primary: options, aligned: optionsHt } = shuffleAligned<string>(
    q.options,
    Array.isArray(q.optionsHt) ? q.optionsHt : null,
  );
  return {
    q: q.q,
    qHt: q.qHt ?? q.q,
    options,
    correctAnswer: q.options[q.answer],
    ...(optionsHt ? { optionsHt, correctAnswerHt: q.optionsHt[q.answer] } : {}),
    flag: q.flag ?? null,
    explanation: q.explanation ?? null,
    explanationHt: q.explanationHt ?? null,
    ...(idx != null ? { idx } : {}),
  };
}

function prepareQuestions(categoryId: string, count: number): PreparedQuestion[] {
  const raw: any[] = (TRIVIA_QUESTIONS as Record<string, any[]>)[categoryId] ?? [];
  // Shuffle bank INDEXES (not items) so each prepared question keeps its bank
  // idx — that's what lets a finished round become a shareable challenge.
  const idxs = shuffle(raw.map((_: any, i: number) => i)).slice(0, count === 0 ? raw.length : count);
  return idxs.map((i) => toPrepared(raw[i], i));
}

/**
 * Reproduce a challenger's exact round from bank indexes ("Défi d'un ami").
 * Null when any index is out of range — i.e. the two devices run different
 * bank versions and the duel can't be replayed faithfully.
 */
export function prepareChallengeQuestions(categoryId: string, idxs: number[]): PreparedQuestion[] | null {
  const raw: any[] = (TRIVIA_QUESTIONS as Record<string, any[]>)[categoryId] ?? [];
  if (!idxs.length || idxs.some((i) => !Number.isInteger(i) || i < 0 || i >= raw.length)) return null;
  return idxs.map((i) => toPrepared(raw[i], i));
}

/**
 * Prepare today's Daily Challenge: the same 10 questions for everyone,
 * deterministically drawn across ALL categories (seeded by today's date).
 * Option order is still shuffled per-play — only the question *set* is shared.
 */
function prepareDailyQuestions(count = 10): PreparedQuestion[] {
  const pool = getDailyChallengeQuestions(TRIVIA_QUESTIONS as Record<string, any[]>, todayStr(), count);
  return pool.map((q: any) => toPrepared(q));
}

const LETTER_LABELS = ['A', 'B', 'C', 'D'];
const CIRC = 327; // 2 * π * 52

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
        <Text className="w-10" style={[typeScale.caption, { color: colors.azure }]}>
          {profile?.xp ?? 0} XP
        </Text>
        {/* Level progress bar */}
        <View className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
          <View
            className="h-2 rounded-full"
            style={{ width: `${Math.min(100, level?.progressPct ?? 0)}%`, backgroundColor: colors.azure }}
          />
        </View>
        <Text style={[typeScale.caption, { color: colors.faint }]}>
          Niv.{level?.level ?? 1}
        </Text>
      </View>

      {/* Streak section */}
      <View className="flex-row items-center gap-1">
        <Animated.View style={flameStyle}>
          <Flame color={colors.danger} size={16} />
        </Animated.View>
        <Text style={[typeScale.titleSm, { color: colors.danger }]}>{streak?.currentStreak ?? 0}</Text>
        <Text className="ml-0.5" style={[typeScale.caption, { color: colors.faint }]}>{isCreole ? 'jou' : 'jours'}</Text>
      </View>

      {/* Streak freezes — earned by finishing the weekly goal; one bridges a
          single missed day. Hidden at zero so the header stays calm. */}
      {(streak?.streakFreezes ?? 0) > 0 && (
        <View
          className="flex-row items-center gap-1"
          accessible
          accessibilityLabel={isCreole ? `${streak.streakFreezes} jèl seri` : `${streak.streakFreezes} gel de série`}
        >
          <Snowflake color={colors.azure} size={14} />
          <Text style={[typeScale.titleSm, { color: colors.azure }]}>{streak.streakFreezes}</Text>
        </View>
      )}
    </View>
  );
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────

// Two-column illustrated card grid. Cards share ONE calm neutral treatment
// (clean white surface, soft slate shadow, hairline border); only the SVG
// illustration carries colour — no per-category background tints.
const GRID_PAD = 12; // grid outer horizontal padding
const COL_GAP = 10;  // gutter between the three columns
// Cap the grid width so 3-column tiles don't balloon on iPad (portrait-locked +
// requireFullScreen → window width is stable per session). Phones fall under the
// cap and are unchanged; the grid rows are centered on wide screens below.
const GRID_W = Math.min(Dimensions.get('window').width, 720);
const TILE_SIZE = Math.floor(
  (GRID_W - GRID_PAD * 2 - COL_GAP * 2) / 3,
);
const ASSET_BASE_URL = 'https://edlight-academy.web.app';

/**
 * Category tile art. The illustration is a REMOTE SVG, so offline (or when
 * hosting hiccups) it renders nothing — fall back to the category's emoji so
 * a tile is never blank.
 */
function CategoryArt({ image, icon, size }: { image?: string; icon?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <Text style={{ fontSize: 38 }}>{icon ?? '🎯'}</Text>;
  return (
    <SvgUri
      uri={`${ASSET_BASE_URL}${image}`}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid slice"
      onError={() => setFailed(true)}
    />
  );
}

// Grade-relevant ordering: when a student has chosen a filière (track), surface
// the trivia decks whose subject matches that track FIRST, keeping every other
// deck afterwards in its original order. Matching is a light keyword test
// against each category's id / name / description — no fragile id mapping — so
// new decks are picked up automatically and an unknown/empty track is a no-op.
const TRACK_TRIVIA_KEYWORDS: Record<string, string[]> = {
  SVT: ['svt', 'corps', 'bio', 'cellule', 'chim', 'scien', 'nature', 'math', 'géométri', 'geometri'],
  SMP: ['math', 'chim', 'physi', 'scien', 'formule', 'calcul', 'géométri', 'geometri'],
  SES: ['écono', 'econo', 'monnaie', 'social', 'gestion'],
  LET: ['angl', 'langue', 'lettre', 'littér', 'litter', 'proverbe', 'vocab', 'français', 'francais'],
  ARTS: ['art', 'musique', 'culture', 'cuisine'],
};

function orderCategoriesForTrack(cats: any[], track: string | null | undefined) {
  const keywords = track ? TRACK_TRIVIA_KEYWORDS[track] : undefined;
  if (!keywords || keywords.length === 0) return { list: cats, recommendedId: null as string | null };
  const relevant: any[] = [];
  const rest: any[] = [];
  for (const cat of cats) {
    const hay = `${cat.id} ${cat.name} ${cat.description ?? ''}`.toLowerCase();
    (keywords.some((k) => hay.includes(k)) ? relevant : rest).push(cat);
  }
  if (relevant.length === 0) return { list: cats, recommendedId: null as string | null };
  return { list: [...relevant, ...rest], recommendedId: relevant[0].id as string };
}

function CategoryPicker({
  onSelect,
  isCreole,
}: {
  onSelect: (id: string) => void;
  isCreole: boolean;
}) {
  const colors = useColors();
  const { shadow } = useTheme();
  const track = useStore((s) => s.track);
  const { list: orderedCategories, recommendedId } = useMemo(
    () => orderCategoriesForTrack(TRIVIA_CATEGORIES as any[], track),
    [track],
  );
  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      data={orderedCategories}
      keyExtractor={(cat: any) => cat.id}
      numColumns={3}
      // gap → column gutters + side padding; the extra marginBottom + the tile's
      // own marginBottom reproduce the original wrapped grid's row spacing.
      columnWrapperStyle={{ gap: COL_GAP, paddingHorizontal: GRID_PAD, marginBottom: COL_GAP, justifyContent: 'center' }}
      ListHeaderComponent={
        <View className="px-4 pt-4 pb-3">
          <Text style={[typeScale.display, { color: colors.ink }]}>
            {isCreole ? 'Jwèt Trivia' : 'Jeu Trivia'}
          </Text>
          <Text style={[typeScale.body, { color: colors.muted, marginTop: 4 }]}>
            {isCreole ? 'Chwazi yon kategori' : 'Choisissez une catégorie'}
          </Text>
        </View>
      }
      renderItem={({ item: cat }: { item: any }) => (
        <PressableScale
          onPress={() => onSelect(cat.id)}
          pressedScale={0.94}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? (cat.nameHt ?? cat.name) : cat.name}
          style={{ width: TILE_SIZE, alignItems: 'center', marginBottom: 6 }}
        >
          {/* Shadow on the outer view; clipped illustration on the inner. */}
          <View
            style={{
              borderRadius: radius.hero,
              ...shadow.md,
            }}
          >
            {cat.id === recommendedId && (
              <View
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  zIndex: 2,
                  backgroundColor: colors.azure,
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}
                pointerEvents="none"
              >
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                  {isCreole ? 'rekòmande' : 'recommandé'}
                </Text>
              </View>
            )}
            <View
              style={{
                width: TILE_SIZE,
                height: TILE_SIZE,
                borderRadius: radius.hero,
                overflow: 'hidden',
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <CategoryArt image={cat.image} icon={cat.icon} size={TILE_SIZE} />
            </View>
          </View>

          {/* Name (reserve 2 lines so tiles align) */}
          <Text
            numberOfLines={2}
            style={[typeScale.caption, { color: colors.ink, textAlign: 'center', marginTop: 8, minHeight: 30 }]}
          >
            {isCreole ? (cat.nameHt ?? cat.name) : cat.name}
          </Text>
        </PressableScale>
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
  const { shadow } = useTheme();
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
        <Text className="flex-1" numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>
          {isCreole ? (category.nameHt ?? category.name) : category.name}
        </Text>
      </View>

      <View className="px-4 pt-6 pb-3">
        <Text style={[typeScale.h1, { color: colors.ink }]}>
          {isCreole ? 'Konbyen kesyon ?' : 'Combien de questions ?'}
        </Text>
        <Text className="mt-1" style={[typeScale.body, { color: colors.muted }]}>
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
                ...shadow.sm,
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <View className="flex-1">
                <Text style={[typeScale.h2, { color: colors.ink }]}>
                  {opt.count === 0 ? `${isCreole ? 'Tout' : 'Tout'} (${totalQuestions})` : (isCreole ? opt.labelHt : opt.label)}
                </Text>
                <Text className="mt-0.5" style={[typeScale.body, { color: colors.muted }]}>{isCreole ? opt.descHt : opt.desc}</Text>
              </View>
              <View className="items-end">
                <Text style={[typeScale.label, { color: colors.azure }]}>{isCreole ? opt.timeHt : opt.time}</Text>
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
    <Svg width={44} height={44} viewBox="0 0 120 120">
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

// A single answer option. Owns its tonal state (selected = amber, confirmed =
// green/red) AND its confirmation animation: the correct option pops (~1→1.06→1
// via a spring settle) and a wrong pick shakes (translateX ±6 over ~350ms). The
// motion fires once when `confirmed` turns true and is skipped for reduce-motion
// (colours still apply).
function AnswerOption({
  opt,
  label,
  isSelected,
  isCorrectOpt,
  confirmed,
  onPress,
  colors,
  reduceMotion,
}: {
  opt: string;
  label: string;
  isSelected: boolean;
  isCorrectOpt: boolean;
  confirmed: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!confirmed || reduceMotion) return;
    if (isCorrectOpt) {
      // Quick celebratory pop, then a soft spring settle back to rest.
      scale.value = withSequence(
        withTiming(1.06, { duration: 130, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 7, stiffness: 220, mass: 0.6 }),
      );
    } else if (isSelected) {
      // Short horizontal shake for a wrong pick (~350ms total).
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

  // Tighter tonal states: selected = amber, confirmed = green/red,
  // each with a filled letter chip so state reads at a glance.
  let borderColor = colors.border;
  let bgColor = colors.surface;
  let labelBg = colors.surfaceAlt;
  let labelText = colors.muted;
  const textColor = colors.ink;

  if (confirmed) {
    if (isCorrectOpt) {
      borderColor = colors.success;
      bgColor = colors.successSoft;
      labelBg = colors.success;
      labelText = '#ffffff';
    } else if (isSelected) {
      borderColor = colors.danger;
      bgColor = colors.dangerSoft;
      labelBg = colors.danger;
      labelText = '#ffffff';
    }
  } else if (isSelected) {
    borderColor = colors.warn;
    bgColor = colors.warnSoft;
    labelBg = colors.warn;
    labelText = '#ffffff';
  }

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        disabled={confirmed}
        activeOpacity={0.8}
        className="flex-row items-center overflow-hidden"
        style={{
          borderWidth: 1.5,
          borderColor,
          backgroundColor: bgColor,
          borderRadius: 15,
        }}
      >
        {/* Letter chip */}
        <View
          className="items-center justify-center m-2"
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: labelBg }}
        >
          <Text style={{ fontSize: 14, fontWeight: '800', color: labelText }}>
            {label}
          </Text>
        </View>

        <Text
          className="flex-1 text-sm font-medium pr-3"
          style={{ color: textColor, lineHeight: 20, paddingVertical: 10 }}
        >
          {opt}
        </Text>

        {/* Check/X icon when confirmed */}
        {confirmed && isCorrectOpt && (
          <View className="pr-3">
            <Check color={colors.success} size={18} />
          </View>
        )}
        {confirmed && isSelected && !isCorrectOpt && (
          <View className="pr-3">
            <X color={colors.danger} size={18} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function QuizPlayer({
  questions,
  category,
  isCreole,
  onFinish,
}: {
  questions: PreparedQuestion[];
  category: any;
  isCreole: boolean;
  onFinish: (score: number, total: number, mistakes: RoundMistake[]) => void;
}) {
  const colors = useColors();
  const { shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The current selection, readable from the timeout path without the
  // set-state-updater side-effect trick; and the round's missed questions,
  // handed to the results screen for the "Revois tes erreurs" recap.
  const selectedRef = useRef<string | null>(null);
  const mistakesRef = useRef<RoundMistake[]>([]);

  const q = questions[idx];
  // Language-resolved view: Kreyòl options only when the pair exists (the
  // aligned shuffle in toPrepared guarantees FR/HT share one permutation).
  // Selection and correctness both operate on the DISPLAYED strings.
  const correctFor = useCallback(
    (question?: PreparedQuestion) =>
      isCreole && question?.optionsHt && question.correctAnswerHt
        ? question.correctAnswerHt
        : question?.correctAnswer,
    [isCreole],
  );
  const displayOptions = isCreole && q?.optionsHt ? q.optionsHt : q?.options ?? [];
  const isCorrect = confirmed && selected === correctFor(q);

  // --- Timer ---
  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset timer whenever the question changes
  useEffect(() => {
    setTimeLeft(15);
    setSelected(null);
    selectedRef.current = null;
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
      stopTimer();
      setConfirmed(true);
      const currentSelected = selectedRef.current;
      const wasCorrect = currentSelected !== null && currentSelected === correctFor(questions[idx]);
      if (wasCorrect) {
        success();
        setScore((s) => s + 1);
      } else {
        warn();
        if (questions[idx]) mistakesRef.current.push({ q: questions[idx], chosen: currentSelected });
      }
      // Crowd-difficulty logging (canonical FR stem so IDs match across langs).
      if (questions[idx]?.q) logAnswerEvent(questions[idx].q, wasCorrect);
    }
  }, [timeLeft, confirmed, idx, questions, stopTimer, correctFor]);

  const handleSelect = (opt: string) => {
    if (!confirmed) {
      select();
      selectedRef.current = opt;
      setSelected(opt);
    }
  };

  const handleConfirm = () => {
    if (confirmed) return;
    tapMedium();
    stopTimer();
    setConfirmed(true);
    const correct = selected === correctFor(q);
    if (correct) {
      success();
      setScore((s) => s + 1);
    } else {
      warn();
      mistakesRef.current.push({ q, chosen: selected });
    }
    if (q?.q) logAnswerEvent(q.q, correct);
  };

  const handleNext = () => {
    tapMedium();
    if (idx + 1 >= questions.length) {
      onFinish(score, questions.length, mistakesRef.current);
    } else {
      setIdx((i) => i + 1);
    }
  };

  if (!q) return null;

  const questionText = isCreole ? q.qHt : q.q;

  const pct = ((idx + 1) / questions.length) * 100;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Compact top: slim gradient progress bar + "Question X / N" + timer ring */}
      <View className="px-4 pt-3 pb-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View className="flex-1">
            <View className="flex-row items-center justify-between" style={{ marginBottom: 7 }}>
              <Text style={[typeScale.label, { color: colors.ink }]}>
                {isCreole ? 'Kesyon' : 'Question'} {idx + 1} / {questions.length}
              </Text>
              {/* Live score badge */}
              <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ gap: 4, backgroundColor: colors.azureSoft }}>
                <Trophy color={colors.azure} size={13} />
                <Text style={[typeScale.label, { color: colors.azure }]}>{score}</Text>
              </View>
            </View>
            {/* Slim brand-gradient progress bar */}
            <View className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: colors.border }}>
              <LinearGradient
                colors={[colors.azure, colors.azureDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: 6, width: `${pct}%`, borderRadius: 999 }}
              />
            </View>
          </View>

          {/* SVG ring timer with number overlay */}
          <View className="items-center justify-center" style={{ width: 44, height: 44 }}>
            <TimerRing timeLeft={timeLeft} />
            <View className="absolute items-center justify-center">
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: timeLeft > 8 ? '#10b981' : timeLeft > 5 ? '#f59e0b' : '#ef4444',
                }}
              >
                {timeLeft}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Flag (for flags category) */}
        {q.flag != null && (
          <View className="items-center mb-4">
            <Text style={{ fontSize: 64 }}>{q.flag}</Text>
          </View>
        )}

        {/* Question card — lifted, subtle top→bottom surface gradient */}
        <View
          className="mb-4"
          style={{
            borderRadius: radius.card,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.border,
            ...shadow.md,
          }}
        >
          <LinearGradient
            colors={[colors.surface, colors.surfaceAlt]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ padding: 18 }}
          >
            <MathText text={questionText} />
          </LinearGradient>
        </View>

        {/* Answer options — Kreyòl strings when the bank carries them */}
        <View style={{ gap: 10 }}>
          {displayOptions.map((opt, i) => (
            <AnswerOption
              key={i}
              opt={opt}
              label={LETTER_LABELS[i] ?? String(i + 1)}
              isSelected={opt === selected}
              isCorrectOpt={opt === correctFor(q)}
              confirmed={confirmed}
              onPress={() => handleSelect(opt)}
              colors={colors}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>

        {/* Feedback — just the verdict word, no box, border or fill */}
        {confirmed && (
          <PopIn style={{ marginTop: 16, paddingHorizontal: 4 }} from={0.85}>
            <View className="flex-row items-center gap-2 mb-1">
              {isCorrect ? (
                <Check color={colors.success} size={18} />
              ) : (
                <X color={colors.danger} size={18} />
              )}
              <Text
                style={[typeScale.title, { color: isCorrect ? colors.success : colors.danger }]}
              >
                {isCorrect ? (isCreole ? 'Kòrèk !' : 'Correct !') : (isCreole ? 'Pa kòrèk' : 'Incorrect')}
              </Text>
            </View>

            {!isCorrect && (
              <Text className="mt-1" style={[typeScale.body, { color: colors.muted }]}>
                {isCreole ? 'Bon repons :' : 'Bonne réponse :'}{' '}
                <Text style={[typeScale.bodyMd, { color: colors.success }]}>{correctFor(q)}</Text>
              </Text>
            )}

            {(isCreole && q.explanationHt) || q.explanation ? (
              <Text className="mt-2" style={[typeScale.body, { color: colors.muted }]}>
                {isCreole ? (q.explanationHt ?? q.explanation) : q.explanation}
              </Text>
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
            className="py-4 items-center"
            style={{
              backgroundColor: selected ? colors.azure : colors.border,
              borderRadius: radius.tile,
              shadowColor: colors.azureDeep,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: selected ? 0.28 : 0,
              shadowRadius: 12,
              elevation: selected ? 5 : 0,
            }}
          >
            <Text
              style={[typeScale.title, { color: selected ? '#fff' : colors.faint }]}
            >
              {isCreole ? 'Konfime' : 'Confirmer'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleNext}
            activeOpacity={0.85}
            className="flex-row py-4 items-center justify-center gap-1"
            style={{
              backgroundColor: colors.azure,
              borderRadius: radius.tile,
              shadowColor: colors.azureDeep,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28,
              shadowRadius: 12,
              elevation: 5,
            }}
          >
            <Text style={[typeScale.title, { color: '#ffffff' }]}>
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

function TriviaResults({
  score,
  total,
  category,
  reward,
  dailyReplay,
  mistakes,
  freezeEarned,
  onRetry,
  onChooseCategory,
  onChallenge,
  isCreole,
}: {
  score: number;
  total: number;
  category: any;
  /** The real reward from recordResult (arrives async; null while pending). */
  reward: any | null;
  /** True when this round replayed an already-completed Daily (earns 0 XP). */
  dailyReplay: boolean;
  mistakes: RoundMistake[];
  freezeEarned: boolean;
  onRetry: () => void;
  onChooseCategory: () => void;
  /** "Défier un ami" — present only when this round can become a duel
      (signed-in, reproducible category round). */
  onChallenge?: (() => Promise<void>) | null;
  isCreole: boolean;
}) {
  const [challenging, setChallenging] = useState(false);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  // Show the service's real numbers the moment they land; until then the same
  // math the service runs (xpBreakdown), so the chip never lies about bonuses.
  const isDaily = category?.id === 'daily';
  const breakdown = reward?.breakdown ?? xpBreakdown({ score, total, isDaily, dailyAlreadyDone: dailyReplay });
  const xpEarned = reward?.xpEarned ?? breakdown.total;
  const categoryName = isCreole ? (category.nameHt ?? category.name) : category.name;
  const shareRef = useRef<ShareCardCaptureHandle>(null);
  // Always share by the canonical (FR) category name so the same card reads
  // consistently; the card component localizes its own chrome via `lang`.
  const shareSubject = category.name ?? categoryName;

  const title = pct >= 80
    ? (isCreole ? 'Ekselan !' : 'Excellent !')
    : pct >= 60
      ? (isCreole ? 'Bon travay !' : 'Bon travail !')
      : (isCreole ? 'Kontinye pratike !' : 'Continue à pratiquer !');

  return (
    <>
    <ShareCardCapture ref={shareRef} />
    <QuizResultHero
      score={score}
      total={total}
      isCreole={isCreole}
      title={title}
      celebrateHaptic
      showConfetti={pct >= 80 || !!reward?.leveledUp}
      footer={
        <>
          <HeroButton
            variant="glass"
            icon={<RefreshCw color="#fff" size={18} />}
            label={isCreole ? 'Jwe ankò' : 'Rejouer'}
            onPress={onRetry}
            style={{ marginBottom: 10 }}
          />
          <HeroButton
            variant="solid"
            color="#22C55E"
            icon={<Share2 color="#fff" size={18} />}
            label={isCreole ? 'Pataje nòt mwen' : 'Partager mon score'}
            onPress={() => shareRef.current?.share({ mode: 'score', subject: shareSubject, score, total })}
            style={{ marginBottom: 10 }}
          />
          {onChallenge && (
            <HeroButton
              variant="glass"
              icon={<Swords color="#fff" size={18} />}
              label={
                challenging
                  ? (isCreole ? 'Ap prepare defi a…' : 'Préparation du défi…')
                  : (isCreole ? 'Defye yon zanmi' : 'Défier un ami')
              }
              onPress={async () => {
                if (challenging) return;
                setChallenging(true);
                try {
                  await onChallenge();
                } finally {
                  setChallenging(false);
                }
              }}
              style={{ marginBottom: 10 }}
            />
          )}
          <HeroButton
            variant="ghost"
            label={isCreole ? 'Chwazi yon kategori' : 'Choisir une catégorie'}
            onPress={onChooseCategory}
          />
        </>
      }
    >
      {/* XP earned — glass chip, with the bonus parts spelled out below */}
      <PopIn delay={400} style={{ marginTop: 12, alignItems: 'center' }}>
        <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Zap color="#fde68a" size={16} />
          <Text style={{ fontFamily: typeScale.title.fontFamily, fontSize: 14, color: '#fde68a' }}>+{xpEarned} XP {isCreole ? 'ou genyen' : 'gagnés'}</Text>
        </View>
        {(breakdown.perfect > 0 || breakdown.dailyBonus > 0) && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            {breakdown.perfect > 0 && (
              <View style={{ ...glass, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: typeScale.label.fontFamily, fontSize: 11.5, color: '#fde68a' }}>
                  +{breakdown.perfect} {isCreole ? 'san fot !' : 'sans faute !'}
                </Text>
              </View>
            )}
            {breakdown.dailyBonus > 0 && (
              <View style={{ ...glass, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: typeScale.label.fontFamily, fontSize: 11.5, color: '#fde68a' }}>
                  +{breakdown.dailyBonus} {isCreole ? 'defi jodi a' : 'défi du jour'}
                </Text>
              </View>
            )}
          </View>
        )}
        {dailyReplay && (
          <Text style={{ fontFamily: typeScale.caption.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8, textAlign: 'center' }}>
            {isCreole
              ? 'Defi a te fèt deja jodi a — antrennman (0 XP).'
              : "Défi déjà joué aujourd'hui — manche d'entraînement (0 XP)."}
          </Text>
        )}
        {reward?.guest && (
          <Text style={{ fontFamily: typeScale.caption.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8, textAlign: 'center' }}>
            {isCreole ? 'Konekte pou kenbe XP ou' : 'Connecte-toi pour garder tes XP'}
          </Text>
        )}
      </PopIn>

      {/* Level-up — the crossing gets its own moment, not just a haptic. */}
      {reward?.leveledUp && (
        <PopIn delay={600} style={{ marginTop: 12 }}>
          <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Crown color="#fde68a" size={16} />
            <Text style={{ fontFamily: typeScale.title.fontFamily, fontSize: 14, color: '#fde68a' }}>
              {isCreole ? `Nivo ${reward.newLevel} !` : `Niveau ${reward.newLevel} !`}
            </Text>
          </View>
        </PopIn>
      )}

      {/* Weekly-goal reward */}
      {freezeEarned && (
        <PopIn delay={700} style={{ marginTop: 12 }}>
          <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Snowflake color="#7EE7FF" size={16} />
            <Text style={{ fontFamily: typeScale.title.fontFamily, fontSize: 14, color: '#7EE7FF' }}>
              {isCreole ? 'Jèl seri ou genyen !' : 'Gel de série gagné !'}
            </Text>
          </View>
        </PopIn>
      )}

      {/* Glass stat row */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
        <View style={{ ...glass, flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontFamily: typeScale.num.fontFamily, color: '#fff' }}>{pct}%</Text>
          <Text style={{ fontSize: 10, fontFamily: typeScale.overline.fontFamily, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>{isCreole ? 'PRESIZYON' : 'PRÉCISION'}</Text>
        </View>
        <View style={{ ...glass, flex: 1.4, borderRadius: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18 }}>{category.icon}</Text>
          <Text numberOfLines={1} style={{ fontSize: 10, fontFamily: typeScale.label.fontFamily, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            {categoryName}
          </Text>
        </View>
      </View>

      {/* Revois tes erreurs — a wrong answer should teach, not just count. */}
      {mistakes.length > 0 && (
        <View style={{ width: '100%', marginTop: 22 }}>
          <Text style={{ fontFamily: typeScale.overline.fontFamily, fontSize: 11, letterSpacing: 1, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
            {isCreole ? 'REVIZE ERÈ OU YO' : 'REVOIS TES ERREURS'} ({mistakes.length})
          </Text>
          {mistakes.map((m, i) => {
            // `chosen` was captured as the DISPLAYED string, so the ✓ answer
            // and 💡 explanation must resolve in the same language.
            const correct = isCreole && m.q.optionsHt && m.q.correctAnswerHt ? m.q.correctAnswerHt : m.q.correctAnswer;
            const explanation = isCreole ? (m.q.explanationHt ?? m.q.explanation) : m.q.explanation;
            return (
              <View key={i} style={{ ...glass, borderRadius: 14, padding: 12, marginTop: 8 }}>
                <Text style={{ fontFamily: typeScale.bodyMd.fontFamily, fontSize: 13.5, lineHeight: 19, color: '#ffffff' }}>
                  {isCreole ? m.q.qHt : m.q.q}
                </Text>
                <Text style={{ fontFamily: typeScale.caption.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>
                  {isCreole ? 'Ou' : 'Toi'} : {m.chosen ?? (isCreole ? '(tan an fini)' : '(temps écoulé)')}
                  {'   ·   '}
                  <Text style={{ color: '#86efac' }}>✓ {correct}</Text>
                </Text>
                {explanation ? (
                  <Text style={{ fontFamily: typeScale.caption.fontFamily, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
                    💡 {explanation}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </QuizResultHero>
    </>
  );
}

// ─── Main TriviaScreen ────────────────────────────────────────────────────────

export default function TriviaScreen() {
  const colors = useColors();
  const { user, language, incrementGuestInteraction, setFocusMode, pendingDailyChallenge, setPendingDailyChallenge, quizAttempts, recordQuizAttempt } = useStore();
  const isCreole = language === 'ht';

  const { profile, recordResult, recordGameResult, daily, isAuthed } = useTrivia();
  const { recordActivity } = useStreak();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<TriviaPhase>('hub');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [roundSize, setRoundSize] = useState(10);
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });
  // True while the active round is today's Daily Challenge (drives the +50 XP
  // bonus + completedToday tracking, via recordResult({ isDaily: true })).
  const [isDailyRound, setIsDailyRound] = useState(false);
  // Round outcome surfaced by the results screen: the real reward object from
  // recordResult (async), the review list, and one-shot celebration flags.
  const [lastReward, setLastReward] = useState<any>(null);
  const [roundMistakes, setRoundMistakes] = useState<RoundMistake[]>([]);
  const [wasDailyReplay, setWasDailyReplay] = useState(false);
  const [freezeEarned, setFreezeEarned] = useState(false);
  // Transient hub note when the home deep-link lands after the daily is done.
  const [dailyDoneNote, setDailyDoneNote] = useState(false);

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
  // flag, then navigates to this tab. Consume it on focus (once). When today's
  // challenge is already done, acknowledge it instead of silently landing on
  // the hub — the tap should never feel like it did nothing.
  useFocusEffect(
    useCallback(() => {
      if (pendingDailyChallenge) {
        setPendingDailyChallenge(false);
        if (!daily?.completedToday) startDaily();
        else setDailyDoneNote(true);
      }
    }, [pendingDailyChallenge, setPendingDailyChallenge, daily, startDaily]),
  );

  useEffect(() => {
    if (!dailyDoneNote) return;
    const tmr = setTimeout(() => setDailyDoneNote(false), 3500);
    return () => clearTimeout(tmr);
  }, [dailyDoneNote]);

  // "Défier un ami" — only when the finished round is faithfully reproducible:
  // a signed-in player, a real category round (daily draws span banks), and
  // every question still carrying its bank index.
  const challengeIdxs = useMemo(() => {
    if (!isAuthed || isDailyRound || !selectedCategory?.id || selectedCategory.id === 'daily') return null;
    const idxs = questions.map((q) => q.idx);
    return idxs.length > 0 && idxs.every((i) => i != null) ? (idxs as number[]) : null;
  }, [isAuthed, isDailyRound, selectedCategory, questions]);

  const handleChallenge = useCallback(async () => {
    if (!challengeIdxs || !selectedCategory) return;
    const created = await createChallenge({
      categoryId: selectedCategory.id,
      questionIdxs: challengeIdxs,
      score: finalScore.score,
    });
    if (!created) {
      Alert.alert(
        isCreole ? 'Defi a pa t pati' : "Le défi n'est pas parti",
        isCreole ? 'Verifye koneksyon ou epi eseye ankò.' : 'Vérifie ta connexion et réessaie.',
      );
      return;
    }
    await shareChallenge({
      categoryLabel: isCreole ? (selectedCategory.nameHt ?? selectedCategory.name) : selectedCategory.name,
      score: finalScore.score,
      total: challengeIdxs.length,
      url: created.url,
      lang: isCreole ? 'ht' : 'fr',
    });
  }, [challengeIdxs, selectedCategory, finalScore, isCreole]);

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
    (score: number, total: number, mistakes: RoundMistake[] = []) => {
      // Captured BEFORE recording flips completedToday, so the results screen
      // knows whether this round was a 0-XP replay of a finished daily.
      const dailyReplay = isDailyRound && !!daily?.completedToday;
      setFinalScore({ score, total });
      setRoundMistakes(mistakes);
      setWasDailyReplay(dailyReplay);
      setLastReward(null);
      setFreezeEarned(false);
      setPhase('results');
      incrementGuestInteraction();

      // Record streak activity
      recordActivity().catch(console.warn);

      // Weekly-goal bookkeeping: a trivia round is a quiz. Crossing the weekly
      // goal earns a streak freeze (service caps the stash at 2).
      const before = countQuizzesThisWeek(Object.values(quizAttempts as Record<string, any[]>).flat());
      recordQuizAttempt(`trivia:${selectedCategory?.id || 'mixed'}`, { score, total, date: Date.now(), source: 'trivia' });
      if (user?.uid && before < WEEKLY_QUIZ_GOAL && before + 1 >= WEEKLY_QUIZ_GOAL) {
        awardStreakFreeze(user.uid)
          .then(() => {
            setFreezeEarned(true);
            qc.invalidateQueries({ queryKey: ['global-streak'] });
          })
          .catch(() => {});
      }

      // Note: daily-quiz re-engagement nudges are handled centrally by
      // scheduleEngagementReminders (recurring), so no per-round scheduling here.

      // Persist XP/profile via the shared gamification service, and hand the
      // REAL reward (breakdown, level-up, guest flag) to the results screen —
      // the old local `score * 10` under-reported every bonus. Leaderboard
      // submission happens inside recordResult.
      recordResult({ category: selectedCategory?.id, score, total, isDaily: isDailyRound })
        .then((reward) => {
          setLastReward(reward ?? null);
          if (!user?.uid) return null;
          return getWeeklyTop(50).then((top) => {
            const entry = top.find((e: any) => e.id === user.uid);
            if (entry && entry.rank <= 10) notifyLeaderboardRank(entry.rank).catch(() => {});
          });
        })
        .catch(console.warn);
    },
    [recordActivity, user, incrementGuestInteraction, recordResult, selectedCategory, isDailyRound, daily, quizAttempts, recordQuizAttempt, qc],
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
        <>
          <JeuxHub
            onSelectGame={(id) => { setSelectedGame(id); setPhase('arcade'); }}
            onStartTrivia={() => setPhase('categories')}
            onStartDaily={startDaily}
          />
          {/* Transient ack for the home deep-link when the daily is already
              done — the tap should read as "seen", not as a dead tap. */}
          {dailyDoneNote && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 20, right: 20, zIndex: 10, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, opacity: 0.94 }}>
                <Check color="#4ade80" size={14} />
                <Text style={[typeScale.label, { color: colors.surface }]} numberOfLines={1}>
                  {isCreole
                    ? `Defi jodi a fini deja — ${daily?.score ?? ''}/${daily?.total ?? ''}. Tounen demen !`
                    : `Défi du jour déjà terminé — ${daily?.score ?? ''}/${daily?.total ?? ''}. Reviens demain !`}
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {phase === 'arcade' && selectedGame && (
        <View className="flex-1">
          <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TouchableOpacity onPress={exitToHub} className="p-1 mr-3" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={isCreole ? 'Fèmen' : 'Fermer'}>
              <X color={colors.muted} size={20} />
            </TouchableOpacity>
            <Text style={[typeScale.title, { color: colors.ink }]}>
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
            <Text style={[typeScale.label, { color: colors.azure }]}>
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
              onPress={() => {
                // Mid-round progress is unrecoverable — never discard it on a
                // single (possibly accidental) tap.
                Alert.alert(
                  isCreole ? 'Kite jwèt la ?' : 'Quitter la partie ?',
                  isCreole ? 'Pwogrè manch sa a ap pèdi.' : 'La progression de cette manche sera perdue.',
                  [
                    { text: isCreole ? 'Kontinye jwe' : 'Continuer', style: 'cancel' },
                    {
                      text: isCreole ? 'Kite' : 'Quitter',
                      style: 'destructive',
                      onPress: () => {
                        if (isDailyRound) exitToHub();
                        else setPhase('categories');
                      },
                    },
                  ],
                );
              }}
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
            <Text className="flex-1" numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>
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
            <Text className="ml-2" style={[typeScale.title, { color: colors.ink }]}>
              {isCreole ? 'Rezilta' : 'Résultats'}
            </Text>
          </View>

          <TriviaResults
            score={finalScore.score}
            total={finalScore.total}
            category={selectedCategory}
            reward={lastReward}
            dailyReplay={wasDailyReplay}
            mistakes={roundMistakes}
            freezeEarned={freezeEarned}
            onRetry={handleRetry}
            onChooseCategory={handleChooseCategory}
            onChallenge={challengeIdxs ? handleChallenge : null}
            isCreole={isCreole}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
