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
import { useTheme, typeScale, radius } from '../../../theme/theme';
import Button from '../../ui/Button';
import { AnswerStatus, Correction } from './Answer';
import { questionsLabel, type Tx } from './copy';
import {
  correctionCount, savedLineKind, sessionSlice, tally,
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
  next, nextLessonTitle, dueInScope, actions, onCorrectionsOpened, onClose, children,
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
}) {
  const { colors, cardSurface } = useTheme();
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

  const row = (k: 'correct' | 'incorrect' | 'unanswered' | 'ungraded', n: number, words: string) => (
    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
      <AnswerStatus kind={k} t={t} label={words} />
      <Text style={[typeScale.title, { color: colors.ink, fontVariant: ['tabular-nums'] }]}>{n}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          {context ? <Text style={[typeScale.body, { color: colors.muted }]}>{context}</Text> : null}
          <Text accessibilityRole="header" style={[typeScale.h1, { color: colors.ink }]}>{title}</Text>
        </View>
        {onClose ? (
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')} style={{ padding: 4 }}>
            <X color={colors.muted} size={22} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Score (quiz) or what happened (practice) */}
      <View style={{ ...cardSurface, padding: 16, gap: 6 }}>
        {mode === 'quiz' ? (
          <>
            <Text
              accessibilityLabel={t(`${tl.correct} sur ${tl.scored} bonnes réponses`, `${tl.correct} sou ${tl.scored} bon repons`)}
              style={[typeScale.num, { color: colors.ink, fontVariant: ['tabular-nums'] }]}
            >
              {tl.correct} <Text style={[typeScale.h2, { color: colors.muted }]}>/ {tl.scored}</Text>
            </Text>
            <Text style={[typeScale.body, { color: colors.muted }]}>{t('bonnes réponses', 'bon repons')}</Text>
          </>
        ) : (
          <Text style={[typeScale.body, { color: colors.ink }]}>
            {t(`${questionsLabel(seen, t)} vue${seen > 1 ? 's' : ''}. L’entraînement libre n’a pas de score.`, `${seen} kesyon ou wè. Pratik lib pa gen nòt.`)}
          </Text>
        )}
        {verdict ? <Text style={[typeScale.bodyMd, { color: colors.ink, marginTop: 4 }]}>{verdict}</Text> : null}

        <View style={{ marginTop: 6 }}>
          {row('correct', tl.correct, t('Correctes', 'Kòrèk'))}
          {row('incorrect', tl.incorrect, t('Ratées', 'Rate'))}
          {tl.unanswered > 0 ? row('unanswered', tl.unanswered, t('Sans réponse', 'San repons')) : null}
          {tl.ungraded > 0 ? row('ungraded', tl.ungraded, t('Non corrigées automatiquement', 'Pa korije otomatikman')) : null}
        </View>
        {tl.unanswered > 0 || tl.ungraded > 0 ? (
          <Text style={[typeScale.body, { color: colors.muted }]}>
            {t('Les questions sans réponse ou non corrigées ne comptent pas comme des erreurs et ne vont pas dans Révision.',
              'Kesyon san repons oswa ki pa korije yo pa konte kòm erè e yo pa ale nan Revizyon.')}
          </Text>
        ) : null}
      </View>

      {/* What was saved */}
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <SavedIcon color={kind === 'unconfirmed' ? colors.warn : colors.muted} size={18} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[typeScale.body, { color: colors.ink }]}>
            {mode === 'quiz' ? t('Ton score est gardé sur ce téléphone. ', 'Nòt ou kenbe sou telefòn sa a. ') : ''}
            {savedText}
          </Text>
          {kind === 'unconfirmed' ? (
            <TouchableOpacity onPress={onRecheck} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
              <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{t('Réessayer maintenant', 'Eseye ankò kounye a')}</Text>
            </TouchableOpacity>
          ) : null}
          {!signedIn && newErrors > 0 ? (
            <TouchableOpacity onPress={onSignIn} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
              <Text style={[typeScale.bodyMd, { color: colors.azure }]}>{t('Connecte-toi', 'Konekte')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {next.caughtUp ? (
        <Text style={[typeScale.bodyMd, { color: colors.ink }]}>
          {t('Rien à réviser dans ce chapitre pour l’instant.', 'Pa gen anyen pou revize nan chapit sa a pou kounye a.')}
        </Text>
      ) : null}

      {/* One dominant next action */}
      <View style={{ gap: 10 }}>
        {next.primary === 'nextLesson' && nextLessonTitle ? (
          <Text style={[typeScale.body, { color: colors.muted }]}>{`${t('Ensuite', 'Apre sa')} : « ${nextLessonTitle} »`}</Text>
        ) : null}
        <Button label={labelFor(next.primary)} onPress={() => run(next.primary)} size="lg" fullWidth />
        {next.secondary ? (
          <Button label={labelFor(next.secondary)} onPress={() => run(next.secondary!)} variant="ghost" size="lg" fullWidth />
        ) : null}
      </View>

      {/* Corrections, readable before leaving */}
      {shownItems.length > 0 ? (
        <View style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={() => { const o = !open; setOpen(o); if (o) onCorrectionsOpened?.(corrections); }}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <Text style={[typeScale.title, { color: colors.ink }]}>
              {t(`Correction des ${questionsLabel(shownItems.length, t)}`, `Koreksyon ${shownItems.length} kesyon yo`)}
            </Text>
            {open ? <ChevronUp color={colors.muted} size={20} /> : <ChevronDown color={colors.muted} size={20} />}
          </TouchableOpacity>
          {open ? shownItems.map((item, i) => (
            <View key={`${item.id}-${i}`} style={{ ...cardSurface, padding: 14, borderRadius: radius.card }}>
              <Correction item={item} entry={shownLog[i]} t={t} showQuestion index={i + 1} />
            </View>
          )) : null}
        </View>
      ) : null}

      {children}
    </ScrollView>
  );
}
