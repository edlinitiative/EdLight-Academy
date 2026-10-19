/**
 * The one answer anatomy (LJ-08), shared by the quiz bank, a lesson's
 * Exercices and Révision:
 *
 *   result       icon + words (never colour alone)
 *   your answer  what the student chose
 *   expected     the right option, when the question can be graded
 *   explanation  the authored one, or an honest "no explanation" line
 *   next step    the labelled footer button (owned by the runner)
 *
 * Look (Stitch 06, 2026-10-17): options are opaque white cards with the soft
 * card drop and NO outline. State is a full opaque wash — azureSoft for the
 * pending pick, successSoft for the right answer, dangerSoft for a wrong pick —
 * plus a 28pt disc and a word on the right. Nothing moves: no shake, no flash.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Check, X, Circle, AlertCircle, HelpCircle } from 'lucide-react-native';
import { useTheme, typeScale, fonts } from '../../../theme/theme';
import PressableScale from '../../ui/PressableScale';
import { MathText } from '../../MathText';
import { needsKatex } from '../../../utils/mathRouting';
import { answerStatusLabel, type Tx } from './copy';
import { isGradable, statusOf, type AnswerStatusKind, type LogEntry, type SessionItem } from './session';
import ExplainButton from '../../sandra/ExplainButton';
import type { ExplainSurface } from '../../../../../shared/explainContext';

const ICON: Record<AnswerStatusKind, any> = {
  correct: Check,
  incorrect: X,
  partial: AlertCircle,
  unanswered: Circle,
  ungraded: HelpCircle,
};

export function useStatusTone(kind: AnswerStatusKind) {
  const { colors, isDark } = useTheme();
  switch (kind) {
    case 'correct': return { fg: isDark ? colors.success : colors.successFill, bg: colors.successSoft, disc: colors.successFill };
    case 'incorrect': return { fg: colors.danger, bg: colors.dangerSoft, disc: colors.danger };
    case 'partial': return { fg: isDark ? colors.warn : '#9A5B00', bg: colors.warnSoft, disc: '#B45309' };
    default: return { fg: colors.muted, bg: colors.surfaceAlt, disc: colors.faint };
  }
}

/** Rich text when the string carries math, plain themed text otherwise. */
export function Rich({ text, style, numberOfLines }: { text: string; style?: any; numberOfLines?: number }) {
  const { colors } = useTheme();
  // MathText spreads its style into a WebView: give it none, it themes itself.
  if (needsKatex(text)) return <MathText text={text} />;
  return <Text numberOfLines={numberOfLines} style={[{ color: colors.ink }, style]}>{text}</Text>;
}

export function AnswerStatus({ kind, t, label }: { kind: AnswerStatusKind; t: Tx; label?: string }) {
  const tone = useStatusTone(kind);
  const Icon = ICON[kind];
  const words = label || answerStatusLabel(kind, t);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={words}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5,
      }}
    >
      <Icon color={tone.fg} size={16} strokeWidth={2.6} />
      <Text style={[typeScale.label, { fontFamily: fonts.bold, color: tone.fg }]}>{words}</Text>
    </View>
  );
}

/** The 28pt result disc on a checked option: white glyph on the status ground. */
function StatusDisc({ kind }: { kind: 'correct' | 'incorrect' }) {
  const tone = useStatusTone(kind);
  const Icon = ICON[kind];
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tone.disc, alignItems: 'center', justifyContent: 'center' }}>
      <Icon color="#ffffff" size={16} strokeWidth={3} />
    </View>
  );
}

const LETTERS = 'ABCDEFGHIJ';

/**
 * One option. Before checking: neutral white, the pending pick washed azure.
 * After checking: the right option (when known) washes green with "Bonne
 * réponse", the student's wrong pick washes red with "Ta réponse", and both
 * say so to VoiceOver.
 */
