import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, withSpring, withRepeat, Easing,
} from 'react-native-reanimated';
import { Check, X, Zap } from 'lucide-react-native';
import useStore from '../../contexts/store';
import MathText from '../../components/MathText';
import StageEnter from '../../components/trivia/StageEnter';
import ScoreCounter from '../../components/trivia/ScoreCounter';
import CorrectFlash from '../../components/trivia/CorrectFlash';
import { useArenaLive, useArenaAnswer } from '../../hooks/useArena';
import { tierRing } from '../../services/arenaService';
import { useFocusLossCounter } from '../../utils/integrity';
import { classifyAnswerResult, type AnswerReceiptStatus } from '../../utils/arenaAnswerReceipt';
import { useColors, useTheme, typeScale, radius } from '../../theme/theme';
import { success, warn, tapMedium } from '../../utils/haptics';
import { useReduceMotion } from '../../utils/motion';
import { spring, duration, easing } from '../../theme/motion';

const LETTER_LABELS = ['A', 'B', 'C', 'D'];
const RING_CIRC = 2 * Math.PI * 52;

/**
 * Live — the existing trivia frame, stripped and tightened.
 *
 * Three departures from the practice quiz, each of which is the tournament
 * rather than a preference:
 *
 *  1. ONE TAP LOCKS. There is no Confirmer step and no changing your mind: the
 *     submission IS the commitment, and a two-step flow at 20 seconds a
 *     question just taxes slow readers twice.
 *  2. THE CLOCK IS A TIER, NOT A COUNTDOWN. The ring carries the full/half
 *     boundary as a visible mark and changes colour crossing it, because the
 *     tier has to be legible WHILE answering — explaining afterwards that the
 *     answer scored 500 instead of 1000 teaches nothing anybody can use.
 *  3. NO GLOBAL LEADERBOARD. Between questions the only thing on screen is the
 *     student's school position and whether they are in its five. Watching
 *     yourself drop mid-round is demoralising and it invites tab-switching —
 *     and your school's five is the tension that makes the next question
 *     matter.
 */
