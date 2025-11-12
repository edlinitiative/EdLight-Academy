import React, { useState, useMemo } from 'react';
import { useAppData } from '../hooks/useData';

export default function FlashcardDeck({ subjectCode, chapterNumber, subchapterNumber, onClose }) {
  const { data: appData } = useAppData();
  const quizBank = appData?.quizBank;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState(new Set());
  const [difficultCards, setDifficultCards] = useState(new Set());

  // Get quiz questions for flashcards
  const flashcards = useMemo(() => {
    if (!quizBank || !subjectCode) return [];

    let questions = [];
    
    if (chapterNumber != null) {
      const unitKey = `${subjectCode}|U${chapterNumber}`;
      questions = (quizBank.byUnit?.[unitKey] || []).slice();
      
      if (questions.length === 0 && quizBank.bySubject) {
        const subjectRows = (quizBank.bySubject[subjectCode] || []).slice();
        questions = subjectRows.filter(row => {
          const rowChapter = row.Chapter_Number || row.chapter_number || row.unit;
          return String(rowChapter) === String(chapterNumber);
        });
      }
    }

    // Filter by subchapter if provided
    if (subchapterNumber != null && questions.length > 0) {
      questions = questions.filter(row => {
        const rowSubchapter = row.Subchapter_Number || row.subchapter_number || row.lesson_no;
        return String(rowSubchapter) === String(subchapterNumber);
      });
    }

    // Convert to flashcard format
    return questions.map((q, idx) => {
      // Parse options if they're JSON string
      let options = [];
      if (typeof q.options === 'string') {
        try {
          options = JSON.parse(q.options);
        } catch (e) {
          // Fallback to individual option fields
          options = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
        }
      } else if (Array.isArray(q.options)) {
        options = q.options;
      } else {
        options = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean);
      }

      const correctAnswer = q.correct_answer || q.correctAnswer || 'A';
      const correctIndex = correctAnswer.charCodeAt(0) - 65; // 'A' -> 0, 'B' -> 1, etc.
      const correctText = options[correctIndex] || options[0] || 'No answer available';

      return {
        id: q.id || q.quiz_id || idx,
        question: q.question,
        answer: correctText,
        hint: q.hint,
        explanation: q.good_response || q.wrong_response,
        allOptions: options,
      };
    });
  }, [quizBank, subjectCode, chapterNumber, subchapterNumber]);

  if (!flashcards || flashcards.length === 0) {
    return (
      <div className="flashcard-deck">
        <div className="flashcard-deck__header">
          <h3>Flashcards</h3>
          <button className="button button--ghost button--sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flashcard-empty">
          <p className="text-muted">No flashcards available for this section.</p>
        </div>
      </div>
    );
  }

  const currentCard = flashcards[currentIndex];
  const progress = currentIndex + 1;
  const total = flashcards.length;
  const isMastered = masteredCards.has(currentCard.id);
  const isDifficult = difficultCards.has(currentCard.id);

  const goNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  };

  const goPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  };

  const toggleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const markMastered = () => {
    setMasteredCards(prev => {
      const next = new Set(prev);
      next.add(currentCard.id);
      return next;
    });
    // Remove from difficult if it was there
    setDifficultCards(prev => {
      const next = new Set(prev);
      next.delete(currentCard.id);
      return next;
    });
  };

  const markDifficult = () => {
    setDifficultCards(prev => {
      const next = new Set(prev);
      next.add(currentCard.id);
      return next;
    });
    // Remove from mastered if it was there
    setMasteredCards(prev => {
      const next = new Set(prev);
      next.delete(currentCard.id);
      return next;
    });
  };

  const shuffle = () => {
    // Fisher-Yates shuffle
    const indices = flashcards.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  return (
    <div className="flashcard-deck">
      <div className="flashcard-deck__header">
        <div>
          <h3>Flashcards</h3>
          <p className="text-muted">
            Card {progress} of {total} • {masteredCards.size} mastered • {difficultCards.size} to review
          </p>
        </div>
        <div className="flashcard-deck__actions">
          <button className="button button--ghost button--sm" onClick={shuffle} title="Shuffle cards">
            🔀 Shuffle
          </button>
          <button className="button button--ghost button--sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="flashcard-container">
        <div 
          className={`flashcard ${isFlipped ? 'flashcard--flipped' : ''} ${isMastered ? 'flashcard--mastered' : ''} ${isDifficult ? 'flashcard--difficult' : ''}`}
          onClick={toggleFlip}
        >
          <div className="flashcard__inner">
            <div className="flashcard__front">
              <div className="flashcard__label">Question</div>
              <div className="flashcard__content">
                {currentCard.question}
              </div>
              <div className="flashcard__hint-text">💡 Click to reveal answer</div>
            </div>
            <div className="flashcard__back">
              <div className="flashcard__label">Answer</div>
              <div className="flashcard__content flashcard__content--answer">
                {currentCard.answer}
              </div>
              {currentCard.hint && (
                <div className="flashcard__hint">
                  <strong>Hint:</strong> {currentCard.hint}
                </div>
              )}
              {currentCard.explanation && (
                <div className="flashcard__explanation">
                  <strong>Explanation:</strong> {currentCard.explanation}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flashcard-controls">
          <button 
            className="button button--ghost"
            onClick={goPrevious}
            disabled={currentIndex === 0}
          >
            ← Previous
          </button>

          <div className="flashcard-controls__rating">
            <button 
              className={`button button--sm ${isDifficult ? 'button--danger' : 'button--ghost'}`}
              onClick={markDifficult}
              title="Mark as difficult to review later"
            >
              😕 Hard
            </button>
            <button 
              className={`button button--sm ${isMastered ? 'button--success' : 'button--ghost'}`}
              onClick={markMastered}
              title="Mark as mastered"
            >
              ✓ Got it!
            </button>
          </div>

          <button 
            className="button button--ghost"
            onClick={goNext}
            disabled={currentIndex === flashcards.length - 1}
          >
            Next →
          </button>
        </div>

        <div className="flashcard-progress">
          <div 
            className="flashcard-progress__bar"
            style={{ width: `${(progress / total) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
