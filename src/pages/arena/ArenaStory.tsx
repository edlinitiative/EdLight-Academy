import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Star, Crown, Play, RefreshCw, ChevronRight, ChevronLeft, Check, MapPin } from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useTriviaContent } from '../../hooks/useTriviaContent';
import { useFocusMode } from '../../hooks/useFocusMode';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import { drawAndRemember } from '../../utils/questionRotation';
import PixelAvatar from '../../components/PixelAvatar';
import ArenaPageHead from '../../components/arena/ArenaPageHead';
import { TriviaQuiz } from '../TriviaGames';
import {
  STORY_CHAPTERS, STAGES_PER_CHAPTER, MAX_STARS, isUnlocked, nextStage, starsFor, totalStars, chapterCleared,
  type StoryStage,
} from '../../../shared/arenaStory';
import { departmentPath, departmentCentroid, MAP_WIDTH, MAP_HEIGHT } from '../../data/haitiMapGeometry';
import './ArenaArcade.css';
import './ArenaHome.css';
import './ArenaStory.css';

/**
 * /arena/histoire — Mode Histoire, « Le tour d'Ayiti ».
 *
 * map → chapter → play → result. The rules live in shared/arenaStory; this
 * page draws them. Questions come from the same trivia banks as every other
 * round (through the rotation bag, so a stage does not repeat what a quick
 * game just served), and XP goes through useTrivia.recordResult, so the
 * campaign feeds the student's school exactly like any other game.
 *
 * The map is the hero and the progress bar at once: each département is lit
 * by its state (locked in shadow, open in green, conquered in gold), the road
 * travelled is drawn solid and the road ahead dotted. Beside it, the chapter
 * reads as a level select — three stages and a boss on one path, and one
 * button that always says what to play next.
 */

