import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Zap, PenLine, Flame, Trophy, X, Star, Check, RefreshCw, ThumbsUp, Dumbbell, Sparkles, Crown, CalendarCheck } from 'lucide-react';
import useStore from '../contexts/store';
import { useFocusMode } from '../hooks/useFocusMode';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { getDailyChallengeQuestions } from '../utils/dailyChallenge';
import { todayStr } from '../services/streakService';
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
function CategoryPicker({ onSelect, isCreole }) {
  return (
    <div className="trivia-landing">
      <div className="trivia-landing__header">
        <h1 className="trivia-landing__title">{isCreole ? 'Jèt Trivia' : 'Jeu Trivia'}</h1>
        <p className="trivia-landing__subtitle">
          {isCreole ? 'Chwazi yon kategori' : 'Choisissez une catégorie'}
        </p>
      </div>
      <div className="trivia-landing__grid">
        {TRIVIA_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className="trivia-cat-tile"
            onClick={() => onSelect(cat.id)}
            aria-label={`${isCreole ? cat.nameHt : cat.name} — ${TRIVIA_QUESTIONS[cat.id].length} ${isCreole ? 'kesyon' : 'questions'}`}
          >
            <span className="trivia-cat-tile__media">
              <img
                className="trivia-cat-tile__img"
                src={cat.image}
                alt=""
                width={200}
                height={200}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.style.display = 'none';
                  const fallback = img.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <span className="trivia-cat-tile__emoji" aria-hidden style={{ display: 'none' }}>
                {cat.icon}
              </span>
            </span>
            <span className="trivia-cat-tile__title">{isCreole ? cat.nameHt : cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Difficulty / Round Size Picker ─── */
function RoundPicker({ category, onStart, onBack, isCreole }) {
  const cat = TRIVIA_CATEGORIES.find((c) => c.id === category);
  const total = TRIVIA_QUESTIONS[category].length;

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
        <img className="trivia-round-picker__thumb" src={cat.image} alt="" width={400} height={225} />
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
function TriviaQuiz({ category, count, onFinish, onBack, isCreole, questions: providedQuestions = null, accentColor = null }) {
  const cat = TRIVIA_CATEGORIES.find((c) => c.id === category);
  const questions = useMemo(
    () =>
      providedQuestions && providedQuestions.length
        ? providedQuestions
        : shuffle(TRIVIA_QUESTIONS[category] || []).slice(0, count),
    [category, count, providedQuestions],
  );
  const accent = accentColor || cat?.color || '#0A66C2';

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
        <button className="trivia-back-btn trivia-back-btn--sm" onClick={onBack}>
          <X size={18} />
        </button>
        <div className="trivia-quiz__progress-wrap">
          <div className="trivia-quiz__progress-bar">
            <div className="trivia-quiz__progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="trivia-quiz__counter">
            {current + 1} / {questions.length}
          </span>
        </div>
        <div className="trivia-quiz__score-badge">
          <Star size={16} /> {score}
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
            <span className="trivia-option__letter">
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
function TriviaResults({ category, score, total, onReplay, onHome, isCreole, reward = null, accentColor = null }) {
  const cat = TRIVIA_CATEGORIES.find((c) => c.id === category);
  const accent = accentColor || cat?.color || '#0A66C2';
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
                {isCreole ? 'Konekte pou sove XP ou' : 'Connectez-vous pour sauvegarder vos XP'}
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

/* ─── Main Trivia Page ─── */
export default function TriviaGames() {
  const { language } = useStore();
  const isCreole = language === 'ht';
  const location = useLocation();
  const { recordResult, level, daily, isAuthed } = useTrivia();
  const { streak } = useStreak();

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
    const qs = getDailyChallengeQuestions(TRIVIA_QUESTIONS, todayStr(), 10);
    if (!qs.length) return;
    setDailyQuestions(qs);
    setCategory('daily');
    setRoundCount(qs.length);
    setReward(null);
    setPlayNonce((n) => n + 1);
    setScreen('play');
  }, []);

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
          {isAuthed && <TriviaHeader level={level} streak={streak} isCreole={isCreole} />}
          <DailyChallengeBanner daily={daily} isCreole={isCreole} onStart={startDaily} />
          <CategoryPicker onSelect={handleCategorySelect} isCreole={isCreole} />
        </>
      )}
      {screen === 'round' && (
        <RoundPicker
          category={category}
          onStart={handleStart}
          onBack={handleBack}
          isCreole={isCreole}
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
        />
      )}
    </div>
  );
}
