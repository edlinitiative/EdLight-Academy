import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { Zap, Flame, Trophy, X, Star, Check, RefreshCw, ThumbsUp, Dumbbell, Sparkles, Crown, CalendarCheck, Clock, ChevronRight, Users, Target, Gamepad2, Swords, History, School as SchoolIcon } from 'lucide-react';
import useStore from '../contexts/store';
import { useFocusMode } from '../hooks/useFocusMode';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { useTriviaContent } from '../hooks/useTriviaContent';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { drawAndRemember } from '../utils/questionRotation';
import { todayStr } from '../services/streakService';
import { GAMES, GAME_ICONS, getGameById } from '../data/games';
import Leaderboard from '../components/Leaderboard';
import SchoolRanking from '../components/SchoolRanking';
import DailyQuests from '../components/DailyQuests';
import { useCollectives } from '../hooks/useLeaderboard';
import { useOpenArena } from '../hooks/useOpenArena';
import { normalizeName } from '../../shared/leaderboardAgg';
import VraiFauxGame from '../components/games/VraiFauxGame';
import MemoireGame from '../components/games/MemoireGame';
import MoKacheGame from '../components/games/MoKacheGame';
import CalculGame from '../components/games/CalculGame';
import SuitesGame from '../components/games/SuitesGame';
import '../styles/pf.css';
import './TriviaGames.css';
import { trackTriviaEvent as trackEvent } from '../utils/triviaLearning';
import { triviaOptions, triviaExplanation } from '../utils/triviaLearning';
import { logAnswerEvent } from '../services/answerEventsService';
import { inviteRef, sendInvite, canNativeShare } from '../utils/schoolInvite';
import SprintSolo from './trivia/SprintSolo';
import LiveRoomEntry from './trivia/LiveRoomEntry';
import './trivia/triviaModes.css';

/* ─── The three ways to play trivia (Ted: "3 variations — combine the
   features"): the quick round, the solo sprint, and live rooms. ─── */
