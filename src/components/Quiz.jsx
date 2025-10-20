import React, { useEffect, useState } from 'react';
import useStore from '../contexts/store';

export function QuizComponent({ quiz, onComplete }) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(null);
  const { recordQuizAttempt } = useStore();

  const normalize = (value) => (value ?? '').toString().trim().toLowerCase();
  const hasRawQuiz = Boolean(quiz);
  const hints = hasRawQuiz ? quiz.hints : [];
  const hasHints = Array.isArray(hints) && hints.length > 0;
  const quizId = hasRawQuiz ? (quiz.id || quiz.quiz_id || quiz.video_id || 'quiz') : null;
  const correctAnswer = hasRawQuiz
    ? (quiz.correct_answer || quiz.correctAnswer || quiz.correct_option || quiz.correctOption || '')
    : '';
  const questionText = hasRawQuiz ? (quiz.question || quiz.prompt || '') : '';
  const explanationText = hasRawQuiz ? (quiz.explanation || quiz.feedback || '') : '';

  const optionEntries = hasRawQuiz && Array.isArray(quiz.options) && quiz.options.length > 0
    ? quiz.options.map((opt, idx) => ({
        value: opt.value || opt.id || String.fromCharCode(65 + idx),
        label: opt.label || opt.text || opt.value || '',
      }))
    : ['a', 'b', 'c', 'd']
        .map((key, idx) => {
          const label = quiz?.[`option_${key}`] || quiz?.[`option_${key.toUpperCase()}`];
          if (!label) return null;
          return {
            value: (quiz?.[`option_${key}_value`] || quiz?.[`option_${key.toUpperCase()}_value`] || key).toString().toUpperCase(),
            label,
            index: idx,
          };
        })
        .filter(Boolean);

  const hasAnswer = normalize(answer).length > 0;

  useEffect(() => {
    setAnswer('');
    setShowHint(0);
    setIsSubmitted(false);
    setWasCorrect(null);
  }, [quizId]);

  const handleSubmit = () => {
    if (!hasAnswer) return;
    const isCorrect = normalize(answer) === normalize(correctAnswer);
    const attempt = {
      date: new Date(),
      score: isCorrect ? 1 : 0,
      answer
    };

    if (quizId) {
      recordQuizAttempt(quizId, attempt);
    }
    setIsSubmitted(true);
    setWasCorrect(isCorrect);
    
    if (onComplete) {
      onComplete(isCorrect);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const renderStatusChip = () => {
    if (!isSubmitted) {
      return <span className="chip chip--ghost">Not answered</span>;
    }

    return wasCorrect
      ? <span className="chip chip--success">✓ Correct</span>
      : <span className="chip chip--danger">Try Again</span>;
  };

  if (!hasRawQuiz) {
    return (
      <div className="card quiz-card">
        <div className="quiz-card__header">
          <div className="quiz-card__title">
            <span className="quiz-card__label">Quick Quiz</span>
            <h3 className="quiz-card__heading">Quiz content unavailable</h3>
          </div>
        </div>
        <p className="text-muted">We couldn&apos;t load this quiz yet. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="card quiz-card">
      <header className="quiz-card__header">
        <div className="quiz-card__title">
          <span className="quiz-card__label">Quick Quiz</span>
          <h3 className="quiz-card__heading">{quiz.title || quiz.name || 'Check your understanding'}</h3>
        </div>
        {renderStatusChip()}
      </header>

      <div className="quiz-card__question">
        <span className="quiz-card__prompt">{questionText}</span>
        {quiz.context && <p className="quiz-card__context">{quiz.context}</p>}
      </div>

      {quiz.type === 'multiple-choice' || optionEntries.length > 0 ? (
        <div className="quiz-card__options">
          {optionEntries.map((option) => (
            <label key={option.value} className="radio-option">
                <input
                  type="radio"
                  name="quiz-answer"
                  value={option.value}
                  checked={answer === option.value}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={isSubmitted}
                />
                <span>{option.label}</span>
              </label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          className="input-field"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter your answer"
          disabled={isSubmitted}
        />
      )}

      {showHint > 0 && hasHints && hints[showHint - 1] && (
        <div className="hint-box">
          <strong>Hint {showHint}:</strong> {hints[showHint - 1]}
        </div>
      )}

      <div className="quiz-card__controls">
        <button
          type="button"
          onClick={handleSubmit}
          className="button button--primary button--sm"
          disabled={!hasAnswer || isSubmitted}
        >
          Check Answer
        </button>
        {!isSubmitted && hasHints && showHint < hints.length && (
          <button
            type="button"
            onClick={() => setShowHint((h) => h + 1)}
            className="button button--ghost button--sm"
            disabled={isSubmitted}
          >
            Need a Hint?
          </button>
        )}
      </div>

      {isSubmitted && (
        <div className="quiz-card__explanation">
          <strong>Explanation:</strong> {explanationText || 'Great effort! Review the solution above before moving on.'}
        </div>
      )}
    </div>
  );
}