export function AnswerOption({
  item, index, entry, selected, checked, onPress, t,
}: {
  item: SessionItem;
  index: number;
  entry?: LogEntry | null;
  /** The pending (unchecked) selection. */
  selected: boolean;
  checked: boolean;
  onPress: () => void;
  t: Tx;
}) {
  const { colors, isDark, elevation } = useTheme();
  const opt = item.options[index];
  const graded = isGradable(item);
  const isKey = graded && index === item.correctIndex;
  const isPick = checked ? entry?.selected === index : selected;

  let bg = colors.surface;
  let discBg = colors.surfaceAlt;
  let discFg = colors.muted;
  let state = '';
  let tag: { kind: 'correct' | 'incorrect' | null; words: string; fg: string } | null = null;
  let lifted = true;

  if (checked) {
    if (isKey) {
      bg = colors.successSoft; discBg = colors.surface; discFg = isDark ? colors.success : colors.successFill;
      state = t('bonne réponse', 'bon repons');
      tag = { kind: 'correct', words: t('Bonne réponse', 'Bon repons'), fg: isDark ? colors.success : colors.successFill };
      lifted = false;
    } else if (isPick) {
      if (graded) {
        bg = colors.dangerSoft; discBg = colors.surface; discFg = colors.danger;
        state = t('ta réponse, incorrecte', 'repons ou, pa kòrèk');
        tag = { kind: 'incorrect', words: t('Ta réponse', 'Repons ou'), fg: colors.danger };
      } else {
        // No key to compare with: the pick is shown as the student's, never as wrong.
        bg = colors.azureSoft; discBg = colors.surface; discFg = colors.azureInk;
        state = t('ta réponse', 'repons ou');
        tag = { kind: null, words: t('Ta réponse', 'Repons ou'), fg: colors.azureInk };
      }
      lifted = false;
    }
  } else if (isPick) {
    bg = colors.azureSoft; discBg = colors.azureFill; discFg = '#ffffff';
    lifted = false;
  }

  const letter = LETTERS[index] ?? String(index + 1);
  return (
    <PressableScale
      onPress={onPress}
      disabled={checked}
      disabledOpacity={1}
      haptic={false}
      pressedScale={0.99}
      accessibilityRole="radio"
      accessibilityState={{ checked: isPick, disabled: checked }}
      accessibilityLabel={`${letter}. ${opt}${state ? `. ${state}` : ''}`}
      style={[
        {
          flexDirection: 'row', alignItems: 'center', gap: 14,
          backgroundColor: bg, borderRadius: 16,
          paddingVertical: 14, paddingHorizontal: 14, marginBottom: 12, minHeight: 64,
        },
        lifted && !isDark ? elevation.card : null,
      ]}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: discBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 20, color: discFg }}>{letter}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Rich text={opt} style={{ fontFamily: fonts.medium, fontSize: 18, lineHeight: 25, color: colors.ink }} />
      </View>
      {tag ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '42%' }}>
          <Text numberOfLines={2} style={[typeScale.label, { fontFamily: fonts.bold, color: tag.fg, textAlign: 'right', flexShrink: 1 }]}>{tag.words}</Text>
          {tag.kind ? <StatusDisc kind={tag.kind} /> : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

/**
 * "Ta réponse : [31,5 g/cm³]" — a label and a tonal value. Short plain values
 * sit in a pill on the right; long or math values drop below as a full-width
 * tonal block so nothing is squeezed or cut.
 */
function ValueRow({ label, value, tone }: { label: string; value: string; tone: { fg: string; bg: string } }) {
  const { colors } = useTheme();
  const inline = value.length <= 28 && !needsKatex(value) && !value.includes('\n');
  if (inline) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36 }}>
        <Text style={[typeScale.body, { color: colors.muted }]}>{label}</Text>
        <View style={{ backgroundColor: tone.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 1 }}>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: tone.fg, textAlign: 'right' }}>{value}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={[typeScale.body, { color: colors.muted }]}>{label}</Text>
      <View style={{ backgroundColor: tone.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Rich text={value} style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 23, color: colors.ink }} />
      </View>
    </View>
  );
}