// The real département outlines the broadcast map uses (data/haitiMapGeometry),
// padded so coastal pins and their labels never touch the frame.
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
    <span className="hs-stars" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <Star key={i} size={size} weight="fill" className={i < n ? 'is-on' : ''} aria-hidden="true" />
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
  // The map screen's title is the shared ArenaPageHead h1, reached through
  // its wrapper so focus can still land on the page heading after a screen
  // change (screen readers announce where they are).
  const headWrapRef = useRef<HTMLDivElement>(null);
  useFocusMode(screen === 'play');

  useEffect(() => {
    if (screen === 'play') return;
    window.scrollTo(0, 0);
    const h = headingRef.current || headWrapRef.current?.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }, [screen, chapterIdx]);

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
  const conquered = STORY_CHAPTERS.filter((_, i) => chapterCleared(progress, i)).length;
  const chapterOpen = isUnlocked(progress, chapterIdx, 0);
  // What the big button plays: the first open stage without stars, else none.
  const goStage = (() => {
    for (let i = 0; i < STAGES_PER_CHAPTER; i += 1) if (isUnlocked(progress, chapterIdx, i) && !row[i]) return i;
    return null;
  })();

  // ── Play: the quiz, framed in the night ────────────────────────────────
  if (screen === 'play') {
    const stage = stageOf(stageIdx);
    return (
      <section className="hs hs--play">
        <div className="container hs-play">
          <div className="hs-play__bar">
            <button type="button" className="hs-back" onClick={() => setScreen('map')}>
              <ArrowLeft size={16} aria-hidden="true" /> {t('La carte', 'Kat la')}
            </button>
            <span className={`hs-play__chip${isBoss ? ' is-boss' : ''}`}>
              {isBoss
                ? <><PixelAvatar seed={chapter.boss.name} size={26} className="hs-play__boss" /> {t(`Boss · ${chapter.boss.name}`, `Bòs · ${chapter.boss.name}`)}</>
                : <><MapPin size={16} aria-hidden="true" /> {chapter.dept} · {t(`Étape ${stageIdx + 1}`, `Etap ${stageIdx + 1}`)}</>}
            </span>
            <span className="hs-play__rule">{t(`${stage.pass} bonnes réponses sur ${stage.count} pour passer`, `${stage.pass} bon repons sou ${stage.count} pou pase`)}</span>
          </div>
          <div className="hs-play__stage">
            <TriviaQuiz
              key={`${chapter.id}-${stageIdx}-${nonce}`}
              category={stage.themes[0]}
              count={stage.count}
              timed={stage.timed}
              questions={round}
              accentColor={isBoss ? '#FF5C39' : '#3D8BFF'}
              onFinish={onFinish}
              onBack={() => setScreen('map')}
              isCreole={isCreole}
              categories={categories}
              questionsMap={questions}
            />
          </div>
        </div>
      </section>
    );
  }

  // ── Result: the stars land one by one ──────────────────────────────────
  if (screen === 'result' && result) {
    const won = result.stars > 0;
    const stage = stageOf(stageIdx);
    const after = nextStage(progress);
    const conqueredNow = isBoss && won;
    const finale = conqueredNow && chapterIdx === STORY_CHAPTERS.length - 1;
    return (
      <section className="hs hs--result">
        <div className="hs-sky" aria-hidden="true" />
        <div className="container hs-result">
          <div className={`hs-result__card${won ? ' is-won' : ''}`}>
            {won && <span className="hs-result__rays" aria-hidden="true" />}
            {isBoss && <span className="hs-result__boss"><PixelAvatar seed={chapter.boss.name} size={88} /></span>}
            <p className="hs-over">{chapter.dept} · {isBoss ? chapter.boss.name : t(`Étape ${stageIdx + 1}`, `Etap ${stageIdx + 1}`)}</p>
            <h1 ref={headingRef} tabIndex={-1}>
              {finale
                ? t('La Citadelle est à toi !', 'Sitadèl la pou ou !')
                : conqueredNow
                  ? t(`${chapter.dept} conquis !`, `${chapter.dept} konkeri !`)
                  : won
                    ? t('Étape réussie !', 'Etap la pase !')
                    : t('Pas cette fois…', 'Pa fwa sa a…')}
            </h1>
            <div className="hs-result__stars" role="img" aria-label={t(`${result.stars} étoiles sur 3`, `${result.stars} zetwal sou 3`)}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`hs-bigstar${i < result.stars ? ' is-on' : ''}${i === 1 ? ' is-mid' : ''}`} style={{ '--d': `${0.3 + i * 0.3}s` } as React.CSSProperties}>
                  <Star size={i === 1 ? 72 : 56} weight="fill" aria-hidden="true" />
                </span>
              ))}
            </div>
            <p className="hs-result__score"><b>{result.score}</b><span>/ {result.total}</span></p>
            <p className="hs-result__line">
              {won
                ? (finale
                  ? t('Tu as traversé les dix départements. Ton école peut être fière : rendez-vous au championnat national.', 'Ou travèse dis depatman yo. Lekòl ou ka fyè : randevou nan chanpyona nasyonal la.')
                  : t('Chaque bonne réponse a aussi fait gagner des XP à ton école.', 'Chak bon repons fè lekòl ou genyen XP tou.'))
                : t(`Il fallait ${stage.pass} bonnes réponses. Rejoue : les questions changent.`, `Ou te bezwen ${stage.pass} bon repons. Rejwe : kesyon yo chanje.`)}
            </p>
            {result.xp && isAuthed ? <p className="hs-result__xp">+{result.xp} XP</p> : null}
            {!isAuthed && <p className="hs-result__note">{t('Connecte-toi pour garder ta progression et tes XP.', 'Konekte pou w kenbe pwogrè ak XP ou.')}</p>}
            <div className="hs-result__actions">
              {won && after && !finale ? (
                <button type="button" className="hs-go" onClick={() => {
                  if (after.chapter !== chapterIdx) { selectChapter(after.chapter); return; }
                  play(after.stage);
                }}>
                  {conqueredNow ? t('Chapitre suivant', 'Pwochen chapit') : t('Étape suivante', 'Pwochen etap')} <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : null}
              {finale && (
                <Link to="/arena/championnat" className="hs-go">{t('Le championnat', 'Chanpyona a')} <ChevronRight size={18} aria-hidden="true" /></Link>
              )}
              <button type="button" className={won ? 'hs-ghost' : 'hs-go'} onClick={() => play(stageIdx)}>
                <RefreshCw size={16} aria-hidden="true" /> {t('Rejouer', 'Rejwe')}
              </button>
              <button type="button" className="hs-ghost" onClick={() => setScreen('map')}>{t('La carte', 'Kat la')}</button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── The map + level select ─────────────────────────────────────────────
  const travelled = (next?.chapter ?? STORY_CHAPTERS.length - 1) + 1;
  const prevDept = STORY_CHAPTERS[Math.max(0, chapterIdx - 1)].dept;
  return (
    <section className="hs">
      <div className="container hs-wrap">
        {/* The shared title row, then the map. Progress lives beside it. */}
        <div ref={headWrapRef}>
          <ArenaPageHead
            title={t('Le tour d’Ayiti', 'Tou Ayiti a')}
            sub={t(
              'Traverse les dix départements, étape par étape : chaque bonne réponse compte aussi pour ton école.',
              'Travèse dis depatman yo, etap pa etap : chak bon repons konte pou lekòl ou tou.',
            )}
          />
        </div>

        <div className="hs-grid">
          <div className="hs-map" role="group" aria-label={t('Carte des chapitres', 'Kat chapit yo')}>
            <svg className="hs-map__art" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
              <defs>
                <linearGradient id="hs-open" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#2FD18C" />
                  <stop offset="1" stopColor="#11895C" />
                </linearGradient>
                <linearGradient id="hs-done" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FFE08A" />
                  <stop offset="1" stopColor="#E9A21C" />
                </linearGradient>
              </defs>
              <g className="hs-map__glow">{CHAPTER_GEO.map((g, i) => <path key={i} d={g.d} />)}</g>
              {STORY_CHAPTERS.map((c, i) => {
                const open = isUnlocked(progress, i, 0);
                const done = chapterCleared(progress, i);
                const cls = `hs-dept${open ? ' is-open' : ''}${done ? ' is-done' : ''}${i === chapterIdx ? ' is-here' : ''}`;
                return (
                  <g key={c.id} className={cls} onClick={() => selectChapter(i)}>
                    <path d={CHAPTER_GEO[i].d} className="hs-dept__fill" />
                  </g>
                );
              })}
              <path d={CHAPTER_GEO[chapterIdx].d} className="hs-dept__edge" />
              {travelled < STORY_CHAPTERS.length && (
                <polyline className="hs-route hs-route--ahead" points={CHAPTER_GEO.slice(travelled - 1).map((g) => `${g.at.x},${g.at.y}`).join(' ')} />
              )}
              {travelled > 1 && (
                <polyline className="hs-route" points={CHAPTER_GEO.slice(0, travelled).map((g) => `${g.at.x},${g.at.y}`).join(' ')} />
              )}
            </svg>
            {STORY_CHAPTERS.map((c, i) => {
              const open = isUnlocked(progress, i, 0);
              const done = chapterCleared(progress, i);
              const here = i === chapterIdx;
              const got = (progress[c.id] || []).reduce((a, b) => a + b, 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`hs-pin${open ? '' : ' is-locked'}${done ? ' is-done' : ''}${here ? ' is-here' : ''}${next?.chapter === i ? ' is-next' : ''}`}
                  style={{ left: pct(CHAPTER_GEO[i].at.x, VIEW.x, VIEW.w), top: pct(CHAPTER_GEO[i].at.y, VIEW.y, VIEW.h) }}
                  onClick={() => selectChapter(i)}
                  aria-pressed={here}
                  aria-label={`${i + 1}. ${c.dept}${open ? '' : ` — ${t('verrouillé', 'fèmen')}`}${got ? ` — ${got} ★` : ''}`}
                >
                  <span className="hs-pin__dot">{done ? <Crown size={15} weight="fill" aria-hidden="true" /> : open ? i + 1 : <Lock size={13} aria-hidden="true" />}</span>
                  <span className="hs-pin__label">{c.dept}</span>
                </button>
              );
            })}
          </div>

          <article className="hs-level" aria-labelledby="hs-chapter-title">
            <div className="hs-level__nav">
              <div className="hs-level__heading">
                <p className="hs-level__over">
                  {t(`Chapitre ${chapterIdx + 1} sur ${STORY_CHAPTERS.length}`, `Chapit ${chapterIdx + 1} sou ${STORY_CHAPTERS.length}`)} · {chapter.capital}
                </p>
                <h2 id="hs-chapter-title" className="hs-level__title">{chapter.dept}</h2>
              </div>
              <div className="hs-level__arrows">
                <button type="button" className="hs-arrow" disabled={chapterIdx === 0} onClick={() => selectChapter(chapterIdx - 1)} aria-label={t('Chapitre précédent', 'Chapit anvan')}><ChevronLeft size={20} /></button>
                <button type="button" className="hs-arrow" disabled={chapterIdx === STORY_CHAPTERS.length - 1} onClick={() => selectChapter(chapterIdx + 1)} aria-label={t('Chapitre suivant', 'Pwochen chapit')}><ChevronRight size={20} /></button>
              </div>
            </div>
            {/* Progress as one quiet line: earned stars in gold, nothing boxed. */}
            <p className="hs-progress">
              <span><Star size={18} weight="fill" aria-hidden="true" className="hs-progress__star" /> {t(`${stars} étoile${stars === 1 ? '' : 's'} sur ${MAX_STARS}`, `${stars} zetwal sou ${MAX_STARS}`)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {t(
                  `${conquered} département${conquered === 1 ? '' : 's'} conquis sur ${STORY_CHAPTERS.length}`,
                  `${conquered} depatman konkeri sou ${STORY_CHAPTERS.length}`,
                )}
              </span>
            </p>
            <p className="hs-level__intro">{isCreole ? chapter.intro.ht : chapter.intro.fr}</p>

            <ol className="hs-path">
              {[0, 1, 2, 3].map((i) => {
                const st = stageOf(i);
                const open = isUnlocked(progress, chapterIdx, i);
                const boss = i === 3;
                const cleared = !!row[i];
                const current = goStage === i;
                return (
                  <li key={i} className={`hs-node${boss ? ' hs-node--boss' : ''}${open ? '' : ' is-locked'}${cleared ? ' is-cleared' : ''}${current ? ' is-current' : ''}`}>
                    <button type="button" className="hs-node__btn" onClick={() => play(i)} disabled={!open}>
                      <span className="hs-node__mark" aria-hidden="true">
                        {boss
                          ? <PixelAvatar seed={chapter.boss.name} size={46} />
                          : cleared ? <Check size={18} /> : open ? i + 1 : <Lock size={15} />}
                      </span>
                      <span className="hs-node__body">
                        <strong>{boss ? <>{t('Boss', 'Bòs')} · {chapter.boss.name}</> : t(`Étape ${i + 1}`, `Etap ${i + 1}`)}</strong>
                        <span>{boss ? (isCreole ? chapter.boss.ht : chapter.boss.fr) : stageLabel(st)}</span>
                        <small>{st.count} {t('questions', 'kesyon')} · {t(`${st.pass} pour passer`, `${st.pass} pou pase`)}</small>
                      </span>
                      <span className="hs-node__end">
                        {cleared
                          ? <Stars n={row[i]} size={16} label={t(`${row[i]} étoiles`, `${row[i]} zetwal`)} />
                          : open ? <Play size={18} aria-hidden="true" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {!chapterOpen ? (
              <div className="hs-locked">
                <span>{t(`Bats le boss de ${prevDept} pour ouvrir ce chapitre.`, `Bat bòs ${prevDept} pou w louvri chapit sa a.`)}</span>
                {next && <button type="button" className="hs-ghost" onClick={() => selectChapter(next.chapter)}>{t('Chapitre en cours', 'Chapit k ap fèt la')}</button>}
              </div>
            ) : goStage != null ? (
              <button type="button" className={`hs-go hs-go--wide${goStage === 3 ? ' is-boss' : ''}`} onClick={() => play(goStage)}>
                <Play size={20} aria-hidden="true" />
                {goStage === 3
                  ? t(`Affronter ${chapter.boss.name}`, `Afwonte ${chapter.boss.name}`)
                  : t(`Jouer l’étape ${goStage + 1}`, `Jwe etap ${goStage + 1}`)}
              </button>
            ) : (
              <button type="button" className="hs-ghost hs-go--wide" onClick={() => play(3)}>
                <RefreshCw size={16} aria-hidden="true" /> {t('Rejouer le boss pour plus d’étoiles', 'Rejwe bòs la pou plis zetwal')}
              </button>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
