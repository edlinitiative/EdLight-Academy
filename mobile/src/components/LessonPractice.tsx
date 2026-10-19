import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { ExplainSurface } from '../../../shared/explainContext';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, RotateCcw, ChevronLeft, ChevronRight, Info } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { useColors, fonts, type Palette } from '../theme/theme';
import Segmented from './ui/Segmented';
import { selectCardsScoped, toInt, type PracticeCard as Card } from '../utils/practiceCards';
import PracticeRunner from './journey/practice/PracticeRunner';
import { AnswerStatus, Rich } from './journey/practice/Answer';
import { itemFromCard, tally, type Tally } from './journey/practice/session';
import { trackJourney } from '../utils/learningJourney';
import Button from './ui/Button';
import {
  lessonMastery, masteryLabel, masteryColor, masteryNextStep, applyExerciseScore, type MasteryLevel,
} from '../utils/mastery';
import { success } from '../utils/haptics';
import { MasteryMeter } from './MasteryMeter';
import { modalAnimation, isReduceMotionOn } from '../utils/motion';

// Cards come from the shared quiz bank (Firestore `quizzes`), keyed by
// subject_code + unit_no + lesson_no — the same source the web flashcards /
// Exercices read. See utils/practiceCards for the field-shape quirks.
function useLessonCards(subjectCode?: string, unitNo?: any, lessonNo?: any): { cards: Card[]; scope: 'lesson' | 'chapter' | 'none'; isLoading: boolean } {
  const { data, isLoading } = useAppData();
  const raw: any[] = data?.quizBank?.raw ?? [];
  const res = useMemo(
    () => selectCardsScoped(raw, subjectCode, unitNo, lessonNo, { includeUngradable: true }),
    [raw, subjectCode, unitNo, lessonNo],
  );
  return { ...res, isLoading };
}

// ─── Flashcards ───────────────────────────────────────────────────────────────

