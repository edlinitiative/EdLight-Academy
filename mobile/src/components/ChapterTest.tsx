import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, ArrowRight, Flag } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { useTheme } from '../theme/theme';
import { selectCards, buildChapterTest, chapterTestVerdicts, toInt, type PracticeCard } from '../utils/practiceCards';
import { lessonMastery, masteryLabel, type MasteryLevel } from '../utils/mastery';
import { success as hapticSuccess } from '../utils/haptics';
import { useReduceMotion, modalAnimation } from '../utils/motion';
import PressableScale from './ui/PressableScale';
import Button from './ui/Button';
import { chapterDraftKey, restoreChapterDraft, serializeChapterDraft } from '../utils/chapterTestDraft';

const QUESTION_COUNT = 12;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Outcome = {
  cards: PracticeCard[];
  answers: Record<string, number>;
  verdicts: Record<string, boolean>;
  before: Record<string, MasteryLevel>;
  score: number;
};

/**
 * The chapter test — the only route to "maîtrisé".
 *
 * It differs from practice in the two ways that make it a test rather than a
 * drill: questions are drawn round-robin across the WHOLE unit (so knowing one
 * lesson well can't carry you), and nothing is graded until the end (no
 * per-question reveal to learn from mid-run). A lesson is promoted only when
 * every question drawn from it came back right.
 *
 * Visual language (DIRECTION §0 + §6): the learning world — page ground, opaque
 * white cards, no rings, no glass, no gradient ground; one solid azure button
 * per state; correction marked with opaque washes (correct #E7F6EE-family
 * successSoft, wrong dangerSoft), never a coloured edge. The score is the one
 * earned number, so it is the only gold on screen.
 */
