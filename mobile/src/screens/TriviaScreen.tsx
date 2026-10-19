import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Dimensions, FlatList, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, withSpring, Easing } from 'react-native-reanimated';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Flame, Check, X, RefreshCw, ChevronRight, ChevronLeft, Share2, Crown, Snowflake, Swords, Star, Clock, Shuffle } from 'lucide-react-native';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { bankHash } from '../../../shared/duelGrading';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { todayStr, awardStreakFreeze } from '../services/streakService';
import { xpBreakdown } from '../services/triviaService';
import { countQuizzesThisWeek, WEEKLY_QUIZ_GOAL } from '../utils/weeklyActivity';
import { getWeeklyTop } from '../services/leaderboardService';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import PressableScale from '../components/ui/PressableScale';
import { fonts } from '../theme/theme';
import { arenaColors as C, arenaType } from '../theme/arenaTheme';
import { success, warn, select, tapMedium, tapLight } from '../utils/haptics';
import { useReduceMotion } from '../utils/motion';
import { shuffleAligned } from '../utils/shuffleAligned';
import { mathToText } from '../utils/mathText';
import PopIn from '../components/ui/PopIn';
import StageEnter from '../components/trivia/StageEnter';
import ScoreCounter from '../components/trivia/ScoreCounter';
import CorrectFlash from '../components/trivia/CorrectFlash';
import SchoolRace from '../components/trivia/SchoolRace';
import { notifyLeaderboardRank } from '../services/notificationService';
import { logAnswerEvent } from '../services/answerEventsService';
import JeuxHub from '../components/games/JeuxHub';
import DailyChallengeBanner from '../components/games/DailyChallengeBanner';
import NightResult, { RewardChip } from '../components/games/NightResult';
import { NightIconButton, NightRow, NightSection, nightType } from '../components/games/night';
import ShareCardCapture, { type ShareCardCaptureHandle } from '../components/share/ShareCardCapture';
import ShareCard from '../components/share/ShareCard';
import { createChallenge, shareChallenge } from '../services/challengeService';
import VraiFauxGame from '../components/games/VraiFauxGame';
import MemoireGame from '../components/games/MemoireGame';
import MoKacheGame from '../components/games/MoKacheGame';
import CalculGame from '../components/games/CalculGame';
import { useDeadlineCountdown } from '../components/games/RoundTimer';
import type { BackgroundPolicy } from '../utils/deadlineTimer';
import SuitesGame from '../components/games/SuitesGame';
import { ArenaButton } from '../components/arena/ArenaKit';
import Avatar from '../components/arena/art/avatars/Avatar';
import { useMyAvatar } from '../hooks/useMyAvatar';
import useNightStatusBar from '../components/arena/useNightStatusBar';
import { intentPlan, parseTriviaIntent, pickerCopy, resultPrimary, roundSizeFor, type TriviaIntent } from '../utils/triviaIntent';

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
export function toPrepared(q: any, idx?: number): PreparedQuestion {
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

/** A mixed round: `count` questions drawn at random across every theme. */
export function prepareMixedQuestions(count = 10): PreparedQuestion[] {
  const banks = TRIVIA_QUESTIONS as Record<string, any[]>;
  const all: any[] = [];
  for (const id of Object.keys(banks)) for (const q of banks[id] ?? []) all.push(q);
  // No bank idx: a mixed draw spans banks, so it cannot become a duel.
  return shuffle(all).slice(0, count).map((q) => toPrepared(q));
}

const LETTER_LABELS = ['A', 'B', 'C', 'D'];

/** Seconds per practice / duel question. */
const QUESTION_SECONDS = 15;

const SIDE = 20;

// ─── Night header for the pre-game phases ──────────────────────────────────────

function PhaseHeader({ title, subtitle, onBack, backLabel }: { title: string; subtitle?: string; onBack: () => void; backLabel: string }) {
  return (
    <View style={{ paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 8, gap: 14 }}>
      <NightIconButton onPress={onBack} label={backLabel} icon={<ChevronLeft color={C.ink} size={22} />} />
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={[nightType.page, { color: C.ink }]}>{title}</Text>
        {subtitle ? <Text style={[nightType.meta, { color: C.muted }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// ─── CategoryPicker ───────────────────────────────────────────────────────────

// Two columns of opaque night tiles, the illustration (the tab's best imagery)
// at the left and the theme's name beside it — the web's "choisis un thème".
const GRID_W = Math.min(Dimensions.get('window').width, 720);
const COL_GAP = 12;
const TILE_W = Math.floor((GRID_W - SIDE * 2 - COL_GAP) / 2);
const ART = 52;
const ASSET_BASE_URL = 'https://edlight-academy.web.app';

/**
 * Category tile art. The illustration is a REMOTE SVG, so offline (or when
 * hosting hiccups) it renders nothing — fall back to the theme's initial on a
 * tonal disc so a tile is never blank (no emoji).
 */
function CategoryArt({ image, name, size }: { image?: string; name: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.heading, fontSize: 24, color: C.inkSoft }}>{(name || '?').charAt(0).toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: 14, overflow: 'hidden', backgroundColor: C.surfaceRaised }}>
      <SvgUri
        uri={`${ASSET_BASE_URL}${image}`}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid slice"
        onError={() => setFailed(true)}
      />
    </View>
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
  onSelect, onMixed, onBack, header, isCreole, intent = 'practice', isAuthed = true, onSignIn,
}: {
  onSelect: (id: string) => void;
  onMixed: () => void;
  onBack: () => void;
  /** Rendered above the grid (the Défi du jour card). */
  header?: React.ReactNode;
  isCreole: boolean;
  /** Practice, or a friend challenge (a duel-able round only). */
  intent?: TriviaIntent;
  isAuthed?: boolean;
  onSignIn?: () => void;
}) {
  const track = useStore((s) => s.track);
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const plan = intentPlan(intent);
  const copy = pickerCopy(intent, t);
  const { list: orderedCategories, recommendedId } = useMemo(
    () => orderCategoriesForTrack(TRIVIA_CATEGORIES as any[], track),
    [track],
  );
  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      data={orderedCategories}
      keyExtractor={(cat: any) => cat.id}
      numColumns={2}
      columnWrapperStyle={{ gap: COL_GAP, paddingHorizontal: SIDE, marginBottom: COL_GAP }}
      ListHeaderComponent={
        <View>
          <PhaseHeader
            title={copy.title}
            subtitle={copy.subtitle}
            onBack={onBack}
            backLabel={t('Retour aux jeux', 'Tounen nan jwèt yo')}
          />
          <View style={{ paddingHorizontal: SIDE, paddingTop: 8, gap: 12 }}>
            {copy.explainer ? (
              // The async duel format, said once, before the choice.
              <View accessible style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: 20, backgroundColor: C.surface }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceRaised }}>
                  <Swords color={C.ink} size={18} />
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={[arenaType.body, { color: C.inkSoft }]}>{copy.explainer}</Text>
                  {!isAuthed ? (
                    <>
                      <Text style={[arenaType.status, { color: C.warn }]}>
                        {t('Connecte-toi pour pouvoir envoyer le défi.', 'Konekte pou w ka voye defi a.')}
                      </Text>
                      {onSignIn ? <ArenaButton variant="secondary" label={t('Se connecter', 'Konekte')} onPress={onSignIn} style={{ alignSelf: 'flex-start', backgroundColor: C.surfaceRaised }} /> : null}
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}
            {plan.showDaily ? header : null}
            {plan.allowMixed ? (
              <ArenaButton
                variant="secondary"
                label={t('Jouer un mélange de thèmes', 'Jwe yon melanj tèm')}
                accessibilityHint={t('10 questions tirées de tous les thèmes', '10 kesyon nan tout tèm yo')}
                icon={<Shuffle color={C.ink} size={18} />}
                onPress={onMixed}
                style={{ minHeight: 52 }}
              />
            ) : null}
          </View>
          <NightSection title={t('Les thèmes', 'Tèm yo')} meta={t(`${orderedCategories.length} thèmes`, `${orderedCategories.length} tèm`)} style={{ marginHorizontal: SIDE }} />
        </View>
      }
      renderItem={({ item: cat }: { item: any }) => {
        const name = isCreole ? (cat.nameHt ?? cat.name) : cat.name;
        const recommended = cat.id === recommendedId;
        return (
          <PressableScale
            onPress={() => onSelect(cat.id)}
            pressedScale={0.96}
            accessibilityRole="button"
            accessibilityLabel={`${name}${recommended ? t(', recommandé pour ta filière', ', rekòmande pou filyè w') : ''}`}
            style={{
              width: TILE_W, minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 10,
              padding: 12, borderRadius: 16, backgroundColor: C.surface,
            }}
          >
            <CategoryArt image={cat.image} name={name} size={ART} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={3} style={[arenaType.name, { fontSize: 15, lineHeight: 19, color: C.ink }]}>{name}</Text>
              {recommended ? <Text style={[arenaType.status, { color: C.coral }]}>{t('Pour toi', 'Pou ou')}</Text> : null}
            </View>
          </PressableScale>
        );
      }}
    />
  );
}

// ─── RoundPicker ──────────────────────────────────────────────────────────────

const ROUND_OPTIONS = [
  { count: 10, label: '10 questions', labelHt: '10 kesyon', time: '~2 min', timeHt: '~2 min', desc: 'Rapide', descHt: 'Rapid' },
  { count: 25, label: '25 questions', labelHt: '25 kesyon', time: '~5 min', timeHt: '~5 min', desc: 'Standard', descHt: 'Estanda' },
  { count: 50, label: '50 questions', labelHt: '50 kesyon', time: '~10 min', timeHt: '~10 min', desc: 'Long', descHt: 'Long' },
  { count: 0, label: 'Tout', labelHt: 'Tout', time: 'Complet', timeHt: 'Konplè', desc: 'Toutes les questions', descHt: 'Tout kesyon yo' },
];

function RoundPicker({
  category, onPick, onBack, isCreole,
}: {
  category: any;
  onPick: (count: number) => void;
  onBack: () => void;
  isCreole: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const totalQuestions = (TRIVIA_QUESTIONS as Record<string, any[]>)[category.id]?.length ?? 0;
  const name = isCreole ? (category.nameHt ?? category.name) : category.name;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <PhaseHeader
        title={name}
        subtitle={t(`Combien de questions ? ${totalQuestions} disponibles · 15 s chacune`, `Konbyen kesyon ? ${totalQuestions} disponib · 15 s chak`)}
        onBack={onBack}
        backLabel={t('Retour aux thèmes', 'Tounen nan tèm yo')}
      />
      <View style={{ paddingHorizontal: SIDE, paddingTop: 12, gap: 10 }}>
        {ROUND_OPTIONS.filter((opt) => opt.count === 0 || opt.count <= totalQuestions).map((opt) => {
          const actualCount = opt.count === 0 ? totalQuestions : Math.min(opt.count, totalQuestions);
          if (actualCount === 0) return null;
          return (
            <NightRow
              key={opt.count}
              title={opt.count === 0 ? `${t('Tout', 'Tout')} (${totalQuestions})` : (isCreole ? opt.labelHt : opt.label)}
              meta={`${isCreole ? opt.descHt : opt.desc} · ${isCreole ? opt.timeHt : opt.time}`}
              onPress={() => onPick(opt.count)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── QuizPlayer ───────────────────────────────────────────────────────────────

/** One answer row: 72h, a letter square, the answer text — and nothing else
 *  (no formula or symbol hints beside an answer: they give it away). */
function AnswerOption({
  opt, label, isCorrectOpt, isPicked, confirmed, onPress, reduceMotion,
}: {
  opt: string;
  label: string;
  isCorrectOpt: boolean;
  isPicked: boolean;
  confirmed: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!confirmed || reduceMotion) return;
    if (isCorrectOpt) {
      scale.value = withSequence(
        withTiming(1.04, { duration: 130, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 8, stiffness: 220, mass: 0.6 }),
      );
    } else if (isPicked) {
      shake.value = withSequence(
        withTiming(-6, { duration: 50, easing: Easing.linear }),
        withRepeat(withTiming(6, { duration: 70, easing: Easing.linear }), 4, true),
        withTiming(0, { duration: 50, easing: Easing.linear }),
      );
    }
  }, [confirmed, isCorrectOpt, isPicked, reduceMotion, scale, shake]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateX: shake.value }] }));

  // State is a tonal wash, never an edge: right = success wash, your wrong
  // pick = danger wash, the rest step back.
  const right = confirmed && isCorrectOpt;
  const wrong = confirmed && isPicked && !isCorrectOpt;
  const bg = right ? C.successSoft : wrong ? C.dangerSoft : C.surface;
  const squareBg = right ? C.success : wrong ? C.danger : C.surfaceRaised;
  const squareInk = right || wrong ? C.marine : C.ink;
  const quiet = confirmed && !right && !wrong;

  return (
    <Animated.View style={animStyle}>
      <PressableScale
        onPress={onPress}
        disabled={confirmed}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityState={{ disabled: confirmed, selected: isPicked }}
        accessibilityLabel={`${label}. ${opt}${right ? (', bonne réponse') : wrong ? ', ta réponse, incorrecte' : ''}`}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72,
          paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: bg,
          opacity: quiet ? 0.6 : 1,
        }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: squareBg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: 17, color: squareInk }}>{label}</Text>
        </View>
        <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, color: C.ink }}>{opt}</Text>
        {right ? <Check color={C.success} size={22} /> : wrong ? <X color={C.danger} size={22} /> : null}
      </PressableScale>
    </Animated.View>
  );
}

