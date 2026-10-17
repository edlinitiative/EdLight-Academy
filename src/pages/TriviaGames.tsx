import React, { useState, useCallback, useEffect, useRef } from 'react';
import CategoryIcon from '../components/CategoryIcon';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Trophy, X, Star, Check, RefreshCw, ThumbsUp, Dumbbell, Sparkles, Crown, CalendarCheck, Swords } from '../components/icons';
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
import { DuelPanel, MyDuels } from '../components/games/Duels';
import { loadDuelBank } from '../utils/duelBank';
import { DUEL_ROUND, drawIdxs, questionsAt, shuffleOptions, isDuelCode, normalizeDuelCode } from '../utils/duels';
import SprintSolo from './trivia/SprintSolo';
import LiveRoomEntry from './trivia/LiveRoomEntry';
import './trivia/triviaModes.css';
import ArenaPageHead from '../components/arena/ArenaPageHead';

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

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const timerRef = useRef(null);
  const answersRef = useRef([]);
  const lockedRef = useRef(false);
  const finishedRef = useRef(false);
  const startedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const q = questions[current];
  const options = q ? triviaOptions(q, isCreole) : [];

  useEffect(() => { headingRef.current?.focus(); }, [current, questions.length]);

  const handleSelect = useCallback((idx) => {
    if (lockedRef.current || !q) return;
    lockedRef.current = true;
    clearInterval(timerRef.current);
    setSelected(idx);
    setAnswered(true);
    const correct = idx === q.answer;
    answersRef.current.push({ question: q, selected: idx, correct });
    if (correct) setScore((s) => s + 1);
    if (q.q) logAnswerEvent(q.q, correct);
    if (current === 0) trackEvent('trivia_first_answer', { category, timed, elapsedMs: Date.now() - startedAt.current, timedOut: idx === -1 });
  }, [q, current, category, timed]);

  useEffect(() => {
    if (!timed || !q || answered) return;
    setTimeLeft(15);
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
    setTimeLeft(15);
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

  const optionClass = (idx) => {
    const base = 'trivia-option';
    if (!answered) return `${base}${selected === idx ? ` ${base}--selected` : ''}`;
    if (idx === q.answer) return `${base} ${base}--correct`;
    if (idx === selected) return `${base} ${base}--wrong`;
    return `${base} ${base}--dimmed`;
  };

  // Guard: an empty/misconfigured category would leave `q` undefined and crash
  // on `q.flag` / `q.options.map`. Show a graceful message instead.
  if (!questions.length || !q) {
    return (
      <div className="trivia-quiz" style={{ '--cat-color': accent } as React.CSSProperties}>
        <div className="trivia-quiz__top-bar">
          <button className="trivia-quiz__close" onClick={onBack} aria-label={isCreole ? 'Kite' : 'Quitter'}>
            <X size={16} />
          </button>
        </div>
        <div className="trivia-quiz__question-card">
          <h2 className="trivia-quiz__question">
            {isCreole
              ? 'Pa gen kesyon pou kategori sa a pou kounye a.'
              : 'Aucune question disponible pour cette catégorie pour le moment.'}
          </h2>
        </div>
        <button className="trivia-next-btn" onClick={onBack}>
          ← {isCreole ? 'Retounen' : 'Retour'}
        </button>
      </div>
    );
  }

  return (
    <div className="trivia-quiz" style={{ '--cat-color': accent } as React.CSSProperties}>
      <div className="trivia-quiz__top-bar">
        <button className="trivia-quiz__close" onClick={onBack} aria-label={isCreole ? 'Kite' : 'Quitter'}>
          <X size={16} />
        </button>
        <div className="trivia-quiz__progress-bar">
          <div
            className="trivia-quiz__progress-fill"
            style={{ width: `${((current + (answered ? 1 : 0)) / questions.length) * 100}%` }}
          />
          <span className="trivia-quiz__counter" translate="no">
            {current + 1}/{questions.length}
          </span>
        </div>
        <div className="trivia-quiz__score-badge">
          <Star size={13} /> {score}
        </div>
      </div>

      {timed ? <div aria-label={isCreole ? `${timeLeft} segonn rete` : `${timeLeft} secondes restantes`} className="trivia-quiz__timer-ring" data-urgent={timeLeft <= 5 ? 'true' : undefined}>
        <span>{timeLeft}</span>
      </div> : <p className="trivia-mode-label">{isCreole ? 'San kwonomèt · Pran tan ou' : 'Sans chrono · Prends ton temps'}</p>}

      <div className="trivia-quiz__question-card">
        {q.flag && (
          <div className="trivia-quiz__flag">
            {q.flagIso ? (
              <img
                src={`https://flagcdn.com/w320/${q.flagIso}.png`}
                srcSet={`https://flagcdn.com/w640/${q.flagIso}.png 2x`}
                alt=""
                className="trivia-quiz__flag-img"
                loading="eager"
              />
            ) : (
              <span className="trivia-quiz__flag-emoji" aria-hidden>{q.flag}</span>
            )}
          </div>
        )}
        <h2 ref={headingRef} tabIndex={-1} className="trivia-quiz__question">
          {isCreole ? q.qHt || q.q : q.q}
        </h2>
      </div>

      <div className="trivia-quiz__options">
        {options.map((opt, idx) => (
          <button
            key={idx}
            className={optionClass(idx)}
            onClick={() => handleSelect(idx)}
            disabled={answered}
          >
            {/* A/B/C/D is a pure UI scaffold, not content. Mark it non-translatable
                so browser auto-translation (e.g. Google Translate on the French
                page) can't turn a lone "A" into "HAS". */}
            <span className="trivia-option__letter" translate="no">
              {String.fromCharCode(65 + idx)}
            </span>
            <span className="trivia-option__text">{opt}</span>
            {answered && idx === q.answer && (
              <span className="trivia-option__icon"><Check size={16} /></span>
            )}
            {answered && idx === selected && idx !== q.answer && (
              <span className="trivia-option__icon"><X size={16} /></span>
            )}
          </button>
        ))}
      </div>

      {answered && <div className="trivia-feedback" role="status">
        <strong>{selected === q.answer ? (isCreole ? 'Egzak !' : 'Exact !') : selected === -1 ? (isCreole ? 'Tan an fini. Men repons lan.' : 'Temps écoulé. Voici la réponse.') : (isCreole ? 'Kontinye, w ap aprann !' : 'Continue, tu apprends !')}</strong>
        <p>{isCreole ? 'Bon repons :' : 'Bonne réponse :'} <strong>{options[q.answer]}</strong></p>
        {triviaExplanation(q, isCreole) && <p>{triviaExplanation(q, isCreole)}</p>}
      </div>}
      {answered && (
        <button className="trivia-next-btn" onClick={handleNext}>
          {current + 1 >= questions.length
            ? (isCreole ? 'Wè rezilta' : 'Voir les résultats')
            : (isCreole ? 'Pwochen kesyon →' : 'Question suivante →')}
        </button>
      )}
    </div>
  );
}

/* ─── Results Screen ─── */
function TriviaResults({ answers, isAuthed, saving, saveError, onReview, category, score, total, onReplay, onHome, isCreole, reward = null, accentColor = null, categories = TRIVIA_CATEGORIES as any[], onStartDuelRound = (_c: string) => {}, onPickDuel = () => {} }) {
  const { profile } = useTrivia();
  const school: string | null = isAuthed ? profile?.leaderboard?.school || null : null;
  const xp = reward && !reward.guest ? reward.xpEarned : 0;
  // Stable across re-renders so the duel panel's bank lookup runs once.
  const played = React.useMemo(() => answers.map((a) => a.question), [answers]);
  const cat = categories.find((c) => c.id === category);
  const accent = accentColor || cat?.color || '#1B6FE0';
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;

  let IconCmp, message, messageHt;
  if (pct >= 90) {
    IconCmp = Trophy;
    message = 'Excellent ! Vous êtes un champion !';
    messageHt = 'Ekselan! Ou se yon chanpyon!';
  } else if (pct >= 70) {
    IconCmp = Star;
    message = 'Très bien ! Continuez comme ça !';
    messageHt = 'Trè byen! Kontinye konsa!';
  } else if (pct >= 50) {
    IconCmp = ThumbsUp;
    message = 'Pas mal ! Vous pouvez vous améliorer.';
    messageHt = 'Pa mal! Ou ka amelyore.';
  } else {
    IconCmp = Dumbbell;
    message = 'Courage ! Réessayez pour progresser.';
    messageHt = 'Kouraj! Eseye ankò pou pwogrese.';
  }

  return (
    <div className="trivia-results" style={{ '--cat-color': accent } as React.CSSProperties}>
      <div className="trivia-results__card">
        <span className="trivia-results__emoji"><IconCmp size={48} /></span>
        <div className="trivia-results__score-ring">
          <svg viewBox="0 0 120 120" className="trivia-results__ring-svg">
            <circle cx="60" cy="60" r="52" className="trivia-results__ring-bg" />
            <circle
              cx="60" cy="60" r="52"
              className="trivia-results__ring-fill"
              style={{
                strokeDasharray: `${(pct / 100) * 327} 327`,
              }}
            />
          </svg>
          <span className="trivia-results__pct">{pct}%</span>
        </div>
        <p className="trivia-results__detail">
          {score} / {total} {isCreole ? 'kòrèk' : 'correct'}
        </p>
        <p className="trivia-results__message">
          {isCreole ? messageHt : message}
        </p>
        {reward && reward.xpEarned > 0 && (
          <div className="trivia-reward">
            <span className="trivia-reward__xp"><Sparkles size={16} /> +{reward.xpEarned} XP</span>
            {reward.leveledUp && (
              <span className="trivia-reward__levelup">
                <Crown size={14} /> {isCreole ? `Nivo ${reward.newLevel} !` : `Niveau ${reward.newLevel} !`}
              </span>
            )}
            {reward.guest && (
              <span className="trivia-reward__guest">
                {isCreole ? 'Aperçu XP — pati sa a pa anrejistre' : 'Aperçu XP — cette partie n’est pas sauvegardée'}
              </span>
            )}
          </div>
        )}
        <p role="status">{saving ? (isCreole ? 'N ap anrejistre pwogrè ou…' : 'Enregistrement de ta progression…') : saveError ? (isCreole ? 'Nou pa t ka anrejistre XP yo. Rezilta ou rete isit la.' : 'Les XP n’ont pas pu être enregistrés. Ton résultat reste disponible ici.') : ''}</p>
        <div className="trivia-results__actions">
          {answers.some((a) => !a.correct) && <button className="button button--primary" onClick={onReview}>{isCreole ? 'Revize erè mwen yo' : 'Revoir mes erreurs'}</button>}
          <button className="button button--secondary" onClick={onReplay}>
            <RefreshCw size={16} /> {isCreole ? 'Jwe ak nouvo kesyon' : 'Rejouer avec de nouvelles questions'}
          </button>
          <button className="button button--ghost" onClick={onHome}>
            ← {isCreole ? 'Kategori yo' : 'Catégories'}
          </button>
        </div>
        {!isAuthed && <div className="trivia-results__save">
          <p>{isCreole ? 'Kontinye gratis. Kreye yon kont pou anrejistre pwogrè pwochen pati ou yo.' : 'Continue gratuitement. Crée un compte pour sauvegarder la progression de tes prochaines parties.'}</p>
          <button className="button button--ghost" onClick={() => { useStore.getState().setActiveTab('signup'); useStore.getState().toggleAuthModal(); }}>
            {isCreole ? 'Kreye yon kont' : 'Créer un compte'}
          </button>
        </div>}
        {/* The peak of the game is the moment to bring someone in: the duel
            is minted from this very round when a friend can replay it. */}
        {school && xp > 0 && (
          <p className="trivia-challenge__school">
            {isCreole ? `+${xp} XP pou ${school}` : `+${xp} XP pour ${school}`}
          </p>
        )}
        <DuelPanel
          category={category}
          played={played}
          score={score}
          total={total}
          isAuthed={isAuthed}
          isCreole={isCreole}
          onStartDuelRound={onStartDuelRound}
          onPickDuel={onPickDuel}
        />
      </div>
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
  const { recordResult, daily, isAuthed } = useTrivia();
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
  useFocusMode(screen === 'play' || screen === 'review');

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
    setScreen('play');
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
  }, [category, recordResult, timed]);

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
    {screen === 'play' && <TriviaQuiz key={`${category}-${playNonce}`} category={category}
      count={roundCount} timed={category === 'daily' || isDuelRound || timed}
      questions={category === 'daily' ? dailyQuestions : isDuelRound ? duelQuestions : null}
      accentColor={category === 'daily' ? '#f59e0b' : null} onFinish={handleFinish}
      onBack={() => { trackEvent('trivia_exit', { category }); handleHome(); }}
      isCreole={isCreole} categories={categories} questionsMap={questions} />}
    {screen === 'results' && <>
      <h1 className="trivia-result-heading" tabIndex={-1} ref={resultHeading}>{isCreole ? 'Pati fini !' : 'Partie terminée !'}</h1>
      <TriviaResults category={category} score={finalScore.score} total={finalScore.total} answers={answers}
        reward={reward} saving={saving} saveError={saveError} isAuthed={isAuthed}
        accentColor={category === 'daily' ? '#f59e0b' : null} onReplay={handleReplay} onHome={handleHome}
        onReview={() => { trackEvent('trivia_review', { category }); setScreen('review'); }}
        isCreole={isCreole} categories={categories} onStartDuelRound={startDuelRound} onPickDuel={pickDuel} />
      {isAuthed && !saving && <div className="trivia-standing"><MySchoolCard where="trivia-results" /></div>}
    </>}
    {screen === 'review' && <section className="trivia-review">
      <button className="trivia-back-btn" onClick={() => setScreen('results')}>← {isCreole ? 'Rezilta' : 'Résultats'}</button>
      <h1 ref={resultHeading} tabIndex={-1}>{isCreole ? 'Aprann nan erè ou yo' : 'Apprends de tes erreurs'}</h1>
      {answers.filter((a) => !a.correct).map(({ question: q, selected }, index) => <article className="trivia-feedback" key={index}>
        {/* A flag question reviewed without its flag asked nothing. */}
        {q.flag && (q.flagIso
          ? <img className="trivia-review__flag" src={`https://flagcdn.com/w160/${q.flagIso}.png`} srcSet={`https://flagcdn.com/w320/${q.flagIso}.png 2x`} alt="" loading="lazy" />
          : <span className="trivia-review__flag trivia-review__flag--emoji" aria-hidden>{q.flag}</span>)}
        <h2>{isCreole ? q.qHt || q.q : q.q}</h2>
        <p>{isCreole ? 'Repons ou :' : 'Ta réponse :'} {selected === -1 ? (isCreole ? 'Tan an fini' : 'Temps écoulé') : triviaOptions(q, isCreole)[selected]}</p>
        <p>{isCreole ? 'Bon repons :' : 'Bonne réponse :'} <strong>{triviaOptions(q, isCreole)[q.answer]}</strong></p>
        {triviaExplanation(q, isCreole) && <p>{triviaExplanation(q, isCreole)}</p>}
      </article>)}
      <button className="button button--primary" onClick={handleReplay}>{isCreole ? 'Jwe ak nouvo kesyon' : 'Rejouer avec de nouvelles questions'}</button>
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

  return (
    <div className="trivia-page trivia-page--arcade">
      <div className="arcade__header">
        <button className="trivia-back-btn trivia-back-btn--sm" onClick={exit} aria-label={isCreole ? 'Kite' : 'Quitter'}>
          <X size={18} />
        </button>
        <h1 className="arcade__title" style={{ color: game.color }}>
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
