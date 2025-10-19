import React, { useState } from 'react';
import useStore from '../contexts/store';

export function QuizComponent({ quiz, onComplete }) {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { recordQuizAttempt } = useStore();

  const handleSubmit = () => {
    if (!answer) return;
    
    const isCorrect = answer.toLowerCase() === quiz.correct_answer.toLowerCase();
    const attempt = {
      date: new Date(),
      score: isCorrect ? 1 : 0,
      answer
    };

    recordQuizAttempt(quiz.id, attempt);
    setIsSubmitted(true);
    
    if (onComplete) {
      onComplete(isCorrect);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="card" style={{ padding: '2rem', maxWidth: '600px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3>Quick Quiz</h3>
        <div className="text-small">
          {isSubmitted ? (
            <span className={answer === quiz.correct_answer ? "text-success" : "text-danger"}>
              {answer === quiz.correct_answer ? "✓ Correct" : "✕ Try Again"}
            </span>
          ) : (
            <span className="text-gray">Not answered</span>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '1.25rem', marginBottom: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
          <strong>Question:</strong> {quiz.question}
        </div>
        
        {quiz.type === 'multiple-choice' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {['a', 'b', 'c', 'd'].map(option => 
              quiz[`option_${option}`] && (
                <label key={option} className="radio-option">
                  <input
                    type="radio"
                    name="quiz-answer"
                    value={option.toUpperCase()}
                    checked={answer === option.toUpperCase()}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={isSubmitted}
                  />
                  <span>{quiz[`option_${option}`]}</span>
                </label>
              )
            )}
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

        {showHint > 0 && quiz.hints && quiz.hints[showHint - 1] && (
          <div className="hint-box">
            <strong>Hint {showHint}:</strong> {quiz.hints[showHint - 1]}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={handleSubmit} 
          className="btn"
          disabled={!answer || isSubmitted}
        >
          Check Answer
        </button>
        {!isSubmitted && quiz.hints && showHint < quiz.hints.length && (
          <button 
            onClick={() => setShowHint(h => h + 1)}
            className="btn-outline"
            disabled={isSubmitted}
          >
            Need a Hint?
          </button>
        )}
      </div>
      
      {isSubmitted && (
        <div className="text-small" style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
          <strong>Explanation:</strong> {quiz.explanation}
        </div>
      )}
    </div>
  );
}