export default function ChapterTest({
  visible, onClose, subjectCode, unitNo, unitTitle, lessons, isCreole = false,
}: {
  visible: boolean;
  onClose: () => void;
  subjectCode?: string;
  unitNo?: any;
  unitTitle?: string;
  /** The unit's lessons, so questions can be attributed back to a lesson id. */
  lessons: any[];
  isCreole?: boolean;
  /** Kept for callers; the test no longer tints its ground by subject. */
  tint?: string;
}) {
  const { colors, typeScale, fonts, cardSurface, featureSurface, isDark } = useTheme();
  const reduce = useReduceMotion();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { data } = useAppData();
  const progress = useStore((s) => s.progress);
  const applyChapterTest = useStore((s) => s.applyChapterTest);
  const recordReviewOutcome = useStore((s) => s.recordReviewOutcome);
  // Whose test this is: an unfinished test is restored only for its owner
  // (same rule as the exam draft mirror, F1). Guests share one bucket.
  const owner = useStore((s) => (s.isAuthenticated && s.user?.uid ? s.user.uid : 'guest'));
  const draftKey = chapterDraftKey(subjectCode, unitNo);

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The draw being played, frozen at start (or restored), so a bank refresh
  // mid-test can't swap the questions under the student.
  const [fixedCards, setFixedCards] = useState<PracticeCard[] | null>(null);
  const [resumable, setResumable] = useState<ReturnType<typeof restoreChapterDraft>>(null);

  const pool = useMemo(
    () => selectCards(data?.quizBank?.raw ?? [], subjectCode, unitNo),
    [data?.quizBank?.raw, subjectCode, unitNo],
  );
  // Re-drawn on each attempt, so a retake isn't the same twelve questions.
  const drawn = useMemo(
    () => buildChapterTest(pool, QUESTION_COUNT, shuffle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, attempt],
  );
  const cards = fixedCards ?? drawn;

  // L-8: an unfinished test (app killed or backgrounded) can be resumed.
  useEffect(() => {
    if (!visible || phase !== 'intro' || pool.length === 0) return undefined;
    let live = true;
    AsyncStorage.getItem(draftKey)
      .then((raw) => { if (live) setResumable(restoreChapterDraft(raw, owner, pool)); })
      .catch(() => {});
    return () => { live = false; };
  }, [visible, phase, draftKey, owner, pool]);

  // Saved on every answer and every step, while the test runs.
  useEffect(() => {
    if (phase !== 'running' || cards.length === 0) return;
    AsyncStorage.setItem(draftKey, serializeChapterDraft(owner, cards, answers, idx)).catch(() => {});
  }, [phase, cards, answers, idx, draftKey, owner]);

  const start = () => {
    setFixedCards(drawn);
    setAnswers({});
    setIdx(0);
    setResumable(null);
    setPhase('running');
  };
  const resume = () => {
    if (!resumable) return;
    setFixedCards(resumable.cards);
    setAnswers(resumable.answers);
    setIdx(resumable.idx);
    setResumable(null);
    setPhase('running');
  };

  const lessonIdByNo = useMemo(() => {
    const map: Record<number, string> = {};
    for (const l of lessons ?? []) {
      const no = toInt(l?.lesson_no);
      if (no != null && l?.id) map[no] = l.id;
    }
    return map;
  }, [lessons]);

  const reset = () => { setPhase('intro'); setIdx(0); setAnswers({}); setOutcome(null); setFixedCards(null); };
  const close = () => { reset(); onClose(); };

  function finish(finalAnswers: Record<string, number>) {
    const correctByCardId: Record<string, boolean> = {};
    let score = 0;
    for (const card of cards) {
      const ok = finalAnswers[card.id] === card.correctIndex;
      correctByCardId[card.id] = ok;
      if (ok) score += 1;
      // Feed the review map: a miss here becomes a "Revizyon" question, a hit
      // resolves one missed elsewhere.
      recordReviewOutcome(card.id, ok, {
        subjectCode,
        unitNo: toInt(unitNo) ?? undefined,
        lessonId: card.lessonNo != null ? lessonIdByNo[card.lessonNo] : undefined,
      });
    }
    const verdicts = chapterTestVerdicts(cards, correctByCardId, lessonIdByNo);
    // Snapshot levels BEFORE the store mutates, so the result screen can show
    // the actual promotion rather than just the new state.
    const before: Record<string, MasteryLevel> = {};
    for (const lessonId of Object.keys(verdicts)) before[lessonId] = lessonMastery(progress[lessonId]);
    applyChapterTest(verdicts);
    AsyncStorage.removeItem(draftKey).catch(() => {});
    setOutcome({ cards, answers: finalAnswers, verdicts, before, score });
    setPhase('done');
  }

  const promoted = outcome
    ? Object.keys(outcome.verdicts).filter((id) => lessonMastery(progress[id]) !== outcome.before[id])
    : [];
  useEffect(() => {
    if (phase === 'done' && promoted.length > 0) hapticSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 56, backgroundColor: colors.surface }}>
      <PressableScale
        onPress={close}
        haptic={false}
        accessibilityRole="button"
        accessibilityLabel={t('Fermer', 'Fèmen')}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <X color={colors.ink} size={24} strokeWidth={2.2} />
      </PressableScale>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: colors.ink }}>
        {t('Test du chapitre', 'Tès chapit la')}{unitTitle ? ` · ${unitTitle}` : ''}
      </Text>
    </View>
  );

  const shell = (children: React.ReactNode, footer?: React.ReactNode) => (
    <Modal visible={visible} animationType={modalAnimation(reduce, 'slide')} onRequestClose={close}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
          {header}
          {children}
          {footer ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surface }}>{footer}</View>
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );

  // ── Results ────────────────────────────────────────────────────────────────
  if (phase === 'done' && outcome) {
    const total = outcome.cards.length;
    const pct = total > 0 ? Math.round((outcome.score / total) * 100) : 0;
    return shell(
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}>
        <View style={[featureSurface, { padding: 24 }]} accessible accessibilityLabel={`${t('Score', 'Nòt')} ${outcome.score} ${t('sur', 'sou')} ${total}`}>
          <Text style={[typeScale.meta, { color: colors.muted }]}>{t('Score', 'Nòt')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <Text style={{ fontFamily: fonts.heading, fontSize: 56, lineHeight: 60, letterSpacing: -2, color: isDark ? '#FFB92E' : '#B7791F' }}>{outcome.score}</Text>
            <Text style={{ fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 28, color: colors.muted }}>/ {total}</Text>
          </View>
          <View style={{ alignSelf: 'flex-start', marginTop: 12, backgroundColor: colors.azureSoft, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.azureInk }}>
              {pct} % · {promoted.length > 0
                ? (isCreole ? `${promoted.length} leson monte nivo` : `${promoted.length} leçon${promoted.length > 1 ? 's ont' : ' a'} progressé`)
                : t('Presque !', 'Prèske !')}
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, marginTop: 14, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(pct, 3)}%`, height: 8, borderRadius: 4, backgroundColor: colors.azure }} />
          </View>
          {promoted.length === 0 ? (
            <Text style={[typeScale.body, { color: colors.muted, marginTop: 14 }]}>
              {t(
                "Aucune leçon n'a changé de niveau. Reprends les exercices des leçons manquées, puis retente.",
                'Okenn leson pa chanje nivo. Repran egzèsis leson ou rate yo, epi eseye ankò.',
              )}
            </Text>
          ) : null}
        </View>

        {promoted.length > 0 ? (
          <View style={[cardSurface, { padding: 20, gap: 14 }]}>
            <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>{t('Tu as progressé', 'Ou avanse')}</Text>
            {promoted.map((lessonId) => {
              const lesson = (lessons ?? []).find((l: any) => l.id === lessonId);
              const after = lessonMastery(progress[lessonId]);
              return (
                <View key={lessonId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Check color={colors.success} size={16} strokeWidth={3} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[typeScale.bodyMd, { color: colors.ink }]} numberOfLines={2}>{lesson?.title ?? t('Leçon', 'Leson')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={[typeScale.caption, { color: colors.muted }]}>{masteryLabel(outcome.before[lessonId], isCreole)}</Text>
                      <ArrowRight color={colors.faint} size={14} />
                      <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.azureInk }}>{masteryLabel(after, isCreole)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Corrections come after the test, all at once — that's the review. */}
        <View style={[cardSurface, { padding: 20, gap: 12 }]}>
          <Text accessibilityRole="header" style={[typeScale.cardTitle, { color: colors.ink }]}>{t('Correction', 'Koreksyon')}</Text>
          {outcome.cards.map((c, i) => {
            const given = outcome.answers[c.id];
            const ok = given === c.correctIndex;
            return (
              <View
                key={c.id}
                accessible
                accessibilityLabel={`${t('Question', 'Kesyon')} ${i + 1}, ${ok ? t('juste', 'bon') : t('fausse', 'pa bon')}. ${c.question}`}
                style={{ borderRadius: 14, padding: 14, backgroundColor: ok ? colors.successSoft : colors.dangerSoft }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.muted }}>
                  {t('Question', 'Kesyon')} {i + 1} · {ok ? t('Bonne réponse', 'Bon repons') : t('À revoir', 'Pou revize')}
                </Text>
                <Text style={[typeScale.bodyMd, { color: colors.ink, marginTop: 4 }]}>{c.question}</Text>
                <Text style={[typeScale.body, { color: colors.ink, marginTop: 6 }]}>
                  <Text style={{ fontFamily: fonts.bold }}>{t('Bonne réponse : ', 'Bon repons : ')}</Text>{c.answer}
                </Text>
                {!ok && given != null ? (
                  <Text style={[typeScale.body, { color: colors.ink, marginTop: 2 }]}>
                    <Text style={{ fontFamily: fonts.bold }}>{t('Ta réponse : ', 'Repons ou : ')}</Text>{c.options[given]}
                  </Text>
                ) : null}
                {!ok && c.explanation ? (
                  <Text style={[typeScale.meta, { color: colors.muted, marginTop: 6 }]}>{c.explanation}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>,
      <View style={{ gap: 4 }}>
        <Button label={t('Terminer', 'Fini')} size="lg" fullWidth onPress={close} />
        <Button label={t('Refaire le test', 'Refè tès la')} variant="ghost" fullWidth onPress={() => { setAttempt((a) => a + 1); reset(); }} />
      </View>,
    );
  }

  if (pool.length === 0) {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center' }]}>
          {t("Ce chapitre n'a pas encore assez de questions pour un test.", 'Chapit sa a poko gen ase kesyon pou yon tès.')}
        </Text>
      </View>,
    );
  }

  // Intro: state the stakes. A test that opens like a drill feels like one.
  if (phase === 'intro') {
    return shell(
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={[featureSurface, { padding: 24 }]}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.azureSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Flag color={colors.azureInk} size={22} strokeWidth={2.2} />
          </View>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.heading, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: colors.ink, marginTop: 16 }}>
            {t('Test du chapitre', 'Tès chapit la')}
          </Text>
          {unitTitle ? <Text style={[typeScale.meta, { color: colors.muted, marginTop: 6 }]}>{unitTitle}</Text> : null}
          <View style={{ marginTop: 20, gap: 12, backgroundColor: isDark ? colors.surfaceAlt : '#F2F5FA', borderRadius: 18, padding: 16 }}>
            {[
              t(`${cards.length} questions tirées de tout le chapitre.`, `${cards.length} kesyon soti nan tout chapit la.`),
              t('Aucune correction avant la fin.', 'Pa gen koreksyon anvan lafen.'),
              t('Une leçon devient « maîtrisée » si toutes ses questions sont justes.', 'Yon leson vin « metrize » si tout kesyon li yo jis.'),
            ].map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.azure, marginTop: 9 }} />
                <Text style={[typeScale.body, { color: colors.ink, flex: 1 }]}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>,
      resumable ? (
        <View style={{ gap: 8 }}>
          <Button
            label={t(`Reprendre (question ${resumable.idx + 1} sur ${resumable.cards.length})`, `Kontinye (kesyon ${resumable.idx + 1} sou ${resumable.cards.length})`)}
            size="lg"
            fullWidth
            onPress={resume}
          />
          <Button
            label={t('Recommencer', 'Rekòmanse')}
            variant="ghost"
            fullWidth
            onPress={() => { AsyncStorage.removeItem(draftKey).catch(() => {}); start(); }}
          />
        </View>
      ) : (
        <Button label={t('Commencer le test', 'Kòmanse tès la')} size="lg" fullWidth onPress={start} />
      ),
    );
  }

  // Running
  const card = cards[idx];
  if (!card) return null;
  const selected = answers[card.id];
  const isLast = idx + 1 >= cards.length;
  const pct = Math.round(((idx + 1) / cards.length) * 100);
  return shell(
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[typeScale.meta, { color: colors.ink }]}>
            {t(`Question ${idx + 1} sur ${cards.length}`, `Kesyon ${idx + 1} sou ${cards.length}`)}
          </Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.azureInk }}>{pct}%</Text>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, marginTop: 8, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: colors.azure }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 12 }}>
        <View style={[cardSurface, { padding: 20 }]}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, color: colors.ink }}>{card.question}</Text>
        </View>
        <View style={{ gap: 12, marginTop: 16 }} accessibilityRole="radiogroup">
          {card.options.map((opt, i) => {
            const isSel = selected === i;
            return (
              <PressableScale
                key={i}
                onPress={() => setAnswers((a) => ({ ...a, [card.id]: i }))}
                pressedScale={0.985}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${String.fromCharCode(65 + i)}. ${opt}`}
                style={[cardSurface, {
                  borderRadius: 16, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
                  backgroundColor: isSel ? colors.azureSoft : colors.surface,
                }]}
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: isSel ? colors.azureFill : colors.surfaceAlt,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSel
                    ? <Check color="#ffffff" size={18} strokeWidth={3} />
                    : <Text style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink }}>{String.fromCharCode(65 + i)}</Text>}
                </View>
                <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 18, lineHeight: 24, color: colors.ink }}>{opt}</Text>
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
    </View>,
    <Button
      label={isLast ? t('Terminer le test', 'Fini tès la') : t('Question suivante', 'Pwochen kesyon')}
      size="lg"
      fullWidth
      disabled={selected == null}
      onPress={() => { if (isLast) finish(answers); else setIdx((i) => i + 1); }}
    />,
  );
}
