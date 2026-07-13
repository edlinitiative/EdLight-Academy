import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { Zap, PenLine, Flame, Trophy, X, Star, Check, RefreshCw, ThumbsUp, Dumbbell, Sparkles, Crown, CalendarCheck, Clock } from 'lucide-react';
import useStore from '../contexts/store';
import { useFocusMode } from '../hooks/useFocusMode';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { useTriviaContent } from '../hooks/useTriviaContent';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { todayStr } from '../services/streakService';
import { GAMES, GAME_ICONS, getGameById } from '../data/games';
import Leaderboard from '../components/Leaderboard';
import VraiFauxGame from '../components/games/VraiFauxGame';
import MemoireGame from '../components/games/MemoireGame';
import MoKacheGame from '../components/games/MoKacheGame';
import CalculGame from '../components/games/CalculGame';
import SuitesGame from '../components/games/SuitesGame';
import './TriviaGames.css';

/* ─── Utility: shuffle an array (Fisher-Yates) ─── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─── Category Selection Screen ─── */
function CategoryPicker({ onSelect, isCreole, categories = TRIVIA_CATEGORIES as any[], questions = TRIVIA_QUESTIONS as Record<string, any[]> }) {
  return (
    <div className="trivia-landing">
      <div className="trivia-landing__header">
        <h1 className="trivia-landing__title">{isCreole ? 'Jwèt Trivia' : 'Jeu Trivia'}</h1>
        <p className="trivia-landing__subtitle">
          {isCreole
            ? 'Chwazi yon kategori pou kòmanse jwe'
            : 'Choisissez une catégorie pour commencer à jouer'}
        </p>
      </div>
      <div className="trivia-landing__grid">
        {categories.map((cat) => {
          const count = (questions[cat.id] || []).length;
          const name = isCreole ? cat.nameHt || cat.name : cat.name;
          return (
            <button
              key={cat.id}
              className="trivia-cat"
              style={{ ['--cat' as any]: cat.color || '#1B6FE0' }}
              onClick={() => onSelect(cat.id)}
              aria-label={`${name} — ${count} ${isCreole ? 'kesyon' : 'questions'}`}
            >
              <span className="trivia-cat__icon" aria-hidden="true">{cat.icon}</span>
              <span className="trivia-cat__name">{name}</span>
              <span className="trivia-cat__count">
                {count} {isCreole ? 'kesyon' : 'questions'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Difficulty / Round Size Picker ─── */
function RoundPicker({ category, onStart, onBack, isCreole, categories = TRIVIA_CATEGORIES as any[], questions = TRIVIA_QUESTIONS as Record<string, any[]> }) {
  const cat = categories.find((c) => c.id === category);
  const total = (questions[category] || []).length;

  const rounds = [
    { count: 10, label: isCreole ? 'Rapid, 10 kesyon' : 'Rapide, 10 questions', icon: <Zap size={18} /> },
    { count: 25, label: isCreole ? 'Mwayen, 25 kesyon' : 'Moyen, 25 questions', icon: <PenLine size={18} /> },
    { count: 50, label: isCreole ? 'Difisil, 50 kesyon' : 'Difficile, 50 questions', icon: <Flame size={18} /> },
    { count: total, label: isCreole ? `Tout, ${total} kesyon` : `Tout, ${total} questions`, icon: <Trophy size={18} /> },
  ].filter((r) => r.count <= total);

  return (
    <div className="trivia-round-picker">
      <button className="trivia-back-btn" onClick={onBack}>
        ← {isCreole ? 'Retounen' : 'Retour'}
      </button>
      <div className="trivia-round-picker__header">
        <span
          className="trivia-round-picker__badge"
          style={{ ['--cat' as any]: cat?.color || '#1B6FE0' }}
          aria-hidden="true"
        >
          {cat?.icon}
        </span>
        <h2>{isCreole ? cat.nameHt : cat.name}</h2>
        <p>{isCreole ? 'Chwazi konbyen kesyon ou vle reponn' : 'Choisissez le nombre de questions'}</p>
      </div>
      <div className="trivia-round-picker__options">
        {rounds.map((r) => (
          <button
            key={r.count}
            className="trivia-round-btn"
            style={{ '--cat-color': cat.color }}
            onClick={() => onStart(r.count)}
          >
            <span className="trivia-round-btn__icon">{r.icon}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Active Game Screen ─── */
function TriviaQuiz({ category, count, onFinish, onBack, isCreole, questions: providedQuestions = null, accentColor = null, categories = TRIVIA_CATEGORIES as any[], questionsMap = TRIVIA_QUESTIONS as Record<string, any[]> }) {
  const cat = categories.find((c) => c.id === category);
  const questions = useMemo(
    () =>
      providedQuestions && providedQuestions.length
        ? providedQuestions
        : shuffle(questionsMap[category] || []).slice(0, count),
    [category, count, providedQuestions, questionsMap],
  );
  const accent = accentColor || cat?.color || '#1B6FE0';

  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const timerRef = useRef(null);

  const q = questions[current];
  const progress = ((current) / questions.length) * 100;

  // Timer logic
  useEffect(() => {
    setTimeLeft(15);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          // Auto-answer wrong on timeout
          setAnswered(true);
          setSelected(-1); // no selection
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [current]);

  const handleSelect = useCallback(
    (idx) => {
      if (answered) return;
      clearInterval(timerRef.current);
      setSelected(idx);
      setAnswered(true);
      if (idx === q.answer) setScore((s) => s + 1);
    },
    [answered, q]
  );

  const handleNext = useCallback(() => {
    if (current + 1 >= questions.length) {
      onFinish(score, questions.length);
      return;
    }
    setCurrent((c) => c + 1);
    setSelected(null);
    setAnswered(false);
  }, [current, questions.length, onFinish, score]);

  const optionClass = (idx) => {
    const base = 'trivia-option';
    if (!answered) return `${base}${selected === idx ? ` ${base}--selected` : ''}`;
    if (idx === q.answer) return `${base} ${base}--correct`;
    if (idx === selected) return `${base} ${base}--wrong`;
    return `${base} ${base}--dimmed`;
  };

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

      <div className="trivia-quiz__timer-ring" data-urgent={timeLeft <= 5 ? 'true' : undefined}>
        <span>{timeLeft}</span>
      </div>

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
        <h2 className="trivia-quiz__question">
          {isCreole ? q.qHt : q.q}
        </h2>
      </div>

      <div className="trivia-quiz__options">
        {q.options.map((opt, idx) => (
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
function TriviaResults({ category, score, total, onReplay, onHome, isCreole, reward = null, accentColor = null, categories = TRIVIA_CATEGORIES as any[] }) {
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
        <h2 className="trivia-results__title">
          {isCreole ? 'Rezilta Ou' : 'Vos Résultats'}
        </h2>
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
                {isCreole ? 'Konekte pou anrejistre XP ou' : 'Connectez-vous pour sauvegarder vos XP'}
              </span>
            )}
          </div>
        )}
        <div className="trivia-results__actions">
          <button className="button button--primary" onClick={onReplay}>
            <RefreshCw size={16} /> {isCreole ? 'Jwe ankò' : 'Rejouer'}
          </button>
          <button className="button button--ghost" onClick={onHome}>
            ← {isCreole ? 'Kategori yo' : 'Catégories'}
          </button>
        </div>
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
            : (isCreole ? '10 kesyon · +50 XP bonis' : '10 questions · +50 XP bonus')}
        </span>
      </span>
      {!done && <span className="trivia-daily__cta">{isCreole ? 'Jwe →' : 'Jouer →'}</span>}
    </button>
  );
}

/* ─── Classic Trivia (the original flow, now one game among six) ─── */
function TriviaClassic({ isCreole, onExitHub }) {
  const location = useLocation();
  const { recordResult, level, daily, isAuthed } = useTrivia();
  const { streak } = useStreak();
  // Merged trivia content (static floor + optional Firestore overlay).
  const { categories, questions } = useTriviaContent();

  // States: 'pick' | 'round' | 'play' | 'results'
  const [screen, setScreen] = useState('pick');
  const [category, setCategory] = useState(null);
  const [roundCount, setRoundCount] = useState(10);
  const [dailyQuestions, setDailyQuestions] = useState([]);
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });
  const [reward, setReward] = useState(null);
  const [playNonce, setPlayNonce] = useState(0);
  const autoStartedRef = useRef(false);

  // While a round is in play, go heads-down: drop the bottom tab bar + footer
  // so the question owns the screen. The in-quiz ✕ button is the way out.
  useFocusMode(screen === 'play');

  const startDaily = useCallback(() => {
    const qs = getDailyChallengeQuestions(questions, todayStr(), 10);
    if (!qs.length) return;
    setDailyQuestions(qs);
    setCategory('daily');
    setRoundCount(qs.length);
    setReward(null);
    setPlayNonce((n) => n + 1);
    setScreen('play');
  }, [questions]);

  // Deep-link from the home "Défi du jour" widget:
  // navigate('/trivia', { state: { startDaily: true } }).
  useEffect(() => {
    if (autoStartedRef.current) return;
    if ((location.state)?.startDaily && !daily.completedToday) {
      autoStartedRef.current = true;
      startDaily();
    }
  }, [location.state, daily.completedToday, startDaily]);

  const handleCategorySelect = (catId) => {
    setCategory(catId);
    setScreen('round');
  };

  const handleStart = (count) => {
    setRoundCount(count);
    setReward(null);
    setPlayNonce((n) => n + 1);
    setScreen('play');
  };

  const handleFinish = useCallback(
    async (score, total) => {
      setFinalScore({ score, total });
      const isDaily = category === 'daily';
      try {
        const r = await recordResult({ category: isDaily ? 'daily' : category, score, total, isDaily });
        setReward(r);
      } catch {
        setReward(null);
      }
      setScreen('results');
    },
    [category, recordResult],
  );

  const handleReplay = () => {
    if (category === 'daily') {
      // Daily is once-a-day — send them back to choose a category.
      setScreen('pick');
      setCategory(null);
      return;
    }
    setScreen('round');
  };

  const handleHome = () => {
    setScreen('pick');
    setCategory(null);
  };

  const handleBack = () => {
    if (screen === 'round') {
      setScreen('pick');
      setCategory(null);
    } else if (screen === 'play') {
      if (category === 'daily') {
        setScreen('pick');
        setCategory(null);
      } else {
        setScreen('round');
      }
    }
  };

  return (
    <div className="trivia-page">
      {screen === 'pick' && (
        <>
          <button className="trivia-back-btn" onClick={onExitHub}>
            ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
          </button>
          {isAuthed && <TriviaHeader level={level} streak={streak} isCreole={isCreole} />}
          <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={startDaily} />
          <CategoryPicker
            onSelect={handleCategorySelect}
            isCreole={isCreole}
            categories={categories}
            questions={questions}
          />
        </>
      )}
      {screen === 'round' && (
        <RoundPicker
          category={category}
          onStart={handleStart}
          onBack={handleBack}
          isCreole={isCreole}
          categories={categories}
          questions={questions}
        />
      )}
      {screen === 'play' && (
        <TriviaQuiz
          key={`${category}-${playNonce}`}
          category={category}
          count={roundCount}
          questions={category === 'daily' ? dailyQuestions : null}
          accentColor={category === 'daily' ? '#f59e0b' : null}
          onFinish={handleFinish}
          onBack={handleBack}
          isCreole={isCreole}
          categories={categories}
          questionsMap={questions}
        />
      )}
      {screen === 'results' && (
        <TriviaResults
          category={category}
          score={finalScore.score}
          total={finalScore.total}
          reward={reward}
          accentColor={category === 'daily' ? '#f59e0b' : null}
          onReplay={handleReplay}
          onHome={handleHome}
          isCreole={isCreole}
          categories={categories}
        />
      )}
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
    <div className="game-records">
      <h3 className="game-records__title">
        <Crown size={15} /> {isCreole ? 'Rekò yo' : 'Records'}
      </h3>
      <ul className="game-records__list">
        {arcade.map((g) => {
          const rec = records[g.id];
          const Icon = GAME_ICONS[g.id];
          return (
            <li key={g.id} className="game-records__row">
              <span className="game-records__game" style={{ color: g.color }}>
                <Icon size={14} /> {isCreole ? g.nameHt : g.name}
              </span>
              {rec ? (
                <span className="game-records__holder">
                  {rec.displayName} · <strong>{rec.score}</strong>
                </span>
              ) : (
                <span className="game-records__open">{isCreole ? 'Poko gen rekò !' : 'À prendre !'}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── Games hub (landing) ─── */
function GamesHub({ isCreole }) {
  const navigate = useNavigate();
  const { profile, level, daily, isAuthed } = useTrivia();
  const { streak } = useStreak();

  const highScores = profile?.games?.highScores || {};
  const gamesPlayed = profile?.games?.gamesPlayed || 0;

  return (
    <div className="games-hub">
      <div className="games-hub__hero">
        <div className="games-hub__hero-text">
          <h1 className="games-hub__title">
            {isCreole ? 'Aprann pandan w ap jwe' : 'Apprenez en jouant'}
          </h1>
          <p className="games-hub__subtitle">
            {isCreole
              ? 'Chak pati fè ou ranmase XP epi monte nan klasman an.'
              : 'Chaque partie vous fait gagner des XP et grimper au classement.'}
          </p>
        </div>
        {isAuthed && (
          <div className="games-hub__stats">
            <div className="games-hub__stat">
              <Zap size={16} />
              <strong>{level.xp}</strong>
              <span>XP · {isCreole ? 'Nivo' : 'Niv.'} {level.level}</span>
            </div>
            <div className="games-hub__stat">
              <Flame size={16} />
              <strong>{streak?.currentStreak || 0}</strong>
              <span>{isCreole ? 'Seri' : 'Série'}</span>
            </div>
            <div className="games-hub__stat">
              <Trophy size={16} />
              <strong>{gamesPlayed}</strong>
              <span>{isCreole ? 'Pati' : 'Parties'}</span>
            </div>
          </div>
        )}
      </div>

      <DailyChallengeBanner
        daily={daily}
        isCreole={isCreole}
        onStart={() => navigate('/jeux/trivia', { state: { startDaily: true } })}
      />

      <div className="games-hub__layout">
        <div className="games-hub__main">
          <div className="games-hub__grid">
            {GAMES.map((g) => {
              const Icon = GAME_ICONS[g.id];
              const hs = highScores[g.id];
              return (
                <button
                  key={g.id}
                  className="game-card"
                  style={{ ['--game-color' as any]: g.color }}
                  onClick={() => navigate(`/jeux/${g.id}`)}
                >
                  <span className="game-card__icon" aria-hidden="true"><Icon size={26} /></span>
                  {hs != null && (
                    <span className="game-card__hs"><Trophy size={11} /> {hs}</span>
                  )}
                  <span className="game-card__name">{isCreole ? g.nameHt : g.name}</span>
                  <span className="game-card__desc">{isCreole ? g.descriptionHt : g.description}</span>
                  <span className="game-card__meta">
                    <Clock size={12} /> ~{g.minutes} min
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <aside className="games-hub__side">
          <Leaderboard variant="full" max={25} periodToggle />
          <GameRecords isCreole={isCreole} />
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
