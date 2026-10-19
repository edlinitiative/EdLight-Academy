/**
 * Mode Histoire on the phone — « Le tour d'Ayiti ». The native port of the
 * web /arena/histoire (src/pages/arena/ArenaStory.tsx).
 *
 * map → play → result. The rules are shared/arenaStory, unchanged: ten
 * départements × three stages + a boss, stars best-of, the next chapter opens
 * when the boss falls. Questions come from the same trivia banks as every
 * other round (shared storyDraw), the round is the app's own QuizPlayer, and
 * XP goes through useTrivia.recordResult — so the campaign feeds the
 * student's school exactly like any other game. Progress is kept per account
 * on this device (hooks/useStoryProgress; account sync is a follow-up).
 *
 * No hero band: a back button and a title row, then the map.
 */
import React, { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Check, ChevronLeft, ChevronRight, Crown, Lock, Play, RefreshCw, Star } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import {
  STORY_CHAPTERS, STAGES_PER_CHAPTER, MAX_STARS, chapterCleared, chapterGoStage, chapterRow, isUnlocked,
  nextStage, stageOf, starsFor, storyDraw, totalStars, type StoryStage,
} from '../../../../shared/arenaStory';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../data/triviaData';
import { QuizPlayer, toPrepared, type PreparedQuestion } from '../TriviaScreen';
import { ArenaButton, ArenaScreen } from '../../components/arena/ArenaKit';
import arenaHaptics from '../../components/arena/arenaHaptics';
import Avatar from '../../components/arena/art/avatars/Avatar';
import StoryMapArt from '../../components/arena/city/StoryMapArt';
import PressableScale from '../../components/ui/PressableScale';
import PopIn from '../../components/ui/PopIn';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import { useReduceMotion } from '../../utils/motion';

type Phase = 'map' | 'play' | 'result';
type T = (fr: string, ht: string) => string;

const BANKS = TRIVIA_QUESTIONS as Record<string, any[]>;

/** A stage's round, ready for QuizPlayer. */
export function prepareStoryRound(stage: StoryStage, rand: () => number = Math.random): PreparedQuestion[] {
  return storyDraw(stage, BANKS, rand).map((p) => toPrepared(BANKS[p.theme][p.idx]));
}