export interface QuizOpponent {
  seed: string;
  name: string;
  /** Their chosen avatar (wire string), when they made one. */
  avatar?: string | null;
  /** Their final score for this draw (duel), shown as the bar to beat. */
  score: number;
}

export function QuizPlayer({
  questions,
  category,
  isCreole,
  onFinish,
  timerPolicy = 'pause',
  onQuit,
  title,
  opponent = null,
}: {
  questions: PreparedQuestion[];
  category: any;
  isCreole: boolean;
  /** `picks`: the French option text chosen per question (null = timeout) —
   *  what the server grades a duel from (shared/duelGrading). */
  onFinish: (score: number, total: number, mistakes: RoundMistake[], picks: (string | null)[]) => void;
  /**
   * What leaving the app does to the 15s question clock — see the TIMING
   * POLICY in utils/deadlineTimer.ts. 'pause' for solo practice (default),
   * 'run' for a scored duel, where the other player's clock did not stop.
   */
  timerPolicy?: BackgroundPolicy;
  /** The 44 close control; the host confirms before discarding progress. */
  onQuit?: () => void;
  /** Centred header title ("Trivia · Sciences"). */
  title?: string;
  /** A duel's challenger: the score strip reads "Toi vs <name>". */
  opponent?: QuizOpponent | null;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const me = useStore((s) => s.user);
  const { avatar: myAvatar } = useMyAvatar();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  // Consecutive correct answers in THIS round — drives how much light a right
  // answer throws. Reset on a miss, so the build is something to protect.
  const [run, setRun] = useState(0);
  const mistakesRef = useRef<RoundMistake[]>([]);
  const picksRef = useRef<(string | null)[]>([]);

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
  const isCorrect = confirmed && picked === correctFor(q);

  // Deadline-based: re-derived from Date.now() on every tick, so a suspended
  // interval can never make the clock drift. Frozen once answered.
  const { timeLeft, remainingMs } = useDeadlineCountdown(QUESTION_SECONDS, {
    policy: timerPolicy,
    paused: confirmed,
    resetKey: idx,
    tickMs: 100,
  });

  useEffect(() => {
    setPicked(null);
    setConfirmed(false);
  }, [idx]);

  // A tap IS the answer (one tap, no confirm step) — committed at once.
  const commit = useCallback((choice: string | null) => {
    if (confirmed || !q) return;
    setPicked(choice);
    setConfirmed(true);
    // Canonical French text of the pick: FR and HT options share one order.
    const shown = isCreole && q.optionsHt ? q.optionsHt : q.options;
    const at = choice === null ? -1 : shown.indexOf(choice);
    picksRef.current[idx] = at >= 0 ? q.options[at] ?? null : null;
    const correct = choice !== null && choice === correctFor(q);
    if (correct) {
      success();
      setScore((s) => s + 1);
      setRun((r) => r + 1);
    } else {
      warn();
      setRun(0);
      mistakesRef.current.push({ q, chosen: choice });
    }
    // Crowd-difficulty logging (canonical FR stem so IDs match across langs).
    if (q.q) logAnswerEvent(q.q, correct);
  }, [confirmed, q, correctFor, isCreole, idx]);

  // Time ran out with nothing chosen → a miss.
  useEffect(() => {
    if (timeLeft === 0 && !confirmed) commit(null);
  }, [timeLeft, confirmed, commit]);

  const handleNext = () => {
    tapLight();
    if (idx + 1 >= questions.length) {
      onFinish(score, questions.length, mistakesRef.current, questions.map((_, i) => picksRef.current[i] ?? null));
    }
    else setIdx((i) => i + 1);
  };

  if (!q) return null;

  const questionText = mathToText(isCreole ? q.qHt : q.q);
  const urgent = !confirmed && timeLeft <= 5;
  const timeFrac = Math.max(0, Math.min(1, remainingMs / (QUESTION_SECONDS * 1000)));
  const categoryName = category ? (isCreole ? (category.nameHt ?? category.name) : category.name) : '';
  const explanation = isCreole ? (q.explanationHt ?? q.explanation) : q.explanation;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header: close · title / progress · timer pill */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIDE, paddingTop: 8 }}>
        {onQuit ? <NightIconButton onPress={onQuit} label={t('Quitter la partie', 'Kite pati a')} /> : <View style={{ width: 44 }} />}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text numberOfLines={1} style={[arenaType.name, { fontSize: 17, color: C.ink }]}>{title ?? `Trivia · ${categoryName}`}</Text>
          <Text style={[arenaType.status, { color: C.muted }]}>{t('Question', 'Kesyon')} {idx + 1} / {questions.length}</Text>
        </View>
        <View
          accessible
          accessibilityRole="timer"
          accessibilityLabel={t(`${timeLeft} secondes`, `${timeLeft} segonn`)}
          accessibilityLiveRegion={urgent ? 'polite' : 'none'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: C.surface }}
        >
          <Clock color={urgent ? C.danger : C.coral} size={18} />
          <Text style={[arenaType.num, { fontSize: 17, color: urgent ? C.danger : C.ink, minWidth: 30 }]}>{timeLeft} s</Text>
        </View>
      </View>
      {/* The countdown bar: the clock's proportion, coral on a night track. */}
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface, marginHorizontal: SIDE, marginTop: 14, overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, width: `${timeFrac * 100}%`, backgroundColor: urgent ? C.danger : C.coral }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: SIDE, paddingTop: 16, paddingBottom: 24, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* Score strip: you (and, in a duel, the score you are chasing). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, backgroundColor: C.surface }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar seed={me?.uid || 'toi'} config={myAvatar} size={48} mood={confirmed ? (isCorrect ? 'celebrating' : 'recovering') : 'focused'} />
            <View>
              <Text style={[arenaType.status, { color: C.muted }]}>{t('Toi', 'Ou')}</Text>
              <ScoreCounter value={score} style={{ ...arenaType.num, fontSize: 20, lineHeight: 24, color: C.ink }} />
            </View>
          </View>
          {opponent ? (
            <>
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: C.secondary }}>
                <Text style={[arenaType.status, { fontFamily: fonts.bold, color: C.inkSoft }]}>VS</Text>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                  <Text numberOfLines={1} style={[arenaType.status, { color: C.muted }]}>{opponent.name}</Text>
                  <Text style={[arenaType.num, { fontSize: 20, lineHeight: 24, color: C.ink }]}>{opponent.score}</Text>
                </View>
                <Avatar seed={opponent.seed} config={opponent.avatar} size={48} />
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[arenaType.status, { color: C.muted }]}>{t('Série', 'Seri')}</Text>
              <Text style={[arenaType.num, { fontSize: 20, lineHeight: 24, color: run > 1 ? C.coral : C.ink }]}>{run}</Text>
            </View>
          )}
        </View>

        {/* The flag IS the question in the flags theme — it stays. */}
        {q.flag != null ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 64 }} accessibilityLabel={t('Drapeau', 'Drapo')}>{q.flag}</Text>
          </View>
        ) : null}

        {/* Question card */}
        <StageEnter playKey={idx} index={0} springy>
          <View style={{ padding: 22, gap: 10, borderRadius: 24, backgroundColor: C.surfaceRaised }}>
            {/* No category eyebrow here: every caller's header title already
                names the round ("Défi du jour", "Trivia · Sciences",
                "Défi · Sciences"), so a dot-label repeated it. */}
            <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 22, lineHeight: 30, letterSpacing: -0.3, color: C.ink }}>
              {questionText}
            </Text>
          </View>
        </StageEnter>

        {/* Answers. The wash of light behind them fires only on a right
            answer, and sits under the options so it never intercepts a tap. */}
        <View style={{ gap: 10 }}>
          {confirmed && isCorrect ? <CorrectFlash playKey={idx} streak={run} /> : null}
          {displayOptions.map((opt, i) => (
            <StageEnter key={i} playKey={idx} index={i + 1}>
              <AnswerOption
                opt={opt}
                label={LETTER_LABELS[i] ?? String(i + 1)}
                isPicked={opt === picked}
                isCorrectOpt={opt === correctFor(q)}
                confirmed={confirmed}
                onPress={() => { select(); commit(opt); }}
                reduceMotion={reduceMotion}
              />
            </StageEnter>
          ))}
        </View>

        {/* Verdict — the word, the right answer when missed, the why. */}
        {confirmed ? (
          <PopIn from={0.9} style={{ padding: 18, gap: 6, borderRadius: 20, backgroundColor: C.surface }}>
            <Text accessibilityLiveRegion="polite" style={[arenaType.title, { color: isCorrect ? C.success : C.danger }]}>
              {isCorrect
                ? t('Bonne réponse', 'Bon repons')
                : picked === null ? t('Temps écoulé', 'Tan an fini') : t('Pas tout à fait', 'Pa tout bon')}
            </Text>
            {!isCorrect ? (
              <Text style={[arenaType.body, { color: C.inkSoft }]}>
                {t('La bonne réponse : ', 'Bon repons lan : ')}
                <Text style={{ fontFamily: fonts.bold, color: C.ink }}>{correctFor(q)}</Text>
              </Text>
            ) : null}
            {explanation ? <Text style={[arenaType.body, { color: C.muted }]}>{explanation}</Text> : null}
          </PopIn>
        ) : (
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: C.surface }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.coral }} />
            <Text style={[arenaType.status, { color: C.inkSoft }]}>{t('Un toucher = ta réponse. Pas de retour en arrière.', 'Yon touche = repons ou. Pa gen retounen.')}</Text>
          </View>
        )}
      </ScrollView>

      {confirmed ? (
        <View style={{ paddingHorizontal: SIDE, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 20), backgroundColor: C.bg }}>
          <ArenaButton
            label={idx + 1 >= questions.length ? t('Voir le résultat', 'Wè rezilta a') : t('Question suivante', 'Pwochen kesyon')}
            onPress={handleNext}
            style={{ minHeight: 52 }}
          />
        </View>
      ) : null}
    </View>
  );
}