/**
 * The correction under a checked question (and in the result list).
 * `showQuestion` repeats the prompt — the result list needs it, the live
 * question already shows it above. Bare: the caller owns the card around it.
 */
export function Correction({
  item, entry, t, showQuestion = false, index, explainSurface,
}: {
  item: SessionItem;
  entry?: LogEntry | null;
  t: Tx;
  showQuestion?: boolean;
  /** 1-based position, for the result list. */
  index?: number;
  /**
   * Offer "Explique-moi" on a wrong answer, from this surface. Omitted (no
   * button) during a scored quiz: there the explanation waits for the
   * result list. The button also needs an ExplainProvider above it.
   */
  explainSurface?: ExplainSurface;
}) {
  const { colors, isDark } = useTheme();
  const kind = statusOf(item, entry);
  const yours = entry?.selected != null ? item.options[entry.selected] : null;
  const expected = isGradable(item) ? item.options[item.correctIndex] : null;
  const wrongTone = { fg: colors.danger, bg: colors.dangerSoft };
  const rightTone = { fg: isDark ? colors.success : colors.successFill, bg: colors.successSoft };
  const neutralTone = { fg: colors.azureInk, bg: colors.azureSoft };
  const yoursTone = kind === 'correct' ? rightTone : kind === 'incorrect' ? wrongTone : neutralTone;
  // Hints are authored "think about…" lines; worth repeating after the answer
  // as a reminder, never instead of the explanation.
  const rappel = item.hint && item.hint.trim() && item.hint.trim() !== (item.explanation ?? '').trim() ? item.hint.trim() : '';

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <Text style={[typeScale.label, { color: colors.muted }]}>
          {index != null ? t(`Question ${index}`, `Kesyon ${index}`) : t('Correction', 'Koreksyon')}
        </Text>
        <AnswerStatus kind={kind} t={t} />
      </View>
      {showQuestion ? <Rich text={item.question} style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 24, color: colors.ink }} /> : null}

      {yours != null ? <ValueRow label={t('Ta réponse :', 'Repons ou :')} value={yours} tone={yoursTone} /> : null}

      {expected != null && kind !== 'correct' ? (
        <ValueRow label={t('Bonne réponse :', 'Bon repons :')} value={expected} tone={rightTone} />
      ) : null}

      {kind === 'ungraded' ? (
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {t('Cette question n’a pas de corrigé enregistré : elle n’est pas comptée et ne va pas dans Révision.',
            'Kesyon sa a pa gen koreksyon anrejistre : li pa konte e li pa ale nan Revizyon.')}
        </Text>
      ) : null}

      {kind !== 'unanswered' || showQuestion ? (
        item.explanation ? (
          <View style={{ gap: 8 }}>
            <Text style={[typeScale.body, { color: colors.muted }]}>{t('Explication :', 'Eksplikasyon :')}</Text>
            <View style={{ backgroundColor: isDark ? colors.surfaceAlt : colors.bg, borderRadius: 14, padding: 16, gap: 8 }}>
              <Rich text={item.explanation} style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 24, color: colors.ink }} />
              {rappel ? (
                <Text style={[typeScale.meta, { color: colors.muted }]}>{`${t('Rappel', 'Rapèl')} : ${rappel}`}</Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={[typeScale.body, { color: colors.muted }]}>
            {t('Pas d’explication rédigée pour cette question.', 'Pa gen eksplikasyon ekri pou kesyon sa a.')}
          </Text>
        )
      ) : null}

      {kind === 'incorrect' && explainSurface ? (
        <ExplainButton
          context={{
            surface: explainSurface,
            question: item.question,
            studentAnswer: yours ?? undefined,
            expectedAnswer: expected ?? undefined,
            explanation: item.explanation,
            subject: item.subjectCode,
            questionType: 'mcq',
            status: 'incorrect',
            questionId: item.id || undefined,
          }}
        />
      ) : null}
    </View>
  );
}
