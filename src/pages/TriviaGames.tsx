import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, PenLine, Flame, Trophy, X, Star, Check, RefreshCw, ThumbsUp, Dumbbell } from 'lucide-react';
import useStore from '../contexts/store';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
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
      <header className="trivia-landing__header">
        <span className="trivia-landing__eyebrow">
          {isCreole ? 'Jeu Edikasyon' : 'Jeux Éducatifs'}
        </span>
        <h1 className="trivia-landing__title">
          {isCreole ? 'Trivia, Teste Konesans Ou' : 'Trivia, Testez vos connaissances'}
        </h1>
        <p className="trivia-landing__subtitle">
          {isCreole
            ? 'Chwazi yon kategori epi reponn kesyon yo pou vin pi entelijan!'
            : 'Choisissez une catégorie et répondez aux questions pour apprendre en vous amusant !'}
        </p>
      </header>

      <div className="trivia-landing__grid">
        {TRIVIA_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className="trivia-cat-card"
            onClick={() => onSelect(cat.id)}
            aria-label={`${isCreole ? cat.nameHt : cat.name} — ${TRIVIA_QUESTIONS[cat.id].length} ${isCreole ? 'kesyon' : 'questions'}`}
          >
            <div className="trivia-cat-card__media">
              <img
                className="trivia-cat-card__img"
                src={cat.image}
                alt=""
                width={400}
                height={225}
                loading="lazy"
                decoding="async"
              />
              <h2 className="trivia-cat-card__title">{isCreole ? cat.nameHt : cat.name}</h2>
            </div>
            <div className="trivia-cat-card__body">
              <p className="trivia-cat-card__desc">{isCreole ? cat.descriptionHt : cat.description}</p>
            </div>
            <div className="trivia-cat-card__footer">
              <span className="trivia-cat-card__count">
                {TRIVIA_QUESTIONS[cat.id].length} {isCreole ? 'kesyon' : 'questions'}
              </span>
              <span className="trivia-cat-card__cta">
                {isCreole ? 'Jwe →' : 'Jouer →'}
              </span>
            </div>
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
function TriviaQuiz({ category, count, onFinish, onBack, isCreole }) {
  const cat = TRIVIA_CATEGORIES.find((c) => c.id === category);
  const questions = useMemo(() => shuffle(TRIVIA_QUESTIONS[category]).slice(0, count), [category, count]);

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
    <div className="trivia-quiz" style={{ '--cat-color': cat.color }}>
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
function TriviaResults({ category, score, total, onReplay, onHome, isCreole }) {
  const cat = TRIVIA_CATEGORIES.find((c) => c.id === category);
  const pct = Math.round((score / total) * 100);

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
    <div className="trivia-results" style={{ '--cat-color': cat.color }}>
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
        <div className="trivia-results__actions">
          <button className="button button--primary button--pill" onClick={onReplay}>
            <RefreshCw size={16} /> {isCreole ? 'Jwe ankò' : 'Rejouer'}
          </button>
          <button className="button button--ghost button--pill" onClick={onHome}>
            ← {isCreole ? 'Kategori yo' : 'Catégories'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Trivia Page ─── */
export default function TriviaGames() {
  const { language } = useStore();
  const isCreole = language === 'ht';

  // States: 'pick' | 'round' | 'play' | 'results'
  const [screen, setScreen] = useState('pick');
  const [category, setCategory] = useState(null);
  const [roundCount, setRoundCount] = useState(10);
  const [finalScore, setFinalScore] = useState({ score: 0, total: 0 });

  const handleCategorySelect = (catId) => {
    setCategory(catId);
    setScreen('round');
  };

  const handleStart = (count) => {
    setRoundCount(count);
    setScreen('play');
  };

  const handleFinish = (score, total) => {
    setFinalScore({ score, total });
    setScreen('results');
  };

  const handleReplay = () => {
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
      setScreen('round');
    }
  };

  return (
    <div className="trivia-page">
      {screen === 'pick' && (
        <CategoryPicker onSelect={handleCategorySelect} isCreole={isCreole} />
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
          key={`${category}-${roundCount}-${Date.now()}`}
          category={category}
          count={roundCount}
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
          onReplay={handleReplay}
          onHome={handleHome}
          isCreole={isCreole}
        />
      )}
    </div>
  );
}