function Flashcards({ cards, isCreole }: { cards: Card[]; isCreole: boolean }) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];
  if (!card) return null;

  const go = (d: number) => { setIdx((i) => Math.max(0, Math.min(cards.length - 1, i + d))); setFlipped(false); };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={styles.counter}>{idx + 1} / {cards.length}</Text>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setFlipped((f) => !f)}
        style={styles.card}
        accessibilityRole="button"
        accessibilityHint={isCreole ? 'Tape pou vire kat la' : 'Touchez pour retourner la carte'}
      >
        <Text style={styles.cardLabel}>{flipped ? (isCreole ? 'Repons' : 'Réponse') : 'Question'}</Text>
        <Rich text={flipped ? card.answer : card.question} style={styles.cardText} />
        {flipped && card.explanation ? (
          <Rich text={card.explanation} style={styles.cardExpl} />
        ) : null}
        <View style={styles.flipHint}>
          <RotateCcw color={colors.muted} size={16} />
          <Text style={styles.flipHintText}>{isCreole ? 'Tape pou vire' : 'Touchez pour retourner'}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.rowBetween}>
        <TouchableOpacity
          onPress={() => go(-1)}
          disabled={idx === 0}
          style={[styles.navBtn, idx === 0 && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Kat anvan' : 'Carte précédente'}
        >
          <ChevronLeft color={colors.muted} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => go(1)}
          disabled={idx === cards.length - 1}
          style={[styles.navBtn, idx === cards.length - 1 && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={isCreole ? 'Kat apre' : 'Carte suivante'}
        >
          <ChevronRight color={colors.muted} size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Exercices (MCQ) ──────────────────────────────────────────────────────────
//
// The same runner, answer anatomy and tally as the quiz bank and Révision
// (components/journey/practice): one try, then result · your answer · the
// expected one · the authored explanation (or an honest "none" line). A card
// whose key matches no option is shown as "non corrigée automatiquement" —
// never marked wrong, never sent to Révision, never counted in the score.

export function Exercices({
  cards, isCreole, onFinish, onAnswer, resultLevel, renderDone, onStart, explainSurface,
}: {
  cards: Card[];
  isCreole: boolean;
  /** Percent right among the GRADED cards; not called when none could be graded. */
  onFinish?: (pct: number) => void;
  /** Fired for each graded answer — feeds the missed-question review map. */
  onAnswer?: (card: Card, correct: boolean) => void;
  /** The lesson's mastery level after the score was recorded. */
  resultLevel?: MasteryLevel;
  /** Replace the default end screen (Révision draws its own). */
  renderDone?: (args: { tally: Tally; restart: () => void }) => React.ReactNode;
  onStart?: () => void;
  /**
   * Révision passes 'revision': "Explique-moi" on each wrong answer, live
   * (needs an ExplainProvider above). A lesson's scored exercises omit it.
   */
  explainSurface?: ExplainSurface;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const items = useMemo(() => cards.map((c) => itemFromCard(c)), [cards]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState<Tally | null>(null);
  const restart = () => { setDone(null); setRound((r) => r + 1); };

  React.useEffect(() => { if (items.length > 0) onStart?.(); }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    if (renderDone) return <>{renderDone({ tally: done, restart })}</>;
    const nextStep = resultLevel ? masteryNextStep(resultLevel, isCreole) : null;
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        {done.scored > 0 ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontFamily: fonts.heading, fontSize: 56, lineHeight: 60, letterSpacing: -2, color: colors.ink, fontVariant: ['tabular-nums'] }}>
              {done.correct}
              <Text style={{ fontFamily: fonts.headingBold, fontSize: 22, letterSpacing: 0, color: colors.muted }}>{`  / ${done.scored}`}</Text>
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.muted }}>{t('bonnes réponses', 'bon repons')}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 15, color: colors.ink, textAlign: 'center' }}>
            {t('Aucune de ces questions ne se corrige automatiquement : pas de score ici.', 'Okenn nan kesyon sa yo pa korije otomatikman : pa gen nòt isit la.')}
          </Text>
        )}
        <View style={{ gap: 6 }}>
          <TallyRow kind="correct" n={done.correct} label={t('Correctes', 'Kòrèk')} t={t} />
          <TallyRow kind="incorrect" n={done.incorrect} label={t('Ratées', 'Rate')} t={t} />
          {done.ungraded > 0 ? <TallyRow kind="ungraded" n={done.ungraded} label={t('Non corrigées automatiquement', 'Pa korije otomatikman')} t={t} /> : null}
        </View>
        {done.incorrect > 0 ? (
          <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 20 }}>
            {t('Les questions ratées sont dans ta Révision.', 'Kesyon ou rate yo nan Revizyon ou.')}
          </Text>
        ) : null}
        {/* The score alone says nothing lasting — the level is what was earned. */}
        {resultLevel ? (
          <View style={{ alignItems: 'center', marginTop: 4, gap: 8 }}>
            <MasteryMeter level={resultLevel} />
            <Text style={{ fontSize: 14, color: masteryColor(resultLevel, colors), fontWeight: '600' }}>
              {masteryLabel(resultLevel, isCreole)}
            </Text>
          </View>
        ) : null}
        {nextStep ? (
          <Text style={{ fontSize: 14, color: colors.ink, textAlign: 'center' }}>
            {t('Prochaine étape', 'Pwochen etap')} : {nextStep}
          </Text>
        ) : null}
        <Button label={t('Recommencer ces questions', 'Rekòmanse kesyon sa yo')} onPress={restart} variant="secondary" size="lg" fullWidth />
      </ScrollView>
    );
  }
  if (items.length === 0) return null;

  return (
    <PracticeRunner
      key={round}
      items={items}
      mode="quiz"
      chrome="minimal"
      title=""
      t={t}
      explainSurface={explainSurface}
      liveExplain={!!explainSurface}
      onAnswer={(item, _entry, outcome) => {
        const card = byId.get(item.id);
        if (card && outcome != null) onAnswer?.(card, outcome);
      }}
      onFinish={(log) => {
        const tl = tally(items, log);
        if (tl.scored > 0) onFinish?.((tl.correct / tl.scored) * 100);
        setDone(tl);
      }}
      onExit={() => {}}
    />
  );
}

