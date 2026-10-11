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

  const reset = useCallback((nextSeed: number, school: string) => {
    simRef.current = createDemo({ seed: nextSeed, totalQuestions: TOTAL_QUESTIONS, youSchool: school || null, youName: t('Toi', 'Ou'), now: 0 });
    directorRef.current = newDirector();
    phaseRef.current = { phase: 'doors', until: DOORS_MS, doorsAt: 0, provisionalAt: 0, finalAt: 0, openedAt: 0 };
    myAnswer.current = null;
    setPicked(null);
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
          push(sim.close(now, mine && q ? { correct: mine.choice === q.answer, elapsedMs: mine.elapsedMs } : null));
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
  }, [questions, isCreole]);

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
    if (ph.phase !== 'question' || myAnswer.current || !youSchool) return;
    myAnswer.current = { choice, elapsedMs: Math.max(800, nowRef.current - ph.openedAt) };
    setPicked(choice);
  }, [youSchool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) answer(n - 1);
      else if (e.key === ' ' && started && (e.target as HTMLElement)?.tagName !== 'BUTTON') { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, started]);

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

  const badge = stateLabel === 'live' || stateLabel === 'grading' ? t('EN DIRECT · DÉMO', 'AN DIRÈK · DEMO')
    : stateLabel === 'doors' ? t('BIENTÔT · DÉMO', 'BYENTO · DEMO')
      : stateLabel === 'provisional' ? t('RÉSULTATS · DÉMO', 'REZILTA · DEMO') : t('TERMINÉ · DÉMO', 'FINI · DEMO');

  // ── Before the first press ────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="live demo-intro">
        <div className="live__rays" aria-hidden />
        <div className="demo-intro__card">
          <Link to="/arena" className="demo-back"><ArrowLeft size={16} aria-hidden="true" /> {t('Arène', 'Arèn')}</Link>
          <p className="demo-intro__tag">{t('Simulation', 'Similasyon')}</p>
          <h1>{t('Le championnat, en démo', 'Chanpyona a, an demo')}</h1>
          <p>
            {t(
              `Dix écoles fictives, des élèves simulés, ${TOTAL_QUESTIONS} questions — joués avec les vraies règles de score et la vraie diffusion. Rien n’est enregistré.`,
              `Dis lekòl fiktif, elèv simile, ${TOTAL_QUESTIONS} kesyon — jwe ak vrè règ nòt yo ak vrè difizyon an. Anyen pa anrejistre.`,
            )}
          </p>
          <div className="demo-schools" role="radiogroup" aria-label={t('Joue pour une école (facultatif)', 'Jwe pou yon lekòl (si ou vle)')}>
            <button type="button" role="radio" aria-checked={youSchool === ''} className={`demo-school${youSchool === '' ? ' is-on' : ''}`} onClick={() => setYouSchool('')}>
              <span className="demo-school__spectate" aria-hidden="true"><Play size={20} /></span>
              <span>{t('Regarder seulement', 'Gade sèlman')}</span>
            </button>
            {DEMO_SCHOOLS.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={youSchool === s.key} className={`demo-school${youSchool === s.key ? ' is-on' : ''}`} onClick={() => setYouSchool(s.key)}>
                <SchoolBuilding name={s.label} cell={3} night />
                <span>{s.label}<small>{s.commune}</small></span>
              </button>
            ))}
          </div>
          <p className="demo-intro__hint">
            {youSchool
              ? t('Tu joues pour cette école : réponds avec les touches 1 à 4 quand une question s’ouvre.', 'Ou jwe pou lekòl sa a : reponn ak touch 1 rive 4 lè yon kesyon louvri.')
              : t('Choisis une école pour jouer avec elle, ou regarde la soirée.', 'Chwazi yon lekòl pou jwe avè l, oswa gade aswè a.')}
          </p>
          <button type="button" className="demo-go" onClick={begin}>
            <Play size={20} aria-hidden="true" /> {t('Lancer la démo', 'Lanse demo a')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`live demo-live${youSchool ? ' demo-live--play' : ''}`}>
      <div className="live__rays" aria-hidden />
      <div className="live__horizon" aria-hidden />

      <div className="live__inner">
        <header className="live__head">
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
          <span className="live__onair">
            {(stateLabel === 'live' || stateLabel === 'grading') && <span className="live__onair-dot" />}
            {badge}
          </span>
        </header>

        {atTheDoors ? (
          <PreShow data={data} elapsed={Math.max(0, simNow - ph.doorsAt)} reduceMotion={reduceMotion} t={t} mapSlot={mapEl} />
        ) : isFinal ? (
          <PostGame data={data} elapsed={Math.max(0, simNow - ph.finalAt)} reduceMotion={reduceMotion} t={t} mapSlot={mapEl} />
        ) : (
          <Stage scene={scene} elapsed={Math.max(0, simNow - scene.since)} data={data} t={t} />
        )}

        {/* The city: every demo school's building, height = team average.
            Not during doors (the pre-show has its own arrivals) or the
            post-game (the podium is the story). */}
        {!atTheDoors && !isFinal && <div className="demo-city" aria-label={t('Les écoles', 'Lekòl yo')}>
          {(standings?.schools || []).filter((s) => s.members > 0).slice().sort((a, b) => a.key.localeCompare(b.key)).map((s) => (
            <div key={s.key} className={`demo-tower${s.rank === 1 ? ' is-lead' : ''}${s.key === youSchool ? ' is-you' : ''}${s.qualified ? '' : ' is-short'}`}>
              <span className="demo-tower__rank">{s.qualified ? `#${s.rank}` : `${s.members}/5`}</span>
              <SchoolBuilding name={s.label} floors={1 + Math.round((s.teamAvg / maxAvg) * 5)} night cell={3} />
              <span className="demo-tower__name">{s.shortName}</span>
            </div>
          ))}
        </div>}
      </div>

      {/* Play-along: the question, for the school you picked. */}
      {youSchool && (openQ || revealQ) && (() => {
        const item = (openQ || revealQ)!;
        const opts = triviaOptions(item.q, isCreole);
        return (
          <aside className="demo-play" aria-live="polite">
            <p className="demo-play__meta">
              {openQ ? t(`À toi · ${secondsLeft} s`, `Pou ou · ${secondsLeft} s`) : t('Réponse', 'Repons')}
              {youRow ? ` · ${youRow.score} pts · #${youRow.rank}` : ''}
            </p>
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
                      <span className="demo-opt__key">{i + 1}</span> {o}
                      {isAnswer && <Check size={18} aria-hidden="true" />}
                      {isMineWrong && <X size={18} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ol>
            {openQ && picked !== null && <p className="demo-play__note">{t('Réponse enregistrée — tout le monde la découvre à la fermeture.', 'Repons anrejistre — tout moun dekouvri l lè kesyon an fèmen.')}</p>}
          </aside>
        );
      })()}

      {/* Controls */}
      <div className="demo-dock" role="toolbar" aria-label={t('Contrôles de la démo', 'Kontwòl demo a')}>
        <Link to="/arena" className="demo-dock__btn" aria-label={t('Retour à l’Arène', 'Tounen nan Arèn nan')}><ArrowLeft size={18} aria-hidden="true" /></Link>
        <button type="button" className="demo-dock__btn demo-dock__btn--main" onClick={() => setPlaying((p) => !p)} disabled={isFinal} aria-label={playing ? t('Pause', 'Poz') : t('Lecture', 'Jwe')}>
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
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
  );
}
