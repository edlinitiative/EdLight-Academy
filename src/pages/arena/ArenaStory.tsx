import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Star, Crown, Play, RefreshCw, ChevronRight, Check } from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useTriviaContent } from '../../hooks/useTriviaContent';
import { useFocusMode } from '../../hooks/useFocusMode';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import { drawAndRemember } from '../../utils/questionRotation';
import PixelAvatar from '../../components/PixelAvatar';
import { TriviaQuiz } from '../TriviaGames';
import {
  STORY_CHAPTERS, STAGES_PER_CHAPTER, MAX_STARS, isUnlocked, nextStage, starsFor, totalStars, chapterCleared,
  type StoryStage,
} from '../../../shared/arenaStory';
import { departmentPath, departmentCentroid, MAP_WIDTH, MAP_HEIGHT } from '../../data/haitiMapGeometry';
import './ArenaArcade.css';
import './ArenaHome.css';

/**
 * /arena/histoire — Mode Histoire, « Le tour d'Ayiti ».
 *
 * map → chapter → play → result. The rules live in shared/arenaStory; this
 * page draws them. Questions come from the same trivia banks as every other
 * round (through the rotation bag, so a stage does not repeat what a quick
 * game just served), and XP goes through useTrivia.recordResult, so the
 * campaign feeds the student's school exactly like any other game.
 */

// The real département outlines the broadcast map uses (data/haitiMapGeometry),
// padded so coastal pins and their labels never touch the frame. Each chapter
// is drawn as its own département and lit by its state: the map IS the
// progress bar.
const PAD = 36;
const VIEW = { x: -PAD, y: -PAD, w: MAP_WIDTH + PAD * 2, h: MAP_HEIGHT + PAD * 2 };
const CHAPTER_GEO = STORY_CHAPTERS.map((c) => ({
  d: departmentPath(c.dept) || '',
  at: departmentCentroid(c.dept) || { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
}));
const pct = (v: number, origin: number, span: number) => `${(((v - origin) / span) * 100).toFixed(2)}%`;

type Screen = 'map' | 'play' | 'result';

function drawStage(stage: StoryStage, questionsMap: Record<string, any[]>) {
  const per = Math.ceil(stage.count / stage.themes.length);
  const pool = stage.themes.flatMap((t) => drawAndRemember(t, questionsMap[t] || [], per));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, stage.count);
}

function Stars({ n, size = 16, label }: { n: number; size?: number; label?: string }) {
  return (
    <span className="arc-stars" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <Star key={i} size={size} className={i < n ? 'is-on' : ''} aria-hidden="true" />
      ))}
    </span>
  );
}

