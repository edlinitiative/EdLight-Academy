import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, RotateCcw, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { useColors, type Palette } from '../theme/theme';
import { selectCards, type PracticeCard as Card } from '../utils/practiceCards';
import {
  lessonMastery, masteryLabel, masteryColor, masteryNextStep, applyExerciseScore, type MasteryLevel,
} from '../utils/mastery';
import { success } from '../utils/haptics';
import { MasteryMeter } from './MasteryMeter';

// Cards come from the shared quiz bank (Firestore `quizzes`), keyed by
// subject_code + unit_no + lesson_no — the same source the web flashcards /
// Exercices read. See utils/practiceCards for the field-shape quirks.
function useLessonCards(subjectCode?: string, unitNo?: any, lessonNo?: any): Card[] {
  const { data } = useAppData();
  const raw: any[] = data?.quizBank?.raw ?? [];
  return useMemo(() => selectCards(raw, subjectCode, unitNo, lessonNo), [raw, subjectCode, unitNo, lessonNo]);
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
        <Text style={styles.cardText}>{flipped ? card.answer : card.question}</Text>
        {flipped && card.explanation ? (
          <Text style={styles.cardExpl}>{card.explanation}</Text>
        ) : null}
        <View style={styles.flipHint}>
          <RotateCcw color={colors.faint} size={13} />
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

function Exercices({
  cards, isCreole, onFinish, resultLevel,
}: {
  cards: Card[];
  isCreole: boolean;
  onFinish?: (pct: number) => void;
  /** The lesson's mastery level after the score was recorded. */
  resultLevel?: MasteryLevel;
}) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const card = cards[idx];

  if (done) {
    const nextStep = resultLevel ? masteryNextStep(resultLevel, isCreole) : null;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: colors.azure }}>{score}/{cards.length}</Text>
        {/* The score alone says nothing lasting — the level is what was earned. */}
        {resultLevel ? (
          <View style={{ alignItems: 'center', marginTop: 14, gap: 8 }}>
            <MasteryMeter level={resultLevel} />
            <Text style={{ fontSize: 13, color: masteryColor(resultLevel, colors), fontWeight: '600' }}>
              {masteryLabel(resultLevel, isCreole)}
            </Text>
          </View>
        ) : null}
        {nextStep ? (
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 10, textAlign: 'center' }}>
            {isCreole ? 'Pwochen etap' : 'Prochaine étape'} : {nextStep}
          </Text>
        ) : (
          <Text style={{ fontSize: 15, color: colors.muted, marginTop: 8 }}>
            {isCreole ? 'Byen fèt !' : 'Bien joué !'}
          </Text>
        )}
        <TouchableOpacity
          onPress={() => { setIdx(0); setSelected(null); setChecked(false); setScore(0); setDone(false); }}
          style={[styles.primaryBtn, { marginTop: 20, paddingHorizontal: 28 }]}
        >
          <Text style={styles.primaryBtnText}>{isCreole ? 'Rekòmanse' : 'Recommencer'}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!card) return null;

  const check = () => {
    if (selected == null) return;
    setChecked(true);
    if (selected === card.correctIndex) setScore((s) => s + 1);
  };
  const nextQ = () => {
    if (idx + 1 >= cards.length) {
      // `score` already includes this question — check() ran on the previous tap.
      onFinish?.(cards.length > 0 ? (score / cards.length) * 100 : 0);
      return setDone(true);
    }
    setIdx((i) => i + 1); setSelected(null); setChecked(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 12 }}>
        <Text style={styles.counter}>{idx + 1} / {cards.length}</Text>
        <View style={styles.questionBox}>
          <Text style={styles.questionText}>{card.question}</Text>
        </View>
        <View style={{ gap: 10, marginTop: 14 }}>
          {card.options.map((opt, i) => {
            const isSel = selected === i;
            const isCorrect = i === card.correctIndex;
            // Neutral option is themed; correct/incorrect keep their green/red.
            let border = colors.border; let bg = colors.surface; let color = colors.ink;
            if (checked) {
              if (isCorrect) { border = colors.success; bg = colors.successSoft; color = colors.success; }
              else if (isSel) { border = colors.danger; bg = colors.dangerSoft; color = colors.danger; }
            } else if (isSel) { border = colors.azure; bg = colors.azureSoft; }
            return (
              <TouchableOpacity
                key={i}
                disabled={checked}
                onPress={() => setSelected(i)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: border, backgroundColor: bg, borderRadius: 14, padding: 14 }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: isSel && !checked ? colors.azure : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSel && !checked ? '#fff' : colors.muted }}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14.5, color, lineHeight: 20 }}>{opt}</Text>
                {checked && isCorrect ? <Check color={colors.success} size={18} /> : null}
                {checked && isSel && !isCorrect ? <X color={colors.danger} size={18} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        {checked && (card.explanation || card.hint) ? (
          <View style={styles.explBox}>
            <Lightbulb color={colors.warn} size={15} />
            <Text style={styles.explText}>{card.explanation || card.hint}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {!checked ? (
          <TouchableOpacity onPress={check} disabled={selected == null} style={[styles.primaryBtn, selected == null && styles.disabled]}>
            <Text style={styles.primaryBtnText}>{isCreole ? 'Verifye' : 'Vérifier'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={nextQ} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>
              {idx + 1 >= cards.length ? (isCreole ? 'Fini' : 'Terminer') : (isCreole ? 'Swivan' : 'Suivant')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
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
  const cards = useLessonCards(subjectCode, unitNo, lessonNo);
  const recordLessonScore = useStore((s) => s.recordLessonScore);
  const lessonProgress = useStore((s) => (lessonId ? s.progress[lessonId] : undefined));
  const level = lessonMastery(lessonProgress);

  // Keep the tab in sync with whichever button opened the sheet.
  React.useEffect(() => { if (visible) setMode(initialMode); }, [visible, initialMode]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Own provider so safe-area insets resolve inside the RN Modal window. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.segment}>
            {(['flashcards', 'exercices'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                hitSlop={8}
                style={[styles.segBtn, mode === m && styles.segBtnActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
              >
                <Text style={[styles.segText, mode === m && styles.segTextActive]}>
                  {m === 'flashcards'
                    ? (isCreole ? 'Kat etid' : 'Flashcards')
                    : (isCreole ? 'Egzèsis' : 'Exercices')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <X color={colors.muted} size={24} />
          </TouchableOpacity>
        </View>

        {cards.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 15, color: colors.muted, textAlign: 'center' }}>
              {isCreole ? 'Pa gen egzèsis pou leson sa a pou kounye a.' : 'Aucun exercice disponible pour cette leçon pour le moment.'}
            </Text>
          </View>
        ) : mode === 'flashcards' ? (
          <Flashcards cards={cards} isCreole={isCreole} />
        ) : (
          <Exercices
            cards={cards}
            isCreole={isCreole}
            resultLevel={lessonId ? level : undefined}
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segBtnActive: { backgroundColor: colors.surface, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 13.5, fontWeight: '600', color: colors.muted },
  segTextActive: { color: colors.azure, fontWeight: '700' },
  counter: { fontSize: 12, fontWeight: '600', color: colors.faint, marginBottom: 10 },
  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    padding: 24, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: colors.azure, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  cardText: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center', lineHeight: 28 },
  cardExpl: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 14, lineHeight: 20 },
  flipHint: { position: 'absolute', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 5 },
  flipHintText: { fontSize: 11, color: colors.faint },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  navBtn: { width: 52, height: 44, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  questionBox: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  questionText: { fontSize: 16, fontWeight: '600', color: colors.ink, lineHeight: 23 },
  explBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 14 },
  explText: { flex: 1, fontSize: 14, color: colors.muted, lineHeight: 20 },
  footer: { padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { backgroundColor: colors.azure, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
