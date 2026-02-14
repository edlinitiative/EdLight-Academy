import React, { useEffect, useMemo, useState } from 'react';
import { useKatex, renderWithKatex } from '../utils/shared';

export default function DirectBankQuiz({ item, onScore }) {
  const katexReady = useKatex();
  const [selected, setSelected] = useState(null);
  const [textAns, setTextAns] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  useEffect(() => {
    setSelected(null);
    setTextAns('');
    setSubmitted(false);
    setCorrect(null);
    setAttempts(0);
  }, [item]);

  const handleCheck = () => {
    let isCorrect = false;
    if (item.kind === 'mcq' || item.kind === 'tf') {
      if (selected === null) return;
      isCorrect = selected === item.correctIndex;
    } else {
      const norm = (s) => String(s || '').trim().toLowerCase();
      isCorrect = norm(textAns) === norm(item.correctText);
    }
    if (isCorrect) {
      setSubmitted(true);
      setCorrect(true);
      if (onScore) onScore({ correct: 1, message: 'correct' });
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    if (next >= maxAttempts) {
      setSubmitted(true);
      setCorrect(false);
      if (onScore) onScore({ correct: 0, message: 'exhausted_attempts' });
    } else {
      // allow another try without submitting
      setCorrect(false);
      if (onScore) onScore({ correct: 0, message: `attempt_${next}` });
    }
  };

  const Status = () => {
    if (!submitted) {
      const left = maxAttempts - attempts;
      return <span className="chip chip--ghost">{left} {left === 1 ? 'try' : 'tries'} left</span>;
    }
    return correct ? <span className="chip chip--success">✓ Correct</span> : <span className="chip chip--danger">Out of tries</span>;
  };

  const hintToShow = !submitted && attempts > 0 && Array.isArray(item.hints) ? item.hints[Math.min(attempts - 1, item.hints.length - 1)] : '';
  const correctAnswerDisplay = useMemo(() => {
    if (item.kind === 'mcq' || item.kind === 'tf') return item.correctLabel ?? (Array.isArray(item.options) ? item.options[item.correctIndex] : '');
    return item.correctText || '';
  }, [item]);

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div className="quiz-card__header" style={{ marginBottom: '0.5rem' }}>
        <div className="quiz-card__title">
          <span className="quiz-card__label">Curriculum Practice</span>
        </div>
        <Status />
      </div>

      <div className="quiz-card__question" dangerouslySetInnerHTML={renderWithKatex(item.stem, katexReady)} />

      {(item.kind === 'mcq' || item.kind === 'tf') ? (
        <div className="quiz-card__options">
          {item.options.map((label, idx) => (
            <label key={idx} className="radio-option">
              <input
                type="radio"
                name="bank-answer"
                value={idx}
                checked={selected === idx}
                onChange={() => setSelected(idx)}
                disabled={submitted}
              />
              <span dangerouslySetInnerHTML={renderWithKatex(label, katexReady)} />
            </label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          className="input-field"
          placeholder="Enter your answer"
          value={textAns}
          onChange={(e) => setTextAns(e.target.value)}
          disabled={submitted}
        />
      )}

      {hintToShow && (
        <div className="hint-box" style={{ margin: '0.5rem 0' }}>
          <strong>Hint:</strong> <span dangerouslySetInnerHTML={renderWithKatex(hintToShow, katexReady)} />
        </div>
      )}

      <div className="quiz-card__controls">
        <button
          type="button"
          className="button button--primary button--sm"
          onClick={handleCheck}
          disabled={submitted || ((item.kind === 'mcq' || item.kind === 'tf') ? selected === null : textAns.trim().length === 0)}
        >
          {submitted ? 'Answered' : (attempts > 0 ? 'Try Again' : 'Check Answer')}
        </button>
      </div>

      {submitted && (
        <div className="quiz-card__explanation" style={{ marginTop: '0.75rem' }}>
          {correct ? (
            <div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Correct!</strong> {correctAnswerDisplay ? (
                  <>
                    {' '}<em>Answer:</em> <span dangerouslySetInnerHTML={renderWithKatex(correctAnswerDisplay, katexReady)} />
                  </>
                ) : null}
              </div>
              {item.good && (
                <div><strong>Explanation:</strong> <span dangerouslySetInnerHTML={renderWithKatex(item.good, katexReady)} /></div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Correct answer:</strong> <span dangerouslySetInnerHTML={renderWithKatex(correctAnswerDisplay, katexReady)} />
              </div>
              {(item.good || item.wrong) && (
                <div><strong>Explanation:</strong> <span dangerouslySetInnerHTML={renderWithKatex(item.good || item.wrong, katexReady)} /></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
