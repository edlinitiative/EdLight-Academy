import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Check, X, Zap } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { TIER_FULL_MS, TIER_HALF_MS } from '../../../../shared/arena/scoring';
import { pickWarmUpQuestions, type WarmUpQuestion } from '../../utils/warmUpQuestions';
import { useColors, useTheme, typeScale } from '../../theme/theme';
import { select, success, warn } from '../../utils/haptics';

/**
 * The warm-up — the wait, made into practice.
 *
 * The ten minutes before the first question are the only moment in the
 * tournament when a student sits staring at a screen with nothing to do, and
 * the school often cannot start because it is two players short. Both problems
 * want the same answer: give them the real game to play while they wait.
 *
 * IT IS THE ACTUAL FORMAT, not a lookalike. Same tier clock —
 * `TIER_FULL_MS` / `TIER_HALF_MS` straight from `shared/arena/scoring`, so
 * 12 seconds means here exactly what it will mean at 18:00 — same four chips,
 * same one-tap-and-it-locks rule. The first real question must not be the first
 * time a student has seen this shape.
 *
 * ── TWO RULES THIS COMPONENT MAY NEVER BREAK ────────────────────────────────
 *
 * 1. THE QUESTIONS COME FROM THE PRACTICE BANK, never the tournament's.
 *    `TRIVIA_QUESTIONS` ships inside the app WITH its answers, which is
 *    exactly what a tournament bank can never do (integrity rule 1). Reaching
 *    for the real questions here would put the answer key on the phone.
 *
 * 2. NOTHING HERE SCORES. No XP, no streak, no leaderboard write, nothing that
 *    ranks. A student who warms up for ten minutes and one who arrives at
 *    18:00 must start the tournament exactly equal — otherwise the warm-up
 *    stops being a courtesy and becomes a thing you have to do to compete.
 */

export default function ArenaWarmUp({ isCreole, onExit }: { isCreole: boolean; onExit?: () => void }) {
  const colors = useColors();
  const { radius } = useTheme();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const questions = useMemo(() => pickWarmUpQuestions(12), []);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [right, setRight] = useState(0);
  const shownAt = useRef(Date.now());

  const question = questions[index % Math.max(1, questions.length)];
  const locked = choice !== null;

  // The clock, ticking only while a question is open. Stopped the instant an
  // answer lands so the tier a student sees is the tier they earned.
  useEffect(() => {
    if (locked) return undefined;
    const id = setInterval(() => setElapsed(Date.now() - shownAt.current), 100);
    return () => clearInterval(id);
  }, [locked, index]);

  const next = useCallback(() => {
    setChoice(null);
    setElapsed(0);
    shownAt.current = Date.now();
    setIndex((i) => i + 1);
  }, []);

  const answer = useCallback((i: number) => {
    if (locked) return;
    const ms = Date.now() - shownAt.current;
    setElapsed(ms);
    setChoice(i);
    const correct = i === question?.answer;
    if (correct) { success(); setRight((r) => r + 1); } else { warn(); }
  }, [locked, question]);

  if (!question) return null;

  const options = (isCreole && question.optionsHt?.length ? question.optionsHt : question.options) ?? [];
  const prompt = (isCreole && question.qHt) ? question.qHt : question.q;

  // The same three bands the tournament pays on, shown as a draining bar so the
  // 12-second boundary is something a student FEELS before it costs them.
  const ratio = Math.min(1, elapsed / TIER_HALF_MS);
  const tierColor = elapsed <= TIER_FULL_MS
    ? colors.success
    : elapsed <= TIER_HALF_MS ? colors.warn : colors.danger;

  return (
    <View style={{
      padding: 16, borderRadius: radius.card, gap: 12,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Zap color={colors.azure} size={14} />
        <Text style={[typeScale.overline, { color: colors.muted, flex: 1 }]}>
          {t('Échauffement', 'Chofe kò w')}
        </Text>
        <Text style={[typeScale.caption, { color: colors.muted }]}>
          {right}/{index + (locked ? 1 : 0)}
        </Text>
      </View>

      {/* Says what it is, every time. A practice round that looks like the
          tournament must never be mistaken for the tournament. */}
      <Text style={[typeScale.caption, { color: colors.muted }]}>
        {t(
          'Pour s’entraîner — ça ne compte pas au classement.',
          'Se pou antrene — li pa konte nan klasman an.',
        )}
      </Text>

      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{
          width: `${Math.max(2, (1 - ratio) * 100)}%`, height: '100%', backgroundColor: tierColor,
        }} />
      </View>

      <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{prompt}</Text>

      <View style={{ gap: 8 }}>
        {options.map((opt, i) => {
          const isAnswer = i === question.answer;
          const picked = choice === i;
          const show = locked && (isAnswer || picked);
          return (
            <PressableScale
              key={`${index}-${i}`}
              onPress={() => { if (!locked) { select(); answer(i); } }}
              disabled={locked}
              pressedScale={0.99}
              accessibilityRole="button"
              accessibilityState={{ disabled: locked, selected: picked }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                padding: 13, borderRadius: radius.card,
                borderWidth: 1,
                borderColor: show ? (isAnswer ? colors.success : colors.danger) : colors.border,
                backgroundColor: show
                  ? (isAnswer ? colors.successSoft : colors.dangerSoft)
                  : colors.bg,
              }}
            >
              <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>{opt}</Text>
              {show ? (
                isAnswer
                  ? <Check color={colors.success} size={16} />
                  : <X color={colors.danger} size={16} />
              ) : null}
            </PressableScale>
          );
        })}
      </View>

      {locked ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {onExit ? (
            <PressableScale
              onPress={() => { select(); onExit(); }}
              pressedScale={0.98}
              accessibilityRole="button"
              style={{
                paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.card,
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              <Text style={[typeScale.label, { color: colors.muted }]}>{t('Arrêter', 'Kanpe')}</Text>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={() => { select(); next(); }}
            pressedScale={0.98}
            accessibilityRole="button"
            style={{
              flex: 1, paddingVertical: 12, borderRadius: radius.card,
              backgroundColor: colors.azure, alignItems: 'center',
            }}
          >
            <Text style={[typeScale.label, { color: '#fff' }]}>
              {t('Question suivante', 'Kesyon swivan')}
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}
