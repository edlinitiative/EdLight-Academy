import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Check, ArrowRight, Target } from 'lucide-react-native';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';
import { useColors, typeScale } from '../theme/theme';
import { selectCards, buildChapterTest, chapterTestVerdicts, toInt, type PracticeCard } from '../utils/practiceCards';
import { lessonMastery, masteryLabel, type MasteryLevel } from '../utils/mastery';
import QuizResultHero, { HeroButton, glass, DEEP } from './quiz/QuizResultHero';
import { mixHex, darkenUntilReadable, lightenUntilReadable } from '../utils/contrast';
import PressableScale from './ui/PressableScale';
import MasteryArc from './MasteryArc';

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
 * It differs from the practice sheet in the two ways that make it a test rather
 * than a drill: questions are drawn round-robin across the WHOLE unit (so
 * knowing one lesson well can't carry you), and nothing is graded until the end
 * (no per-question reveal to learn from mid-run). A lesson is promoted only when
 * every question drawn from it came back right.
 *
 * It runs on the aurora ground and finishes on the shared QuizResultHero, so
 * passing a chapter feels like the other victories in the app rather than like
 * a form submission.
 */
export default function ChapterTest({
  visible, onClose, subjectCode, unitNo, unitTitle, lessons, isCreole = false, tint,
}: {
  visible: boolean;
  onClose: () => void;
  subjectCode?: string;
  unitNo?: any;
  unitTitle?: string;
  /** The unit's lessons, so questions can be attributed back to a lesson id. */
  lessons: any[];
  isCreole?: boolean;
  tint?: string;
}) {
  const colors = useColors();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { data } = useAppData();
  const progress = useStore((s) => s.progress);
  const applyChapterTest = useStore((s) => s.applyChapterTest);
  const accent = tint ?? colors.azure;

  // Driven to AA against white text — the tint is course data, not a token.
  const ground = useMemo(
    () => [
      darkenUntilReadable(mixHex(accent, DEEP, 0.16), DEEP, 8),
      mixHex(accent, DEEP, 0.62),
      DEEP,
    ] as const,
    [accent],
  );
  const arcFrom = useMemo(() => mixHex(accent, '#ffffff', 0.55), [accent]);
  const arcTo = useMemo(() => lightenUntilReadable(accent, ground[0], 4.5), [accent, ground]);

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'running' | 'done'>('intro');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const pool = useMemo(
    () => selectCards(data?.quizBank?.raw ?? [], subjectCode, unitNo),
    [data?.quizBank?.raw, subjectCode, unitNo],
  );
  // Re-drawn on each attempt, so a retake isn't the same twelve questions.
  const cards = useMemo(
    () => buildChapterTest(pool, QUESTION_COUNT, shuffle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, attempt],
  );

  const lessonIdByNo = useMemo(() => {
    const map: Record<number, string> = {};
    for (const l of lessons ?? []) {
      const no = toInt(l?.lesson_no);
      if (no != null && l?.id) map[no] = l.id;
    }
    return map;
  }, [lessons]);

  const reset = () => { setPhase('intro'); setIdx(0); setAnswers({}); setOutcome(null); };
  const close = () => { reset(); onClose(); };

  function finish(finalAnswers: Record<string, number>) {
    const correctByCardId: Record<string, boolean> = {};
    let score = 0;
    for (const card of cards) {
      const ok = finalAnswers[card.id] === card.correctIndex;
      correctByCardId[card.id] = ok;
      if (ok) score += 1;
    }
    const verdicts = chapterTestVerdicts(cards, correctByCardId, lessonIdByNo);
    // Snapshot levels BEFORE the store mutates, so the result screen can show
    // the actual promotion rather than just the new state.
    const before: Record<string, MasteryLevel> = {};
    for (const lessonId of Object.keys(verdicts)) before[lessonId] = lessonMastery(progress[lessonId]);
    applyChapterTest(verdicts);
    setOutcome({ cards, answers: finalAnswers, verdicts, before, score });
    setPhase('done');
  }

  // ── Results ────────────────────────────────────────────────────────────────
  if (phase === 'done' && outcome) {
    const promoted = Object.keys(outcome.verdicts).filter(
      (lessonId) => lessonMastery(progress[lessonId]) !== outcome.before[lessonId],
    );
    const title = promoted.length > 0
      ? (isCreole
        ? `${promoted.length} leson monte nivo`
        : `${promoted.length} leçon${promoted.length > 1 ? 's' : ''} a${promoted.length > 1 ? 'ont' : ''} progressé`)
      : t('Presque !', 'Prèske !');

    return (
      <Modal visible={visible} animationType="slide" onRequestClose={close}>
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: ground[0] }}>
            <QuizResultHero
              score={outcome.score}
              total={outcome.cards.length}
              isCreole={isCreole}
              title={title}
              accent={accent}
              celebrateHaptic
              showConfetti={promoted.length > 0}
              footer={(
                <View style={{ gap: 10 }}>
                  <HeroButton
                    label={t('Terminer', 'Fini')}
                    onPress={close}
                    variant="solid"
                    color={accent}
                  />
                  <HeroButton
                    label={t('Refaire le test', 'Refè tès la')}
                    onPress={() => { setAttempt((a) => a + 1); reset(); }}
                    variant="ghost"
                  />
                </View>
              )}
            >
              {promoted.length > 0 ? (
                <View style={{ width: '100%', marginTop: 22 }}>
                  <Text style={[typeScale.overline, { color: 'rgba(255,255,255,0.84)', marginBottom: 10 }]}>
                    {t('Tu as progressé', 'Ou avanse')}
                  </Text>
                  {promoted.map((lessonId) => {
                    const lesson = (lessons ?? []).find((l: any) => l.id === lessonId);
                    const after = lessonMastery(progress[lessonId]);
                    return (
                      <View
                        key={lessonId}
                        style={[{ borderRadius: 16, padding: 14, marginBottom: 8 }, glass]}
                      >
                        <Text style={[typeScale.bodyMd, { color: '#fff' }]} numberOfLines={2}>
                          {lesson?.title ?? t('Leçon', 'Leson')}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}>
                          <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.8)' }]}>
                            {masteryLabel(outcome.before[lessonId], isCreole)}
                          </Text>
                          <ArrowRight color="rgba(255,255,255,0.5)" size={12} />
                          <Text style={[typeScale.micro, { color: arcFrom }]}>
                            {masteryLabel(after, isCreole)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={[typeScale.body, {
                  color: 'rgba(255,255,255,0.88)', marginTop: 18, textAlign: 'center', lineHeight: 21,
                }]}>
                  {t(
                    "Aucune leçon n'a changé de niveau. Reprends les exercices des leçons manquées, puis retente.",
                    'Okenn leson pa chanje nivo. Repran egzèsis leson ou rate yo, epi eseye ankò.',
                  )}
                </Text>
              )}

              {/* Corrections come after the test, all at once — that's the review. */}
              <View style={{ width: '100%', marginTop: 26 }}>
                <Text style={[typeScale.overline, { color: 'rgba(255,255,255,0.84)', marginBottom: 10 }]}>
                  {t('Correction', 'Koreksyon')}
                </Text>
                {outcome.cards.map((c, i) => {
                  const given = outcome.answers[c.id];
                  const ok = given === c.correctIndex;
                  return (
                    <View key={c.id} style={[{ borderRadius: 16, padding: 14, marginBottom: 8 }, glass]}>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Text style={[typeScale.micro, {
                          color: ok ? '#D1FAE5' : '#FEE2E2', width: 18,
                        }]}>
                          {i + 1}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[typeScale.bodyMd, { color: '#fff' }]}>{c.question}</Text>
                          <Text style={[typeScale.caption, { color: '#D1FAE5', marginTop: 6 }]}>
                            {c.answer}
                          </Text>
                          {!ok && given != null ? (
                            <Text style={[typeScale.caption, { color: '#FEE2E2', marginTop: 2 }]}>
                              {t('Ta réponse', 'Repons ou')} : {c.options[given]}
                            </Text>
                          ) : null}
                          {!ok && c.explanation ? (
                            <Text style={[typeScale.caption, {
                              color: 'rgba(255,255,255,0.86)', marginTop: 6, lineHeight: 17,
                            }]}>
                              {c.explanation}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </QuizResultHero>

            <TouchableOpacity
              onPress={close}
              hitSlop={12}
              style={{ position: 'absolute', top: 58, right: 20 }}
              accessibilityRole="button"
              accessibilityLabel={t('Fermer', 'Fèmen')}
            >
              <X color="rgba(255,255,255,0.8)" size={22} />
            </TouchableOpacity>
          </View>
        </SafeAreaProvider>
      </Modal>
    );
  }

  // ── Intro + running (aurora ground) ────────────────────────────────────────
  const card = cards[idx];

  const body = () => {
    if (pool.length === 0) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={[typeScale.body, { color: 'rgba(255,255,255,0.88)', textAlign: 'center' }]}>
            {t(
              "Ce chapitre n'a pas encore assez de questions pour un test.",
              'Chapit sa a poko gen ase kesyon pou yon tès.',
            )}
          </Text>
        </View>
      );
    }

    // Intro: state the stakes. A test that opens like a drill feels like one.
    if (phase === 'intro') {
      return (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={{ alignItems: 'center', marginBottom: 26 }}>
            <MasteryArc
              level="none"
              points={0}
              label={undefined}
              caption={t('Vise la maîtrise', 'Vize metriz la')}
              from={arcFrom}
              to={arcTo}
              size={150}
            />
          </View>
          <Text style={[typeScale.display, { color: '#fff', textAlign: 'center' }]}>
            {t('Test du chapitre', 'Tès chapit la')}
          </Text>
          {unitTitle ? (
            <Text style={[typeScale.body, { color: 'rgba(255,255,255,0.84)', marginTop: 5, textAlign: 'center' }]}>
              {unitTitle}
            </Text>
          ) : null}

          <View style={[{ borderRadius: 20, padding: 18, marginTop: 26, gap: 13 }, glass]}>
            {[
              t(`${cards.length} questions tirées de tout le chapitre.`, `${cards.length} kesyon soti nan tout chapit la.`),
              t('Aucune correction avant la fin.', 'Pa gen koreksyon anvan lafen.'),
              t('Une leçon devient « maîtrisée » si toutes ses questions sont justes.', 'Yon leson vin « metrize » si tout kesyon li yo jis.'),
            ].map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 11 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: arcFrom, marginTop: 8 }} />
                <Text style={[typeScale.body, { color: 'rgba(255,255,255,0.85)', flex: 1, lineHeight: 20 }]}>
                  {line}
                </Text>
              </View>
            ))}
          </View>

          <HeroButton
            label={t('Commencer', 'Kòmanse')}
            onPress={() => setPhase('running')}
            variant="solid"
            color={accent}
            icon={<Target color="#fff" size={17} />}
            style={{ marginTop: 26 }}
          />
        </ScrollView>
      );
    }

    // Running
    if (!card) return null;
    const selected = answers[card.id];
    const isLast = idx + 1 >= cards.length;
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {cards.map((c, i) => (
              <View
                key={c.id}
                style={{
                  flex: 1, height: 3, borderRadius: 3,
                  backgroundColor: i < idx
                    ? arcFrom
                    : i === idx ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.16)',
                }}
              />
            ))}
          </View>
          <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.8)', marginTop: 10 }]}>
            {idx + 1} / {cards.length}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 12 }}>
          <Text style={[typeScale.h2, { color: '#fff', lineHeight: 26 }]}>{card.question}</Text>
          <View style={{ gap: 10, marginTop: 22 }}>
            {card.options.map((opt, i) => {
              const isSel = selected === i;
              return (
                <PressableScale
                  key={i}
                  onPress={() => setAnswers((a) => ({ ...a, [card.id]: i }))}
                  pressedScale={0.985}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSel }}
                  style={[{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    borderRadius: 16, padding: 15,
                  }, glass, isSel ? {
                    backgroundColor: 'rgba(255,255,255,0.24)',
                    borderColor: 'rgba(255,255,255,0.8)',
                  } : null]}
                >
                  <View style={{
                    width: 25, height: 25, borderRadius: 999,
                    backgroundColor: isSel ? '#fff' : 'rgba(255,255,255,0.16)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSel
                      ? <Check color={accent} size={14} strokeWidth={3} />
                      : <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.8)' }]}>{String.fromCharCode(65 + i)}</Text>}
                  </View>
                  <Text style={[typeScale.body, { flex: 1, color: '#fff', lineHeight: 20 }]}>{opt}</Text>
                </PressableScale>
              );
            })}
          </View>
        </ScrollView>

        <View style={{ padding: 16 }}>
          <HeroButton
            label={isLast ? t('Terminer le test', 'Fini tès la') : t('Suivant', 'Swivan')}
            onPress={() => { if (isLast) finish(answers); else setIdx((i) => i + 1); }}
            variant={selected == null ? 'glass' : 'solid'}
            color={accent}
            style={selected == null ? { opacity: 0.45 } : undefined}
          />
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaProvider>
        <LinearGradient colors={ground} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
          {/* Aurora glows — same depth cue as the course hero. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: -50, left: -40, width: 210, height: 210, borderRadius: 105, backgroundColor: accent, opacity: 0.28 }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -40, right: -30, width: 210, height: 210, borderRadius: 105, backgroundColor: arcFrom, opacity: 0.18 }} />
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 18, paddingVertical: 12,
            }}>
              <Text style={[typeScale.label, { color: 'rgba(255,255,255,0.86)' }]}>
                {t('Test du chapitre', 'Tès chapit la')}
              </Text>
              <TouchableOpacity onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('Fermer', 'Fèmen')}>
                <X color="rgba(255,255,255,0.8)" size={22} />
              </TouchableOpacity>
            </View>
            {body()}
          </SafeAreaView>
        </LinearGradient>
      </SafeAreaProvider>
    </Modal>
  );
}
