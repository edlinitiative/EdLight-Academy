import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, RotateCcw, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';

const PRIMARY = '#0857A6';

type Card = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  answer: string;
  hint?: string;
  explanation?: string;
};

const toInt = (v: any): number | null => {
  if (v == null || v === '') return null;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

function parseOptions(raw: any): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map(String); } catch { /* not json */ }
  }
  return [];
}

// Build the practice cards for a lesson from the shared quiz bank (Firestore
// `quizzes`), keyed by subject_code + unit_no + lesson_no — the same source the
// web flashcards / Exercices read. Falls back to the whole chapter if the
// lesson has no lesson-level questions.
function useLessonCards(subjectCode?: string, unitNo?: any, lessonNo?: any): Card[] {
  const { data } = useAppData();
  const raw: any[] = data?.quizBank?.raw ?? [];
  return useMemo(() => {
    if (!subjectCode || unitNo == null) return [];
    const u = toInt(unitNo);
    const chapterRows = raw.filter(
      (r) => String(r.subject_code) === String(subjectCode) && toInt(r.unit_no ?? r.Chapter_Number) === u,
    );
    let rows = chapterRows;
    const l = toInt(lessonNo);
    if (l != null) {
      const lessonRows = chapterRows.filter((r) => toInt(r.lesson_no ?? r.Subchapter_Number) === l);
      if (lessonRows.length > 0) rows = lessonRows;
    }
    return rows
      .map((r, i): Card | null => {
        const question = String(r.question ?? '').trim();
        const options = parseOptions(r.options ?? r.choices);
        if (!question || options.length < 2) return null;
        const letter = String(r.correct_answer ?? r.correct_option ?? 'A').trim().toUpperCase();
        let correctIndex = letter.charCodeAt(0) - 65;
        if (correctIndex < 0 || correctIndex >= options.length) {
          const byText = options.findIndex((o) => o === String(r.correct_answer ?? '').trim());
          correctIndex = byText >= 0 ? byText : 0;
        }
        return {
          id: r.id || `q${i}`,
          question,
          options,
          correctIndex,
          answer: options[correctIndex] ?? '',
          hint: r.hint || undefined,
          explanation: r.good_response || r.explanation || undefined,
        };
      })
      .filter(Boolean) as Card[];
  }, [raw, subjectCode, unitNo, lessonNo]);
}

// ─── Flashcards ───────────────────────────────────────────────────────────────

function Flashcards({ cards, isCreole }: { cards: Card[]; isCreole: boolean }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[idx];
  if (!card) return null;

  const go = (d: number) => { setIdx((i) => Math.max(0, Math.min(cards.length - 1, i + d))); setFlipped(false); };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={styles.counter}>{idx + 1} / {cards.length}</Text>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setFlipped((f) => !f)} style={styles.card}>
        <Text style={styles.cardLabel}>{flipped ? (isCreole ? 'Repons' : 'Réponse') : 'Question'}</Text>
        <Text style={styles.cardText}>{flipped ? card.answer : card.question}</Text>
        {flipped && card.explanation ? (
          <Text style={styles.cardExpl}>{card.explanation}</Text>
        ) : null}
        <View style={styles.flipHint}>
          <RotateCcw color="#94a3b8" size={13} />
          <Text style={styles.flipHintText}>{isCreole ? 'Tape pou vire' : 'Touchez pour retourner'}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.rowBetween}>
        <TouchableOpacity onPress={() => go(-1)} disabled={idx === 0} style={[styles.navBtn, idx === 0 && styles.disabled]}>
          <ChevronLeft color="#334155" size={20} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => go(1)} disabled={idx === cards.length - 1} style={[styles.navBtn, idx === cards.length - 1 && styles.disabled]}>
          <ChevronRight color="#334155" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Exercices (MCQ) ──────────────────────────────────────────────────────────

