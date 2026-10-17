import React, { useState, useCallback, useEffect, useRef } from 'react';
import CategoryIcon from '../components/CategoryIcon';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { X, Star, Check, RefreshCw, CalendarCheck, Swords, Lock, Clock, Flame } from '../components/icons';
import useStore from '../contexts/store';
import { useFocusMode } from '../hooks/useFocusMode';
import { useTrivia } from '../hooks/useTrivia';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { useTriviaContent } from '../hooks/useTriviaContent';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { drawAndRemember } from '../utils/questionRotation';
import { todayStr } from '../services/streakService';
import { GAMES, GAME_ICONS, getGameById } from '../data/games';
import MySchoolCard from '../components/MySchoolCard';
import { useQueryClient } from '@tanstack/react-query';
import VraiFauxGame from '../components/games/VraiFauxGame';
import MemoireGame from '../components/games/MemoireGame';
import MoKacheGame from '../components/games/MoKacheGame';
import CalculGame from '../components/games/CalculGame';
import SuitesGame from '../components/games/SuitesGame';
import './TriviaGames.css';
import { trackTriviaEvent as trackEvent } from '../utils/triviaLearning';
import { triviaOptions, triviaExplanation } from '../utils/triviaLearning';
import { logAnswerEvent } from '../services/answerEventsService';
import { MyDuels } from '../components/games/Duels';
import { loadDuelBank } from '../utils/duelBank';
import { DUEL_ROUND, drawIdxs, questionsAt, shuffleOptions, isDuelCode, normalizeDuelCode } from '../utils/duels';
import SprintSolo from './trivia/SprintSolo';
import LiveRoomEntry from './trivia/LiveRoomEntry';
import './trivia/triviaModes.css';
import ArenaPageHead from '../components/arena/ArenaPageHead';
import { useReducedMotion, motionVars } from '../arena-art/motion/tokens';
import { useMatchSound } from './trivia/useMatchSound';
import SoundToggle from '../arena-art/sound/SoundToggle';
import DuelIntro from '../components/arena/DuelIntro';
import { answerTicks, currentStreak, type RoundAnswer } from './trivia/matchStats';
import MatchResults from './trivia/MatchResults';

/** Seconds per question in a timed round (daily challenge, duels). */
const ROUND_SECONDS = 15;
/** When the reveal beats land after an answer, in ms (brief #12: separate,
    readable beats ~250–400 ms apart). Reduced motion skips straight to the end. */
const BEAT_MS = [280, 600, 920] as const;

/* ─── The three ways to play trivia (Ted: "3 variations — combine the
   features"): the quick round, the solo sprint, and live rooms. This switch
   is the ONLY menu on /jeux/trivia, and the /jeux hub has none: the Arène
   lobby already lists the modes, so a third menu would be noise. ─── */
