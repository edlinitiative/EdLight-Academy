/**
 * PracticeRunner — one question at a time, for every practice surface (LJ-07).
 *
 *   quiz      fixed deck, "Question X sur N", one try, correction after each
 *   practice  open: draws until the pool is exhausted or the student taps
 *             « Terminer »; no score
 *
 * Leaving after at least one checked answer asks first, and offers the
 * summary instead of throwing the work away. Android back is the same exit.
 * Motion: none beyond the option fill change and a progress bar that snaps
 * under reduced motion.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Alert, BackHandler, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useTheme, typeScale, fonts } from '../../../theme/theme';
import { useReduceMotion } from '../../../utils/motion';
import { select, tapMedium, success, warn } from '../../../utils/haptics';
import Button from '../../ui/Button';
import { AnswerOption, Correction, Rich } from './Answer';
import { questionsLabel, type Tx } from './copy';
import { reviewOutcomeOf, statusOf, type LogEntry, type SessionItem, type SessionMode } from './session';

export type FinishReason = 'done' | 'stopped';

function ProgressBar({ pct }: { pct: number }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const w = useSharedValue(pct);
  useEffect(() => {
    w.value = reduce ? pct : withTiming(pct, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [pct, reduce, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      <Animated.View style={[style, { height: 6, borderRadius: 999, backgroundColor: colors.azureFill }]} />
    </View>
  );
}

export default function PracticeRunner({
  items,
  mode,
  t,
  title,
  context,
  onAnswer,
  onFinish,
  onExit,
  chrome = 'full',
}: {
  items: SessionItem[];
  mode: SessionMode;
  t: Tx;
  title: string;
  /** "Chimie NS1 · Chapitre 2" */
  context?: string;
  /** Each checked answer, with the Révision outcome (null = do not record). */
  onAnswer?: (item: SessionItem, entry: LogEntry, reviewOutcome: boolean | null) => void;
  onFinish: (log: Array<LogEntry | null>, reason: FinishReason) => void;
  /** Leave without a summary. */
  onExit: () => void;
  /**
   * 'minimal' when a host (a lesson's practice sheet) already draws the
   * title and close button: only the position line and progress remain, and
   * the host's own close handles Android back.
   */
  chrome?: 'full' | 'minimal';
}) {
  const { colors, cardSurface, isDark } = useTheme();
  const [idx, setIdx] = useState(0);
  const [log, setLog] = useState<Array<LogEntry | null>>(() => items.map(() => null));
  const [pending, setPending] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const item = items[idx];
  const entry = log[idx];
  const checked = entry?.selected != null;
  const isLast = idx >= items.length - 1;
  const answeredAny = useMemo(() => log.some((e) => e?.selected != null), [log]);

  // The deck is frozen by the parent; a new deck restarts the session.
  useEffect(() => { setIdx(0); setPending(null); setLog(items.map(() => null)); }, [items]);
  useEffect(() => { setPending(null); scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [idx]);

  const finish = useCallback((reason: FinishReason) => onFinish(log, reason), [log, onFinish]);

  const requestExit = useCallback(() => {
    if (!answeredAny) { onExit(); return; }
    if (mode === 'practice') { finish('stopped'); return; }
    Alert.alert(
      t('Quitter le quiz ?', 'Kite kwiz la ?'),
      t('Tes réponses jusqu’ici restent dans ton bilan. Les questions ratées sont déjà dans ta Révision.',
        'Repons ou bay deja yo rete nan rezilta ou. Kesyon ou rate yo deja nan Revizyon ou.'),
      [
        { text: t('Continuer', 'Kontinye'), style: 'cancel' },
        { text: t('Voir mon bilan', 'Wè rezilta m'), onPress: () => finish('stopped') },
        { text: t('Quitter', 'Kite'), style: 'destructive', onPress: onExit },
      ],
    );
  }, [answeredAny, mode, finish, onExit, t]);

  useEffect(() => {
    if (chrome === 'minimal') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { requestExit(); return true; });
    return () => sub.remove();
  }, [requestExit, chrome]);

  if (!item) return null;

  const check = () => {
    if (checked || pending == null) return;
    tapMedium();
    const next: LogEntry = { selected: pending };
    const s = statusOf(item, next);
    if (s === 'correct') success(); else if (s === 'incorrect') warn();
    setLog((prev) => { const copy = [...prev]; copy[idx] = next; return copy; });
    onAnswer?.(item, next, reviewOutcomeOf(item, next));
  };

  const advance = () => {
    tapMedium();
    if (isLast) { onFinish(log, 'done'); return; }
    setIdx((i) => i + 1);
  };

  const position = mode === 'quiz'
    ? t(`Question ${idx + 1} sur ${items.length}`, `Kesyon ${idx + 1} sou ${items.length}`)
    : t(`Question ${idx + 1} · ${questionsLabel(items.length, t)} dans ce chapitre`, `Kesyon ${idx + 1} · ${items.length} kesyon nan chapit sa a`);
  const pct = Math.round(((idx + (checked ? 1 : 0)) / Math.max(1, items.length)) * 100);
  const headerTitle = title
    ? `${mode === 'quiz' ? t('Quiz', 'Kwiz') : t('Pratique', 'Pratik')} · ${title}`
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header: a white strip, no rule under it — a 0.04 drop only. */}
      <View
        style={{
          paddingHorizontal: 20, paddingTop: chrome === 'full' ? 6 : 12, paddingBottom: 14, gap: 12,
          backgroundColor: colors.surface, zIndex: 1,
          shadowColor: '#0B296B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.04, shadowRadius: 8, elevation: 2,
        }}
      >
        {chrome === 'full' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <TouchableOpacity
            onPress={requestExit}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={mode === 'quiz' ? t('Quitter le quiz', 'Kite kwiz la') : t('Quitter', 'Kite')}
            style={{ width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' }}
          >
            <X color={colors.ink} size={24} strokeWidth={2.2} />
          </TouchableOpacity>
          <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21, color: colors.ink }}>
            {headerTitle}
          </Text>
          {mode === 'practice' && answeredAny ? (
            <Button
              label={t('Terminer', 'Fini')}
              accessibilityLabel={t('Terminer et voir mon bilan', 'Fini epi wè rezilta m')}
              onPress={() => finish('stopped')}
              variant="secondary"
              size="sm"
            />
          ) : null}
        </View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Text accessibilityRole="text" style={[typeScale.meta, { color: colors.muted, flex: 1 }]}>{position}</Text>
          {mode === 'quiz' ? (
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 15, lineHeight: 20, color: colors.azureInk, fontVariant: ['tabular-nums'] }}>{`${pct}%`}</Text>
          ) : null}
        </View>
        {mode === 'quiz' ? <ProgressBar pct={pct} /> : null}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {/* The question: its own card, context as a sentence-case meta line. */}
        <View style={{ ...cardSurface, padding: 20, marginBottom: 18, gap: 10 }} accessibilityRole="header">
          {context ? <Text numberOfLines={2} style={[typeScale.meta, { color: colors.azureInk }]}>{context}</Text> : null}
          <Rich text={item.question} style={{ fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 28, color: colors.ink }} />
        </View>

        <View accessibilityRole="radiogroup">
          {item.options.map((_, i) => (
            <AnswerOption
              key={`${idx}-${i}`}
              item={item}
              index={i}
              entry={entry}
              selected={pending === i}
              checked={checked}
              onPress={() => { if (!checked) { select(); setPending(i); } }}
              t={t}
            />
          ))}
        </View>

        {checked ? (
          <View style={{ ...cardSurface, padding: 20, marginTop: 8 }} accessibilityLiveRegion="polite">
            <Correction item={item} entry={entry} t={t} />
          </View>
        ) : null}
      </ScrollView>

      {/* Pinned action on a white strip. */}
      <View
        style={{
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surface,
          shadowColor: '#0B296B', shadowOffset: { width: 0, height: -4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 10, elevation: 6,
        }}
      >
        {!checked ? (
          <Button
            label={t('Vérifier ma réponse', 'Verifye repons mwen')}
            onPress={check}
            disabled={pending == null}
            size="lg"
            fullWidth
          />
        ) : (
          <Button
            label={isLast ? t('Voir mon bilan', 'Wè rezilta m') : t('Question suivante', 'Kesyon swivan')}
            onPress={advance}
            size="lg"
            fullWidth
          />
        )}
      </View>
    </View>
  );
}