function Exercices({ cards, isCreole }: { cards: Card[]; isCreole: boolean }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const card = cards[idx];

  if (done) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 40, fontWeight: '800', color: PRIMARY }}>{score}/{cards.length}</Text>
        <Text style={{ fontSize: 15, color: '#64748b', marginTop: 8 }}>
          {isCreole ? 'Byen fèt !' : 'Bien joué !'}
        </Text>
        <TouchableOpacity
          onPress={() => { setIdx(0); setSelected(null); setChecked(false); setScore(0); setDone(false); }}
          style={[styles.primaryBtn, { marginTop: 20 }]}
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
    if (idx + 1 >= cards.length) return setDone(true);
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
            let border = '#e8edf5'; let bg = '#ffffff'; let color = '#111827';
            if (checked) {
              if (isCorrect) { border = '#10b981'; bg = '#ecfdf5'; color = '#047857'; }
              else if (isSel) { border = '#ef4444'; bg = '#fef2f2'; color = '#b91c1c'; }
            } else if (isSel) { border = PRIMARY; bg = '#eef4fb'; }
            return (
              <TouchableOpacity
                key={i}
                disabled={checked}
                onPress={() => setSelected(i)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: border, backgroundColor: bg, borderRadius: 14, padding: 14 }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 999, backgroundColor: isSel && !checked ? PRIMARY : '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSel && !checked ? '#fff' : '#64748b' }}>{String.fromCharCode(65 + i)}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 14.5, color, lineHeight: 20 }}>{opt}</Text>
                {checked && isCorrect ? <Check color="#10b981" size={18} /> : null}
                {checked && isSel && !isCorrect ? <X color="#ef4444" size={18} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
        {checked && (card.explanation || card.hint) ? (
          <View style={styles.explBox}>
            <Lightbulb color="#b7791f" size={15} />
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
  visible, onClose, subjectCode, unitNo, lessonNo, initialMode = 'flashcards', isCreole = false,
}: {
  visible: boolean;
  onClose: () => void;
  subjectCode?: string;
  unitNo?: any;
  lessonNo?: any;
  initialMode?: 'flashcards' | 'exercices';
  isCreole?: boolean;
}) {
  const [mode, setMode] = useState<'flashcards' | 'exercices'>(initialMode);
  const cards = useLessonCards(subjectCode, unitNo, lessonNo);

  // Keep the tab in sync with whichever button opened the sheet.
  React.useEffect(() => { if (visible) setMode(initialMode); }, [visible, initialMode]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Own provider so safe-area insets resolve inside the RN Modal window. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fb' }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.segment}>
            {(['flashcards', 'exercices'] as const).map((m) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.segBtn, mode === m && styles.segBtnActive]}>
                <Text style={[styles.segText, mode === m && styles.segTextActive]}>
                  {m === 'flashcards' ? 'Flashcards' : (isCreole ? 'Egzèsis' : 'Exercices')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
            <X color="#334155" size={24} />
          </TouchableOpacity>
        </View>

        {cards.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center' }}>
              {isCreole ? 'Pa gen egzèsis pou leson sa a pou kounye a.' : 'Aucun exercice disponible pour cette leçon pour le moment.'}
            </Text>
          </View>
        ) : mode === 'flashcards' ? (
          <Flashcards cards={cards} isCreole={isCreole} />
        ) : (
          <Exercices cards={cards} isCreole={isCreole} />
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e8edf5',
  },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segBtnActive: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 13.5, fontWeight: '600', color: '#64748b' },
  segTextActive: { color: PRIMARY, fontWeight: '700' },
  counter: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginBottom: 10 },
  card: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e8edf5',
    padding: 24, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  cardText: { fontSize: 20, fontWeight: '700', color: '#0f172a', textAlign: 'center', lineHeight: 28 },
  cardExpl: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 14, lineHeight: 20 },
  flipHint: { position: 'absolute', bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 5 },
  flipHintText: { fontSize: 11, color: '#94a3b8' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  navBtn: { width: 52, height: 44, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8edf5', alignItems: 'center', justifyContent: 'center' },
  questionBox: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e8edf5', padding: 16 },
  questionText: { fontSize: 16, fontWeight: '600', color: '#0f172a', lineHeight: 23 },
  explBox: { flexDirection: 'row', gap: 8, backgroundColor: '#fffdf5', borderRadius: 14, borderWidth: 1, borderColor: '#f1e6c4', padding: 14, marginTop: 14 },
  explText: { flex: 1, fontSize: 14, color: '#475569', lineHeight: 20 },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e8edf5' },
  primaryBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