type TriviaMode = 'quick' | 'sprint' | 'live';
function TriviaModeSwitch({ mode, onChange, isCreole }: { mode: TriviaMode; onChange: (m: TriviaMode) => void; isCreole: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const modes: { id: TriviaMode; label: string }[] = [
    { id: 'quick', label: t('Partie rapide', 'Pati rapid') },
    { id: 'sprint', label: t('Sprint solo', 'Sprint solo') },
    { id: 'live', label: t('Salon en direct', 'Salon an dirèk') },
  ];
  return (
    <div className="jz-modes" role="tablist" aria-label={t('Mode de jeu', 'Mòd jwèt')}>
      {modes.map(({ id, label }) => (
        <button key={id} type="button" role="tab" aria-selected={mode === id} className={`jz-mode${mode === id ? ' is-on' : ''}`} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ─── One theme = one quiet tile ───────────────────────────────────────────
   Every theme used to be its own saturated gradient card (sixteen colours on
   one screen). Now they all share one dark tile; a theme keeps its identity
   through its icon, drawn in its own colour. */
function ThemeTile({ cat, isCreole, meta, onClick, disabled = false, ariaLabel }: {
  cat: any; isCreole: boolean; meta?: React.ReactNode; onClick: () => void; disabled?: boolean; ariaLabel?: string;
}) {
  const name = isCreole ? cat.nameHt || cat.name : cat.name;
  return (
    <button type="button" className="jz-theme" style={{ '--cat': cat.color || '#1B6FE0' } as React.CSSProperties}
      onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      <span className="jz-theme__glyph" aria-hidden="true"><CategoryIcon id={cat.id} size={22} /></span>
      <span className="jz-theme__text">
        <span className="jz-theme__name">{name}</span>
        {meta && <span className="jz-theme__meta">{meta}</span>}
      </span>
    </button>
  );
}

/* ─── Today's challenge: one row, one action ─── */
function DailyChallengeRow({ daily, isCreole, onStart, primary = true }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const done = daily.completedToday;
  return (
    <button type="button" className={`jz-daily${done ? ' is-done' : ''}`} onClick={() => !done && onStart()} disabled={done}>
      <span className="jz-daily__glyph" aria-hidden="true">{done ? <Check size={22} /> : <CalendarCheck size={22} />}</span>
      <span className="jz-daily__text">
        <span className="jz-daily__title">{t('Défi du jour', 'Defi jodi a')}</span>
        <span className="jz-daily__sub">
          {done
            ? t(`Terminé : ${daily.score}/${daily.total}. Un nouveau défi t’attend demain.`, `Fini : ${daily.score}/${daily.total}. Yon nouvo defi ap tann ou demen.`)
            : t('Les mêmes 10 questions pour tout le monde aujourd’hui, 15 secondes chacune. +50 XP en bonus.', 'Menm 10 kesyon yo pou tout moun jodi a, 15 segonn chak. +50 XP bonis.')}
        </span>
      </span>
      {!done && <span className={`${primary ? 'an-go' : 'an-ghost'} jz-daily__go`} aria-hidden="true">{t('Jouer', 'Jwe')}</span>}
    </button>
  );
}

/* Start with a short round; configuration stays optional and in place. */
function CategoryPicker({ onSelect, isCreole, categories, questions, count, setCount, timed, setTimed, isAuthed, duelPick = false, daily = null, onStartDaily = () => {}, dailyNotice = '' }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const groups = [
    { name: t('Haïti', 'Ayiti'), match: (id) => id.includes('haiti') },
    { name: t('Sciences et maths', 'Syans ak matematik'), match: (id) => ['maths_eclair', 'chimie_symboles', 'bio_corps', 'sciences'].includes(id) },
    { name: t('Monde et langues', 'Mond lan ak lang'), match: (id) => !id.includes('haiti') && !['maths_eclair', 'chimie_symboles', 'bio_corps', 'sciences'].includes(id) },
  ];
  const roundSize = duelPick ? DUEL_ROUND : count;
  const word = t('questions', 'kesyon');
  return (
    <div className="jz-picker">
      {!duelPick && <section className="jz-start" aria-label={t('Partie rapide', 'Pati rapid')}>
        <div className="jz-start__row">
          <button type="button" className="trivia-mix" onClick={() => onSelect('mixed')} disabled={!Object.values(questions).some((bank: any[]) => bank.length)}>
            {t('Jouer un mélange de thèmes', 'Jwe yon melanj tèm')}
          </button>
          <p className="jz-start__meta">{count} {isCreole ? 'kesyon' : 'questions'} · {timed ? (isCreole ? '15 segonn / kesyon' : '15 secondes / question') : (isCreole ? 'San kwonomèt' : 'Sans chrono')}{!isAuthed && (isCreole ? ' · San kont' : ' · Sans compte')}</p>
        </div>
        <details className="trivia-settings jz-settings">
          <summary>{t('Modifier la partie', 'Modifye pati a')}</summary>
          <div className="jz-settings__fields">
            <label>{t('Nombre de questions', 'Kantite kesyon')}
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n} {word}</option>)}
              </select>
            </label>
            <label>{t('Mode de jeu', 'Mòd jwèt')}
              <select value={timed ? 'timed' : 'learn'} onChange={(e) => setTimed(e.target.value === 'timed')}>
                <option value="learn">{t('Sans chrono', 'San kwonomèt')}</option>
                <option value="timed">{t('Chronométré — 15 secondes', 'Ak kwonomèt — 15 segonn')}</option>
              </select>
            </label>
          </div>
          <p>{t('Si un thème contient moins de questions, la partie utilise toutes celles disponibles.', 'Si yon tèm gen mwens kesyon, w ap jwe tout kesyon ki disponib yo.')}</p>
        </details>
      </section>}
      {!duelPick && daily && <DailyChallengeRow daily={daily} isCreole={isCreole} onStart={onStartDaily} primary={false} />}
      {!duelPick && dailyNotice && <p className="jz-notice" role="status">{dailyNotice}</p>}
      <h2 className="jz-h2 jz-picker__title">{duelPick ? t('Choisis le thème du défi', 'Chwazi tèm defi a') : t('Ou choisis ton thème', 'Oswa chwazi tèm ou')}</h2>
      {groups.map((group) => {
        const items = categories.filter((cat) => group.match(cat.id));
        if (!items.length) return null;
        return <section className="jz-group" key={group.name}>
          <h3 className="jz-h3">{group.name}</h3>
          <div className="jz-themes">
            {items.map((cat) => {
              const available = (questions[cat.id] || []).length;
              const name = isCreole ? cat.nameHt || cat.name : cat.name;
              return <ThemeTile key={cat.id} cat={cat} isCreole={isCreole} onClick={() => onSelect(cat.id)} disabled={!available}
                ariaLabel={`${name} — ${Math.min(roundSize, available)} ${word}`}
                meta={available ? `${Math.min(roundSize, available)} ${word}` : t('Bientôt', 'Byento')} />;
            })}
          </div>
        </section>;
      })}
    </div>
  );
}

/* ─── Active Game Screen ─── */
export function TriviaQuiz({ timed = false, category, count, onFinish, onBack, isCreole, questions: providedQuestions = null, accentColor = null, categories = TRIVIA_CATEGORIES as any[], questionsMap = TRIVIA_QUESTIONS as Record<string, any[]> }) {
  const cat = categories.find((c) => c.id === category);
  /*
    Draw the round from a bag that remembers what it has already served, so
    every question in a category comes up before any of them comes up twice.
    The old `shuffle(bank).slice(0, count)` re-sampled independently each time,
    which meant about one repeat in five by the tenth round.

    `providedQuestions` is the Daily Challenge, which is seeded by the date and
    deliberately identical for everybody — it must NOT go through the bag, or
    playing it would consume questions from the normal rotation.

    Drawn ONCE per mount, in a lazy initialiser rather than a useMemo.
    useMemo recomputes whenever its dependencies change, and `questionsMap`
    changes identity exactly once — when useTriviaContent's Firestore fetch
    resolves and calls setQuestions. On a fast connection that lands before
    anyone presses play; on a slow one it can land mid-round, and the old code
    would then silently swap the player's questions underneath them. Drawing in
    an initialiser makes the round immutable for the life of the quiz, and
    TriviaQuiz is keyed on `${category}-${playNonce}` so every new game is a
    fresh mount and therefore a fresh draw.
  */
  const drawRoundNow = useCallback(
    () =>
      providedQuestions && providedQuestions.length
        ? providedQuestions
        : drawAndRemember(category, category === 'mixed' ? Object.values(questionsMap).flat() : questionsMap[category] || [], count),
    [category, count, providedQuestions, questionsMap],
  );
  const [questions, setQuestions] = useState(drawRoundNow);

  /*
    The one case where a redraw is right: we mounted before the bank existed,
    so the first draw came back empty. Filling an empty round in is a fix;
    replacing a round already in progress is the bug described above, which is
    why this returns early unless there is nothing to play.
  */
  useEffect(() => {
    if (questions.length > 0) return;
    const drawn = drawRoundNow();
    if (drawn.length > 0) setQuestions(drawn);
  }, [drawRoundNow, questions.length]);
  const accent = accentColor || cat?.color || '#1B6FE0';

  const reduced = useReducedMotion();
  const sound = useMatchSound();
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  // The reveal after an answer, one readable beat at a time (brief #12):
  // 0 accepted (locked) → 1 outcome → 2 points for this question → 3 running
  // score/streak. Cosmetic only: every word is in the DOM from the moment of
  // the answer, and "next" is never gated on it.
  const [beat, setBeat] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const timerRef = useRef(null);
  const answersRef = useRef<RoundAnswer[]>([]);
  const lockedRef = useRef(false);
  const finishedRef = useRef(false);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const q = questions[current];
  const options = q ? triviaOptions(q, isCreole) : [];
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  useEffect(() => {
    shownAt.current = Date.now();
    headingRef.current?.focus();
  }, [current, questions.length]);

  const handleSelect = useCallback((idx) => {
    if (lockedRef.current || !q) return;
    lockedRef.current = true;
    clearInterval(timerRef.current);
    setSelected(idx);
    setAnswered(true);
    setBeat(0);
    const correct = idx === q.answer;
    answersRef.current.push({ question: q, selected: idx, correct, ms: Date.now() - shownAt.current });
    if (correct) setScore((s) => s + 1);
    if (idx !== -1) sound('submitted');
    if (q.q) logAnswerEvent(q.q, correct);
    if (current === 0) trackEvent('trivia_first_answer', { category, timed, elapsedMs: Date.now() - startedAt.current, timedOut: idx === -1 });
  }, [q, current, category, timed, sound]);

  // The beats. Cleared on every question change, so skipping ahead mid-reveal
  // never leaves a stale animation behind; reduced motion lands on the last
  // beat at once.
  useEffect(() => {
    if (!answered) return undefined;
    const last = answersRef.current[answersRef.current.length - 1];
    const outcome = () => sound(last?.correct ? 'correct' : 'incorrect');
    if (reduced) { setBeat(3); outcome(); return undefined; }
    const timers = [
      setTimeout(() => { setBeat(1); outcome(); }, BEAT_MS[0]),
      setTimeout(() => setBeat(2), BEAT_MS[1]),
      setTimeout(() => setBeat(3), BEAT_MS[2]),
    ];
    return () => timers.forEach(clearTimeout);
  }, [answered, current, reduced, sound]);

  // Keyboard players keep their place: once answered, "next" has the focus.
  useEffect(() => { if (answered) nextRef.current?.focus({ preventScroll: true }); }, [answered]);

  useEffect(() => {
    if (!timed || !q || answered) return;
    setTimeLeft(ROUND_SECONDS);
    timerRef.current = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [current, timed, q, answered]);

  useEffect(() => {
    if (timed && timeLeft === 0 && !answered) handleSelect(-1);
  }, [timed, timeLeft, answered, handleSelect]);

  const handleNext = useCallback(() => {
    if (!lockedRef.current || finishedRef.current) return;
    if (current + 1 >= questions.length) {
      finishedRef.current = true;
      onFinish(score, questions.length, answersRef.current);
      return;
    }
    lockedRef.current = false;
    setCurrent((c) => c + 1);
    setSelected(null);
    setAnswered(false);
    setBeat(0);
    setTimeLeft(ROUND_SECONDS);
  }, [current, questions.length, onFinish, score]);

  // Keyboard: 1–4 answer, Enter goes on. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const n = Number(e.key);
      if (!answered && Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        handleSelect(n - 1);
      } else if (answered && e.key === 'Enter') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, options.length, handleSelect, handleNext]);

  const closeBtn = (
    <button type="button" className="mx-close" onClick={onBack} aria-label={t('Quitter', 'Kite')}>
      <X size={18} />
    </button>
  );

  // Guard: an empty/misconfigured category would leave `q` undefined and crash
  // on `q.flag` / `q.options.map`. Show a graceful message instead.
  if (!questions.length || !q) {
    return (
      <div className="mx-quiz" style={{ '--cat-color': accent } as React.CSSProperties}>
        <div className="mx-bar">{closeBtn}</div>
        <h2 className="mx-question">
          {t('Aucune question disponible pour cette catégorie pour le moment.', 'Pa gen kesyon pou kategori sa a pou kounye a.')}
        </h2>
        <button type="button" className="an-ghost mx-next" onClick={onBack}>
          ← {t('Retour', 'Retounen')}
        </button>
      </div>
    );
  }

  const last = answered ? answersRef.current[answersRef.current.length - 1] : null;
  const timedOut = answered && selected === -1;
  const gotIt = answered && selected === q.answer;
  // The running numbers move on the third beat, not before (brief #12).
  const settled = !answered || beat >= 3;
  const shownScore = settled ? score : score - (gotIt ? 1 : 0);
  const done = answersRef.current;
  const streakNow = currentStreak(settled ? done : done.slice(0, -1));
  const streakFinal = currentStreak(done);
  const ticks = answerTicks(settled ? done : done.slice(0, -1));
  const total = questions.length;
  const isLast = current + 1 >= total;

  /* One state per option, each with its own icon and words — never colour
     alone. Before the outcome beat, only "locked" is shown. */
  const optionState = (idx: number): { cls: string; icon?: React.ReactNode; label?: string } => {
    if (!answered) return { cls: '' };
    const revealed = beat >= 1;
    const mine = idx === selected;
    if (!revealed) return mine ? { cls: 'is-locked', icon: <Lock size={16} />, label: t('Envoyée', 'Voye') } : { cls: 'is-rest' };
    if (idx === q.answer) return { cls: 'is-correct', icon: <Check size={16} />, label: mine ? t('Juste', 'Bon') : t('Bonne réponse', 'Bon repons') };
    if (mine) return { cls: 'is-wrong', icon: <X size={16} />, label: t('Ta réponse', 'Repons ou') };
    return { cls: 'is-rest' };
  };

  const headline = gotIt
    ? t('Exact !', 'Egzak !')
    : timedOut
      ? t('Temps écoulé. Voici la réponse.', 'Tan an fini. Men repons lan.')
      : t('Pas cette fois — continue, tu apprends !', 'Se pa sa — kontinye, w ap aprann !');
  const explanation = triviaExplanation(q, isCreole);
  const urgent = timed && !answered && timeLeft <= 5;

  return (
    <div className="mx-quiz" style={{ '--cat-color': accent, ...motionVars } as React.CSSProperties} data-reduced={reduced ? 'true' : undefined}>
      <div className="mx-bar">
        {closeBtn}
        <div className="mx-progress">
          <p className="mx-progress__label">
            <span>{t('Question', 'Kesyon')}</span>{' '}
            <strong className="mx-num" translate="no">{current + 1}/{total}</strong>
            {!timed && <span className="mx-progress__mode"> · {t('Sans chrono', 'San kwonomèt')}</span>}
          </p>
          {total <= 20 ? (
            <ol className="mx-track" aria-hidden="true">
              {questions.map((_, i) => (
                <li key={i} className={`mx-track__seg${i < ticks.length ? ` is-${ticks[i]}` : i === current ? ' is-now' : ''}`} />
              ))}
            </ol>
          ) : (
            <div className="mx-track mx-track--bar" aria-hidden="true">
              <span style={{ width: `${(ticks.length / total) * 100}%` }} />
            </div>
          )}
        </div>
        <p className="mx-score" aria-label={t(`Score : ${shownScore}`, `Pwen : ${shownScore}`)}>
          <Star size={15} aria-hidden="true" /> <span className="mx-num" translate="no">{shownScore}</span>
          {streakNow >= 2 && <span className="mx-score__streak"><Flame size={14} aria-hidden="true" />{t(`série ${streakNow}`, `seri ${streakNow}`)}</span>}
        </p>
        {timed && (
          <div
            className={`mx-timer${urgent ? ' is-urgent' : ''}${timedOut ? ' is-out' : ''}`}
            role="timer"
            aria-label={t(`${timeLeft} secondes restantes`, `${timeLeft} segonn rete`)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" className="mx-timer__bg" />
              <circle cx="12" cy="12" r="9.5" className="mx-timer__fill" pathLength={ROUND_SECONDS}
                style={{ strokeDasharray: `${timeLeft} ${ROUND_SECONDS}` }} />
            </svg>
            <span className="mx-num" aria-hidden="true">{timeLeft} s</span>
          </div>
        )}
        {/* Sound is off until the student turns it on (audit X2). */}
        <SoundToggle compact />
      </div>
      {/* Spoken once, at five seconds: the visible count is not announced. */}
      <span className="mx-sr" aria-live="polite">{urgent && timeLeft === 5 ? t('Plus que 5 secondes', 'Rete 5 segonn sèlman') : ''}</span>

      <div className="mx-stage">
        {q.flag && (
          <div className="mx-flag">
            {q.flagIso ? (
              <img
                src={`https://flagcdn.com/w320/${q.flagIso}.png`}
                srcSet={`https://flagcdn.com/w640/${q.flagIso}.png 2x`}
                alt=""
                className="mx-flag__img"
                loading="eager"
              />
            ) : (
              <span className="mx-flag__emoji" aria-hidden>{q.flag}</span>
            )}
          </div>
        )}
        <h2 ref={headingRef} tabIndex={-1} className="mx-question">
          {isCreole ? q.qHt || q.q : q.q}
        </h2>
      </div>

      <div className="mx-options" data-answered={answered ? 'true' : undefined}>
        {options.map((opt, idx) => {
          const st = optionState(idx);
          return (
            <button
              key={idx}
              type="button"
              className={`mx-opt ${st.cls}`.trim()}
              onClick={() => handleSelect(idx)}
              disabled={answered}
              aria-keyshortcuts={String(idx + 1)}
            >
              {/* A/B/C/D is a pure UI scaffold, not content. Mark it non-translatable
                  so browser auto-translation (e.g. Google Translate on the French
                  page) can't turn a lone "A" into "HAS". */}
              <span className="mx-opt__key" translate="no">{String.fromCharCode(65 + idx)}</span>
              <span className="mx-opt__text">{opt}</span>
              {st.label && <span className="mx-opt__mark">{st.icon}<span>{st.label}</span></span>}
            </button>
          );
        })}
      </div>
      {!answered && <p className="mx-keys" aria-hidden="true">{t('Touches 1 à 4 pour répondre · Entrée pour continuer', 'Touch 1 a 4 pou reponn · Antre pou kontinye')}</p>}

      {answered && (
        <div className={`mx-feedback is-${gotIt ? 'correct' : timedOut ? 'timeout' : 'wrong'}`} role="status" data-beat={beat}>
          <div className="mx-b1">
            <p className="mx-feedback__head">
              <span className="mx-feedback__icon" aria-hidden="true">{gotIt ? <Check size={18} /> : timedOut ? <Clock size={18} /> : <X size={18} />}</span>
              <strong>{headline}</strong>
              <span className={`mx-points mx-b2${gotIt ? ' is-plus' : ''}`}>{gotIt ? t('+1 point', '+1 pwen') : t('+0 point', '+0 pwen')}</span>
            </p>
            {!gotIt && <p>{t('Bonne réponse :', 'Bon repons :')} <strong>{options[q.answer]}</strong></p>}
            {explanation && <p className="mx-feedback__why">{explanation}</p>}
          </div>
          <p className="mx-feedback__run mx-b3">
            {t('Score', 'Pwen')} <strong className="mx-num" translate="no">{score}/{current + 1}</strong>
            {streakFinal >= 2 && <> · <Flame size={14} aria-hidden="true" /> {t(`${streakFinal} de suite`, `${streakFinal} youn apre lòt`)}</>}
          </p>
        </div>
      )}
      {answered && (
        <div className="mx-next-wrap">
          <button ref={nextRef} type="button" className="an-go mx-next" onClick={handleNext}>
            {isLast ? t('Voir les résultats', 'Wè rezilta') : t('Question suivante →', 'Pwochen kesyon →')}
          </button>
        </div>
      )}
    </div>
  );
}

/* The daily challenge retains its fixed round and timer; practice is configurable. */
function TriviaClassic({ isCreole, onExitHub }) {
  const location = useLocation();
  const navigate = useNavigate();
  const modeParam = new URLSearchParams(location.search).get('mode');
  const mode: TriviaMode = modeParam === 'sprint' || modeParam === 'live' ? modeParam : 'quick';
  const setMode = (m: TriviaMode) => navigate({ search: m === 'quick' ? '' : `?mode=${m}` }, { replace: true });
  const [sprintPlaying, setSprintPlaying] = useState(false);
  const { recordResult, daily, isAuthed, profile } = useTrivia();
  // The theme's stats as they stood BEFORE this round, for an honest "new
  // record" on the results (the saved profile already includes the round).
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [prevTheme, setPrevTheme] = useState<{ games?: number; bestPct?: number } | null>(null);
  const { categories, questions } = useTriviaContent();
  const [screen, setScreen] = useState('pick');
  const [category, setCategory] = useState(null);
  const [roundCount, setRoundCount] = useState(10);
  const [timed, setTimed] = useState(false);
  const [dailyQuestions, setDailyQuestions] = useState([]);
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });
  const [answers, setAnswers] = useState([]);
  const [reward, setReward] = useState(null);
  const [saving, setSaving] = useState(false);
  // After a round is saved, the boards it moved are stale: refetch them so the
  // standing card under the result shows the place THIS game earned.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (screen !== 'results' || saving) return;
    for (const key of ['leaderboard-weekly', 'leaderboard-my-rank', 'leaderboard-collectives']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [screen, saving, queryClient]);
  const [saveError, setSaveError] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [dailyNotice, setDailyNotice] = useState('');
  // "Défi d'un ami": the picker in duel mode, and a round drawn from the duel
  // bank (utils/duelBank.ts) so a friend can replay it question for question.
  const [duelPick, setDuelPick] = useState(false);
  const [duelQuestions, setDuelQuestions] = useState<any[] | null>(null);
  const [duelNotice, setDuelNotice] = useState('');
  const autoStartedRef = useRef(false);
  const roundVersion = useRef(0);
  const entryAt = useRef(Date.now());
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useFocusMode(screen === 'play' || screen === 'ready' || screen === 'review');

  useEffect(() => { trackEvent('trivia_view'); }, []);
  useEffect(() => {
    if (screen !== 'play') {
      window.scrollTo(0, 0);
      resultHeading.current?.focus();
    }
  }, [screen]);
  useEffect(() => () => { roundVersion.current += 1; }, []);

  const startDaily = useCallback(() => {
    const qs = getDailyChallengeQuestions(questions, todayStr(), 10);
    if (!qs.length) {
      setDailyNotice(isCreole ? 'Defi jodi a poko disponib. Eseye yon tèm.' : 'Le défi du jour n’est pas encore disponible. Essaie un thème.');
      return;
    }
    roundVersion.current += 1;
    setDailyNotice('');
    setDuelQuestions(null);
    setDailyQuestions(qs);
    setCategory('daily');
    setReward(null);
    setSaving(false);
    setSaveError(false);
    setPlayNonce((n) => n + 1);
    setScreen('play');
    trackEvent('trivia_start', { category: 'daily', count: qs.length, timed: true, elapsedMs: Date.now() - entryAt.current });
  }, [questions, isCreole]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (location.state?.startDaily && !daily.completedToday) {
      autoStartedRef.current = true;
      startDaily();
    } else if (typeof location.state?.startCategory === 'string') {
      // A topic tapped on the /jeux hub starts that round directly.
      autoStartedRef.current = true;
      startRound(location.state.startCategory);
    } else if (typeof location.state?.duelCategory === 'string') {
      // "Revanche" from a duel result (/defi/:code): a fresh duel round on the
      // same theme, which the student then sends back.
      autoStartedRef.current = true;
      startDuelRound(location.state.duelCategory);
    } else if (location.state?.duelPick) {
      // "Lance une partie, puis défie un ami" on the /jeux hub.
      autoStartedRef.current = true;
      setDuelPick(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, daily.completedToday, startDaily]);

  const startRound = (catId) => {
    roundVersion.current += 1;
    setDuelQuestions(null);
    setCategory(catId);
    setReward(null);
    setSaving(false);
    setSaveError(false);
    setPlayNonce((n) => n + 1);
    setScreen('play');
    trackEvent('trivia_start', { category: catId, count: roundCount, timed, elapsedMs: Date.now() - entryAt.current });
  };

  /*
    A duel round: DUEL_ROUND questions from the duel bank, 15 s each — the
    app's round, so whoever replays it (web or app) plays the same thing. It
    still counts as a normal practice round for XP; the duel XP is paid by the
    server when the friend plays.
  */
  const startDuelRound = async (catId: string) => {
    setDuelNotice('');
    let qs = null;
    try {
      const bank = await loadDuelBank();
      const deck = bank[catId] || [];
      qs = questionsAt(deck, drawIdxs(deck.length, DUEL_ROUND));
    } catch {
      qs = null;
    }
    if (!qs) {
      setDuelNotice(isCreole
        ? 'Tèm sa a pa disponib pou defi kounye a. Chwazi yon lòt.'
        : 'Ce thème n’est pas encore disponible en défi. Choisis-en un autre.');
      setScreen('pick');
      setDuelPick(true);
      return;
    }
    roundVersion.current += 1;
    setDuelPick(false);
    setDuelQuestions(qs.map((q) => shuffleOptions(q)));
    setCategory(catId);
    setReward(null);
    setSaving(false);
    setSaveError(false);
    setPlayNonce((n) => n + 1);
    // A duel is a contest: 3-2-1 before its timed round (audit X1). The
    // opponent is not known yet — the friend plays later — so no reveal.
    setScreen('ready');
    trackEvent('trivia_start', { category: catId, count: qs.length, timed: true, duel: true, elapsedMs: Date.now() - entryAt.current });
  };
  const pickDuel = () => {
    roundVersion.current += 1;
    setDuelPick(true);
    setScreen('pick');
    setCategory(null);
  };
  const isDuelRound = !!duelQuestions && category !== 'daily';

  const handleFinish = useCallback(async (score, total, roundAnswers) => {
    const version = roundVersion.current;
    setPrevTheme(isAuthed ? profileRef.current?.byCategory?.[category || 'mixed'] || { games: 0, bestPct: 0 } : null);
    setFinalScore({ score, total });
    setAnswers(roundAnswers);
    setScreen('results');
    setSaving(true);
    trackEvent('trivia_complete', { category, score, total, timed: category === 'daily' || timed });
    try {
      const r = await recordResult({ category, score, total, isDaily: category === 'daily' });
      if (version === roundVersion.current) setReward(r);
    } catch {
      if (version === roundVersion.current) setSaveError(true);
    } finally {
      if (version === roundVersion.current) setSaving(false);
    }
  }, [category, recordResult, timed, isAuthed]);

  const handleReplay = () => {
    trackEvent('trivia_replay', { category });
    // A completed daily round becomes fresh mixed practice, never another daily reward.
    if (isDuelRound) startDuelRound(category);
    else startRound(category === 'daily' ? 'mixed' : category);
  };
  const handleHome = () => {
    roundVersion.current += 1;
    setScreen('pick');
    setCategory(null);
  };

  const themeName = (id: string | null) => {
    if (id === 'daily') return isCreole ? 'Tout tèm yo' : 'Tous les thèmes';
    if (id === 'mixed' || !id) return isCreole ? 'Melanj tèm' : 'Mélange de thèmes';
    const c: any = (categories as any[]).find((x) => x.id === id);
    return c ? (isCreole ? c.nameHt || c.name : c.name) : id;
  };

  const head = (
    <ArenaPageHead
      title="Trivia"
      sub={isCreole
        ? 'Yon pati rapid, yon sprint kont kwonomèt, oswa yon salon an dirèk ak klas ou.'
        : 'Une partie rapide, un sprint contre la montre, ou un salon en direct avec ta classe.'}
      back="/jeux"
      backLabel={isCreole ? 'Jwèt' : 'Jeux'}
    />
  );

  if (mode !== 'quick') {
    return <div className="trivia-page trivia-page--modes jz jz-trivia container">
      {!sprintPlaying && <>
        {head}
        <TriviaModeSwitch mode={mode} onChange={setMode} isCreole={isCreole} />
      </>}
      {mode === 'sprint'
        ? <SprintSolo isCreole={isCreole} categories={categories} questionsMap={questions} onPlaying={setSprintPlaying} />
        : <LiveRoomEntry isCreole={isCreole} />}
    </div>;
  }

  return <div className={`trivia-page${screen === 'pick' ? ' jz jz-trivia container' : ''}`}>
    {screen === 'pick' && <>
      {head}
      <TriviaModeSwitch mode={mode} onChange={setMode} isCreole={isCreole} />
      {duelPick && <div className="duel-pickbar jz-duelbar" role="status">
        <p>
          <strong>{isCreole ? 'Mòd defi' : 'Mode défi'}</strong>{' — '}
          {isCreole
            ? `chwazi yon tèm. ${DUEL_ROUND} kesyon, 15 segonn chak ; apre sa w ap voye menm kesyon yo bay yon zanmi.`
            : `choisis un thème. ${DUEL_ROUND} questions, 15 secondes chacune ; ensuite tu envoies les mêmes à un ami.`}
        </p>
        <button type="button" className="duel-pill duel-pill--soft" onClick={() => { setDuelPick(false); setDuelNotice(''); }}>
          {isCreole ? 'Anile' : 'Annuler'}
        </button>
      </div>}
      {duelNotice && <p className="jz-notice" role="status">{duelNotice}</p>}
      <CategoryPicker onSelect={duelPick ? startDuelRound : startRound} isCreole={isCreole} categories={categories} questions={questions}
        count={roundCount} setCount={setRoundCount} timed={timed} setTimed={setTimed} isAuthed={isAuthed} duelPick={duelPick}
        daily={daily} onStartDaily={startDaily} dailyNotice={dailyNotice} />
    </>}
    {screen === 'ready' && <div className="mx-page">
      <DuelIntro key={`ready-${playNonce}`} me={{ name: isCreole ? 'Ou menm' : 'Toi', school: '', colors: { primary: '#1F3456', secondary: '#FFD27A' }, seed: 'toi' }}
        onGo={() => setScreen('play')} />
    </div>}
        {screen === 'play' && <TriviaQuiz key={`${category}-${playNonce}`} category={category}
      count={roundCount} timed={category === 'daily' || isDuelRound || timed}
      questions={category === 'daily' ? dailyQuestions : isDuelRound ? duelQuestions : null}
      accentColor={category === 'daily' ? '#f59e0b' : null} onFinish={handleFinish}
      onBack={() => { trackEvent('trivia_exit', { category }); handleHome(); }}
      isCreole={isCreole} categories={categories} questionsMap={questions} />}
    {screen === 'results' && <div className="mx-page">
      <MatchResults category={category} categoryName={themeName(category)} score={finalScore.score} total={finalScore.total}
        answers={answers} mode={category === 'daily' ? 'daily' : isDuelRound ? 'duel' : 'practice'}
        reward={reward} saving={saving} saveError={saveError} isAuthed={isAuthed} isCreole={isCreole}
        prevTheme={prevTheme} headingRef={resultHeading} onReplay={handleReplay} onHome={handleHome}
        onReview={() => { trackEvent('trivia_review', { category }); setScreen('review'); }}
        onStartDuelRound={startDuelRound} onPickDuel={pickDuel} />
      {isAuthed && !saving && <div className="trivia-standing"><MySchoolCard where="trivia-results" /></div>}
    </div>}
    {screen === 'review' && <section className="mx-page mx-review">
      <button type="button" className="an-ghost mx-review__back" onClick={() => setScreen('results')}>← {isCreole ? 'Rezilta' : 'Résultats'}</button>
      <h1 ref={resultHeading} tabIndex={-1} className="mx-review__title">{isCreole ? 'Aprann nan erè ou yo' : 'Apprends de tes erreurs'}</h1>
      {answers.filter((a) => !a.correct).map(({ question: q, selected }, index) => {
        const opts = triviaOptions(q, isCreole);
        const why = triviaExplanation(q, isCreole);
        return <article className="mx-miss" key={index}>
          {/* A flag question reviewed without its flag asked nothing. */}
          {q.flag && (q.flagIso
            ? <img className="trivia-review__flag" src={`https://flagcdn.com/w160/${q.flagIso}.png`} srcSet={`https://flagcdn.com/w320/${q.flagIso}.png 2x`} alt="" loading="lazy" />
            : <span className="trivia-review__flag trivia-review__flag--emoji" aria-hidden>{q.flag}</span>)}
          <h2 className="mx-miss__q">{isCreole ? q.qHt || q.q : q.q}</h2>
          <p className="mx-miss__row is-wrong">
            {selected === -1 ? <Clock size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
            <span>{isCreole ? 'Repons ou :' : 'Ta réponse :'} {selected === -1 ? (isCreole ? 'Tan an fini' : 'Temps écoulé') : opts[selected]}</span>
          </p>
          <p className="mx-miss__row is-correct">
            <Check size={16} aria-hidden="true" />
            <span>{isCreole ? 'Bon repons :' : 'Bonne réponse :'} <strong>{opts[q.answer]}</strong></span>
          </p>
          {why && <p className="mx-miss__why">{why}</p>}
        </article>;
      })}
      <div className="mx-review__actions">
        <button type="button" className="an-go" onClick={handleReplay}><RefreshCw size={16} aria-hidden="true" /> {isCreole ? 'Rejwe' : 'Rejouer'}</button>
      </div>
    </section>}
  </div>;
}

/* ─── "Défi d'un ami" on the hub ──────────────────────────────────────────
   Signed in: MyDuels (the student's duels, from Firestore). A guest gets the
   same two ways in — start a round, or open a code a friend sent — without a
   "connecte-toi" line: the page asks for the account once, further down. */
function HubDuels({ isCreole, isAuthed }: { isCreole: boolean; isAuthed: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const clean = normalizeDuelCode(code);
  if (isAuthed) return <div className="jz-section jz-duels" id="defi"><MyDuels isCreole={isCreole} /></div>;
  return (
    <section className="jz-section jz-duels duel-hub" id="defi" aria-labelledby="jz-duel-title">
      <div className="jz-section__head">
        <h2 className="jz-h2" id="jz-duel-title">{t('Défi d’un ami', 'Defi yon zanmi')}</h2>
        <p className="jz-section__sub">
          {t('Joue 10 questions, puis envoie exactement les mêmes à un ami : un seul essai, 15 secondes par question, le meilleur score gagne +20 XP.',
            'Jwe 10 kesyon, epi voye egzakteman menm yo bay yon zanmi : yon sèl tantativ, 15 segonn pa kesyon, pi gwo nòt la genyen +20 XP.')}
        </p>
      </div>
      <div className="duel-hub__actions">
        <Link to="/jeux/trivia" state={{ duelPick: true }} className="an-ghost" onClick={() => trackEvent('duel_entry', { where: 'jeux' })}>
          <Swords size={18} aria-hidden="true" /> {t('Lance une partie, puis défie un ami', 'Lanse yon pati, epi defye yon zanmi')}
        </Link>
        <form className="duel-hub__code" onSubmit={(e) => { e.preventDefault(); if (isDuelCode(clean)) navigate(`/defi/${clean}`); }}>
          <label className="duel-sr-only" htmlFor="jz-duel-code">{t('Code d’un défi reçu', 'Kòd yon defi ou resevwa')}</label>
          <input id="jz-duel-code" className="duel-hub__input" placeholder={t('J’ai un code', 'Mwen gen yon kòd')} value={code}
            onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} maxLength={12} />
          <button type="submit" className="an-ghost" disabled={!isDuelCode(clean)}>{t('Ouvrir', 'Louvri')}</button>
        </form>
      </div>
    </section>
  );
}

/* ─── Games hub (/jeux) ────────────────────────────────────────────────────
   One calm page, no tab bar: today's challenge, a theme to start on, the duel,
   the mini-games with their records, then the way to the boards. The Arène
   lobby lists the modes and /jeux/trivia switches between them, so the hub
   does not add a third menu. Old tab hashes (#trivia, #arcade, #tournois,
   #historique) still land on the matching section. Every figure shown is a
   real field: the player's own best, or the record holder's. */
const HUB_ANCHORS: Record<string, string> = { trivia: 'trivia', arcade: 'arcade', historique: 'arcade', records: 'arcade', tournois: 'tournois', defi: 'defi' };

function GamesHub({ isCreole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, daily, isAuthed } = useTrivia();
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const { categories } = useTriviaContent();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const highScores = (isAuthed && profile?.games?.highScores) || {};

  const [records, setRecords] = useState<Record<string, any>>({});
  useEffect(() => {
    let alive = true;
    import('../services/leaderboardService')
      .then(({ getGameRecords }) => getGameRecords())
      .then((r) => { if (alive) setRecords(r || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => { trackEvent('games_view'); }, []);
  // Deep links from the lobby and the app (/jeux#arcade …) land on their section.
  useEffect(() => {
    const target = HUB_ANCHORS[(location.hash || '').replace('#', '')];
    if (!target) return;
    const id = window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(id);
  }, [location.hash]);

  const themes = categories && categories.length ? categories : TRIVIA_CATEGORIES;
  const arcade = GAMES.filter((g) => g.id !== 'trivia');
  const minutes = arcade.map((g) => g.minutes);
  const play = (catId: string) => {
    trackEvent('trivia_topic_from_hub', { category: catId });
    navigate('/jeux/trivia', { state: { startCategory: catId } });
  };

  return (
    <div className="games-hub jz jz-hub container">
      <ArenaPageHead
        title={t('Jeux', 'Jwèt')}
        sub={t('Des parties courtes pour apprendre en jouant — seul, contre un ami ou pour ton école.', 'Ti pati kout pou aprann pandan w ap jwe — pou kont ou, kont yon zanmi oswa pou lekòl ou.')}
      />

      <DailyChallengeRow daily={daily} isCreole={isCreole} onStart={() => navigate('/jeux/trivia', { state: { startDaily: true } })} />

      <section className="jz-section" id="trivia" aria-labelledby="jz-trivia-title">
        <div className="jz-section__head jz-section__head--row">
          <div>
            <h2 className="jz-h2" id="jz-trivia-title">{t('Trivia : choisis un thème', 'Trivia : chwazi yon tèm')}</h2>
            <p className="jz-section__sub">{t('10 questions sans chrono. La partie commence dès que tu touches un thème.', '10 kesyon san kwonomèt. Pati a kòmanse depi ou touche yon tèm.')}</p>
          </div>
          <button type="button" className="an-ghost" onClick={() => play('mixed')}>
            {t('Mélange de thèmes', 'Melanj tèm')}
          </button>
        </div>
        <div className="jz-themes">
          {themes.map((c: any) => <ThemeTile key={c.id} cat={c} isCreole={isCreole} onClick={() => play(c.id)} />)}
        </div>
        <p className="jz-more">
          <span>{t('Autres façons de jouer :', 'Lòt fason pou jwe :')}</span>
          <Link to="/jeux/trivia?mode=sprint">{t('Sprint solo', 'Sprint solo')}</Link>
          <Link to="/jeux/trivia?mode=live">{t('Salon en direct', 'Salon an dirèk')}</Link>
          <Link to="/jeux/trivia">{t('Longueur et chrono', 'Longè ak kwonomèt')}</Link>
        </p>
      </section>

      <HubDuels isCreole={isCreole} isAuthed={isAuthed} />

      <section className="jz-section" id="arcade" aria-labelledby="jz-arcade-title">
        <div className="jz-section__head">
          <h2 className="jz-h2" id="jz-arcade-title">{t('Mini-jeux', 'Ti jwèt')}</h2>
          <p className="jz-section__sub">
            {t(`${arcade.length} jeux de ${Math.min(...minutes)} à ${Math.max(...minutes)} minutes, avec le record à battre.`,
              `${arcade.length} jwèt ${Math.min(...minutes)} a ${Math.max(...minutes)} minit, ak rekò pou bat la.`)}
          </p>
        </div>
        <div className="jz-games">
          {arcade.map((g) => {
            const Icon = GAME_ICONS[g.id];
            const mine = highScores[g.id];
            const rec = records[g.id];
            return (
              <button key={g.id} type="button" className="jz-game" style={{ '--cat': g.color } as React.CSSProperties}
                onClick={() => { trackEvent('game_select', { game: g.id }); navigate(`/jeux/${g.id}`); }}>
                <span className="jz-game__glyph" aria-hidden="true"><Icon size={22} /></span>
                <span className="jz-game__text">
                  <span className="jz-game__name">{isCreole ? g.nameHt : g.name}</span>
                  <span className="jz-game__desc">{isCreole ? g.descriptionHt : g.description}</span>
                  <span className="jz-game__meta">
                    <span>~{g.minutes} min</span>
                    {mine != null && <span className="jz-game__mine">{t('Ton record', 'Rekò ou')} {mine}</span>}
                    {rec && <span>{t('Record', 'Rekò')} {rec.score}{rec.displayName ? ` · ${rec.displayName}` : ''}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {!isAuthed && (
        <div className="jz-signin">
          <p>{t('Tu joues sans compte. Connecte-toi pour garder tes XP, ta série et tes records, et les faire compter pour ton école.',
            'W ap jwe san kont. Konekte pou kenbe XP ou, seri ou ak rekò ou, epi fè yo konte pou lekòl ou.')}</p>
          <button type="button" className="an-ghost" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
        </div>
      )}

      <p className="jz-more jz-more--end" id="tournois">
        <span>{t('Classements et tournois :', 'Klasman ak tounwa :')}</span>
        <Link to="/classement">{t('Le classement', 'Klasman an')}</Link>
        <Link to="/tournois">{t('Les tournois', 'Tounwa yo')}</Link>
        <Link to="/arena">{t('L’Arène', 'Arèn nan')}</Link>
      </p>
    </div>
  );
}

/* ─── Main page: hub or one of the games, from the /trivia/:gameId route ─── */
export default function TriviaGames() {
  const { language } = useStore();
  const isCreole = language === 'ht';
  const navigate = useNavigate();
  const { gameId } = useParams();
  const { profile, recordGameResult } = useTrivia();

  const game = gameId ? getGameById(gameId) : null;
  // Arcade rounds own the screen just like a trivia round does.
  useFocusMode(!!game && game.id !== 'trivia');

  // Unknown game id → back to the hub.
  useEffect(() => {
    if (gameId && !game) navigate('/jeux', { replace: true });
  }, [gameId, game, navigate]);

  const exit = useCallback(() => navigate('/jeux'), [navigate]);
  const highScores = profile?.games?.highScores || {};

  if (!game) return <GamesHub isCreole={isCreole} />;
  if (game.id === 'trivia') return <TriviaClassic isCreole={isCreole} onExitHub={exit} />;

  const shared = {
    isCreole,
    onExit: exit,
    onRecord: recordGameResult,
    highScore: highScores[game.id] ?? null,
  };

  const GameIcon = GAME_ICONS[game.id];
  return (
    <div className="trivia-page trivia-page--arcade" style={{ '--cat': game.color } as React.CSSProperties}>
      <div className="arcade__header">
        <button type="button" className="mx-close" onClick={exit} aria-label={isCreole ? 'Kite' : 'Quitter'}>
          <X size={18} />
        </button>
        {GameIcon && <span className="arcade__glyph" aria-hidden="true"><GameIcon size={18} /></span>}
        <h1 className="arcade__title">
          {isCreole ? game.nameHt : game.name}
        </h1>
      </div>
      {game.id === 'vrai-faux' && <VraiFauxGame questionsMap={TRIVIA_QUESTIONS} {...shared} />}
      {game.id === 'memoire' && <MemoireGame {...shared} />}
      {game.id === 'mo-kache' && <MoKacheGame {...shared} />}
      {game.id === 'calcul' && <CalculGame {...shared} />}
      {game.id === 'suites' && <SuitesGame {...shared} />}
    </div>
  );
}