type TriviaMode = 'quick' | 'sprint' | 'live';
function TriviaModeSwitch({ mode, onChange, isCreole }: { mode: TriviaMode; onChange: (m: TriviaMode) => void; isCreole: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const modes: { id: TriviaMode; label: string; sub: string; Icon: any }[] = [
    { id: 'quick', label: t('Partie rapide', 'Pati rapid'), sub: t('10 questions, un thème', '10 kesyon, yon tèm'), Icon: Zap },
    { id: 'sprint', label: t('Sprint solo', 'Sprint solo'), sub: t('Contre la montre', 'Kont kwonomèt'), Icon: Clock },
    { id: 'live', label: t('Salon en direct', 'Salon an dirèk'), sub: t('Avec ta classe, par code', 'Ak klas ou, ak kòd'), Icon: Users },
  ];
  return (
    <div className="trivia-modes" role="tablist" aria-label={t('Mode de jeu', 'Mòd jwèt')}>
      {modes.map(({ id, label, sub, Icon }) => (
        <button key={id} type="button" role="tab" aria-selected={mode === id} className={`trivia-mode${mode === id ? ' is-on' : ''}`} onClick={() => onChange(id)}>
          <span className="trivia-mode__icon"><Icon size={18} aria-hidden="true" /></span>
          <span className="trivia-mode__text"><strong>{label}</strong><small>{sub}</small></span>
        </button>
      ))}
    </div>
  );
}

/* Start with a short round; configuration stays optional and in place. */
function CategoryPicker({ onSelect, isCreole, categories, questions, count, setCount, timed, setTimed, isAuthed }) {
  const groups = [
    { name: isCreole ? 'Ayiti' : 'Haïti', match: (id) => id.includes('haiti') },
    { name: isCreole ? 'Syans ak matematik' : 'Sciences et maths', match: (id) => ['maths_eclair', 'chimie_symboles', 'bio_corps', 'sciences'].includes(id) },
    { name: isCreole ? 'Mond lan ak lang' : 'Monde et langues', match: (id) => !id.includes('haiti') && !['maths_eclair', 'chimie_symboles', 'bio_corps', 'sciences'].includes(id) },
  ];
  return (
    <div className="trivia-landing">
      <header className="trivia-landing__header">
        <h1 className="trivia-landing__title">Trivia</h1>
        <p className="trivia-landing__subtitle">{isCreole ? 'Yon ti pati pou aprann yon bagay nouvo.' : 'Une petite partie pour apprendre quelque chose de nouveau.'}</p>
        <p>{count} {isCreole ? 'kesyon' : 'questions'} · {timed ? (isCreole ? '15 segonn / kesyon' : '15 secondes / question') : (isCreole ? 'San kwonomèt' : 'Sans chrono')}{!isAuthed && (isCreole ? ' · San kont' : ' · Sans compte')}</p>
        <button className="button button--primary trivia-mix" onClick={() => onSelect('mixed')} disabled={!Object.values(questions).some((bank: any[]) => bank.length)}>
          <Sparkles size={18} aria-hidden="true" /> {isCreole ? 'Jwe yon melanj tèm' : 'Jouer un mélange de thèmes'}
        </button>
        <details className="trivia-settings">
          <summary>{isCreole ? 'Modifye pati a' : 'Modifier la partie'}</summary>
          <div className="trivia-settings__fields">
            <label>{isCreole ? 'Kantite kesyon' : 'Nombre de questions'}
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[10, 25, 50].map((n) => <option key={n} value={n}>{n} {isCreole ? 'kesyon' : 'questions'}</option>)}
              </select>
            </label>
            <label>{isCreole ? 'Mòd jwèt' : 'Mode de jeu'}
              <select value={timed ? 'timed' : 'learn'} onChange={(e) => setTimed(e.target.value === 'timed')}>
                <option value="learn">{isCreole ? 'San kwonomèt' : 'Sans chrono'}</option>
                <option value="timed">{isCreole ? 'Ak kwonomèt — 15 segonn' : 'Chronométré — 15 secondes'}</option>
              </select>
            </label>
          </div>
          <p>{isCreole ? 'Si yon tèm gen mwens kesyon, w ap jwe tout kesyon ki disponib yo.' : 'Si un thème contient moins de questions, la partie utilise toutes celles disponibles.'}</p>
        </details>
      </header>
      <h2 className="trivia-themes-title">{isCreole ? 'Oswa chwazi tèm ou' : 'Ou choisis ton thème'}</h2>
      {groups.map((group) => {
        const items = categories.filter((cat) => group.match(cat.id));
        if (!items.length) return null;
        return <section className="trivia-topic-group" key={group.name}>
          <h3>{group.name}</h3>
          <div className="trivia-landing__grid">
            {items.map((cat) => {
              const available = (questions[cat.id] || []).length;
              const name = isCreole ? cat.nameHt || cat.name : cat.name;
              return <button key={cat.id} className="trivia-cat" style={{ '--cat': cat.color || '#1B6FE0' } as React.CSSProperties}
                onClick={() => onSelect(cat.id)} disabled={!available}
                aria-label={`${name} — ${Math.min(count, available)} ${isCreole ? 'kesyon' : 'questions'}`}>
                <span className="trivia-cat__icon" aria-hidden="true">{cat.icon}</span>
                <span className="trivia-cat__name">{name}</span>
                <span className="trivia-cat__count">{available ? `${Math.min(count, available)} ${isCreole ? 'kesyon · Jwe →' : 'questions · Jouer →'}` : (isCreole ? 'Byento' : 'Bientôt')}</span>
              </button>;
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
function TriviaResults({ answers, isAuthed, saving, saveError, onReview, category, score, total, onReplay, onHome, isCreole, reward = null, accentColor = null, categories = TRIVIA_CATEGORIES as any[] }) {
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
        {/* The peak of the game is the moment to bring someone in. It used to
            send the student to the app store to make a duel; the score itself
            can be sent from here, with their school named when they have one. */}
        <ScoreChallenge
          score={score}
          total={total}
          categoryName={cat ? (isCreole ? cat.nameHt || cat.name : cat.name) : null}
          xp={reward && !reward.guest ? reward.xpEarned : 0}
          isAuthed={isAuthed}
          isCreole={isCreole}
        />
      </div>
    </div>
  );
}

/* ─── "Tu peux faire mieux ?" — the score, sent to a friend ─── */
function ScoreChallenge({ score, total, categoryName, xp, isAuthed, isCreole }) {
  const { profile } = useTrivia();
  const school: string | null = isAuthed ? profile?.leaderboard?.school || null : null;
  const [ref, setRef] = useState<{ code: string | null; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    if (isAuthed) inviteRef().then((r) => { if (live) setRef(r); });
    else setRef({ code: null, link: 'https://academy.edlight.org/jeux/trivia' });
    return () => { live = false; };
  }, [isAuthed]);

  const topic = categoryName ? (isCreole ? ` sou ${categoryName}` : ` en ${categoryName}`) : '';
  const message = !ref ? '' : isCreole
    ? `🎯 M fè ${score}/${total}${topic} sou EdLight Academy${school ? ` pou ${school}` : ''}. Ou ka fè pi byen ?${ref.code ? ` Kòd mwen : ${ref.code}.` : ''} ${ref.link}`
    : `🎯 J’ai fait ${score}/${total}${topic} sur EdLight Academy${school ? ` pour ${school}` : ''}. Tu peux faire mieux ?${ref.code ? ` Mon code : ${ref.code}.` : ''} ${ref.link}`;

  const send = async (channel: 'whatsapp' | 'native' | 'copy') => {
    if (!message) return;
    const didCopy = await sendInvite(channel, message, 'trivia-results');
    if (didCopy) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  return (
    <div className="trivia-challenge">
      {school && xp > 0 && (
        <p className="trivia-challenge__school">
          {isCreole ? `+${xp} XP pou ${school}` : `+${xp} XP pour ${school}`}
        </p>
      )}
      <h3 className="trivia-challenge__title">{isCreole ? 'Defye yon zanmi' : 'Défie un ami'}</h3>
      <p className="trivia-challenge__sub">
        {isCreole ? `Voye nòt ou (${score}/${total}) : èske l ka fè pi byen ?` : `Envoie ton score (${score}/${total}) : peut-il faire mieux ?`}
      </p>
      <div className="trivia-challenge__actions">
        <button type="button" className="button button--primary" disabled={!ref} onClick={() => send('whatsapp')}>
          {isCreole ? 'Voye sou WhatsApp' : 'Envoyer sur WhatsApp'}
        </button>
        <button type="button" className="button button--ghost" disabled={!ref} onClick={() => send(canNativeShare() ? 'native' : 'copy')}>
          {copied ? (isCreole ? 'Kopye' : 'Copié') : canNativeShare() ? (isCreole ? 'Pataje' : 'Partager') : (isCreole ? 'Kopye lyen an' : 'Copier le lien')}
        </button>
      </div>
    </div>
  );
}

/* ─── Trivia header: level, XP progress, streak ─── */
function TriviaHeader({ level, streak, isCreole }) {
  return (
    <div className="trivia-header">
      <div className="trivia-header__stat">
        <Zap size={16} />
        <span className="trivia-header__value">{isCreole ? 'Nivo' : 'Niv.'} {level.level}</span>
      </div>
      <div className="trivia-header__xpbar" title={`${level.xp} XP`}>
        <span className="trivia-header__xpfill" style={{ width: `${level.progressPct}%` }} />
        <span className="trivia-header__xptext">{level.xp} XP</span>
      </div>
      <div className="trivia-header__stat trivia-header__stat--streak">
        <Flame size={16} />
        <span className="trivia-header__value">{streak?.currentStreak || 0}</span>
      </div>
    </div>
  );
}

/* ─── Daily Challenge banner ─── */
function DailyChallengeBanner({ daily, isCreole, onStart }) {
  const done = daily.completedToday;
  return (
    <button
      type="button"
      className={`trivia-daily ${done ? 'trivia-daily--done' : ''}`}
      onClick={() => !done && onStart()}
      disabled={done}
    >
      <span className="trivia-daily__icon">{done ? <Check size={22} /> : <CalendarCheck size={22} />}</span>
      <span className="trivia-daily__body">
        <span className="trivia-daily__title">{isCreole ? 'Defi jodi a' : 'Défi du jour'}</span>
        <span className="trivia-daily__sub">
          {done
            ? (isCreole
                ? `Fini — ${daily.score}/${daily.total}. Retounen demen !`
                : `Terminé — ${daily.score}/${daily.total}. Revenez demain !`)
            : (isCreole ? '10 kesyon · 15 segonn / kesyon · +50 XP bonis' : '10 questions · 15 s / question · +50 XP bonus')}
        </span>
      </span>
      {!done && <span className="trivia-daily__cta">{isCreole ? 'Jwe →' : 'Jouer →'}</span>}
    </button>
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
  const { recordResult, level, daily, isAuthed } = useTrivia();
  const { streak } = useStreak();
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
  const [saveError, setSaveError] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [dailyNotice, setDailyNotice] = useState('');
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, daily.completedToday, startDaily]);

  const startRound = (catId) => {
    roundVersion.current += 1;
    setCategory(catId);
    setReward(null);
    setSaving(false);
    setSaveError(false);
    setPlayNonce((n) => n + 1);
    setScreen('play');
    trackEvent('trivia_start', { category: catId, count: roundCount, timed, elapsedMs: Date.now() - entryAt.current });
  };

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
    startRound(category === 'daily' ? 'mixed' : category);
  };
  const handleHome = () => {
    roundVersion.current += 1;
    setScreen('pick');
    setCategory(null);
  };

  if (mode !== 'quick') {
    return <div className="trivia-page trivia-page--modes">
      {!sprintPlaying && <>
        <button className="trivia-back-btn" onClick={onExitHub}>← {isCreole ? 'Jwèt yo' : 'Les jeux'}</button>
        <TriviaModeSwitch mode={mode} onChange={setMode} isCreole={isCreole} />
      </>}
      {mode === 'sprint'
        ? <SprintSolo isCreole={isCreole} categories={categories} questionsMap={questions} onPlaying={setSprintPlaying} />
        : <LiveRoomEntry isCreole={isCreole} />}
    </div>;
  }

  return <div className="trivia-page">
    {screen === 'pick' && <>
      <button className="trivia-back-btn" onClick={onExitHub}>← {isCreole ? 'Jwèt yo' : 'Les jeux'}</button>
      <TriviaModeSwitch mode={mode} onChange={setMode} isCreole={isCreole} />
      <CategoryPicker onSelect={startRound} isCreole={isCreole} categories={categories} questions={questions}
        count={roundCount} setCount={setRoundCount} timed={timed} setTimed={setTimed} isAuthed={isAuthed} />
      <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={startDaily} />
      {dailyNotice && <p role="status">{dailyNotice}</p>}
      {isAuthed && <TriviaHeader level={level} streak={streak} isCreole={isCreole} />}
    </>}
    {screen === 'play' && <TriviaQuiz key={`${category}-${playNonce}`} category={category}
      count={roundCount} timed={category === 'daily' || timed} questions={category === 'daily' ? dailyQuestions : null}
      accentColor={category === 'daily' ? '#f59e0b' : null} onFinish={handleFinish}
      onBack={() => { trackEvent('trivia_exit', { category }); handleHome(); }}
      isCreole={isCreole} categories={categories} questionsMap={questions} />}
    {screen === 'results' && <>
      <h1 className="trivia-result-heading" tabIndex={-1} ref={resultHeading}>{isCreole ? 'Pati fini !' : 'Partie terminée !'}</h1>
      <TriviaResults category={category} score={finalScore.score} total={finalScore.total} answers={answers}
        reward={reward} saving={saving} saveError={saveError} isAuthed={isAuthed}
        accentColor={category === 'daily' ? '#f59e0b' : null} onReplay={handleReplay} onHome={handleHome}
        onReview={() => { trackEvent('trivia_review', { category }); setScreen('review'); }}
        isCreole={isCreole} categories={categories} />
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

/* ─── Section heading: caps micro-label over the title ─────────────────────
   From the mockups: every band opens with a mono caps eyebrow and a heading
   in the display face. The mockups also put a short azure bar to the left of
   each title — dropped deliberately: left-edge accent stripes are out
   app-wide, so emphasis here comes from the eyebrow and the type weight. */
function HubHeading({ eyebrow, title, id = undefined, icon = null, size = 'md' }: any) {
  return (
    <div className={`jx-heading${size === 'sm' ? ' jx-heading--sm' : ''}`}>
      <span className="pf-eyebrow">{eyebrow}</span>
      <h2 className="jx-heading__title" id={id}>
        {icon}
        {title}
      </h2>
    </div>
  );
}

/* ─── Records strip: best-ever score per game + holder ─── */
function GameRecords({ isCreole }) {
  const [records, setRecords] = useState({});
  useEffect(() => {
    let alive = true;
    import('../services/leaderboardService').then(({ getGameRecords }) =>
      getGameRecords().then((r) => { if (alive) setRecords(r); }),
    );
    return () => { alive = false; };
  }, []);

  const arcade = GAMES.filter((g) => g.id !== 'trivia');
  if (!arcade.some((g) => records[g.id])) return null; // nothing set yet

  return (
    <div className="game-records pf-card">
      <HubHeading
        size="sm"
        eyebrow={isCreole ? 'Pi bon nòt yo' : 'Meilleurs scores'}
        title={isCreole ? 'Rekò yo' : 'Records'}
        icon={<Crown size={15} aria-hidden="true" />}
      />
      <ul className="game-records__list">
        {arcade.map((g) => {
          const rec = records[g.id];
          const Icon = GAME_ICONS[g.id];
          return (
            <li key={g.id} className="game-records__row" style={{ ['--game-color' as any]: g.color }}>
              <span className="game-records__game">
                <span className="pf-tile pf-tile--sm game-records__tile" aria-hidden="true">
                  <Icon size={14} />
                </span>
                {isCreole ? g.nameHt : g.name}
              </span>
              {rec ? (
                <span className="game-records__holder">
                  {rec.displayName} · <strong>{rec.score}</strong>
                </span>
              ) : (
                <span className="pf-pill pf-pill--amber">{isCreole ? 'Poko gen rekò !' : 'À prendre !'}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* Size of the shipped question bank. Computed from the data, once, so the
   figure on the hero can never drift from what a player actually gets. */
const BANK_TOTAL = Object.values(TRIVIA_QUESTIONS as Record<string, any[]>)
  .reduce((n, list) => n + (list?.length || 0), 0);

/* ─── Games hub (landing) ─────────────────────────────────────────────────
   Ted's fifth mockup: a HUD (school + rank, level and XP bar, streak, "Défier"),
   four mode tabs, the playable thing on the left, the tournament / school
   league / daily quests on the right. Every figure is the student's own or the
   board's; the mockup's live opponent, 50/50 joker, energy bolts, XP
   multiplier and invented school headcounts have no counterpart in the app
   and are not drawn. */
type HubTab = 'trivia' | 'arcade' | 'tournois' | 'historique';
const HUB_TABS: HubTab[] = ['trivia', 'arcade', 'tournois', 'historique'];

function GamesHub({ isCreole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, level, daily, isAuthed } = useTrivia();
  const { streak } = useStreak();
  const setLanguage = useStore((s) => s.setLanguage);
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const { categories } = useTriviaContent();
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const highScores = profile?.games?.highScores || {};
  const gamesPlayed = profile?.games?.gamesPlayed || 0;
  const school: string | null = isAuthed ? profile?.leaderboard?.school || null : null;
  const { groups } = useCollectives('school', 'all', !!school);
  const mySchool = school ? groups.find((g) => g.key === normalizeName(school)) : null;
  const arena = useOpenArena();
  const days = streak?.currentStreak || 0;

  const initialTab = (location.hash || '').replace('#', '') as HubTab;
  const [tab, setTab] = useState<HubTab>(HUB_TABS.includes(initialTab) ? initialTab : 'trivia');
  const pickTab = (next: HubTab) => {
    setTab(next);
    trackEvent('games_tab', { tab: next });
    window.history.replaceState(window.history.state, '', `#${next}`);
  };
  useEffect(() => { trackEvent('games_view'); }, []);

  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(n || 0);
  const arcadeGames = GAMES.filter((g) => g.id !== 'trivia');
  const tabLabel: Record<HubTab, string> = {
    trivia: t('Trivia & défi du jour', 'Trivia ak defi jodi a'),
    arcade: t('Mini-jeux', 'Ti jwèt'),
    tournois: t('Tournois & classements', 'Tounwa ak klasman'),
    historique: t('Mes records', 'Rekò mwen'),
  };
  const tabIcon: Record<HubTab, React.ReactNode> = {
    trivia: <Target size={18} aria-hidden="true" />,
    arcade: <Gamepad2 size={18} aria-hidden="true" />,
    tournois: <Swords size={18} aria-hidden="true" />,
    historique: <History size={18} aria-hidden="true" />,
  };

  const arenaTitle = arena ? (isCreole && arena.titleHt ? arena.titleHt : arena.title) : null;
  const arenaDate = arena?.startsAt && arena.startsAt > Date.now()
    ? new Date(arena.startsAt).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  const gameCard = (g, i) => {
    const Icon = GAME_ICONS[g.id];
    const hs = highScores[g.id];
    return (
      <button
        key={g.id}
        className="game-card"
        style={{ ['--game-color' as any]: g.color }}
        onClick={() => { trackEvent('game_select', { game: g.id }); navigate(`/jeux/${g.id}`); }}
      >
        <span className="game-card__wash" aria-hidden="true" />
        <span className="game-card__icon" aria-hidden="true"><Icon size={22} /></span>
        <span className="pf-eyebrow game-card__index" translate="no">
          {(isCreole ? 'JWÈT ' : 'JEU ') + String(i + 1).padStart(2, '0')}
        </span>
        <span className="game-card__name">{isCreole ? g.nameHt : g.name}</span>
        <span className="game-card__desc">{isCreole ? g.descriptionHt : g.description}</span>
        <span className="game-card__meta">
          <span className="game-card__time"><Clock size={12} aria-hidden="true" /> ~{g.minutes} min</span>
          {hs != null && (
            <span className="game-card__hs"><Trophy size={12} aria-hidden="true" /> {t('Record', 'Rekò')} {hs}</span>
          )}
        </span>
        <span className="game-card__cta" aria-hidden="true">{t('Jouer', 'Jwe')}<ChevronRight size={15} /></span>
      </button>
    );
  };

  return (
    <div className="games-hub pf container gx">
      {/* ── HUD ─────────────────────────────────────────────────────────── */}
      <header className="gx-hud">
        <div className="gx-hud__top">
          <div className="gx-hud__who">
            <span className="gx-hud__badge" aria-hidden="true"><SchoolIcon size={22} /></span>
            <div className="gx-hud__id">
              <h1 className="gx-hud__title">
                {school || t('À quoi veux-tu jouer aujourd’hui ?', 'Ki sa ou vle jwe jodi a ?')}
              </h1>
              <p className="gx-hud__sub">
                {school
                  ? (mySchool
                    ? t(
                      `Rang #${mySchool.rank} des écoles · ${mySchool.members} élève${mySchool.members > 1 ? 's' : ''} sur EdLight`,
                      `Plas #${mySchool.rank} pami lekòl yo · ${mySchool.members} elèv sou EdLight`,
                    )
                    : t('Chaque partie fait monter ton école au classement.', 'Chak pati fè lekòl ou monte nan klasman an.'))
                  : isAuthed
                    ? (
                      <button type="button" className="gx-link" onClick={() => setSchoolChosen(false)}>
                        {t('Ajoute ton école pour la faire monter au classement →', 'Ajoute lekòl ou pou fè l monte nan klasman an →')}
                      </button>
                    )
                    : t(
                      `${GAMES.length} jeux · ${TRIVIA_CATEGORIES.length} thèmes · ${nf(BANK_TOTAL)} questions`,
                      `${GAMES.length} jwèt · ${TRIVIA_CATEGORIES.length} tèm · ${nf(BANK_TOTAL)} kesyon`,
                    )}
              </p>
            </div>
          </div>
          <div className="gx-hud__controls">
            <div className="gx-lang" role="group" aria-label={t('Langue', 'Lang')}>
              <button type="button" className={!isCreole ? 'is-on' : ''} aria-pressed={!isCreole} onClick={() => setLanguage('fr')}>Français</button>
              <button type="button" className={isCreole ? 'is-on' : ''} aria-pressed={isCreole} onClick={() => setLanguage('ht')}>Kreyòl</button>
            </div>
            <Link to="/download?from=defi" className="gx-duel">
              <Users size={16} aria-hidden="true" /> {t('Défier un ami', 'Defye yon zanmi')}
            </Link>
          </div>
        </div>

        {isAuthed ? (
          <div className="gx-hud__stats">
            <div className="gx-stat gx-stat--level">
              <div className="gx-stat__row">
                <span className="gx-stat__label"><Crown size={16} aria-hidden="true" /> {t(`Niveau ${level.level}`, `Nivo ${level.level}`)}</span>
                <span className="gx-stat__value">{nf(level.xp)} XP</span>
              </div>
              <span className="gx-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, level.progressPct || 0)}%` }} /></span>
              <span className="gx-stat__hint">
                {level.xpForNext > 0
                  ? t(`${nf(level.xpToNext)} XP avant le niveau ${level.level + 1}`, `${nf(level.xpToNext)} XP anvan nivo ${level.level + 1}`)
                  : t('Niveau maximum', 'Nivo maksimòm')}
              </span>
            </div>
            <div className="gx-stat">
              <span className="gx-stat__icon gx-stat__icon--amber" aria-hidden="true"><Flame size={18} /></span>
              <div className="gx-stat__text">
                <span className="gx-stat__value">{days} {t(days === 1 ? 'jour' : 'jours', 'jou')}</span>
                <span className="gx-stat__hint">{t('de série', 'seri')}</span>
              </div>
            </div>
            <div className="gx-stat">
              <span className="gx-stat__icon gx-stat__icon--azure" aria-hidden="true"><Gamepad2 size={18} /></span>
              <div className="gx-stat__text">
                <span className="gx-stat__value">{nf(gamesPlayed)}</span>
                <span className="gx-stat__hint">{t('parties d’arcade', 'pati arkad')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="gx-hud__signin">
            <span>{t('Connecte-toi pour garder tes XP, ta série et faire gagner ton école.', 'Konekte pou kenbe XP ou, seri ou epi fè lekòl ou genyen.')}</span>
            <button type="button" className="gx-btn" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
          </div>
        )}
      </header>

      {/* ── Mode tabs ───────────────────────────────────────────────────── */}
      <div className="gx-tabs" role="tablist" aria-label={t('Modes de jeu', 'Mòd jwèt')}>
        {HUB_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`gx-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="gx-panel"
            className={`gx-tab${tab === id ? ' is-on' : ''}`}
            onClick={() => pickTab(id)}
          >
            {tabIcon[id]}
            <span>{tabLabel[id]}</span>
            {id === 'trivia' && !daily.completedToday && <span className="gx-tab__dot">{t('Défi', 'Defi')}</span>}
            {id === 'arcade' && <span className="gx-tab__count">{GAMES.length}</span>}
          </button>
        ))}
      </div>

      <div className="gx-layout">
        <div className="gx-main" id="gx-panel" role="tabpanel" aria-labelledby={`gx-tab-${tab}`}>
          {tab === 'trivia' && (
            <>
              <DailyChallengeBanner
                daily={daily}
                isCreole={isCreole}
                onStart={() => navigate('/jeux/trivia', { state: { startDaily: true } })}
              />
              <section className="gx-card" aria-labelledby="gx-topics-title">
                <div className="gx-card__head">
                  <div>
                    <span className="gx-tag">{t('Trivia · 10 questions · sans chrono', 'Trivia · 10 kesyon · san kwonomèt')}</span>
                    <h2 className="gx-card__title" id="gx-topics-title">{t('Choisis un thème, joue tout de suite', 'Chwazi yon tèm, jwe kounye a')}</h2>
                  </div>
                  <button type="button" className="gx-btn" onClick={() => navigate('/jeux/trivia', { state: { startCategory: 'mixed' } })}>
                    <Sparkles size={16} aria-hidden="true" /> {t('Mélange de thèmes', 'Melanj tèm')}
                  </button>
                </div>
                <div className="gx-topics">
                  {(categories && categories.length ? categories : TRIVIA_CATEGORIES).map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      className="gx-topic"
                      style={{ ['--cat' as any]: c.color }}
                      onClick={() => { trackEvent('trivia_topic_from_hub', { category: c.id }); navigate('/jeux/trivia', { state: { startCategory: c.id } }); }}
                    >
                      <span className="gx-topic__emoji" aria-hidden="true">{c.icon || '🎯'}</span>
                      <span className="gx-topic__name">{isCreole ? c.nameHt || c.name : c.name}</span>
                    </button>
                  ))}
                </div>
                <p className="gx-card__foot">
                  {t('Au clavier : 1 à 4 pour répondre, Entrée pour continuer.', 'Ak klavye a : 1 rive 4 pou reponn, Antre pou kontinye.')}
                  {' '}<Link to="/jeux/trivia">{t('Plus d’options (longueur, chrono)', 'Plis opsyon (longè, kwonomèt)')} →</Link>
                </p>
              </section>
              <section className="gx-card gx-card--duel" aria-labelledby="duel-title">
                <span className="pf-tile pf-tile--sm pf-tile--violet" aria-hidden="true"><Users size={15} /></span>
                <div className="gx-card__body">
                  <h2 id="duel-title" className="gx-card__title gx-card__title--sm">{t('Défi d’un ami — 1 contre 1', 'Defi yon zanmi — 1 kont 1')}</h2>
                  <p className="gx-card__text">{t('Termine une partie, puis envoie les mêmes questions à un ami : un seul essai, le meilleur score gagne. Le défi se crée dans l’application.', 'Fini yon pati, epi voye menm kesyon yo bay yon zanmi : yon sèl tantativ, pi gwo nòt la genyen. Defi a kreye nan aplikasyon an.')}</p>
                </div>
                <Link to="/download?from=defi" className="gx-btn gx-btn--ghost">{t('Obtenir l’application', 'Jwenn aplikasyon an')}</Link>
              </section>
            </>
          )}

          {tab === 'arcade' && (
            <section>
              <HubHeading eyebrow={t('La salle d’arcade', 'Sal arkad la')} title={t('Mini-jeux par matière', 'Ti jwèt pa matyè')} />
              <div className="games-hub__grid">{GAMES.map(gameCard)}</div>
            </section>
          )}

          {tab === 'tournois' && (
            <>
              <section className="gx-card">
                <div className="gx-card__head">
                  <div>
                    <span className="gx-tag gx-tag--amber">{t('Championnat interscolaire', 'Chanpyona ant lekòl')}</span>
                    <h2 className="gx-card__title">{arenaTitle || t('L’Arène', 'Arèn nan')}</h2>
                  </div>
                  <Link to="/arena" className="gx-btn">{arena ? t('Inscrire mon école', 'Enskri lekòl mwen') : t('Voir l’Arène', 'Gade Arèn nan')}</Link>
                </div>
                <p className="gx-card__text">
                  {arena === undefined
                    ? t('Chargement…', 'N ap chaje…')
                    : arena
                      ? (arena.state === 'doors'
                        ? t('Les portes sont ouvertes : la finale se joue maintenant dans l’application.', 'Pòt yo louvri : final la ap jwe kounye a nan aplikasyon an.')
                        : arenaDate
                          ? t(`Inscriptions ouvertes — finale le ${arenaDate}.`, `Enskripsyon ouvè — final la ${arenaDate}.`)
                          : t('Inscriptions ouvertes.', 'Enskripsyon ouvè.'))
                      : t('Aucune finale ouverte pour l’instant — la prochaine sera annoncée ici. En attendant, chaque partie compte pour ton école.', 'Pa gen final ki ouvè kounye a — n ap anonse pwochen an isit la. Pandan tan an, chak pati konte pou lekòl ou.')}
                  {arena && arena.schools > 0
                    ? ` ${t(`${arena.schools} école${arena.schools > 1 ? 's' : ''} inscrite${arena.schools > 1 ? 's' : ''}.`, `${arena.schools} lekòl enskri.`)}`
                    : ''}
                </p>
              </section>
              <SchoolRanking max={10} />
              <section>
                <HubHeading eyebrow={t('Classement', 'Klasman')} title={t('Classement XP des jeux', 'Klasman XP jwèt yo')} />
                <Leaderboard variant="full" max={25} periodToggle />
              </section>
            </>
          )}

          {tab === 'historique' && (
            <>
              <section className="gx-card">
                <h2 className="gx-card__title">{t('Tes meilleurs scores', 'Pi bon nòt ou')}</h2>
                {isAuthed ? (
                  <ul className="gx-records">
                    {arcadeGames.map((g) => {
                      const Icon = GAME_ICONS[g.id];
                      const hs = highScores[g.id];
                      return (
                        <li key={g.id} style={{ ['--game-color' as any]: g.color }}>
                          <span className="pf-tile pf-tile--sm game-records__tile" aria-hidden="true"><Icon size={14} /></span>
                          <span className="gx-records__name">{isCreole ? g.nameHt : g.name}</span>
                          {hs != null
                            ? <strong>{hs}</strong>
                            : <button type="button" className="gx-link" onClick={() => navigate(`/jeux/${g.id}`)}>{t('Pas encore joué →', 'Poko jwe →')}</button>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="gx-card__text">{t('Connecte-toi pour garder tes records.', 'Konekte pou kenbe rekò ou.')}</p>
                )}
                <p className="gx-card__foot">
                  {t('Tes erreurs de quiz et d’exercices t’attendent dans la révision.', 'Erè quiz ak egzèsis ou yo ap tann ou nan revizyon an.')}
                  {' '}<Link to="/revision">{t('Réviser mes erreurs', 'Revize erè mwen')} →</Link>
                </p>
              </section>
              <GameRecords isCreole={isCreole} />
            </>
          )}
        </div>

        {/* ── Right column: tournament, the league, today's quests ───────── */}
        <aside className="gx-side">
          {/* On the Tournois tab the panel already carries the Arène status and
              the full school board; the side keeps only the quests there. */}
          {tab !== 'tournois' && (<>
          <section className="gx-card gx-card--event">
            <div className="gx-card__row">
              <span className="gx-tag gx-tag--navy">{t('Événement national', 'Evènman nasyonal')}</span>
              {arena?.state === 'doors' && <span className="gx-live">{t('En direct', 'An dirèk')}</span>}
            </div>
            <h3 className="gx-card__title gx-card__title--sm">{arenaTitle || t('La finale des écoles', 'Final lekòl yo')}</h3>
            <p className="gx-card__text">
              {arena
                ? (arenaDate
                  ? t(`Le ${arenaDate}. Inscris ton école ici, joue dans l’application.`, `${arenaDate}. Enskri lekòl ou isit la, jwe nan aplikasyon an.`)
                  : t('Inscris ton école ici, joue dans l’application.', 'Enskri lekòl ou isit la, jwe nan aplikasyon an.'))
                : t('La prochaine finale sera annoncée ici.', 'N ap anonse pwochen final la isit la.')}
            </p>
            <Link to="/arena" className="gx-btn gx-btn--block">{arena ? t('Réserver ma place', 'Rezève plas mwen') : t('Voir l’Arène', 'Gade Arèn nan')}</Link>
          </section>
          <SchoolRanking max={5} />
          </>)}
          <DailyQuests />
        </aside>
      </div>
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