export default function ArenaLiveScreen() {
  const route = useRoute<any>();
  const tid: string | null = route?.params?.tournamentId ?? null;

  const colors = useColors();
  const { shadow } = useTheme();
  const language = useStore((s) => s.language);
  const setFocusMode = useStore((s) => s.setFocusMode);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const reduceMotion = useReduceMotion();

  // The presence heartbeat runs inside useArenaLive: a student watching the
  // round IS in the room, and qualification is decided on who is.
  const { tournament, question, mySchool, me, inFive, answerable, inPause, loading, now } = useArenaLive(tid);
  const navigation = useNavigation<any>();

  /*
   * The last question has closed. Hand over to the result screen with `replace`
   * rather than `navigate`: there is nothing to go back to, and leaving the
   * live screen on the stack lets a student swipe back into a tournament that
   * has ended and sit on a dead question.
   */
  const over = !!tournament && tournament.state !== 'live' && tournament.state !== 'doors';
  useEffect(() => {
    if (over && tid) navigation.replace('ArenaResult', { tournamentId: tid });
  }, [over, tid, navigation]);
  const answer = useArenaAnswer(tid);

  // The Arena takes over the screen on tournament night: anything that lets a
  // student wander into Cours mid-round and lose their place is a defect.
  useFocusEffect(useCallback(() => {
    setFocusMode(true);
    return () => setFocusMode(false);
  }, [setFocusMode]));

  // ── One question's local state ─────────────────────────────────────────
  const index = question?.index ?? null;
  const [choice, setChoice] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  // When THIS device painted the question. The clock starts here, not when the
  // server opened it — otherwise a slow connection is taxed for the network.
  const shownAt = useRef<number>(Date.now());
  const takeFocusReading = useFocusLossCounter(answerable);

  // The mutation's own resolved value, not just "did the promise settle" —
  // submitAnswer() never throws, so a dropped connection or a window that
  // had already closed comes back as an ordinary `{ok:false}` result. See
  // utils/arenaAnswerReceipt.ts for why that distinction matters here.
  const [receipt, setReceipt] = useState<AnswerReceiptStatus | null>(null);
  // Captured once per commit, not re-read on retry: useFocusLossCounter's
  // takeReading() resets its counters when called, so calling it a second
  // time for a retry would silently zero out the first attempt's reading.
  const focusReadingRef = useRef<{ focusLosses: number; awayMs: number } | null>(null);

  useEffect(() => {
    if (index == null) return;
    setChoice(null);
    setLocked(false);
    setReceipt(null);
    focusReadingRef.current = null;
    shownAt.current = Date.now();
  }, [index]);

  const elapsed = Math.max(0, now - shownAt.current);
  const ring = tierRing(elapsed);

  const options = isCreole && question?.optionsHt?.length ? question.optionsHt : question?.options ?? [];
  const prompt = isCreole && question?.promptHt ? question.promptHt : question?.prompt ?? '';
  const revealed = question?.state === 'closed' ? question.answerIndex : null;
  const wasCorrect = revealed != null && choice != null && choice === revealed;

  useEffect(() => {
    if (revealed == null || choice == null) return;
    if (choice === revealed) success(); else warn();
  }, [revealed, choice]);

  /**
   * The tap that commits.
   *
   * Local state locks BEFORE the request is in flight — the student is
   * committed the instant they touch the option, and a spinner between the tap
   * and the lock is where double-answers come from. The composite answer ID
   * makes a duplicate a no-op server-side, so the optimism is safe.
   */
  const pick = (i: number) => {
    if (locked || !answerable || index == null) return;
    tapMedium();
    setChoice(i);
    setLocked(true);
    setReceipt('sending');
    focusReadingRef.current = takeFocusReading();
    answer.mutate(
      {
        questionIndex: index,
        choice: i,
        clientShownAt: shownAt.current,
        focusLosses: focusReadingRef.current.focusLosses,
      },
      { onSuccess: (result) => setReceipt(classifyAnswerResult(result)) },
    );
  };

  /**
   * The tap never reached the server, or the server couldn't tell why it
   * failed — offline, a timeout, a 5xx. Retrying is safe: the composite
   * answer id makes a second attempt a no-op if the first one actually
   * landed (see submitAnswer's own doc comment).
   */
  const retry = () => {
    if (receipt !== 'retryable' || choice == null || index == null) return;
    setReceipt('sending');
    answer.mutate(
      {
        questionIndex: index,
        choice,
        clientShownAt: shownAt.current,
        focusLosses: focusReadingRef.current?.focusLosses ?? 0,
      },
      { onSuccess: (result) => setReceipt(classifyAnswerResult(result)) },
    );
  };

  const schoolLine = useMemo(() => {
    if (!mySchool) return null;
    return {
      rank: mySchool.rank,
      short: mySchool.shortName || mySchool.label,
      teamAvg: mySchool.teamAvg,
      inFive,
      teamSize: tournament?.teamSize ?? 5,
      qualified: mySchool.qualified,
    };
  }, [mySchool, inFive, tournament?.teamSize]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.azure} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ── Head: where we are, and what this answer is worth ───────────── */}
      <View style={{
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
        backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[typeScale.label, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>
              {t('Question', 'Kesyon')} {(index ?? 0) + 1} / {tournament?.questionCount ?? '—'}
            </Text>
            {question?.category ? (
              <Text numberOfLines={1} style={[typeScale.micro, { color: colors.muted }]}>
                {question.category}
              </Text>
            ) : null}
          </View>

          {/* The score moves only when a question CLOSES, because it comes off
              the standings document and not off a player row. That is the
              integrity rule showing through the UI: a score that ticked the
              instant an answer landed would tell five friends which option was
              right while the question was still open for everyone else. */}
          {me ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <Zap color={colors.azure} size={13} />
              <ScoreCounter value={me.score} style={{ ...typeScale.label, color: colors.azure }} />
            </View>
          ) : null}

          <TierRing ring={ring} active={answerable && !locked} isCreole={isCreole} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {question && (answerable || locked || question.state === 'closed') ? (
          <>
            <StageEnter playKey={index ?? 0} index={0} springy style={{ marginBottom: 16 }}>
              <View style={{
                borderRadius: radius.card, overflow: 'hidden',
                borderWidth: 1, borderColor: colors.border, ...shadow.md,
              }}>
                <LinearGradient
                  colors={[colors.surface, colors.surfaceAlt]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={{ padding: 18 }}
                >
                  <MathText text={prompt} />
                </LinearGradient>
              </View>
            </StageEnter>

            <View style={{ gap: 10 }}>
              {wasCorrect ? <CorrectFlash playKey={index ?? 0} streak={me?.streak ?? 0} /> : null}
              {options.map((opt, i) => (
                <StageEnter key={i} playKey={index ?? 0} index={i + 1}>
                  <AnswerOption
                    opt={opt}
                    label={LETTER_LABELS[i] ?? String(i + 1)}
                    isSelected={choice === i}
                    isCorrectOpt={revealed === i}
                    revealed={revealed != null}
                    locked={locked || !answerable}
                    onPress={() => pick(i)}
                    reduceMotion={reduceMotion}
                  />
                </StageEnter>
              ))}
            </View>

            {locked && revealed == null ? (
              <AnswerReceiptLine receipt={receipt} onRetry={retry} t={t} />
            ) : null}
          </>
        ) : null}

        {/* ── Between questions: your school, and your five. Nothing else. ── */}
        {inPause || question?.state !== 'open' ? (
          <StageEnter playKey={`pause-${index ?? 0}`} index={0} style={{ marginTop: 18 }}>
            <SchoolPosition line={schoolLine} isCreole={isCreole} />
          </StageEnter>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── The tier clock ──────────────────────────────────────────────────────────

/**
 * A ring that shows the BOUNDARY, not just the time.
 *
 * The arc burns down over the 20s in which an answer can still score anything.
 * The hairline across it sits at 12s — the full/half edge — and the arc changes
 * colour the moment it passes, so a student watching the ring knows, without
 * being told, that the answer they are about to give is now worth half. The
 * number in the middle counts down to the NEXT tier rather than to zero, which
 * is the only version of that number anyone can act on.
 */
function TierRing({ ring, active, isCreole }: {
  ring: ReturnType<typeof tierRing>;
  active: boolean;
  isCreole: boolean;
}) {
  const colors = useColors();
  const reduceMotion = useReduceMotion();
  const tone = ring.tier === 'full' ? colors.success : ring.tier === 'half' ? colors.warn : colors.danger;

  const beat = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion || !active || ring.tier !== 'half') {
      beat.value = withTiming(1, { duration: duration.instant });
      return;
    }
    // A soft pulse only in the half band — the seconds that are still worth
    // something but are visibly worth less.
    beat.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 420, easing: easing.standard }),
        withTiming(1, { duration: 420, easing: easing.standard }),
      ),
      -1,
      false,
    );
  }, [ring.tier, active, reduceMotion, beat]);

  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  // The boundary mark, in ring coordinates: the arc starts at the top and runs
  // clockwise, so the full/half edge sits `1 - boundary` of the way round.
  const boundaryAngle = (1 - ring.boundary) * 360 - 90;
  const rad = (boundaryAngle * Math.PI) / 180;

  return (
    <Animated.View style={[{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, pulse]}>
      <Svg width={46} height={46} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={52} fill="none" stroke={colors.border} strokeWidth={10} />
        <Circle
          cx={60} cy={60} r={52} fill="none"
          stroke={tone} strokeWidth={10}
          strokeDasharray={`${ring.remaining * RING_CIRC} ${RING_CIRC}`}
          strokeLinecap="round"
          rotation="-90"
          origin="60, 60"
        />
        {/* The full/half edge, drawn ON the track so it is legible before it
            is reached — a boundary you only see once you cross it is a report,
            not a warning. */}
        <Line
          x1={60 + 45 * Math.cos(rad)} y1={60 + 45 * Math.sin(rad)}
          x2={60 + 59 * Math.cos(rad)} y2={60 + 59 * Math.sin(rad)}
          stroke={colors.ink} strokeWidth={4} strokeLinecap="round" opacity={0.55}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: tone, fontVariant: ['tabular-nums'] }}>
          {ring.secondsInTier}
        </Text>
      </View>
      <Text
        style={{ position: 'absolute', bottom: -13, fontSize: 9, color: tone }}
        accessibilityLabel={isCreole ? 'Nivo pwen an' : 'Palier de points'}
      >
        {ring.tier === 'full' ? '1000' : ring.tier === 'half' ? '500' : '0'}
      </Text>
    </Animated.View>
  );
}

