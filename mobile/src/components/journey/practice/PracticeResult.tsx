/**
 * PracticeResult — the end of a session (LJ-09).
 *
 * Quiz: one score with its definition. Practice: no score (the mode has none),
 * only what happened. Both keep "sans réponse" and "non corrigée" apart from
 * wrong answers, say exactly what was saved (and only claim the account copy
 * once the server acknowledged it), offer ONE dominant next action from real
 * state, and let the student read every correction before leaving.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Check, Clock, AlertCircle, Smartphone, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { useTheme, typeScale, fonts } from '../../../theme/theme';
import Button from '../../ui/Button';
import { AnswerStatus, Correction } from './Answer';
import type { ExplainSurface } from '../../../../../shared/explainContext';
import { questionsLabel, type Tx } from './copy';
import {
  correctionCount, savedLineKind, sessionSlice, statusOf, tally,
  type LogEntry, type NextActionChoice, type NextActionKind, type ReviewConfirmState, type SessionItem, type SessionMode,
} from './session';

export interface ResultActions {
  onReview?: () => void;
  onNextLesson?: () => void;
  onReplay: () => void;
  onOtherChapter: () => void;
}

export default function PracticeResult({
  items, log, mode, stopped, t, title, context,
  signedIn, onSignIn, newErrors, confirm, onRecheck,
  next, nextLessonTitle, dueInScope, actions, onCorrectionsOpened, onClose, children, explainSurface,
}: {
  items: SessionItem[];
  log: Array<LogEntry | null>;
  mode: SessionMode;
  /** Left before the last question. */
  stopped: boolean;
  t: Tx;
  title: string;
  context?: string;
  signedIn: boolean;
  onSignIn: () => void;
  /** This session's misses that went to Révision. */
  newErrors: number;
  confirm: ReviewConfirmState;
  onRecheck: () => void;
  next: NextActionChoice;
  nextLessonTitle?: string;
  dueInScope: number;
  actions: ResultActions;
  onCorrectionsOpened?: (count: number) => void;
  /** Leave the result. Focus mode hides the tab bar, so without it the next actions are the only way out. */
  onClose?: () => void;
  children?: React.ReactNode;
  /** "Explique-moi" on each missed question (needs an ExplainProvider above). */
  explainSurface?: ExplainSurface;
}) {
  const { colors, cardSurface, isDark, elevation } = useTheme();
  const [open, setOpen] = useState(false);

  const slice = sessionSlice(items, log, mode);
  const shownItems = slice.items;
  const shownLog = slice.log;
  const seen = shownItems.length;
  const tl = tally(shownItems, shownLog);
  const corrections = correctionCount(tl);

  const verdict = mode === 'practice'
    ? ''
    : stopped && tl.unanswered > 0
      ? t(`Quiz arrêté avant la fin : ${questionsLabel(tl.unanswered, t)} sans réponse.`, `Kwiz la kanpe anvan fen : ${tl.unanswered} kesyon san repons.`)
      : tl.scored > 0 && tl.correct === tl.scored
        ? t('Tout juste.', 'Tout bon.')
        : tl.scored > 0 && tl.correct >= Math.ceil(tl.scored * 0.7)
          ? t('Solide. Revois les quelques questions ratées.', 'Solid. Revize kèk kesyon ou rate yo.')
          : t('Ce chapitre mérite une révision.', 'Chapit sa a merite yon revizyon.');

  const kind = savedLineKind(signedIn, newErrors, confirm);
  const savedIcon = kind === 'confirmed' ? Check : kind === 'pending' ? Clock : kind === 'unconfirmed' ? AlertCircle : Smartphone;
  const SavedIcon = savedIcon;
  const plural = newErrors > 1;
  const savedText = (() => {
    switch (kind) {
      case 'guest-none': return t('Aucune erreur à garder. Sans compte, rien ne quitte ce téléphone.', 'Pa gen erè pou kenbe. San kont, anyen pa kite telefòn sa a.');
      case 'guest-local': return t(`${plural ? `Tes ${newErrors} erreurs sont gardées` : 'Ton erreur est gardée'} sur ce téléphone, dans Révision. Sans compte, elles ne te suivent pas sur un autre appareil.`,
        `${plural ? `${newErrors} erè ou yo kenbe` : 'Erè ou a kenbe'} sou telefòn sa a, nan Revizyon. San kont, yo pa swiv ou sou yon lòt aparèy.`);
      case 'none': return t('Aucune nouvelle erreur à ajouter à ta Révision.', 'Pa gen nouvo erè pou ajoute nan Revizyon ou.');
      case 'pending': return t(`Ajout de ${plural ? `${newErrors} erreurs` : '1 erreur'} à ta Révision… pas encore confirmé.`, `N ap ajoute ${newErrors} erè nan Revizyon ou… poko konfime.`);
      case 'confirmed': return t(`${plural ? `${newErrors} questions ratées sont` : '1 question ratée est'} dans ta Révision, aussi dans ton compte.`,
        `${newErrors} kesyon ou rate nan Revizyon ou, nan kont ou tou.`);
      case 'unconfirmed': return t(`Pas encore confirmé : ${plural ? `tes ${newErrors} erreurs sont gardées` : 'ton erreur est gardée'} sur ce téléphone, mais pas encore dans ton compte. L’envoi reprendra au retour du réseau.`,
        `Poko konfime : ${plural ? `${newErrors} erè ou yo kenbe` : 'erè ou a kenbe'} sou telefòn sa a, men poko nan kont ou. L ap voye lè rezo a tounen.`);
      default: return '';
    }
  })();

  const labelFor = (k: NextActionKind): string => {
    switch (k) {
      case 'review': return dueInScope > 1
        ? t(`Réviser mes ${dueInScope} erreurs`, `Revize ${dueInScope} erè m yo`)
        : t('Réviser mon erreur', 'Revize erè m nan');
      case 'nextLesson': return t('Leçon suivante', 'Leson swivan');
      case 'replay': return mode === 'practice' ? t('Continuer l’entraînement', 'Kontinye pratik la') : t('Un autre quiz sur ce chapitre', 'Yon lòt kwiz sou chapit sa a');
      case 'otherChapter': return t('Choisir un autre chapitre', 'Chwazi yon lòt chapit');
      default: return '';
    }
  };
  const run = (k: NextActionKind) => {
    if (k === 'review') actions.onReview?.();
    else if (k === 'nextLesson') actions.onNextLesson?.();
    else if (k === 'replay') actions.onReplay();
    else actions.onOtherChapter();
  };

  const [openMiss, setOpenMiss] = useState<number | null>(null);
  const pct = tl.scored > 0 ? Math.round((tl.correct / tl.scored) * 100) : 0;
  // The wrong answers (and ungraded picks) the student should read, in order.
  const misses = shownItems
    .map((item, i) => ({ item, entry: shownLog[i], i, kind: statusOf(item, shownLog[i]) }))
    .filter((m) => m.kind === 'incorrect' || m.kind === 'partial');
  const headerTitle = title ? `${mode === 'quiz' ? t('Quiz', 'Kwiz') : t('Pratique', 'Pratik')} · ${title}` : '';

  const tallyChip = (k: 'correct' | 'incorrect' | 'unanswered' | 'ungraded', n: number, words: string) => (
    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <AnswerStatus kind={k} t={t} label={`${n} ${words}`} />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
          {onClose ? (
            <TouchableOpacity
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...(isDark ? null : elevation.card) }}
            >
              <X color={colors.ink} size={22} strokeWidth={2.2} />
            </TouchableOpacity>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={2} style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }}>{headerTitle}</Text>
            {context ? <Text numberOfLines={1} style={[typeScale.meta, { color: colors.muted }]}>{context}</Text> : null}
          </View>
        </View>

        {/* Score (quiz) or what happened (practice) */}
        <View style={{ ...cardSurface, padding: 20, gap: 12 }}>
          {mode === 'quiz' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ gap: 2 }}>
                  <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Score', 'Nòt')}</Text>
                  <Text
                    accessibilityLabel={t(`${tl.correct} sur ${tl.scored} bonnes réponses`, `${tl.correct} sou ${tl.scored} bon repons`)}
                    style={{ fontFamily: fonts.heading, fontSize: 56, lineHeight: 60, letterSpacing: -2, color: colors.ink, fontVariant: ['tabular-nums'] }}
                  >
                    {tl.correct}
                    <Text style={{ fontFamily: fonts.headingBold, fontSize: 22, letterSpacing: 0, color: colors.muted }}>{`  / ${tl.scored}`}</Text>
                  </Text>
                </View>
                {tl.scored > 0 ? (
                  <View style={{ backgroundColor: colors.azureSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4 }}>
                    <Text style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: colors.azureInk, fontVariant: ['tabular-nums'] }}>{`${pct} %`}</Text>
                  </View>
                ) : null}
              </View>
              {tl.scored > 0 ? (
                <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 8, borderRadius: 999, backgroundColor: colors.azureFill }} />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
              {t(`${questionsLabel(seen, t)} vue${seen > 1 ? 's' : ''}. L’entraînement libre n’a pas de score.`, `${seen} kesyon ou wè. Pratik lib pa gen nòt.`)}
            </Text>
          )}
          {verdict ? <Text style={[typeScale.bodyMd, { color: colors.ink }]}>{verdict}</Text> : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tallyChip('correct', tl.correct, t(tl.correct > 1 ? 'correctes' : 'correcte', 'kòrèk'))}
            {tallyChip('incorrect', tl.incorrect, t(tl.incorrect > 1 ? 'ratées' : 'ratée', 'rate'))}
            {tl.unanswered > 0 ? tallyChip('unanswered', tl.unanswered, t('sans réponse', 'san repons')) : null}
            {tl.ungraded > 0 ? tallyChip('ungraded', tl.ungraded, t(tl.ungraded > 1 ? 'non corrigées' : 'non corrigée', 'pa korije')) : null}
          </View>
          {tl.unanswered > 0 || tl.ungraded > 0 ? (
            <Text style={[typeScale.meta, { color: colors.muted }]}>
              {t('Les questions sans réponse ou non corrigées ne comptent pas comme des erreurs et ne vont pas dans Révision.',
                'Kesyon san repons oswa ki pa korije yo pa konte kòm erè e yo pa ale nan Revizyon.')}
            </Text>
          ) : null}

          {/* What was saved */}
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <SavedIcon color={kind === 'unconfirmed' ? colors.warn : kind === 'confirmed' ? colors.azureInk : colors.muted} size={18} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typeScale.meta, { color: colors.muted }]}>
                {mode === 'quiz' ? t('Ton score est gardé sur ce téléphone. ', 'Nòt ou kenbe sou telefòn sa a. ') : ''}
                {savedText}
              </Text>
              {kind === 'unconfirmed' ? (
                <TouchableOpacity onPress={onRecheck} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                  <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>{t('Réessayer maintenant', 'Eseye ankò kounye a')}</Text>
                </TouchableOpacity>
              ) : null}
              {!signedIn && newErrors > 0 ? (
                <TouchableOpacity onPress={onSignIn} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                  <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>{t('Connecte-toi', 'Konekte')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {next.caughtUp ? (
          <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
            {t('Rien à réviser dans ce chapitre pour l’instant.', 'Pa gen anyen pou revize nan chapit sa a pou kounye a.')}
          </Text>
        ) : null}

        {/* À revoir — every miss, each with its correction one tap away. */}
        {misses.length > 0 ? (
          <View style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={[typeScale.section, { fontSize: 20, lineHeight: 25, color: colors.ink }]}>
              {t(`À revoir · ${questionsLabel(misses.length, t)}`, `Pou revize · ${misses.length} kesyon`)}
            </Text>
            {misses.map((m) => {
              const isOpen = openMiss === m.i;
              return (
                <View key={`${m.item.id}-${m.i}`} style={{ ...cardSurface, overflow: 'hidden' }}>
                  <TouchableOpacity
                    onPress={() => { const o = isOpen ? null : m.i; setOpenMiss(o); if (o != null) onCorrectionsOpened?.(1); }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={`${t(`Question ${m.i + 1}`, `Kesyon ${m.i + 1}`)}. ${m.item.question}. ${t('Voir la correction', 'Wè koreksyon an')}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 72 }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <X color={colors.danger} size={18} strokeWidth={2.8} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text numberOfLines={isOpen ? 4 : 1} style={[typeScale.bodyMd, { color: colors.ink }]}>{m.item.question}</Text>
                      <Text style={[typeScale.meta, { color: colors.muted }]}>{t(`Question ${m.i + 1}`, `Kesyon ${m.i + 1}`)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={[typeScale.label, { fontFamily: fonts.bold, color: colors.azureInk }]}>
                        {isOpen ? t('Masquer', 'Kache') : t('Correction', 'Koreksyon')}
                      </Text>
                      {isOpen ? <ChevronUp color={colors.azureInk} size={16} /> : <ChevronDown color={colors.azureInk} size={16} />}
                    </View>
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
                      <Correction item={m.item} entry={m.entry} t={t} explainSurface={explainSurface} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {next.primary === 'nextLesson' && nextLessonTitle ? (
          <View style={{ ...cardSurface, padding: 16, gap: 2 }}>
            <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Leçon conseillée', 'Leson konseye')}</Text>
            <Text numberOfLines={2} style={[typeScale.cardTitle, { fontSize: 17, lineHeight: 22, color: colors.ink }]}>{nextLessonTitle}</Text>
          </View>
        ) : null}

        {/* Every correction, readable before leaving */}
        {shownItems.length > 0 ? (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={() => { const o = !open; setOpen(o); if (o) onCorrectionsOpened?.(corrections); }}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}
            >
              <Text style={[typeScale.bodyMd, { color: colors.azureInk }]}>
                {open
                  ? t('Masquer la correction complète', 'Kache tout koreksyon an')
                  : t(`Voir la correction des ${questionsLabel(shownItems.length, t)}`, `Wè koreksyon ${shownItems.length} kesyon yo`)}
              </Text>
              {open ? <ChevronUp color={colors.azureInk} size={20} /> : <ChevronDown color={colors.azureInk} size={20} />}
            </TouchableOpacity>
            {open ? shownItems.map((item, i) => (
              <View key={`${item.id}-${i}`} style={{ ...cardSurface, padding: 18 }}>
                <Correction item={item} entry={shownLog[i]} t={t} showQuestion index={i + 1} explainSurface={explainSurface} />
              </View>
            )) : null}
          </View>
        ) : null}

        {children}
      </ScrollView>

      {/* One dominant next action, pinned; the alternative is tonal. */}
      <View
        style={{
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10, backgroundColor: colors.bg,
        }}
      >
        <Button label={labelFor(next.primary)} onPress={() => run(next.primary)} size="lg" fullWidth />
        {next.secondary ? (
          <Button label={labelFor(next.secondary)} onPress={() => run(next.secondary!)} variant="secondary" size="lg" fullWidth />
        ) : null}
      </View>
    </View>
  );
}