export default function ArenaStory() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { categories, questions } = useTriviaContent();
  const { recordResult, isAuthed } = useTrivia();
  const { progress, record } = useStoryProgress();
  const [params, setParams] = useSearchParams();

  const next = nextStage(progress);
  const chapterParam = Number(params.get('c'));
  const chapterIdx = Number.isInteger(chapterParam) && chapterParam >= 0 && chapterParam < STORY_CHAPTERS.length
    ? chapterParam
    : (next?.chapter ?? STORY_CHAPTERS.length - 1);
  const chapter = STORY_CHAPTERS[chapterIdx];
  const row = progress[chapter.id] || [0, 0, 0, 0];

  const [screen, setScreen] = useState<Screen>('map');
  const [stageIdx, setStageIdx] = useState(0);
  const [round, setRound] = useState<any[]>([]);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number; stars: number; xp: number | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusMode(screen === 'play');

  useEffect(() => { if (screen !== 'play') { window.scrollTo(0, 0); headingRef.current?.focus(); } }, [screen, chapterIdx]);

  const stageOf = (i: number): StoryStage => (i === STAGES_PER_CHAPTER - 1 ? chapter.bossStage : chapter.stages[i]);
  const themeName = (id: string) => {
    const c = categories.find((x: any) => x.id === id);
    return c ? (isCreole ? c.nameHt || c.name : c.name) : id;
  };
  const stageLabel = (s: StoryStage) => s.themes.map(themeName).join(' · ');

  const selectChapter = (i: number) => {
    setParams(i === (next?.chapter ?? -1) ? {} : { c: String(i) }, { replace: true });
    setScreen('map');
  };

  const play = (i: number) => {
    if (!isUnlocked(progress, chapterIdx, i)) return;
    setStageIdx(i);
    setRound(drawStage(stageOf(i), questions));
    setResult(null);
    setNonce((n) => n + 1);
    setScreen('play');
  };

  const onFinish = async (score: number, total: number) => {
    const stage = stageOf(stageIdx);
    const stars = starsFor(score, stage);
    record(chapterIdx, stageIdx, stars);
    setResult({ score, total, stars, xp: null });
    setScreen('result');
    try {
      const r: any = await recordResult({ category: stage.themes[0], score, total, isDaily: false });
      const xp = Number(r?.xpEarned);
      if (Number.isFinite(xp)) setResult((prev) => (prev ? { ...prev, xp } : prev));
    } catch { /* XP is a bonus here; the stars are already saved */ }
  };

  const stars = totalStars(progress);
  const isBoss = stageIdx === STAGES_PER_CHAPTER - 1;

  if (screen === 'play') {
    const stage = stageOf(stageIdx);
    return (
      <section className="section arc-story arc-story--play">
        <div className="container arc-story__play">
          <p className="arc-story__play-tag">
            {chapter.dept} · {isBoss ? t(`Boss : ${chapter.boss.name}`, `Bòs : ${chapter.boss.name}`) : t(`Étape ${stageIdx + 1}`, `Etap ${stageIdx + 1}`)}
            {' · '}{t(`${stage.pass}/${stage.count} pour passer`, `${stage.pass}/${stage.count} pou pase`)}
          </p>
          <TriviaQuiz
            key={`${chapter.id}-${stageIdx}-${nonce}`}
            category={stage.themes[0]}
            count={stage.count}
            timed={stage.timed}
            questions={round}
            accentColor={isBoss ? '#FF5C39' : '#1B6FE0'}
            onFinish={onFinish}
            onBack={() => setScreen('map')}
            isCreole={isCreole}
            categories={categories}
            questionsMap={questions}
          />
        </div>
      </section>
    );
  }

  if (screen === 'result' && result) {
    const won = result.stars > 0;
    const stage = stageOf(stageIdx);
    const after = nextStage(progress);
    const conquered = isBoss && won;
    const finale = conquered && chapterIdx === STORY_CHAPTERS.length - 1;
    return (
      <section className="section arc-story arc-story--night">
        <div className="container arc-result">
          <div className={`arc-result__card${won ? ' is-won' : ''}`}>
            {isBoss && <PixelAvatar seed={chapter.boss.name} size={88} className="arc-result__boss" />}
            <h1 ref={headingRef} tabIndex={-1}>
              {finale
                ? t('La Citadelle est à toi !', 'Sitadèl la pou ou !')
                : conquered
                  ? t(`${chapter.dept} conquis !`, `${chapter.dept} konkeri !`)
                  : won
                    ? t('Étape réussie !', 'Etap la pase !')
                    : t('Pas cette fois…', 'Pa fwa sa a…')}
            </h1>
            <p className="arc-result__score">{result.score} / {result.total}</p>
            <Stars n={result.stars} size={34} label={t(`${result.stars} étoiles sur 3`, `${result.stars} zetwal sou 3`)} />
            <p className="arc-result__line">
              {won
                ? (finale
                  ? t('Tu as traversé les dix départements. Ton école peut être fière : rendez-vous au championnat national.', 'Ou travèse dis depatman yo. Lekòl ou ka fyè : randevou nan chanpyona nasyonal la.')
                  : t('Chaque bonne réponse a aussi fait gagner des XP à ton école.', 'Chak bon repons fè lekòl ou genyen XP tou.'))
                : t(`Il fallait ${stage.pass} bonnes réponses. Rejoue : les questions changent.`, `Ou te bezwen ${stage.pass} bon repons. Rejwe : kesyon yo chanje.`)}
              {result.xp && isAuthed ? ` +${result.xp} XP.` : ''}
              {!isAuthed && ` ${t('Connecte-toi pour garder ta progression et tes XP.', 'Konekte pou w kenbe pwogrè ak XP ou.')}`}
            </p>
            <div className="arc-result__actions">
              {won && after && !finale ? (
                <button type="button" className="arc-btn arc-btn--go" onClick={() => {
                  if (after.chapter !== chapterIdx) { selectChapter(after.chapter); return; }
                  play(after.stage);
                }}>
                  {conquered ? t('Chapitre suivant', 'Pwochen chapit') : t('Étape suivante', 'Pwochen etap')} <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : null}
              {finale && (
                <Link to="/arena/championnat" className="arc-btn arc-btn--go">{t('Le championnat', 'Chanpyona a')} <ChevronRight size={18} aria-hidden="true" /></Link>
              )}
              <button type="button" className={`arc-btn${won ? ' arc-btn--ghost' : ' arc-btn--go'}`} onClick={() => play(stageIdx)}>
                <RefreshCw size={16} aria-hidden="true" /> {t('Rejouer', 'Rejwe')}
              </button>
              <button type="button" className="arc-btn arc-btn--ghost" onClick={() => setScreen('map')}>
                {t('La carte', 'Kat la')}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Map + chapter panel ────────────────────────────────────────────────
  return (
    <section className="section arc-story arc-story--night">
      <div className="container arc-story__container">
        <header className="arc-story__head">
          <Link to="/arena" className="arc-back"><ArrowLeft size={16} aria-hidden="true" /> {t('Arène', 'Arèn')}</Link>
          <div>
            <p className="arc-eyebrow">{t('Mode Histoire', 'Mòd Istwa')}</p>
            <h1 ref={headingRef} tabIndex={-1}>{t('Le tour d’Ayiti', 'Tou Ayiti a')}</h1>
            <p className="arc-story__lede">
              {t('Dix départements, trois étapes et un boss dans chacun. Gagne pour ouvrir la route.', 'Dis depatman, twa etap ak yon bòs nan chak. Genyen pou w louvri wout la.')}
            </p>
          </div>
          <div className="arc-story__total">
            <Star size={20} aria-hidden="true" />
            <strong>{stars}</strong><span>/ {MAX_STARS}</span>
          </div>
        </header>

        <div className="arc-story__grid">
          <div className="arc-map" role="group" aria-label={t('Carte des chapitres', 'Kat chapit yo')}>
            <svg className="arc-map__art" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
              <defs>
                <pattern id="arc-px" width="8" height="8" patternUnits="userSpaceOnUse">
                  <rect width="4" height="4" fill="rgba(255,255,255,0.07)" />
                </pattern>
              </defs>
              {STORY_CHAPTERS.map((c, i) => {
                const open = isUnlocked(progress, i, 0);
                const done = chapterCleared(progress, i);
                const cls = `arc-dept${open ? ' is-open' : ''}${done ? ' is-done' : ''}${i === chapterIdx ? ' is-here' : ''}`;
                return (
                  <g key={c.id} className={cls} onClick={() => selectChapter(i)}>
                    <path d={CHAPTER_GEO[i].d} className="arc-dept__fill" />
                    <path d={CHAPTER_GEO[i].d} fill="url(#arc-px)" pointerEvents="none" />
                  </g>
                );
              })}
              {/* the selected département on top, so its gold edge is never hidden by a neighbour */}
              <path d={CHAPTER_GEO[chapterIdx].d} className="arc-dept__edge" />
              {/* only the road already travelled — up to the chapter in play */}
              <polyline
                className="arc-map__route"
                points={CHAPTER_GEO.slice(0, (next?.chapter ?? STORY_CHAPTERS.length - 1) + 1).map((g) => `${g.at.x},${g.at.y}`).join(' ')}
              />
            </svg>
            {STORY_CHAPTERS.map((c, i) => {
              const open = isUnlocked(progress, i, 0);
              const done = chapterCleared(progress, i);
              const here = i === chapterIdx;
              const r = progress[c.id] || [];
              const got = r.reduce((a, b) => a + b, 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`arc-pin${open ? '' : ' is-locked'}${done ? ' is-done' : ''}${here ? ' is-here' : ''}${next?.chapter === i ? ' is-next' : ''}`}
                  style={{ left: pct(CHAPTER_GEO[i].at.x, VIEW.x, VIEW.w), top: pct(CHAPTER_GEO[i].at.y, VIEW.y, VIEW.h) }}
                  onClick={() => selectChapter(i)}
                  aria-pressed={here}
                  aria-label={`${i + 1}. ${c.dept}${open ? '' : ` — ${t('verrouillé', 'fèmen')}`}${got ? ` — ${got} ★` : ''}`}
                >
                  <span className="arc-pin__dot">{done ? <Check size={14} aria-hidden="true" /> : open ? i + 1 : <Lock size={12} aria-hidden="true" />}</span>
                  <span className="arc-pin__label">{c.dept}</span>
                </button>
              );
            })}
          </div>

          <article className="arc-chapter" aria-labelledby="arc-chapter-title">
            <p className="arc-eyebrow">{t(`Chapitre ${chapterIdx + 1}`, `Chapit ${chapterIdx + 1}`)} · {chapter.capital}</p>
            <h2 id="arc-chapter-title">{chapter.dept}</h2>
            <p className="arc-chapter__intro">{isCreole ? chapter.intro.ht : chapter.intro.fr}</p>

            <ol className="arc-stages">
              {[0, 1, 2, 3].map((i) => {
                const st = stageOf(i);
                const open = isUnlocked(progress, chapterIdx, i);
                const boss = i === 3;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className={`arc-stage${boss ? ' arc-stage--boss' : ''}${open ? '' : ' is-locked'}${row[i] ? ' is-cleared' : ''}`}
                      onClick={() => play(i)}
                      disabled={!open}
                    >
                      {boss
                        ? <PixelAvatar seed={chapter.boss.name} size={52} className="arc-stage__boss" />
                        : <span className="arc-stage__num">{open ? i + 1 : <Lock size={14} aria-hidden="true" />}</span>}
                      <span className="arc-stage__body">
                        <strong>
                          {boss ? <><Crown size={15} aria-hidden="true" /> {chapter.boss.name}</> : t(`Étape ${i + 1}`, `Etap ${i + 1}`)}
                        </strong>
                        <span>{boss ? (isCreole ? chapter.boss.ht : chapter.boss.fr) : stageLabel(st)}</span>
                        <small>{st.count} {t('questions', 'kesyon')} · 15 s · {t(`${st.pass} pour passer`, `${st.pass} pou pase`)}</small>
                      </span>
                      <span className="arc-stage__end">
                        {row[i] ? <Stars n={row[i]} /> : open ? <Play size={18} aria-hidden="true" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}
