import React, { useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Check } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { useColors, useTheme, typeScale, radius, fonts } from '../theme/theme';
import { toPracticeCard, type PracticeCard } from '../utils/practiceCards';
import type { ReviewMap } from '../utils/review';
import { trackJourney } from '../utils/learningJourney';
import { Exercices } from './LessonPractice';
import Button from './ui/Button';
import { AnswerStatus } from './journey/practice/Answer';
import { dueIdsInScope, dueRowsInScope, type ReviewScope } from './journey/practice/reviewScope';

/**
 * Revizyon — a quiz made ONLY of the student's own missed questions.
 *
 * This is the layer between "replay the whole lesson" and "move on anyway":
 * a student who forgot one concept gets exactly that concept back, drawn from
 * the review map (utils/review). Answering a question correctly here resolves
 * it, so the pile shrinks by being learned, not by being dismissed.
 *
 * `scope` keeps the topic a result screen handed over (LJ-09): "Réviser mes 3
 * erreurs" from a chemistry chapter opens THOSE errors, not the whole pile.
 */

const SESSION_LIMIT = 10;

export type { ReviewScope };

/** The due questions, rebuilt from the quiz bank, most recently missed first. */
export function useDueReviewCards(limit: number = SESSION_LIMIT, scope?: ReviewScope | null): PracticeCard[] {
  const { data } = useAppData();
  const review = useStore((s) => s.review);
  const raw: any[] = data?.quizBank?.raw ?? [];
  return React.useMemo(() => {
    const rows = dueRowsInScope(review as ReviewMap, raw, scope);
    const cards: PracticeCard[] = [];
    for (const row of rows) {
      const card = toPracticeCard(row, cards.length);
      // A question with no usable key cannot be "fixed" — leave it out.
      if (card && card.gradable !== false) cards.push(card);
      if (cards.length >= limit) break;
    }
    return cards;
  }, [raw, review, limit, scope]);
}