// ─── TriviaResults ─────────────────────────────────────────────────────────────

function TriviaResults({
  score, total, category, reward, dailyReplay, mistakes, freezeEarned,
  onRetry, onChooseCategory, onChallenge, isCreole, intent = 'practice',
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
  /** "Défier un ami" — present only when this round can become a duel. */
  onChallenge?: (() => Promise<void>) | null;
  isCreole: boolean;
  /** A round started from "Défier un ami" leads with sending the duel. */
  intent?: TriviaIntent;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const user = useStore((s) => s.user);
  const { streak } = useStreak();
  const [challenging, setChallenging] = useState(false);
  const [review, setReview] = useState(false);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  // The service's real numbers the moment they land; until then the same math
  // the service runs (xpBreakdown), so the chip never lies about bonuses.
  const isDaily = category?.id === 'daily';
  const breakdown = reward?.breakdown ?? xpBreakdown({ score, total, isDaily, dailyAlreadyDone: dailyReplay });
  const xpEarned = reward?.xpEarned ?? breakdown.total;
  const categoryName = isCreole ? (category.nameHt ?? category.name) : category.name;
  const shareRef = useRef<ShareCardCaptureHandle>(null);
  // Share by the canonical (FR) category name so the same card reads
  // consistently; the card localizes its own chrome via `lang`.
  const shareSubject = `Trivia · ${category.name ?? categoryName}`;
  const days = streak?.currentStreak ?? 0;

  useEffect(() => {
    if (pct >= 80) success();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const headline = pct >= 100
    ? t('Sans faute', 'San fot')
    : pct >= 80
      ? t('Excellent', 'Ekselan')
      : pct >= 60
        ? t('Bon travail', 'Bon travay')
        : t('Continue à t’entraîner', 'Kontinye antrene w');

  const winW = Dimensions.get('window').width;
  const previewW = Math.min(winW - SIDE * 2, 380) * 0.72;

  const leadChallenge = resultPrimary(intent, !!onChallenge) === 'challenge';
  const shareAction = {
    label: t('Partager', 'Pataje'),
    icon: <Share2 color={C.onCoral} size={18} />,
    onPress: () => shareRef.current?.share({ mode: 'score', subject: shareSubject, score, total }),
  };
  const challengeAction = onChallenge ? {
    label: challenging
      ? t('Préparation du défi…', 'N ap prepare defi a…')
      : leadChallenge ? t('Envoyer le défi', 'Voye defi a') : t('Défier un ami', 'Defye yon zanmi'),
    icon: <Swords color={leadChallenge ? C.onCoral : C.ink} size={18} />,
    busy: challenging,
    accessibilityHint: t('Envoie ces mêmes questions à un ami', 'Voye menm kesyon sa yo bay yon zanmi'),
    onPress: async () => {
      if (challenging) return;
      setChallenging(true);
      try { await onChallenge(); } finally { setChallenging(false); }
    },
  } : null;

  return (
    <>
      <ShareCardCapture ref={shareRef} />
      <NightResult
        title={t('Résultat', 'Rezilta')}
        subtitle={isDaily ? categoryName : `Trivia · ${categoryName}`}
        onClose={onChooseCategory}
        closeLabel={t('Fermer', 'Fèmen')}
        me={{ seed: user?.uid || 'toi', label: t('Toi', 'Ou') }}
        winner={pct >= 80 ? 'me' : null}
        headline={headline}
        score={score}
        total={total}
        scoreEarned={score > 0}
        scoreLine={t(`${pct} % de bonnes réponses`, `${pct} % bon repons`)}
        chips={(
          <>
            {xpEarned > 0 ? <RewardChip earned icon={<Star color={C.gold} size={16} />} label={`+${xpEarned} XP`} /> : null}
            {breakdown.perfect > 0 ? <RewardChip earned label={t(`+${breakdown.perfect} sans faute`, `+${breakdown.perfect} san fot`)} /> : null}
            {breakdown.dailyBonus > 0 ? <RewardChip earned label={t(`+${breakdown.dailyBonus} défi du jour`, `+${breakdown.dailyBonus} defi jodi a`)} /> : null}
            {reward?.leveledUp ? <RewardChip earned icon={<Crown color={C.gold} size={16} />} label={t(`Niveau ${reward.newLevel}`, `Nivo ${reward.newLevel}`)} /> : null}
            {freezeEarned ? <RewardChip earned icon={<Snowflake color={C.gold} size={16} />} label={t('Gel de série gagné', 'Jèl seri genyen')} /> : null}
            {days > 0 ? <RewardChip icon={<Flame color={C.coral} size={16} />} label={t(`Série ${days} jours`, `Seri ${days} jou`)} /> : null}
          </>
        )}
        primary={leadChallenge && challengeAction ? challengeAction : shareAction}
        secondary={[
          ...(leadChallenge ? [{ ...shareAction, icon: <Share2 color={C.ink} size={18} /> }] : []),
          { label: t('Rejouer', 'Rejwe'), icon: <RefreshCw color={C.ink} size={18} />, onPress: onRetry },
          ...(!leadChallenge && challengeAction ? [challengeAction] : []),
        ]}
        link={mistakes.length > 0
          ? { label: review ? t('Masquer mes erreurs', 'Kache erè m yo') : t(`Revoir mes erreurs (${mistakes.length})`, `Revize erè m yo (${mistakes.length})`), onPress: () => setReview((r) => !r) }
          : { label: t('Choisir un autre thème', 'Chwazi yon lòt tèm'), onPress: onChooseCategory }}
      >
        {intent === 'challenge' ? (
          <Text style={[arenaType.body, { color: C.inkSoft, textAlign: 'center' }]}>
            {onChallenge
              ? t(
                `Envoie le lien : ton ami joue ces ${total} questions quand il veut et essaie de battre ton ${score} sur ${total}.`,
                `Voye lyen an : zanmi w jwe ${total} kesyon sa yo lè li vle e li eseye bat ${score} sou ${total} ou a.`,
              )
              : t('Connecte-toi pour envoyer ce défi à un ami.', 'Konekte pou w voye defi sa a bay yon zanmi.')}
          </Text>
        ) : null}
        {dailyReplay || reward?.guest ? (
          <Text style={[arenaType.status, { color: C.muted, textAlign: 'center' }]}>
            {dailyReplay
              ? t("Défi déjà joué aujourd'hui : manche d'entraînement (0 XP).", 'Defi a te fèt deja jodi a : antrennman (0 XP).')
              : t('Connecte-toi pour garder tes XP.', 'Konekte pou kenbe XP ou.')}
          </Text>
        ) : null}

        {/* Revoir mes erreurs — a wrong answer should teach, not just count. */}
        {review && mistakes.length > 0 ? (
          <View style={{ gap: 10 }}>
            {mistakes.map((m, i) => {
              // `chosen` was captured as the DISPLAYED string, so the right
              // answer and explanation resolve in the same language.
              const correct = isCreole && m.q.optionsHt && m.q.correctAnswerHt ? m.q.correctAnswerHt : m.q.correctAnswer;
              const expl = isCreole ? (m.q.explanationHt ?? m.q.explanation) : m.q.explanation;
              return (
                <View key={i} style={{ padding: 18, gap: 8, borderRadius: 20, backgroundColor: C.surface }}>
                  <Text style={[arenaType.name, { fontSize: 16, lineHeight: 22, color: C.ink }]}>{mathToText(isCreole ? m.q.qHt : m.q.q)}</Text>
                  <Text style={[arenaType.status, { color: C.danger }]}>
                    {t('Toi : ', 'Ou : ')}{m.chosen ?? t('temps écoulé', 'tan an fini')}
                  </Text>
                  <Text style={[arenaType.status, { color: C.success }]}>{t('Réponse : ', 'Repons : ')}{correct}</Text>
                  {expl ? <Text style={[arenaType.body, { color: C.muted }]}>{expl}</Text> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Aperçu du partage — exactly the card that will be posted. */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={[nightType.cardTitle, { color: C.ink }]}>{t('Aperçu du partage', 'Apèsi pataj la')}</Text>
            <Text style={[arenaType.status, { color: C.muted }]}>Story · 9:16</Text>
          </View>
          <View accessible accessibilityLabel={t('Aperçu de la carte à partager', 'Apèsi kat pou pataje a')} style={{ alignSelf: 'center', borderRadius: 24, overflow: 'hidden' }}>
            <ShareCard data={{ mode: 'score', subject: shareSubject, score, total }} lang={isCreole ? 'ht' : 'fr'} width={previewW} />
          </View>
        </View>

        {/* What that score did to the school race — the reason to play the
            next round, shown at the one moment the player is looking. */}
        <SchoolRace isCreole={isCreole} compact />
      </NightResult>
    </>
  );
}

// ─── Main TriviaScreen ────────────────────────────────────────────────────────

export default function TriviaScreen() {
  const { user, language, incrementGuestInteraction, setFocusMode, pendingDailyChallenge, setPendingDailyChallenge, quizAttempts, recordQuizAttempt } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  useNightStatusBar();

  const { profile, recordResult, recordGameResult, daily, isAuthed } = useTrivia();
  const { recordActivity } = useStreak();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const qc = useQueryClient();
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);

  const [phase, setPhase] = useState<TriviaPhase>('hub');
  // Practice or friend challenge — carried from the host to the result (M1).
  const [intent, setIntent] = useState<TriviaIntent>('practice');
  const startTrivia = useCallback((next?: TriviaIntent) => {
    setIntent(parseTriviaIntent(next));
    setSelectedCategory(null);
    setIsDailyRound(false);
    setPhase('categories');
  }, []);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [roundSize, setRoundSize] = useState(10);
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [finalScore, setFinalScore] = useState<{ score: number; total: number; picks?: (string | null)[] }>({ score: 0, total: 0 });
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
  // covers the answers and the next button. Reset when leaving the tab.
  useFocusEffect(
    useCallback(() => {
      setFocusMode(phase === 'playing' || phase === 'results' || phase === 'arcade');
      return () => setFocusMode(false);
    }, [phase, setFocusMode]),
  );

  // Tapping the "Jeux" tab returns to the hub. This screen is phase-based (not
  // a navigation stack), so we reset the local phase ourselves.
  useEffect(() => {
    const unsub = navigation.addListener('tabPress', () => {
      setIntent('practice');
      setPhase('hub');
      setSelectedGame(null);
      setSelectedCategory(null);
      setIsDailyRound(false);
    });
    return unsub;
  }, [navigation]);

  const highScores: Record<string, number> = (profile as any)?.games?.highScores || {};

  // Launch today's Daily Challenge: a fixed, shared 10-question round drawn
  // across all categories, under a synthetic 'daily' category.
  const startDaily = useCallback(() => {
    const qs = prepareDailyQuestions(10);
    if (!qs.length) return;
    setSelectedCategory({ id: 'daily', name: 'Défi du jour', nameHt: 'Defi jodi a' });
    setQuestions(qs);
    setRoundSize(qs.length);
    setIsDailyRound(true);
    setPhase('playing');
  }, []);

  const startMixed = useCallback(() => {
    tapMedium();
    const qs = prepareMixedQuestions(10);
    if (!qs.length) return;
    setSelectedCategory({ id: 'mixed', name: 'Mélange de thèmes', nameHt: 'Melanj tèm' });
    setQuestions(qs);
    setRoundSize(qs.length);
    setIsDailyRound(false);
    setPhase('playing');
  }, []);

  // Deep-link from the home "Défi du jour" widget: it sets a transient store
  // flag, then navigates to this tab. Consume it on focus (once). When today's
  // challenge is already done, acknowledge it instead of a dead tap.
  useFocusEffect(
    useCallback(() => {
      if (pendingDailyChallenge) {
        setPendingDailyChallenge(false);
        if (!daily?.completedToday) startDaily();
        else setDailyDoneNote(true);
      }
    }, [pendingDailyChallenge, setPendingDailyChallenge, daily, startDaily]),
  );

  // The ArenaHub root route hands its intent over as a tab param (practice or
  // challenge, with a nonce so the same intent twice still lands). Consume it
  // once, then clear it so a later tab visit does not replay it.
  const routeIntent = route?.params?.intent;
  const routeNonce = route?.params?.nonce;
  useEffect(() => {
    if (!routeIntent) return;
    startTrivia(parseTriviaIntent(routeIntent));
    navigation.setParams({ intent: undefined, nonce: undefined });
  }, [routeIntent, routeNonce, startTrivia, navigation]);

  useEffect(() => {
    if (!dailyDoneNote) return;
    const tmr = setTimeout(() => setDailyDoneNote(false), 3500);
    return () => clearTimeout(tmr);
  }, [dailyDoneNote]);

  // "Défier un ami" — only when the finished round is faithfully reproducible:
  // a signed-in player, a real category round (daily/mixed draws span banks),
  // and every question still carrying its bank index.
  const challengeIdxs = useMemo(() => {
    if (!isAuthed || isDailyRound || !selectedCategory?.id || selectedCategory.id === 'daily' || selectedCategory.id === 'mixed') return null;
    const idxs = questions.map((q) => q.idx);
    return idxs.length > 0 && idxs.every((i) => i != null) ? (idxs as number[]) : null;
  }, [isAuthed, isDailyRound, selectedCategory, questions]);

  const handleChallenge = useCallback(async () => {
    if (!challengeIdxs || !selectedCategory) return;
    const created = await createChallenge({
      categoryId: selectedCategory.id,
      questionIdxs: challengeIdxs,
      score: finalScore.score,
      // The server grades the duel from these (P0 validation D-8).
      answers: finalScore.picks?.length === challengeIdxs.length ? finalScore.picks : undefined,
      bankHash: bankHash((TRIVIA_QUESTIONS as Record<string, any[]>)[selectedCategory.id]),
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

  const handleSelectCategory = useCallback((categoryId: string) => {
    select();
    const cat = TRIVIA_CATEGORIES.find((c: any) => c.id === categoryId);
    setSelectedCategory(cat ?? null);
    setIsDailyRound(false);
    // A challenge plays a fixed short round straight away: the duel is the
    // point, not the round size.
    const available = (TRIVIA_QUESTIONS as Record<string, any[]>)[categoryId]?.length ?? 0;
    const fixed = cat ? roundSizeFor(intent, available) : null;
    if (fixed) {
      setQuestions(prepareQuestions(categoryId, fixed));
      setRoundSize(fixed);
      setPhase('playing');
      return;
    }
    setPhase('roundPicker');
  }, [intent]);

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

  const handleGameFinish = useCallback(
    (score: number, total: number, mistakes: RoundMistake[] = [], picks: (string | null)[] = []) => {
      // Captured BEFORE recording flips completedToday, so the results screen
      // knows whether this round was a 0-XP replay of a finished daily.
      const dailyReplay = isDailyRound && !!daily?.completedToday;
      setFinalScore({ score, total, picks });
      setRoundMistakes(mistakes);
      setWasDailyReplay(dailyReplay);
      setLastReward(null);
      setFreezeEarned(false);
      setPhase('results');
      incrementGuestInteraction();

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

      // Persist XP/profile via the shared gamification service, and hand the
      // REAL reward (breakdown, level-up, guest flag) to the results screen.
      // Leaderboard submission happens inside recordResult.
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

  const exitToHub = useCallback(() => {
    setIntent('practice');
    setPhase('hub');
    setSelectedGame(null);
    setSelectedCategory(null);
    setIsDailyRound(false);
  }, []);

  const arcadeProps = { isCreole, onExit: exitToHub, onRecord: recordGameResult };

  // "Rejouer" — the same theme and size; the Daily replays today's fixed set
  // (its +50 XP is awarded once a day; the service dedupes).
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
    if (selectedCategory?.id === 'mixed') {
      setQuestions(prepareMixedQuestions(roundSize || 10));
      setPhase('playing');
      return;
    }
    if (!selectedCategory) {
      setPhase('categories');
      return;
    }
    setQuestions(prepareQuestions(selectedCategory.id, roundSize));
    setPhase('playing');
  }, [isDailyRound, selectedCategory, roundSize]);

  const handleChooseCategory = useCallback(() => {
    tapLight();
    setPhase('categories');
    setSelectedCategory(null);
    setIsDailyRound(false);
  }, []);

  const confirmQuit = useCallback(() => {
    // Mid-round progress is unrecoverable — never discard it on one tap.
    Alert.alert(
      t('Quitter la partie ?', 'Kite pati a ?'),
      t('La progression de cette manche sera perdue.', 'Pwogrè manch sa a ap pèdi.'),
      [
        { text: t('Continuer', 'Kontinye jwe'), style: 'cancel' },
        {
          text: t('Quitter', 'Kite'),
          style: 'destructive',
          onPress: () => {
            if (isDailyRound || selectedCategory?.id === 'mixed') exitToHub();
            else setPhase('categories');
          },
        },
      ],
    );
  }, [isDailyRound, selectedCategory, exitToHub]); // eslint-disable-line react-hooks/exhaustive-deps

  const playTitle = selectedCategory
    ? (isDailyRound ? t('Défi du jour', 'Defi jodi a') : `Trivia · ${isCreole ? (selectedCategory.nameHt ?? selectedCategory.name) : selectedCategory.name}`)
    : 'Trivia';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      {phase === 'hub' && (
        <>
          <JeuxHub
            onSelectGame={(id) => { setSelectedGame(id); setPhase('arcade'); }}
            onStartTrivia={startTrivia}
            onStartDaily={startDaily}
            onRematch={handleSelectCategory}
          />
          {/* Transient ack for the home deep-link when the daily is done. */}
          {dailyDoneNote && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 20, right: 20, zIndex: 10, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surfaceRaised, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Check color={C.success} size={16} />
                <Text style={[arenaType.status, { color: C.ink }]} numberOfLines={1}>
                  {t(
                    `Défi du jour déjà terminé : ${daily?.score ?? ''}/${daily?.total ?? ''}. Reviens demain.`,
                    `Defi jodi a fini deja : ${daily?.score ?? ''}/${daily?.total ?? ''}. Tounen demen.`,
                  )}
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {phase === 'arcade' && selectedGame && (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 4 }}>
            <NightIconButton onPress={exitToHub} label={t('Fermer', 'Fèmen')} />
            <Text style={[arenaType.name, { fontSize: 17, color: C.ink }]}>{t('Les jeux', 'Jwèt yo')}</Text>
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

      {phase === 'categories' && (
        <CategoryPicker
          onSelect={handleSelectCategory}
          onMixed={startMixed}
          onBack={exitToHub}
          header={<DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={startDaily} compact />}
          isCreole={isCreole}
          intent={intent}
          isAuthed={isAuthed}
          onSignIn={toggleAuthModal}
        />
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
        <QuizPlayer
          questions={questions}
          category={selectedCategory}
          isCreole={isCreole}
          onFinish={handleGameFinish}
          onQuit={confirmQuit}
          title={playTitle}
        />
      )}

      {phase === 'results' && selectedCategory && (
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
          intent={intent}
        />
      )}
    </SafeAreaView>
  );
}