export default function ArenaStoryScreen() {
  const navigation = useNavigation<any>();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const { width } = useWindowDimensions();
  const { recordResult, isAuthed } = useTrivia();
  const { progress, record } = useStoryProgress();
  const reduce = useReduceMotion();

  const next = nextStage(progress);
  const [picked, setPicked] = useState<number | null>(null);
  const chapterIdx = picked ?? next?.chapter ?? STORY_CHAPTERS.length - 1;
  const chapter = STORY_CHAPTERS[chapterIdx];
  const row = chapterRow(progress, chapterIdx);

  const [phase, setPhase] = useState<Phase>('map');
  const [stageIdx, setStageIdx] = useState(0);
  const [round, setRound] = useState<PreparedQuestion[]>([]);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number; stars: number; xp: number | null } | null>(null);

  const themeName = (id: string) => {
    const c = (TRIVIA_CATEGORIES as any[]).find((x) => x.id === id);
    return c ? (isCreole ? c.nameHt || c.name : c.name) : id;
  };
  const stageLabel = (s: StoryStage) => s.themes.map(themeName).join(' · ');

  const play = (chapterAt: number, i: number) => {
    if (!isUnlocked(progress, chapterAt, i)) return;
    const stage = stageOf(chapterAt, i);
    if (!stage) return;
    arenaHaptics.commit();
    setPicked(chapterAt);
    setStageIdx(i);
    setRound(prepareStoryRound(stage));
    setResult(null);
    setNonce((n) => n + 1);
    setPhase('play');
  };

  const onFinish = (score: number, total: number) => {
    const stage = stageOf(chapterIdx, stageIdx)!;
    const stars = starsFor(score, stage);
    record(chapterIdx, stageIdx, stars);
    if (stars > 0) arenaHaptics.correct(); else arenaHaptics.wrong();
    setResult({ score, total, stars, xp: null });
    setPhase('result');
    recordResult({ category: stage.themes[0], score, total, isDaily: false })
      .then((r: any) => {
        const xp = Number(r?.xpEarned);
        if (Number.isFinite(xp)) setResult((prev) => (prev ? { ...prev, xp } : prev));
      })
      .catch(() => undefined); // XP is a bonus here; the stars are already saved.
  };

  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ArenaHub'));
  const isBoss = stageIdx === STAGES_PER_CHAPTER - 1;

  // ── Play ────────────────────────────────────────────────────────────────
  if (phase === 'play') {
    const stage = stageOf(chapterIdx, stageIdx)!;
    return (
      <ArenaScreen world={false} edges={['top']}>
        <QuizPlayer
          key={`${chapter.id}-${stageIdx}-${nonce}`}
          questions={round}
          category={null}
          isCreole={isCreole}
          title={isBoss ? t(`Boss · ${chapter.boss.name}`, `Bòs · ${chapter.boss.name}`) : `${chapter.dept} · ${t(`Étape ${stageIdx + 1}`, `Etap ${stageIdx + 1}`)}`}
          onQuit={() => setPhase('map')}
          onFinish={(score, total) => onFinish(score, total)}
        />
        <Text style={[arenaType.status, { color: C.muted, textAlign: 'center', paddingBottom: 8 }]}>
          {t(`${stage.pass} bonnes réponses sur ${stage.count} pour passer`, `${stage.pass} bon repons sou ${stage.count} pou pase`)}
        </Text>
      </ArenaScreen>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const won = result.stars > 0;
    const stage = stageOf(chapterIdx, stageIdx)!;
    const after = nextStage(progress);
    const conquered = isBoss && won;
    const finale = conquered && chapterIdx === STORY_CHAPTERS.length - 1;
    const headline = finale
      ? t('La Citadelle est à toi !', 'Sitadèl la pou ou !')
      : conquered ? t(`${chapter.dept} conquis !`, `${chapter.dept} konkeri !`)
        : won ? t('Étape réussie !', 'Etap la pase !') : t('Pas cette fois…', 'Pa fwa sa a…');
    return (
      <ArenaScreen occasion={finale ? 'championship' : 'everyday'}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 32, paddingBottom: 48, gap: 18, alignItems: 'center' }}>
          {isBoss ? <Avatar seed={chapter.boss.name} size={88} mood={won ? 'recovering' : 'celebrating'} still={reduce} /> : null}
          <Text style={[arenaType.status, { color: C.muted }]}>{chapter.dept} · {isBoss ? chapter.boss.name : t(`Étape ${stageIdx + 1}`, `Etap ${stageIdx + 1}`)}</Text>
          <Text accessibilityRole="header" style={[arenaType.hero, { color: C.ink, textAlign: 'center' }]}>{headline}</Text>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t(`${result.stars} étoiles sur 3`, `${result.stars} zetwal sou 3`)}
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}
          >
            {[0, 1, 2].map((i) => {
              const on = i < result.stars;
              const star = <Star color={on ? C.gold : C.secondary} fill={on ? C.gold : C.secondary} size={i === 1 ? 64 : 50} />;
              return reduce || !on ? <View key={i}>{star}</View> : <PopIn key={i} delay={250 + i * 250} from={0.4}>{star}</PopIn>;
            })}
          </View>
          <Text style={{ fontFamily: fonts.heading, fontSize: 40, lineHeight: 46, color: C.ink, fontVariant: ['tabular-nums'] }}>
            {result.score}<Text style={[arenaType.title, { color: C.muted }]}> / {result.total}</Text>
          </Text>
          <Text style={[arenaType.body, { color: C.inkSoft, textAlign: 'center' }]}>
            {won
              ? (finale
                ? t('Tu as traversé les dix départements. Ton école peut être fière : rendez-vous au championnat national.', 'Ou travèse dis depatman yo. Lekòl ou ka fyè : randevou nan chanpyona nasyonal la.')
                : t('Chaque bonne réponse a aussi fait gagner des XP à ton école.', 'Chak bon repons fè lekòl ou genyen XP tou.'))
              : t(`Il fallait ${stage.pass} bonnes réponses. Rejoue : les questions changent.`, `Ou te bezwen ${stage.pass} bon repons. Rejwe : kesyon yo chanje.`)}
          </Text>
          {result.xp && isAuthed ? <Text style={[arenaType.title, { color: C.success }]}>+{result.xp} XP</Text> : null}
          {!isAuthed ? (
            <Text style={[arenaType.status, { color: C.muted, textAlign: 'center' }]}>{t('Connecte-toi pour garder tes XP.', 'Konekte pou w kenbe XP ou.')}</Text>
          ) : null}
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
            {won && after && !finale ? (
              <ArenaButton
                label={conquered ? t('Chapitre suivant', 'Pwochen chapit') : t('Étape suivante', 'Pwochen etap')}
                icon={<ChevronRight color={C.onCoral} size={18} />}
                onPress={() => {
                  if (after.chapter !== chapterIdx) { setPicked(after.chapter); setPhase('map'); return; }
                  play(after.chapter, after.stage);
                }}
              />
            ) : null}
            {finale ? (
              <ArenaButton label={t('Le championnat', 'Chanpyona a')} onPress={() => navigation.navigate('ArenaHub', { section: 'championnat' })} />
            ) : null}
            <ArenaButton
              variant={won ? 'secondary' : 'primary'}
              label={t('Rejouer', 'Rejwe')}
              icon={<RefreshCw color={won ? C.ink : C.onCoral} size={16} />}
              onPress={() => play(chapterIdx, stageIdx)}
            />
            <ArenaButton variant="secondary" label={t('La carte', 'Kat la')} onPress={() => setPhase('map')} />
          </View>
        </ScrollView>
      </ArenaScreen>
    );
  }

  // ── The map + level select ──────────────────────────────────────────────
  const stars = totalStars(progress);
  const conqueredCount = STORY_CHAPTERS.filter((_, i) => chapterCleared(progress, i)).length;
  const chapterOpen = isUnlocked(progress, chapterIdx, 0);
  const goStage = chapterGoStage(progress, chapterIdx);
  const prevDept = STORY_CHAPTERS[Math.max(0, chapterIdx - 1)].dept;
  const mapW = Math.min(width - 32, 560);

  return (
    <ArenaScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        <PressableScale
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Retounen')}
          pressedScale={0.94}
          style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceRaised }}
        >
          <ChevronLeft color={C.inkSoft} size={22} />
        </PressableScale>
        <Text accessibilityRole="header" style={[arenaType.hero, { color: C.ink, flex: 1 }]}>{t('Le tour d’Ayiti', 'Tou Ayiti a')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View accessible style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Star color={C.gold} fill={C.gold} size={18} />
          <Text style={[arenaType.status, { color: C.inkSoft }]}>
            {t(`${stars} étoile${stars === 1 ? '' : 's'} sur ${MAX_STARS}`, `${stars} zetwal sou ${MAX_STARS}`)}
            {' · '}
            {t(`${conqueredCount} département${conqueredCount === 1 ? '' : 's'} conquis sur ${STORY_CHAPTERS.length}`, `${conqueredCount} depatman konkeri sou ${STORY_CHAPTERS.length}`)}
          </Text>
        </View>

        <View style={{ alignItems: 'center', paddingVertical: 4, borderRadius: 24, backgroundColor: C.surfaceAlt }}>
          <StoryMapArt progress={progress} selected={chapterIdx} width={mapW} />
        </View>

        {/* The chapters, as 44pt chips — the map's pins in text form. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel={t('Chapitres', 'Chapit yo')}>
          {STORY_CHAPTERS.map((c, i) => {
            const open = isUnlocked(progress, i, 0);
            const done = chapterCleared(progress, i);
            const here = i === chapterIdx;
            return (
              <PressableScale
                key={c.id}
                testID={`chapter-${c.id}`}
                onPress={() => { arenaHaptics.choose(); setPicked(i); }}
                accessibilityRole="button"
                accessibilityState={{ selected: here }}
                accessibilityLabel={`${i + 1}. ${c.dept}${open ? '' : ` — ${t('verrouillé', 'fèmen')}`}${done ? ` — ${t('conquis', 'konkeri')}` : ''}`}
                style={{
                  minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999,
                  backgroundColor: here ? C.ink : C.surface,
                }}
              >
                {done ? <Crown color={here ? C.marine : C.gold} size={15} /> : open ? null : <Lock color={here ? C.marine : C.muted} size={14} />}
                <Text style={[arenaType.status, { fontFamily: fonts.bold, color: here ? C.marine : open ? C.ink : C.muted }]}>{`${i + 1}. ${c.dept}`}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[arenaType.label, { color: C.muted }]}>
                {t(`Chapitre ${chapterIdx + 1} sur ${STORY_CHAPTERS.length}`, `Chapit ${chapterIdx + 1} sou ${STORY_CHAPTERS.length}`)} · {chapter.capital}
              </Text>
              <Text accessibilityRole="header" style={[arenaType.hero, { color: C.ink }]}>{chapter.dept}</Text>
            </View>
            <ArrowBtn dir="prev" disabled={chapterIdx === 0} onPress={() => setPicked(chapterIdx - 1)} t={t} />
            <ArrowBtn dir="next" disabled={chapterIdx === STORY_CHAPTERS.length - 1} onPress={() => setPicked(chapterIdx + 1)} t={t} />
          </View>
          <Text style={[arenaType.body, { color: C.inkSoft }]}>{isCreole ? chapter.intro.ht : chapter.intro.fr}</Text>
        </View>

        <View style={{ gap: 10 }}>
          {[0, 1, 2, 3].map((i) => {
            const st = stageOf(chapterIdx, i)!;
            const open = isUnlocked(progress, chapterIdx, i);
            const boss = i === 3;
            const cleared = !!row[i];
            const current = goStage === i;
            const name = boss ? `${t('Boss', 'Bòs')} · ${chapter.boss.name}` : t(`Étape ${i + 1}`, `Etap ${i + 1}`);
            const detail = boss ? (isCreole ? chapter.boss.ht : chapter.boss.fr) : stageLabel(st);
            return (
              <PressableScale
                key={i}
                testID={`stage-${i}`}
                onPress={() => play(chapterIdx, i)}
                disabled={!open}
                accessibilityRole="button"
                accessibilityState={{ disabled: !open }}
                accessibilityLabel={[
                  name, detail,
                  t(`${st.count} questions, ${st.pass} pour passer`, `${st.count} kesyon, ${st.pass} pou pase`),
                  !open ? t('verrouillé', 'fèmen') : cleared ? t(`${row[i]} étoiles`, `${row[i]} zetwal`) : null,
                ].filter(Boolean).join('. ')}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, padding: 14, borderRadius: 20,
                  // Locked rows stay OPAQUE (the venue art must not show through); the lock icon and muted title carry the state.
                  backgroundColor: current ? C.surfaceRaised : open ? C.surface : C.surfaceAlt,
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: cleared ? C.successSoft : open ? C.surfaceAlt : C.surface }}>
                  {boss
                    ? <Avatar seed={chapter.boss.name} size={44} still />
                    : cleared ? <Check color={C.success} size={20} /> : open ? <Text style={[arenaType.num, { color: C.ink }]}>{i + 1}</Text> : <Lock color={C.muted} size={16} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[arenaType.name, { color: open ? C.ink : C.muted }]}>{name}</Text>
                  <Text style={[arenaType.status, { color: C.muted }]}>{detail}</Text>
                  <Text style={[arenaType.status, { color: C.faint }]}>
                    {st.count} {t('questions', 'kesyon')} · {t(`${st.pass} pour passer`, `${st.pass} pou pase`)}
                  </Text>
                </View>
                {cleared ? (
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[0, 1, 2].map((k) => <Star key={k} size={14} color={k < row[i] ? C.gold : C.secondary} fill={k < row[i] ? C.gold : C.secondary} />)}
                  </View>
                ) : open ? <Play color={C.coral} size={18} /> : null}
              </PressableScale>
            );
          })}
        </View>

        {!chapterOpen ? (
          <View style={{ gap: 10, padding: 16, borderRadius: 20, backgroundColor: C.surface }}>
            <Text style={[arenaType.body, { color: C.inkSoft }]}>{t(`Bats le boss de ${prevDept} pour ouvrir ce chapitre.`, `Bat bòs ${prevDept} pou w louvri chapit sa a.`)}</Text>
            {next ? <ArenaButton variant="secondary" label={t('Chapitre en cours', 'Chapit k ap fèt la')} onPress={() => setPicked(next.chapter)} style={{ backgroundColor: C.surfaceRaised }} /> : null}
          </View>
        ) : goStage != null ? (
          <ArenaButton
            label={goStage === 3 ? t(`Affronter ${chapter.boss.name}`, `Afwonte ${chapter.boss.name}`) : t(`Jouer l’étape ${goStage + 1}`, `Jwe etap ${goStage + 1}`)}
            icon={<Play color={C.onCoral} size={18} />}
            onPress={() => play(chapterIdx, goStage)}
            style={{ minHeight: 56 }}
          />
        ) : (
          <ArenaButton
            variant="secondary"
            label={t('Rejouer le boss pour plus d’étoiles', 'Rejwe bòs la pou plis zetwal')}
            icon={<RefreshCw color={C.ink} size={16} />}
            onPress={() => play(chapterIdx, 3)}
          />
        )}
      </ScrollView>
    </ArenaScreen>
  );
}

function ArrowBtn({ dir, disabled, onPress, t }: { dir: 'prev' | 'next'; disabled: boolean; onPress: () => void; t: T }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={dir === 'prev' ? t('Chapitre précédent', 'Chapit anvan') : t('Chapitre suivant', 'Pwochen chapit')}
      style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, opacity: disabled ? 0.4 : 1 }}
    >
      <Icon color={C.ink} size={20} />
    </PressableScale>
  );
}