// ── The answer receipt ──────────────────────────────────────────────────────

/**
 * The one line that used to always say "Réponse envoyée" no matter what
 * actually happened to the tap. Four honest states instead of one reassuring
 * one — see utils/arenaAnswerReceipt.ts for what decides between them.
 */
function AnswerReceiptLine({ receipt, onRetry, t }: {
  receipt: AnswerReceiptStatus | null;
  onRetry: () => void;
  t: (fr: string, ht: string) => string;
}) {
  const colors = useColors();

  if (receipt === 'accepted' || receipt === null) {
    return (
      <Text style={[typeScale.caption, { color: colors.muted, marginTop: 14, textAlign: 'center' }]}>
        {t('Réponse envoyée. Pas de retour en arrière.', 'Repons ou ale. Pa gen retounen.')}
      </Text>
    );
  }

  if (receipt === 'sending') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}>
        <ActivityIndicator size="small" color={colors.muted} />
        <Text style={[typeScale.caption, { color: colors.muted }]}>
          {t('Envoi en cours…', 'N ap voye li…')}
        </Text>
      </View>
    );
  }

  if (receipt === 'rejected') {
    return (
      <Text style={[typeScale.caption, { color: colors.danger, marginTop: 14, textAlign: 'center' }]}>
        {t(
          'Cette question est fermée — ta réponse n’a pas été comptée.',
          'Kesyon sa a fèmen — repons ou pa konte.',
        )}
      </Text>
    );
  }

  // 'retryable' — a dropped connection or an unrecognised error. The tap may
  // not have reached the server at all, so the honest move is to say so and
  // let the student send it again rather than leave them trusting a receipt
  // that never arrived.
  return (
    <View style={{ alignItems: 'center', marginTop: 14, gap: 8 }}>
      <Text style={[typeScale.caption, { color: colors.danger, textAlign: 'center' }]}>
        {t('Ta réponse n’est pas passée. Vérifie ta connexion.', 'Repons ou pa pase. Tcheke koneksyon ou.')}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        style={{
          paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
          backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger,
        }}
      >
        <Text style={[typeScale.label, { color: colors.danger }]}>
          {t('Réessayer', 'Eseye ankò')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── One option ──────────────────────────────────────────────────────────────

/**
 * Same tonal language as the practice quiz, minus the amber "selected but not
 * confirmed" state — there is no such state here, because a tap is the answer.
 */
function AnswerOption({
  opt, label, isSelected, isCorrectOpt, revealed, locked, onPress, reduceMotion,
}: {
  opt: string;
  label: string;
  isSelected: boolean;
  isCorrectOpt: boolean;
  revealed: boolean;
  locked: boolean;
  onPress: () => void;
  reduceMotion: boolean;
}) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!revealed || reduceMotion) return;
    if (isCorrectOpt) {
      scale.value = withSequence(
        withTiming(1.06, { duration: 130, easing: Easing.out(Easing.quad) }),
        withSpring(1, spring.select),
      );
    } else if (isSelected) {
      shake.value = withSequence(
        withTiming(-6, { duration: 50, easing: Easing.linear }),
        withRepeat(withTiming(6, { duration: 70, easing: Easing.linear }), 4, true),
        withTiming(0, { duration: 50, easing: Easing.linear }),
      );
    }
  }, [revealed, isCorrectOpt, isSelected, reduceMotion, scale, shake]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shake.value }],
  }));

  let borderColor = colors.border;
  let bgColor = colors.surface;
  let labelBg = colors.surfaceAlt;
  let labelText = colors.muted;

  if (revealed) {
    if (isCorrectOpt) {
      borderColor = colors.success; bgColor = colors.successSoft; labelBg = colors.successFill; labelText = '#fff';
    } else if (isSelected) {
      borderColor = colors.danger; bgColor = colors.dangerSoft; labelBg = colors.danger; labelText = '#fff';
    }
  } else if (isSelected) {
    // Locked, not "selected": the tap already committed it.
    borderColor = colors.azure; bgColor = colors.azureSoft; labelBg = colors.azureFill; labelText = '#fff';
  }

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        onPress={onPress}
        disabled={locked}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked, selected: isSelected }}
        style={{
          flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
          borderWidth: 1.5, borderColor, backgroundColor: bgColor, borderRadius: 15,
          opacity: locked && !isSelected && !revealed ? 0.6 : 1,
        }}
      >
        <View style={{
          width: 34, height: 34, margin: 8, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center', backgroundColor: labelBg,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: labelText }}>{label}</Text>
        </View>
        <Text style={[typeScale.bodyMd, { color: colors.ink, flex: 1, paddingRight: 12, paddingVertical: 10 }]}>
          {opt}
        </Text>
        {revealed && isCorrectOpt ? <View style={{ paddingRight: 12 }}><Check color={colors.success} size={18} /></View> : null}
        {revealed && isSelected && !isCorrectOpt ? <View style={{ paddingRight: 12 }}><X color={colors.danger} size={18} /></View> : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Between questions ───────────────────────────────────────────────────────

/**
 * Your school, and whether you are in its five. That is the whole interstitial.
 *
 * A global board here would answer "am I winning", which nobody mid-round can
 * do anything about. This answers "is my school winning, and am I one of the
 * five carrying it" — which is a question the next twenty seconds can change.
 */
function SchoolPosition({ line, isCreole }: {
  line: { rank: number; short: string; teamAvg: number; inFive: boolean; teamSize: number; qualified: boolean } | null;
  isCreole: boolean;
}) {
  const colors = useColors();
  const { radius: r } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  if (!line) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 6 }}>
        <Text style={[typeScale.label, { color: colors.muted }]}>
          {t('Question suivante…', 'Pwochen kesyon an…')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{
      gap: 10, padding: 16, borderRadius: r.card,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    }}>
      <Text style={[typeScale.overline, { color: colors.muted }]}>
        {t('Ton école', 'Lekòl ou')}
      </Text>
      <Text numberOfLines={1} style={[typeScale.h1, { color: colors.ink }]}>{line.short}</Text>
      {/* `rank` is 0 for a school that cannot compete — "0e" is a number we
          would be inventing, so it is simply not shown. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        {line.rank > 0 ? (
          <Text style={[typeScale.display, { color: colors.azure, fontVariant: ['tabular-nums'] }]}>
            {line.rank}
            <Text style={[typeScale.label, { color: colors.muted }]}>
              {line.rank === 1 ? t('er', 'yèm') : t('e', 'yèm')}
            </Text>
          </Text>
        ) : null}
        <Text style={[typeScale.label, { color: colors.muted, fontVariant: ['tabular-nums'] }]}>
          {t('moyenne', 'mwayèn')} {Math.round(line.teamAvg)}
        </Text>
      </View>

      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
        backgroundColor: line.inFive ? colors.successSoft : colors.warnSoft,
      }}>
        {line.inFive ? <Check color={colors.successFill} size={14} /> : <Zap color={colors.warn} size={14} />}
        <Text style={[typeScale.label, { color: line.inFive ? colors.successFill : colors.warn }]}>
          {line.inFive
            ? t(`Tu es dans les ${line.teamSize}`, `Ou nan ${line.teamSize} yo`)
            : t(`Pas encore dans les ${line.teamSize}`, `Ou poko nan ${line.teamSize} yo`)}
        </Text>
      </View>

      {/* A school that failed to qualify still plays — its students compete
          individually and nobody is turned away. Saying so here is the
          difference between "we are out" and "we are still in this". */}
      {!line.qualified ? (
        <Text style={[typeScale.caption, { color: colors.muted, textAlign: 'center' }]}>
          {t(
            'Ton école n\u2019est pas qualifiée ce soir — tu continues en individuel.',
            'Lekòl ou pa kalifye aswè a — ou kontinye pou kont ou.',
          )}
        </Text>
      ) : null}
    </View>
  );
}