export default function ReviewSession({
  visible, onClose, isCreole = false, scope = null,
}: {
  visible: boolean;
  onClose: () => void;
  isCreole?: boolean;
  /** Topic from a result screen. Omit for the whole pile. */
  scope?: ReviewScope | null;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [wide, setWide] = useState(false);
  const activeScope = wide ? null : scope;
  const dueCards = useDueReviewCards(SESSION_LIMIT, activeScope);
  const review = useStore((s) => s.review);
  const recordReviewOutcome = useStore((s) => s.recordReviewOutcome);
  const { data, isLoading } = useAppData();
  const raw: any[] = data?.quizBank?.raw ?? [];
  // Without the bank, every due question looks "gone": never call that
  // "rien à réviser" — wait for it.
  const ready = !isLoading && !!data;
  const totalDue = useMemo(() => dueIdsInScope(review as ReviewMap, raw, null).length, [review, raw]);

  // Freeze the deck when the sheet opens: answering mutates the review map,
  // and a live-recomputed deck would reshuffle under the student mid-session.
  const [cards, setCards] = useState<PracticeCard[]>([]);
  const [round, setRound] = useState(0);
  React.useEffect(() => {
    if (visible && ready) setCards(dueCards);
    if (!visible) setWide(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, wide, round, ready]);

  const started = useRef<string | null>(null);
  const sessionKey = `${round}|${wide}|${cards.map((c) => c.id).join(',')}`;
  const onStart = () => {
    if (started.current === sessionKey) return;
    started.current = sessionKey;
    trackJourney('review_started', { count: cards.length, scoped: !!activeScope, source: activeScope?.source ?? 'review' });
  };

  const remainingInScope = useMemo(
    () => dueIdsInScope(review as ReviewMap, raw, activeScope).length,
    [review, raw, activeScope],
  );

  const scopeLine = activeScope?.label
    ? t(`Tes erreurs · ${activeScope.label}`, `Erè ou yo · ${activeScope.label}`)
    : t('Les questions que tu as ratées', 'Kesyon ou te rate yo');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              paddingLeft: 20, paddingRight: 10, paddingVertical: 10, backgroundColor: colors.surface, zIndex: 1,
              shadowColor: '#0B296B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 22, color: colors.ink }}>
                {t('Révision', 'Revizyon')}
              </Text>
              <Text numberOfLines={1} style={[typeScale.meta, { color: colors.muted, marginTop: 1 }]}>{scopeLine}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
            >
              <X color={colors.ink} size={24} />
            </TouchableOpacity>
          </View>

          {!ready ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }} accessibilityLiveRegion="polite">
              <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
                {t('Chargement de tes questions…', 'N ap chaje kesyon ou yo…')}
              </Text>
            </View>
          ) : cards.length === 0 ? (
            <CaughtUp
              t={t}
              scoped={!!activeScope}
              otherDue={totalDue}
              onWide={() => setWide(true)}
              onClose={onClose}
            />
          ) : (
            <Exercices
              key={sessionKey}
              cards={cards}
              isCreole={isCreole}
              onStart={onStart}
              onAnswer={(card, ok) => {
                const meta = review[card.id];
                recordReviewOutcome(card.id, ok, {
                  subjectCode: meta?.subjectCode,
                  unitNo: meta?.unitNo,
                  lessonId: meta?.lessonId,
                });
              }}
              renderDone={({ tally }) => {
                return (
                  <ReviewDone
                    t={t}
                    fixed={tally.correct}
                    missed={tally.incorrect}
                    remaining={remainingInScope}
                    onMore={() => setRound((r) => r + 1)}
                    onClose={onClose}
                    onReport={() => trackJourney('review_completed', {
                      total: tally.total, correct: tally.correct, incorrect: tally.incorrect,
                      remaining: remainingInScope, scoped: !!activeScope,
                    })}
                  />
                );
              }}
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function CaughtUp({ t, scoped, otherDue, onWide, onClose }: {
  t: (fr: string, ht: string) => string;
  scoped: boolean;
  otherDue: number;
  onWide: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 14 }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.chip, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
        <Check color={colors.successFill} size={28} strokeWidth={2.6} />
      </View>
      <Text style={[typeScale.cardTitle, { color: colors.ink, textAlign: 'center' }]}>
        {scoped ? t('Rien à réviser dans ce chapitre', 'Anyen pou revize nan chapit sa a') : t('Rien à réviser', 'Anyen pou revize')}
      </Text>
      <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
        {scoped
          ? t('Tu as corrigé les erreurs de ce chapitre.', 'Ou korije erè chapit sa a yo.')
          : t('Tu as corrigé toutes tes erreurs. Les prochaines questions ratées apparaîtront ici.', 'Ou korije tout erè ou yo. Pwochen kesyon ou rate yo ap parèt isit la.')}
      </Text>
      {scoped && otherDue > 0 ? (
        <Button label={t(`Réviser mes autres erreurs · ${otherDue}`, `Revize lòt erè m yo · ${otherDue}`)} onPress={onWide} size="lg" fullWidth />
      ) : (
        <Button label={t('Fermer', 'Fèmen')} onPress={onClose} size="lg" fullWidth />
      )}
    </View>
  );
}

function ReviewDone({ t, fixed, missed, remaining, onMore, onClose, onReport }: {
  t: (fr: string, ht: string) => string;
  fixed: number;
  missed: number;
  remaining: number;
  onMore: () => void;
  onClose: () => void;
  onReport: () => void;
}) {
  const colors = useColors();
  const { cardSurface } = useTheme();
  const reported = useRef(false);
  React.useEffect(() => { if (!reported.current) { reported.current = true; onReport(); } }, [onReport]);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink }]}>{t('Révision terminée', 'Revizyon fini')}</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ ...cardSurface, flex: 1, padding: 18, gap: 8 }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: 40, lineHeight: 44, letterSpacing: -1.2, color: colors.ink, fontVariant: ['tabular-nums'] }}>{fixed}</Text>
          <AnswerStatus kind="correct" t={t} label={t('Corrigées', 'Korije')} />
        </View>
        <View style={{ ...cardSurface, flex: 1, padding: 18, gap: 8 }}>
          <Text style={{ fontFamily: fonts.heading, fontSize: 40, lineHeight: 44, letterSpacing: -1.2, color: colors.ink, fontVariant: ['tabular-nums'] }}>{missed}</Text>
          <AnswerStatus kind="incorrect" t={t} label={t('Encore ratées', 'Rate ankò')} />
        </View>
      </View>
      <Text style={[typeScale.body, { color: colors.ink }]}>
        {remaining > 0
          ? t(`Il reste ${remaining} question${remaining > 1 ? 's' : ''} à revoir. Une question quitte la Révision quand tu y réponds juste.`,
            `Rete ${remaining} kesyon pou revize. Yon kesyon soti nan Revizyon lè ou reponn li kòrèk.`)
          : t('Plus rien à revoir ici pour l’instant.', 'Pa gen anyen ankò pou revize isit la pou kounye a.')}
      </Text>
      {remaining > 0 ? (
        <>
          <Button label={t('Continuer la révision', 'Kontinye revizyon an')} onPress={onMore} size="lg" fullWidth />
          <Button label={t('Fermer', 'Fèmen')} onPress={onClose} variant="secondary" size="lg" fullWidth />
        </>
      ) : (
        <Button label={t('Fermer', 'Fèmen')} onPress={onClose} size="lg" fullWidth />
      )}
    </ScrollView>
  );
}
