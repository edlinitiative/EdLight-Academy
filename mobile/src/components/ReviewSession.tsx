import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { useColors, typeScale } from '../theme/theme';
import { toPracticeCard, type PracticeCard } from '../utils/practiceCards';
import { dueQuestionIds } from '../utils/review';
import { Exercices } from './LessonPractice';

/**
 * Revizyon — a quiz made ONLY of the student's own missed questions.
 *
 * This is the layer between "replay the whole lesson" and "move on anyway":
 * a student who forgot one concept gets exactly that concept back, drawn from
 * the review map (utils/review). Answering a question correctly here resolves
 * it, so the pile shrinks by being learned, not by being dismissed.
 */

const SESSION_LIMIT = 10;

/** The due questions, rebuilt from the quiz bank, most recently missed first. */
export function useDueReviewCards(limit: number = SESSION_LIMIT): PracticeCard[] {
  const { data } = useAppData();
  const review = useStore((s) => s.review);
  const raw: any[] = data?.quizBank?.raw ?? [];
  return React.useMemo(() => {
    const due = dueQuestionIds(review);
    if (due.length === 0) return [];
    const byId = new Map<string, any>();
    for (const row of raw) if (row?.id) byId.set(String(row.id), row);
    const cards: PracticeCard[] = [];
    for (const id of due) {
      const row = byId.get(id);
      if (!row) continue; // question no longer in the bank — let it age out
      const card = toPracticeCard(row, cards.length);
      if (card) cards.push(card);
      if (cards.length >= limit) break;
    }
    return cards;
  }, [raw, review, limit]);
}

export default function ReviewSession({
  visible, onClose, isCreole = false,
}: {
  visible: boolean;
  onClose: () => void;
  isCreole?: boolean;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const dueCards = useDueReviewCards();
  const review = useStore((s) => s.review);
  const recordReviewOutcome = useStore((s) => s.recordReviewOutcome);

  // Freeze the deck when the sheet opens: answering mutates the review map,
  // and a live-recomputed deck would reshuffle under the student mid-session.
  const [cards, setCards] = useState<PracticeCard[]>([]);
  React.useEffect(() => {
    if (visible) setCards(dueCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface,
              borderBottomWidth: 1, borderBottomColor: colors.border,
            }}
          >
            <View>
              <Text style={[typeScale.title, { color: colors.ink }]}>
                {t('Révision', 'Revizyon')}
              </Text>
              <Text style={[typeScale.caption, { color: colors.faint, marginTop: 1 }]}>
                {t('Les questions que tu as ratées', 'Kesyon ou te rate yo')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
            >
              <X color={colors.muted} size={24} />
            </TouchableOpacity>
          </View>

          {cards.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <Text style={{ fontSize: 34, marginBottom: 12 }}>🎉</Text>
              <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
                {t(
                  'Rien à réviser — tu as corrigé toutes tes erreurs !',
                  'Anyen pou revize — ou korije tout erè ou yo !',
                )}
              </Text>
            </View>
          ) : (
            <Exercices
              cards={cards}
              isCreole={isCreole}
              onAnswer={(card, ok) => {
                const meta = review[card.id];
                recordReviewOutcome(card.id, ok, {
                  subjectCode: meta?.subjectCode,
                  unitNo: meta?.unitNo,
                  lessonId: meta?.lessonId,
                });
              }}
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
