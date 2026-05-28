import React, { useState, useMemo } from 'react';
import { useKatex, renderWithKatex } from '../utils/shared';

export default function EssayQuiz({ item, onScore }) {
  const katexReady = useKatex();
  const [textAns, setTextAns] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (textAns.trim().length < 20) {
      alert('Please provide a more detailed answer.');
      return;
    }
    setIsLoading(true);
    setSubmitted(true);
    try {
      const response = await fetch('/api/grade-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: item.stem,
          context: item.context,
          answer: textAns,
          modelAnswer: item.correctText,
        }),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      const result = await response.json();
      setFeedback(result);
      if (onScore) {
        onScore({
          correct: result.isCorrect ? 1 : 0,
          message: result.feedback,
          score: result.score,
        });
      }
    } catch (error) {
      console.error('Error grading essay:', error);
      setFeedback({
        feedback: 'Could not grade this essay automatically. A human will review it.',
        score: 'N/A',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const correctAnswerDisplay = useMemo(() => {
    return item.correctText || '';
  }, [item]);

  return (
    <div className="essay-quiz">
      <div className="quiz-card__header" style={{ marginBottom: '0.5rem' }}>
        <div className="quiz-card__title">
          <span className="quiz-card__label">Essay Question</span>
        </div>
      </div>

      <div className="quiz-card__question" dangerouslySetInnerHTML={renderWithKatex(item.stem, katexReady)} />

      {item.context && (
        <div className="reference-text" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '0.25rem' }}>
          <h5 style={{ marginTop: 0 }}>Reference Text</h5>
          <div dangerouslySetInnerHTML={renderWithKatex(item.context, katexReady)} />
        </div>
      )}

      <textarea
        className="input-field"
        placeholder="Compose your answer here (12-15 lines recommended)..."
        rows="10"
        value={textAns}
        onChange={(e) => setTextAns(e.target.value)}
        disabled={submitted || isLoading}
        style={{ width: '100%', resize: 'vertical' }}
      />

      <div className="quiz-card__controls">
        <button
          type="button"
          className="button button--primary button--sm"
          onClick={handleSubmit}
          disabled={submitted || isLoading || textAns.trim().length === 0}
        >
          {isLoading ? 'Grading...' : (submitted ? 'Submitted' : 'Submit for Grading')}
        </button>
      </div>

      {submitted && feedback && (
        <div className="quiz-card__explanation" style={{ marginTop: '0.75rem' }}>
          <h4>Grading Feedback</h4>
          <p>{feedback.feedback}</p>
          <p><strong>Score:</strong> {feedback.score}</p>
          <hr />
          <div style={{ marginTop: '1rem' }}>
            <strong>Model Answer:</strong>
            <div dangerouslySetInnerHTML={renderWithKatex(correctAnswerDisplay, katexReady)} />
          </div>
        </div>
      )}
    </div>
  );
}
