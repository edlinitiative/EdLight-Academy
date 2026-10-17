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
 * No shake, no flash: a checked option changes its fill and gains an icon,
 * and nothing moves.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Check, X, Circle, AlertCircle, HelpCircle, Lightbulb } from 'lucide-react-native';
import { useTheme, typeScale, radius } from '../../../theme/theme';
import PressableScale from '../../ui/PressableScale';
import { MathText } from '../../MathText';
import { needsKatex } from '../../../utils/mathRouting';
import { answerStatusLabel, type Tx } from './copy';
import { isGradable, statusOf, type AnswerStatusKind, type LogEntry, type SessionItem } from './session';

const ICON: Record<AnswerStatusKind, any> = {
  correct: Check,
  incorrect: X,
  partial: AlertCircle,
  unanswered: Circle,
  ungraded: HelpCircle,
};

function useStatusTone(kind: AnswerStatusKind) {
  const { colors, isDark } = useTheme();
  switch (kind) {
    case 'correct': return { fg: isDark ? colors.success : colors.successFill, bg: colors.successSoft };
    case 'incorrect': return { fg: colors.danger, bg: colors.dangerSoft };
    case 'partial': return { fg: colors.warn, bg: colors.warnSoft };
    default: return { fg: colors.muted, bg: colors.surfaceAlt };
  }
}

/** Rich text when the string carries math, plain themed text otherwise. */
export function Rich({ text, style }: { text: string; style?: any }) {
  const { colors } = useTheme();
  // MathText spreads its style into a WebView: give it none, it themes itself.
  if (needsKatex(text)) return <MathText text={text} />;
  return <Text style={[{ color: colors.ink }, style]}>{text}</Text>;
}

export function AnswerStatus({ kind, t, label }: { kind: AnswerStatusKind; t: Tx; label?: string }) {
  const { colors } = useTheme();
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
        backgroundColor: tone.bg, borderRadius: radius.chip, paddingHorizontal: 10, paddingVertical: 5,
      }}
    >
      <Icon color={tone.fg} size={16} strokeWidth={2.5} />
      <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{words}</Text>
    </View>
  );
}

const LETTERS = 'ABCDEFGHIJ';

/**
 * One option. Before checking: neutral, selected = azure. After checking: the
 * right option (when known) gets a check, the student's wrong pick an X, and
 * both say so to VoiceOver.
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
  const { colors } = useTheme();
  const opt = item.options[index];
  const graded = isGradable(item);
  const isKey = graded && index === item.correctIndex;
  const isPick = checked ? entry?.selected === index : selected;

  let border = colors.border;
  let bg = colors.surface;
  let badgeBg = colors.surfaceAlt;
  let badgeFg = colors.muted;
  let state = '';
  let Icon: any = null;
  let iconColor = colors.muted;

  if (checked) {
    if (isKey) {
      border = colors.success; bg = colors.successSoft; badgeBg = colors.successFill; badgeFg = '#ffffff';
      Icon = Check; iconColor = colors.success; state = t('bonne réponse', 'bon repons');
    } else if (isPick) {
      border = graded ? colors.danger : colors.azure;
      bg = graded ? colors.dangerSoft : colors.azureSoft;
      badgeBg = graded ? colors.danger : colors.azureFill; badgeFg = '#ffffff';
      Icon = graded ? X : null; iconColor = colors.danger;
      state = graded ? t('ta réponse, incorrecte', 'repons ou, pa kòrèk') : t('ta réponse', 'repons ou');
    }
  } else if (isPick) {
    border = colors.azure; bg = colors.azureSoft; badgeBg = colors.azureFill; badgeFg = '#ffffff';
  }

  const letter = LETTERS[index] ?? String(index + 1);
  return (
    <PressableScale
      onPress={onPress}
      disabled={checked}
      haptic={false}
      pressedScale={0.99}
      accessibilityRole="radio"
      accessibilityState={{ checked: isPick, disabled: checked }}
      accessibilityLabel={`${letter}. ${opt}${state ? `. ${state}` : ''}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderWidth: 1.5, borderColor: border, backgroundColor: bg,
        borderRadius: radius.hero, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 10,
        minHeight: 52,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: badgeBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[typeScale.titleSm, { color: badgeFg }]}>{letter}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Rich text={opt} style={[typeScale.body, { fontSize: 16, lineHeight: 23, color: colors.ink }]} />
      </View>
      {Icon ? <Icon color={iconColor} size={20} strokeWidth={2.5} /> : null}
    </PressableScale>
  );
}

/**
 * The correction under a checked question (and in the result list).
 * `showQuestion` repeats the prompt — the result list needs it, the live
 * question already shows it above.
 */
export function Correction({
  item, entry, t, showQuestion = false, index,
}: {
  item: SessionItem;
  entry?: LogEntry | null;
  t: Tx;
  showQuestion?: boolean;
  /** 1-based position, for the result list. */
  index?: number;
}) {
  const { colors } = useTheme();
  const kind = statusOf(item, entry);
  const yours = entry?.selected != null ? item.options[entry.selected] : null;
  const expected = isGradable(item) ? item.options[item.correctIndex] : null;
  const label = (s: string) => <Text style={[typeScale.label, { color: colors.muted }]}>{s}</Text>;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {index != null ? (
          <Text style={[typeScale.label, { color: colors.muted }]}>{t(`Question ${index}`, `Kesyon ${index}`)}</Text>
        ) : null}
        <AnswerStatus kind={kind} t={t} />
      </View>
      {showQuestion ? <Rich text={item.question} style={[typeScale.bodyMd, { fontSize: 15, lineHeight: 22 }]} /> : null}

      {yours != null ? (
        <View style={{ gap: 2 }}>
          {label(t('Ta réponse', 'Repons ou'))}
          <Rich text={yours} style={[typeScale.body, { fontSize: 15, lineHeight: 22 }]} />
        </View>
      ) : null}

      {kind === 'ungraded' ? (
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {t('Cette question n’a pas de corrigé enregistré : elle n’est pas comptée et ne va pas dans Révision.',
            'Kesyon sa a pa gen koreksyon anrejistre : li pa konte e li pa ale nan Revizyon.')}
        </Text>
      ) : null}

      {expected != null && kind !== 'correct' ? (
        <View style={{ gap: 2 }}>
          {label(t('Bonne réponse', 'Bon repons'))}
          <Rich text={expected} style={[typeScale.bodyMd, { fontSize: 15, lineHeight: 22 }]} />
        </View>
      ) : null}

      {kind !== 'unanswered' || showQuestion ? (
        item.explanation ? (
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.card, padding: 12 }}>
            <Lightbulb color={colors.muted} size={16} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Rich text={item.explanation} style={[typeScale.body, { fontSize: 15, lineHeight: 22, color: colors.ink }]} />
            </View>
          </View>
        ) : (
          <Text style={[typeScale.body, { color: colors.muted }]}>
            {t('Pas d’explication rédigée pour cette question.', 'Pa gen eksplikasyon ekri pou kesyon sa a.')}
          </Text>
        )
      ) : null}
    </View>
  );
}