function TallyRow({ kind, n, label, t }: { kind: 'correct' | 'incorrect' | 'ungraded' | 'unanswered'; n: number; label: string; t: (fr: string, ht: string) => string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AnswerStatus kind={kind} t={t} label={label} />
      <Text style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] }}>{n}</Text>
    </View>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function LessonPractice({
  visible, onClose, subjectCode, unitNo, lessonNo, lessonId,
  initialMode = 'flashcards', isCreole = false,
}: {
  visible: boolean;
  onClose: () => void;
  subjectCode?: string;
  unitNo?: any;
  lessonNo?: any;
  /** Which lesson these exercises count towards. Omit and nothing is recorded. */
  lessonId?: string;
  initialMode?: 'flashcards' | 'exercices';
  isCreole?: boolean;
}) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const [mode, setMode] = useState<'flashcards' | 'exercices'>(initialMode);
  const { cards, scope, isLoading } = useLessonCards(subjectCode, unitNo, lessonNo);
  // Flashcards need an answer to flip to: a card with no usable key is
  // exercise-only, where it is shown as "non corrigée automatiquement".
  const flashCards = useMemo(() => cards.filter((c) => c.gradable !== false), [cards]);
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const recordLessonScore = useStore((s) => s.recordLessonScore);
  const recordReviewOutcome = useStore((s) => s.recordReviewOutcome);
  const lessonProgress = useStore((s) => (lessonId ? s.progress[lessonId] : undefined));
  const level = lessonMastery(lessonProgress);

  // Keep the tab in sync with whichever button opened the sheet.
  React.useEffect(() => { if (visible) setMode(initialMode); }, [visible, initialMode]);

  return (
    <Modal visible={visible} animationType={modalAnimation(isReduceMotionOn(), 'slide')} onRequestClose={onClose}>
      {/* Own provider so safe-area insets resolve inside the RN Modal window. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        {/* Header — a white strip with the pill switch; no rule under it. */}
        <View style={styles.header}>
          <Segmented<'flashcards' | 'exercices'>
            options={[
              { key: 'flashcards', label: isCreole ? 'Kat etid' : 'Flashcards' },
              { key: 'exercices', label: isCreole ? 'Egzèsis' : 'Exercices' },
            ]}
            value={mode}
            onChange={setMode}
            style={{ flex: 1 }}
          />
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')}>
            <X color={colors.ink} size={24} />
          </TouchableOpacity>
        </View>

        {cards.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 }}>
            <Info color={colors.muted} size={16} style={{ marginTop: 3 }} />
            <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted }}>
              {scope === 'lesson'
                ? t(`${cards.length} question${cards.length > 1 ? 's' : ''} liée${cards.length > 1 ? 's' : ''} à cette leçon.`, `${cards.length} kesyon ki mache ak leson sa a.`)
                : t(`${cards.length} question${cards.length > 1 ? 's' : ''} sur tout le chapitre : elles ne sont pas encore classées leçon par leçon.`,
                  `${cards.length} kesyon sou tout chapit la : yo poko klase leson pa leson.`)}
            </Text>
          </View>
        ) : null}

        {cards.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>
              {isLoading
                ? t('Chargement des questions…', 'N ap chaje kesyon yo…')
                : t('Aucun exercice disponible pour ce chapitre pour le moment.', 'Pa gen egzèsis pou chapit sa a pou kounye a.')}
            </Text>
          </View>
        ) : mode === 'flashcards' ? (
          flashCards.length > 0 ? <Flashcards cards={flashCards} isCreole={isCreole} /> : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>
                {t('Pas de flashcards : ces questions n’ont pas de corrigé enregistré. Essaie les Exercices.', 'Pa gen kat etid : kesyon sa yo pa gen koreksyon anrejistre. Eseye Egzèsis yo.')}
              </Text>
            </View>
          )
        ) : (
          <Exercices
            cards={cards}
            isCreole={isCreole}
            resultLevel={lessonId ? level : undefined}
            onStart={() => trackJourney('practice_started', { source: 'lesson_sheet', mode: 'exercices', count: cards.length, scope })}
            onAnswer={(card, ok) =>
              recordReviewOutcome(card.id, ok, {
                subjectCode,
                unitNo: toInt(unitNo) ?? undefined,
                lessonId,
              })
            }
            onFinish={(pct) => {
              if (!lessonId) return;
              const before = lessonMastery(lessonProgress);
              recordLessonScore(lessonId, pct);
              // Earning a rung is the moment worth feeling. Compare against the
              // level the record WOULD reach, not the (stale) render-time one.
              const after = lessonMastery(
                applyExerciseScore(lessonProgress, pct, Date.now()) ?? lessonProgress,
              );
              if (after !== before) success();
              trackJourney('practice_completed', { source: 'lesson_sheet', mode: 'exercices', pct: Math.round(pct) });
            }}
          />
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: 20, paddingRight: 10, paddingVertical: 10, backgroundColor: colors.surface,
    shadowColor: '#0B296B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, zIndex: 1,
  },
  counter: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.muted, marginBottom: 12, fontVariant: ['tabular-nums'] },
  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 24,
    padding: 24, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0B296B', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 4,
  },
  cardLabel: { fontFamily: fonts.medium, fontSize: 15, color: colors.azureInk, marginBottom: 16 },
  cardText: { fontFamily: fonts.headingBold, fontSize: 21, color: colors.ink, textAlign: 'center', lineHeight: 29 },
  cardExpl: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 14, lineHeight: 22 },
  flipHint: { position: 'absolute', bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flipHintText: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  navBtn: { width: 56, height: 48, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
