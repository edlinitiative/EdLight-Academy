import React, { useEffect, useMemo, useState } from 'react';
import { useKatex, renderWithKatex } from '../utils/shared';
import EssayQuiz from './EssayQuiz';
import { useTranslation } from 'react-i18next';

export default function DirectBankQuiz({ item, onScore }) {
  const { t } = useTranslation();
  const katexReady = useKatex();
  const [selected, setSelected] = useState(null);
  const [textAns, setTextAns] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const maxAttempts = 3;

  const derivedHints = useMemo(() => {
    const base = Array.isArray(item?.hints) ? item.hints.filter(Boolean) : [];
    if (base.length > 0) return base;
    const fallback = [];
    // Use feedback fields as progressive hints when structured hints are missing
    if (item?.wrong) fallback.push(item.wrong);
    if (item?.good && item.good !== item.wrong) fallback.push(item.good);
    return fallback;
  }, [item]);

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
      const target = norm(item.correctText);
      const alt = Array.isArray(item.alternatives) ? item.alternatives.map(norm).filter(Boolean) : [];
      isCorrect = norm(textAns) === target || alt.includes(norm(textAns));
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
      return <span className="chip chip--ghost">{t('quizzes.triesLeft', '{{count}} essai restant', { count: left })}</span>;
    }
    return correct
      ? <span className="chip chip--success">✓ {t('quizzes.correctChip', 'Correct')}</span>
      : <span className="chip chip--danger">{t('quizzes.outOfTries', 'Plus d\'essais')}</span>;
  };

  const hintToShow = !submitted && attempts > 0 && derivedHints.length
    ? derivedHints[Math.min(attempts - 1, derivedHints.length - 1)]
    : '';
  const correctAnswerDisplay = useMemo(() => {
    if (item.kind === 'mcq' || item.kind === 'tf') return item.correctLabel ?? (Array.isArray(item.options) ? item.options[item.correctIndex] : '');
    return item.correctText || '';
  }, [item]);

  if (item.kind === 'essay') {
    return <EssayQuiz item={item} onScore={onScore} />;
  }

  return (
    <div className="direct-bank-quiz">
      <div className="quiz-card__header" style={{ marginBottom: '0.5rem' }}>
        <div className="quiz-card__title">
          <span className="quiz-card__label">{t('quizzes.curriculumPractice', 'Exercices du programme')}</span>
        </div>
        <Status />
      </div>

      <div className="quiz-card__question" dangerouslySetInnerHTML={renderWithKatex(item.stem, katexReady)} />

      {item.context ? (
        <div className="hint-box" style={{ margin: '0.5rem 0' }}>
          <strong>{t('quizzes.context', 'Contexte')}:</strong> <span dangerouslySetInnerHTML={renderWithKatex(item.context, katexReady)} />
        </div>
      ) : null}

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
        <div className="exam-take__short-answer-wrap">
          <textarea
            className="exam-take__short-answer-input"
            placeholder={t('quizzes.writeAnswerHere', 'Écrivez votre réponse ici…')}
            value={textAns}
            onChange={(e) => setTextAns(e.target.value)}
            disabled={submitted}
            rows={3}
          />
          <div className="exam-take__short-answer-wordcount">
            {(() => {
              const wc = (textAns || '').trim().split(/\s+/).filter(Boolean).length;
              return t('quizzes.wordCount', '{{count}} mot', { count: wc });
            })()}
          </div>
        </div>
      )}

      {hintToShow && (
        <div className="hint-box" style={{ margin: '0.5rem 0' }}>
          <strong>{t('quizzes.hint', 'Indice')}:</strong> <span dangerouslySetInnerHTML={renderWithKatex(hintToShow, katexReady)} />
        </div>
      )}

      <div className="quiz-card__controls">
        <button
          type="button"
          className="button button--primary button--sm"
          onClick={handleCheck}
          disabled={submitted || ((item.kind === 'mcq' || item.kind === 'tf') ? selected === null : textAns.trim().length === 0)}
        >
          {submitted
            ? t('quizzes.answered', 'Répondu')
            : (attempts > 0 ? t('quizzes.tryAgain', 'Réessayer') : t('quizzes.check', 'Vérifier'))}
        </button>
      </div>

      {submitted && (
        <div className="quiz-card__explanation" style={{ marginTop: '0.75rem' }}>
          {correct ? (
            <div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>{t('quizzes.correct', 'Correct !')}</strong> {correctAnswerDisplay ? (
                  <>
                    {' '}<em>{t('quizzes.answerLabel', 'Réponse')}:</em> <span dangerouslySetInnerHTML={renderWithKatex(correctAnswerDisplay, katexReady)} />
                  </>
                ) : null}
              </div>
              {item.good && (
                <div><strong>{t('quizzes.explanation', 'Explication')}:</strong> <span dangerouslySetInnerHTML={renderWithKatex(item.good, katexReady)} /></div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>{t('quizzes.correctAnswerLabel', 'Bonne réponse')}:</strong> <span dangerouslySetInnerHTML={renderWithKatex(correctAnswerDisplay, katexReady)} />
              </div>
              {(item.good || item.wrong) && (
                <div><strong>{t('quizzes.explanation', 'Explication')}:</strong> <span dangerouslySetInnerHTML={renderWithKatex(item.good || item.wrong, katexReady)} /></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
