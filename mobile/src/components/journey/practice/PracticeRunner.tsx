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
import { useTheme, typeScale, displayScale, radius } from '../../../theme/theme';
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
    <View style={{ height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.border }}>
      <Animated.View style={[style, { height: 6, borderRadius: 999, backgroundColor: colors.azure }]} />
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
  const { colors } = useTheme();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header: exit · title · position (· Terminer in open practice) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
        {chrome === 'full' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity
            onPress={requestExit}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={mode === 'quiz' ? t('Quitter le quiz', 'Kite kwiz la') : t('Quitter', 'Kite')}
            style={{ padding: 4 }}
          >
            <X color={colors.muted} size={22} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[typeScale.title, { color: colors.ink }]}>{title}</Text>
            {context ? <Text numberOfLines={1} style={[typeScale.body, { color: colors.muted }]}>{context}</Text> : null}
          </View>
          {mode === 'practice' && answeredAny ? (
            <TouchableOpacity
              onPress={() => finish('stopped')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Terminer et voir mon bilan', 'Fini epi wè rezilta m')}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{t('Terminer', 'Fini')}</Text>
            </TouchableOpacity>
          ) : null}
        </View> : null}
        <Text accessibilityRole="text" style={[typeScale.bodyMd, { color: colors.ink }]}>{position}</Text>
        {mode === 'quiz' ? <ProgressBar pct={((idx + (checked ? 1 : 0)) / Math.max(1, items.length)) * 100} /> : null}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 16 }} accessibilityRole="header">
          <Rich text={item.question} style={[displayScale.md, { color: colors.ink, lineHeight: 29 }]} />
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
          <View style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
            <Correction item={item} entry={entry} t={t} />
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
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
