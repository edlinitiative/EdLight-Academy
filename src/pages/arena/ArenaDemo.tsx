import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, RefreshCw, ChevronRight, ArrowLeft, Check, X } from '../../components/icons';
import useStore from '../../contexts/store';
import { createDirector, type Director } from '../../../shared/arena/director';
import type { ArenaEvent } from '../../../shared/arena/events';
import { createDemo, DEMO_SCHOOLS, type DemoSim } from '../../../shared/arena/demo';
import { selectMapPlaces } from '../../../shared/arena/mapPlaces';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../data/triviaData';
import { triviaOptions } from '../../utils/triviaLearning';
import { useReduceMotion } from '../../broadcast/useReduceMotion';
import Stage from '../../broadcast/Stage';
import PreShow from '../../broadcast/segments/PreShow';
import PostGame from '../../broadcast/segments/PostGame';
import HaitiMap from '../../components/arena/HaitiMap';
import SchoolBuilding from '../../components/arena/SchoolBuilding';
import Avatar from '../../arena-art/avatars/Avatar';
import type { StageData, StageTournament } from '../../broadcast/sceneContract';
import { BROADCAST_DIRECTOR_OPTIONS } from '../../broadcast/directorOptions';
import '../../broadcast/stage.css';
import '../Live.css';
import './ArenaDemo.css';

/**
 * /arena/demo — the championship night, simulated, on the real broadcast.
 *
 * The simulator (shared/arena/demo.ts) scores and ranks with the production
 * functions and derives every on-screen moment with `deriveEvents`; this page
 * only owns the clock. It feeds those events to the same director, scenes,
 * pre-show and post-game that /direct renders, so what plays here is what a
 * school hall would see — with ten invented schools, labelled DÉMO throughout.
 *
 * The clock is SIMULATED (`simNow`), not the wall: speed multiplies it, pause
 * stops it, and the director, the scenes and the event timestamps all read it,
 * so 4× really is the same evening four times faster rather than a broadcast
 * dropping moments it no longer has time for.
 *
 * Nothing is read or written anywhere. It works with Firestore unreachable.
 */

const TOTAL_QUESTIONS = 12;
const DOORS_MS = 16_000;
const OPEN_HOLD_MS = 7_000;
const WINDOW_MS = 14_000;
const PAUSE_MS = 8_000;
const GRADING_MS = 9_000;
const PROVISIONAL_MS = 28_000;
const TICK_MS = 100;
const DEMO_THEMES = ['histoire_haiti', 'geo_haiti', 'culture_haiti', 'sciences', 'maths_eclair', 'symboles_haiti'];

type Phase = 'doors' | 'opening' | 'question' | 'pause' | 'grading' | 'provisional' | 'final';

function newDirector(): Director {
  // The real broadcast's settings, not a copy of them.
  return createDirector(BROADCAST_DIRECTOR_OPTIONS);
}

function drawQuestions(seed: number) {
  let a = seed >>> 0;
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bank = TRIVIA_QUESTIONS as Record<string, any[]>;
  return Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
    const theme = DEMO_THEMES[i % DEMO_THEMES.length];
    const list = bank[theme] || [];
    return { theme, q: list[Math.floor(rand() * list.length)] };
  });
}

export default function ArenaDemo() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);
  /*
   * The broadcast scenes write their labels IN CAPITALS for the hall display
   * (/direct). The demo is read up close, so it hands them a translator that
   * turns an all-caps label into sentence case — the shared scenes, and the
   * hall's look, stay exactly as they are.
   */
  const tStage = useCallback((fr: string, ht: string) => {
    const s = isCreole ? ht : fr;
    const letters = s.replace(/[^\p{L}]/gu, '');
    if (letters.length < 4 || letters !== letters.toUpperCase()) return s;
    const low = s.toLocaleLowerCase('fr');
    return low.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('fr'));
  }, [isCreole]);
  const reduceMotion = useReduceMotion();

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [youSchool, setYouSchool] = useState<string>('');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);

  const simRef = useRef<DemoSim | null>(null);
  const directorRef = useRef<Director>(newDirector());
  const questions = useMemo(() => drawQuestions(seed), [seed]);

  // Simulated clock + the timeline's position in it.
  const [simNow, setSimNow] = useState(0);
  const nowRef = useRef(0);
  const phaseRef = useRef<{ phase: Phase; until: number; doorsAt: number; provisionalAt: number; finalAt: number; openedAt: number }>(
    { phase: 'doors', until: DOORS_MS, doorsAt: 0, provisionalAt: 0, finalAt: 0, openedAt: 0 },
  );
  const [, force] = useState(0);
  const myAnswer = useRef<{ choice: number; elapsedMs: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  // The viewer's own play-along tally — every viewer answers, team or not.
  // Spectators' answers never reach the simulation; only a picked school's do.
  const [tally, setTally] = useState({ right: 0, answered: 0 });

  const reset = useCallback((nextSeed: number, school: string) => {
    simRef.current = createDemo({ seed: nextSeed, totalQuestions: TOTAL_QUESTIONS, youSchool: school || null, youName: t('Toi', 'Ou'), now: 0 });
    directorRef.current = newDirector();
    phaseRef.current = { phase: 'doors', until: DOORS_MS, doorsAt: 0, provisionalAt: 0, finalAt: 0, openedAt: 0 };
    myAnswer.current = null;
    setPicked(null);
    setTally({ right: 0, answered: 0 });
    nowRef.current = 0;
    setSimNow(0);
  }, [t]);

  useEffect(() => { reset(seed, youSchool); }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (events: ArenaEvent[]) => { if (events.length) directorRef.current.push(events); };

  /** Run every timeline step whose moment has come. */
  const advance = useCallback((now: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const ph = phaseRef.current;
    if (ph.phase === 'doors') sim.arrive(Math.min(1, now / DOORS_MS), now);
    let guard = 0;
    while (now >= ph.until && guard < 6) {
      guard += 1;
      switch (ph.phase) {
        case 'doors':
          push(sim.start(now));
          ph.phase = 'opening'; ph.until = now + OPEN_HOLD_MS;
          break;
        case 'opening':
        case 'pause': {
          if (sim.index + 1 >= sim.totalQuestions) {
            push(sim.grade(now));
            ph.phase = 'grading'; ph.until = now + GRADING_MS;
            break;
          }
          const next = questions[sim.index + 1];
          const cat = TRIVIA_CATEGORIES.find((c: any) => c.id === next.theme) as any;
          push(sim.openNext(now, cat ? (isCreole ? cat.nameHt || cat.name : cat.name) : ''));
          myAnswer.current = null;
          setPicked(null);
          ph.phase = 'question'; ph.openedAt = now; ph.until = now + WINDOW_MS;
          break;
        }
        case 'question': {
          const q = questions[sim.index]?.q;
          const mine = myAnswer.current;
          const scored = mine && q ? { correct: mine.choice === q.answer, elapsedMs: mine.elapsedMs } : null;
          // Only a player with a school feeds the simulation; a spectator's
          // answer is theirs alone.
          push(sim.close(now, youSchool ? scored : null));
          if (scored) setTally((tl) => ({ right: tl.right + (scored.correct ? 1 : 0), answered: tl.answered + 1 }));
          ph.phase = 'pause'; ph.until = now + PAUSE_MS;
          break;
        }
        case 'grading':
          push(sim.publish(now));
          ph.phase = 'provisional'; ph.provisionalAt = now; ph.until = now + PROVISIONAL_MS;
          break;
        case 'provisional':
          sim.finalize();
          ph.phase = 'final'; ph.finalAt = now; ph.until = Infinity;
          setPlaying(false);
          break;
        default:
          ph.until = Infinity;
      }
    }
    force((n) => n + 1);
  }, [questions, isCreole, youSchool]);

  // The one clock. The simulated time lives in a ref and is mirrored into
  // state for rendering — advancing the simulation inside a state updater
  // would run it twice under StrictMode and emit every event twice.
  useEffect(() => {
    if (!playing) return undefined;
    // Measured, not counted: a background tab's interval is throttled to
    // ~1/s, and counting ticks would slow the whole evening down with it.
    let last = performance.now();
    const id = window.setInterval(() => {
      const wall = performance.now();
      const dt = Math.min(2000, wall - last);
      last = wall;
      nowRef.current += dt * speed;
      advance(nowRef.current);
      setSimNow(nowRef.current);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing, speed, advance]);

  const skip = () => {
    const ph = phaseRef.current;
    if (ph.until === Infinity) return;
    nowRef.current = Math.max(nowRef.current, ph.until);
    advance(nowRef.current);
    setSimNow(nowRef.current);
  };

  const begin = () => { window.scrollTo(0, 0); reset(seed, youSchool); setStarted(true); setPlaying(true); };
  const replay = () => { window.scrollTo(0, 0); const s = Math.floor(Math.random() * 1e9); setSeed(s); setStarted(true); setPlaying(true); };

  const answer = useCallback((choice: number) => {
    const ph = phaseRef.current;
    if (ph.phase !== 'question' || myAnswer.current) return;
    myAnswer.current = { choice, elapsedMs: Math.max(800, nowRef.current - ph.openedAt) };
    setPicked(choice);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) answer(n - 1);
      else if (e.key === ' ' && started && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, started]);

  // The dock behaves like a video player's: it shows on any pointer move or
  // key, and slips away after a few quiet seconds while the evening plays.
  const [dockShown, setDockShown] = useState(true);
  const dockTimer = useRef<number | null>(null);
  const wake = useCallback(() => {
    setDockShown(true);
    if (dockTimer.current) window.clearTimeout(dockTimer.current);
    dockTimer.current = window.setTimeout(() => setDockShown(false), 3200);
  }, []);
  useEffect(() => {
    if (!playing) { setDockShown(true); if (dockTimer.current) window.clearTimeout(dockTimer.current); return undefined; }
    wake();
    window.addEventListener('keydown', wake);
    return () => { window.removeEventListener('keydown', wake); if (dockTimer.current) window.clearTimeout(dockTimer.current); };
  }, [playing, wake]);

  // ── What the stage reads ──────────────────────────────────────────────────
  const sim = simRef.current;
  const ph = phaseRef.current;
  const scene = directorRef.current.tick(simNow);
  const standings = sim?.snapshot || null;
  const stateLabel: string = ph.phase === 'doors' ? 'doors'
    : ph.phase === 'grading' ? 'grading'
      : ph.phase === 'provisional' ? 'provisional'
        : ph.phase === 'final' ? 'final' : 'live';
  const present = sim ? sim.players.filter((p) => p.present) : [];
  const tournament: StageTournament = {
    id: 'demo',
    title: t('DÉMO · Championnat des écoles', 'DEMO · Chanpyona lekòl yo'),
    state: stateLabel,
    startsAt: DOORS_MS,
    doorsAt: ph.doorsAt,
    provisionalAt: ph.provisionalAt,
    finalAt: ph.finalAt,
    questionCount: TOTAL_QUESTIONS,
    currentIndex: sim ? sim.index : -1,
    counts: {
      schools: new Set(present.map((p) => p.schoolKey)).size,
      players: present.length,
      qualifiedSchools: (standings?.schools || []).filter((s) => s.qualified).length,
    },
  };
  const map = useMemo(() => selectMapPlaces({
    schools: DEMO_SCHOOLS.map((s) => {
      const row = standings?.schools.find((x) => x.key === s.key);
      return { key: s.key, label: s.shortName, commune: s.commune, players: row?.members || 0, qualified: !!row?.qualified };
    }).filter((s) => s.players > 0),
    players: [],
  }), [standings]);
  const data: StageData = {
    tournament, standings, places: map.places, unplacedSchools: map.schoolsWithoutLocation, isCreole, now: simNow,
  };
  const atTheDoors = ph.phase === 'doors';
  const isFinal = ph.phase === 'final';
  const mapEl = <HaitiMap places={map.places} mode={atTheDoors ? 'arrivals' : 'density'} />;

  const openQ = ph.phase === 'question' && sim ? questions[sim.index] : null;
  const secondsLeft = openQ ? Math.max(0, Math.ceil((ph.until - simNow) / 1000)) : 0;
  const revealQ = ph.phase === 'pause' && sim ? questions[sim.index] : null;
  const maxAvg = Math.max(1, ...(standings?.schools || []).map((s) => s.teamAvg));
  const youRow = standings?.individuals.find((i) => i.uid === 'demo-you');

  const badge = stateLabel === 'live' || stateLabel === 'grading' ? t('En direct · démo', 'An dirèk · demo')
    : stateLabel === 'doors' ? t('Bientôt · démo', 'Byento · demo')
      : stateLabel === 'provisional' ? t('Résultats · démo', 'Rezilta · demo') : t('Terminé · démo', 'Fini · demo');

  // ── Before the first press: a broadcast title card ───────────────────────
  if (!started) {
    const picked1 = DEMO_SCHOOLS.find((s) => s.key === youSchool) || null;
    return (
      <div className="live demo-intro">
        <div className="live__rays" aria-hidden />
        <span className="demo-beam demo-beam--l" aria-hidden />
        <span className="demo-beam demo-beam--r" aria-hidden />
        <div className="demo-intro__card">
          <div className="demo-intro__copy">
            <Link to="/arena" className="demo-back"><ArrowLeft size={16} aria-hidden="true" /> {t('Arène', 'Arèn')}</Link>
            <p className="demo-intro__tag"><span className="demo-dot" aria-hidden="true" /> {t('Simulation · rien n’est enregistré', 'Similasyon · anyen pa anrejistre')}</p>
            <h1>{t('La soirée du championnat, en démo', 'Swa chanpyona a, an demo')}</h1>
            <p className="demo-intro__lede">
              {t(
                `Dix écoles fictives, des élèves simulés et ${TOTAL_QUESTIONS} questions, joués avec les vraies règles de score et la vraie diffusion — celle que verra la salle.`,
                `Dis lekòl fiktif, elèv simile ak ${TOTAL_QUESTIONS} kesyon, jwe ak vrè règ nòt yo ak vrè difizyon an — sa sal la ap wè a.`,
              )}
            </p>
            <ol className="demo-acts" aria-label={t('Le déroulé', 'Pwogram nan')}>
              <li><b>1</b><span>{t('Les portes', 'Pòt yo')}<small>{t('les écoles arrivent', 'lekòl yo ap rive')}</small></span></li>
              <li><b>2</b><span>{t(`${TOTAL_QUESTIONS} questions`, `${TOTAL_QUESTIONS} kesyon`)}<small>{t('le classement bouge', 'klasman an ap bouje')}</small></span></li>
              <li><b>3</b><span>{t('Les champions', 'Chanpyon yo')}<small>{t('école et élève', 'lekòl ak elèv')}</small></span></li>
            </ol>
            <button type="button" className="demo-go" onClick={begin}>
              <Play size={22} aria-hidden="true" /> {picked1 ? t(`Jouer pour ${picked1.shortName}`, `Jwe pou ${picked1.shortName}`) : t('Lancer la soirée', 'Lanse swa a')}
            </button>
            <p className="demo-intro__hint">
              {youSchool
                ? t('Réponds avec les touches 1 à 4 quand une question s’ouvre. Espace : pause.', 'Reponn ak touch 1 rive 4 lè yon kesyon louvri. Espas : poz.')
                : t('Regarde la soirée et réponds aux questions avec la salle — ou choisis une école pour jouer pour elle.', 'Gade swa a epi reponn kesyon yo ak sal la — oswa chwazi yon lekòl pou jwe pou li.')}
            </p>
          </div>
          <div className="demo-pick">
            <p className="demo-pick__label">{t('Ton camp', 'Kan ou')}</p>
            <div className="demo-schools" role="radiogroup" aria-label={t('Joue pour une école (facultatif)', 'Jwe pou yon lekòl (si ou vle)')}>
              <button type="button" role="radio" aria-checked={youSchool === ''} className={`demo-school demo-school--watch${youSchool === '' ? ' is-on' : ''}`} onClick={() => setYouSchool('')}>
                <span className="demo-school__spectate" aria-hidden="true"><Play size={20} /></span>
                <span>{t('Regarder seulement', 'Gade sèlman')}<small>{t('comme le public', 'tankou piblik la')}</small></span>
              </button>
              {DEMO_SCHOOLS.map((s) => (
                <button key={s.key} type="button" role="radio" aria-checked={youSchool === s.key} className={`demo-school${youSchool === s.key ? ' is-on' : ''}`} onClick={() => setYouSchool(s.key)}>
                  <SchoolBuilding name={s.label} cell={3} night />
                  <span>{s.label}<small>{s.commune}</small></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // The timeline the dock draws: doors, each question, grading, champions.
  const marks: { key: string; label: string; state: 'done' | 'now' | 'next' }[] = (() => {
    const idx = sim ? sim.index : -1;
    const order = ['doors', 'opening', 'q', 'grading', 'provisional', 'final'];
    const at = ph.phase === 'question' || ph.phase === 'pause' ? 'q' : ph.phase;
    const pos = order.indexOf(at);
    const out: { key: string; label: string; state: 'done' | 'now' | 'next' }[] = [];
    const st = (p: number): 'done' | 'now' | 'next' => (p < pos ? 'done' : p === pos ? 'now' : 'next');
    out.push({ key: 'doors', label: t('Portes', 'Pòt'), state: pos > 1 ? 'done' : pos <= 1 ? 'now' : 'next' });
    for (let i = 0; i < TOTAL_QUESTIONS; i += 1) {
      const s = pos > 2 ? 'done' : pos < 2 ? 'next' : i < idx || (i === idx && ph.phase === 'pause') ? 'done' : i === idx ? 'now' : 'next';
      out.push({ key: `q${i}`, label: `Q${i + 1}`, state: s });
    }
    out.push({ key: 'grading', label: t('Calcul', 'Kalkil'), state: st(3) });
    out.push({ key: 'champ', label: t('Champions', 'Chanpyon'), state: pos >= 4 ? (isFinal ? 'done' : 'now') : 'next' });
    return out;
  })();
  const ringPct = openQ ? Math.max(0, Math.min(1, (ph.until - simNow) / WINDOW_MS)) : 0;
  const city = (standings?.schools || []).filter((s) => s.members > 0).slice().sort((a, b) => a.key.localeCompare(b.key));
  // Before the first question closes every school is tied at zero; ten "#1"
  // tags say nothing, so the skyline waits for a real order.
  const anyScored = (standings?.schools || []).some((s) => s.teamAvg > 0);

  return (
    <div className={`live demo-live${youSchool ? ' demo-live--play' : ''}${openQ || revealQ ? ' has-q' : ''}${dockShown ? ' is-dock' : ''}`} onPointerMove={wake} onPointerDown={wake}>
      <div className="live__rays" aria-hidden />
      <div className="live__horizon" aria-hidden />
      <div className="demo-vignette" aria-hidden />

      <div className="live__inner">
        <header className="live__head demo-head">
          <div className="live__brand">
            <img className="live__mark" src="/assets/logo.png" alt="EdLight" />
            <div>
              <h1 className="live__title">{tournament.title}</h1>
              <p className="live__subtitle">
                {sim && sim.index >= 0 && stateLabel === 'live'
                  ? t(`Question ${sim.index + 1} / ${TOTAL_QUESTIONS}`, `Kesyon ${sim.index + 1} / ${TOTAL_QUESTIONS}`)
                  : t('Écoles fictives · simulation', 'Lekòl fiktif · similasyon')}
              </p>
            </div>
          </div>

          {/* The city, as a live skyline in the header: every school's
              building, height = team average; the leader glows. */}
          {!atTheDoors && !isFinal && city.length > 0 && (
            <div className="demo-city" aria-label={t('Les écoles', 'Lekòl yo')}>
              {city.map((s) => (
                <div key={s.key} className={`demo-tower${s.rank === 1 ? ' is-lead' : ''}${s.key === youSchool ? ' is-you' : ''}${s.qualified ? '' : ' is-short'}`} title={s.label}>
                  <span className="demo-tower__rank">{!s.qualified ? `${s.members}/5` : anyScored ? `#${s.rank}` : '—'}</span>
                  <SchoolBuilding name={s.label} floors={1 + Math.round((s.teamAvg / maxAvg) * 5)} night cell={2} />
                  <span className="demo-tower__name">{s.shortName}</span>
                </div>
              ))}
            </div>
          )}

          <span className="live__onair">
            {(stateLabel === 'live' || stateLabel === 'grading') && <span className="live__onair-dot" />}
            {badge}
          </span>
        </header>

        {atTheDoors ? (
          <PreShow data={data} elapsed={Math.max(0, simNow - ph.doorsAt)} reduceMotion={reduceMotion} t={tStage} mapSlot={mapEl} />
        ) : isFinal ? (
          <PostGame data={data} elapsed={Math.max(0, simNow - ph.finalAt)} reduceMotion={reduceMotion} t={tStage} mapSlot={mapEl} />
        ) : (
          <Stage scene={scene} elapsed={Math.max(0, simNow - scene.since)} data={data} t={tStage} />
        )}
      </div>

      {/* Play-along: the question, for everyone — for the school you
          picked, or just for yourself when you are watching. */}
      {(openQ || revealQ) && (() => {
        const item = (openQ || revealQ)!;
        const opts = triviaOptions(item.q, isCreole);
        const mine = DEMO_SCHOOLS.find((s) => s.key === youSchool);
        return (
          <aside className={`demo-play${revealQ ? ' is-reveal' : ''}`} aria-live="polite">
            <div className="demo-play__top">
              {mine ? (
                <span className="demo-play__team">
                  <SchoolBuilding name={mine.label} cell={2} night />
                  <span>{t('Pour', 'Pou')} {mine.shortName}{youRow ? <small>{youRow.score} pts · #{youRow.rank}</small> : null}</span>
                </span>
              ) : (
                <span className="demo-play__team demo-play__team--solo">
                  <Avatar seed="demo-viewer" size={40} mood={revealQ ? (picked === item.q.answer ? 'celebrating' : picked !== null ? 'recovering' : 'idle') : picked !== null ? 'ready' : 'focused'} still={reduceMotion} />
                  <span>{t('Joue avec la salle', 'Jwe ak sal la')}<small>{t(`Toi : ${tally.right} sur ${tally.answered}`, `Ou : ${tally.right} sou ${tally.answered}`)}</small></span>
                </span>
              )}
              {openQ ? (
                <span className="demo-ring" style={{ '--p': ringPct } as React.CSSProperties} aria-label={t(`${secondsLeft} secondes`, `${secondsLeft} segonn`)}>
                  <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" /><circle className="demo-ring__arc" cx="18" cy="18" r="15.5" /></svg>
                  <b>{secondsLeft}</b>
                </span>
              ) : <span className="demo-play__reveal">{t('Réponse', 'Repons')}</span>}
            </div>
            <h2>{isCreole ? item.q.qHt || item.q.q : item.q.q}</h2>
            <ol className="demo-play__opts">
              {opts.map((o: string, i: number) => {
                const isAnswer = !!revealQ && i === item.q.answer;
                const isMineWrong = !!revealQ && picked === i && i !== item.q.answer;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!openQ || picked !== null}
                      onClick={() => answer(i)}
                      className={`demo-opt${picked === i ? ' is-picked' : ''}${isAnswer ? ' is-right' : ''}${isMineWrong ? ' is-wrong' : ''}`}
                    >
                      <span className="demo-opt__key">{i + 1}</span> <span className="demo-opt__text">{o}</span>
                      {isAnswer && <Check size={18} aria-hidden="true" />}
                      {isMineWrong && <X size={18} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ol>
            {openQ && picked !== null && <p className="demo-play__note">{t('Réponse verrouillée — tout le monde la découvre à la fermeture.', 'Repons lan fèmen — tout moun dekouvri l lè kesyon an fèmen.')}</p>}
          </aside>
        );
      })()}

      {/* The viewer's own evening, once it is over. */}
      {isFinal && tally.answered > 0 && (
        <aside className="demo-yours" aria-live="polite">
          <Avatar seed="demo-viewer" size={72} mood={tally.right * 2 >= TOTAL_QUESTIONS ? 'celebrating' : 'idle'} still={reduceMotion} />
          <p className="demo-yours__label">{t('Ta soirée', 'Swa ou')}</p>
          <p className="demo-yours__score"><b>{tally.right}</b> / {TOTAL_QUESTIONS}</p>
          <p className="demo-yours__line">
            {t(`bonnes réponses${youSchool ? '' : ' — en jouant avec la salle'}`, `bon repons${youSchool ? '' : ' — ak sal la'}`)}
          </p>
          <button type="button" className="demo-go demo-yours__again" onClick={replay}>
            <RefreshCw size={18} aria-hidden="true" /> {t('Rejouer une soirée', 'Rejwe yon swa')}
          </button>
        </aside>
      )}

      {/* Controls — a video-player bar: hides itself while the evening plays. */}
      <div className="demo-dock" role="toolbar" aria-label={t('Contrôles de la démo', 'Kontwòl demo a')} onFocus={wake}>
        <ol className="demo-timeline" aria-label={t('Déroulé de la soirée', 'Pwogram swa a')}>
          {marks.map((m) => (
            <li key={m.key} className={`demo-mark demo-mark--${m.state}${m.key.startsWith('q') ? ' is-q' : ''}`} aria-current={m.state === 'now' ? 'step' : undefined}>
              <span className="demo-mark__bar" />
              {!m.key.startsWith('q') || m.state === 'now' ? <span className="demo-mark__label">{m.label}</span> : null}
            </li>
          ))}
        </ol>
        <div className="demo-dock__row">
          <Link to="/arena" className="demo-dock__btn" aria-label={t('Retour à l’Arène', 'Tounen nan Arèn nan')}><ArrowLeft size={18} aria-hidden="true" /></Link>
          <button type="button" className="demo-dock__btn demo-dock__btn--main" onClick={() => setPlaying((p) => !p)} disabled={isFinal} aria-label={playing ? t('Pause', 'Poz') : t('Lecture', 'Jwe')}>
            {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
          </button>
          <button type="button" className="demo-dock__btn" onClick={skip} disabled={isFinal}>
            {t('Étape suivante', 'Pwochen etap')} <ChevronRight size={16} aria-hidden="true" />
          </button>
          <div className="demo-dock__speed" role="radiogroup" aria-label={t('Vitesse', 'Vitès')}>
            {[1, 2, 4].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={speed === v} className={speed === v ? 'is-on' : ''} onClick={() => setSpeed(v)}>{v}×</button>
            ))}
          </div>
          <span className="demo-dock__phase">
            {{
              doors: t('Portes ouvertes — les écoles arrivent', 'Pòt yo louvri — lekòl yo ap rive'),
              opening: t('Ouverture', 'Ouvèti'),
              question: t('Question ouverte', 'Kesyon louvri'),
              pause: t('Pause — le classement bouge', 'Poz — klasman an ap bouje'),
              grading: t('Calcul des scores', 'Kalkil nòt yo'),
              provisional: t('Champions', 'Chanpyon yo'),
              final: t('Terminé', 'Fini'),
            }[ph.phase]}
          </span>
          <button type="button" className="demo-dock__btn" onClick={replay}>
            <RefreshCw size={16} aria-hidden="true" /> {t('Nouvelle soirée', 'Nouvo aswè')}
          </button>
        </div>
      </div>
    </div>
  );
}
