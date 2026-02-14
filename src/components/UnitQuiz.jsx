import React, { useEffect, useMemo, useState } from 'react';
import DirectBankQuiz from './DirectBankQuiz';
import { trackQuizAttempt, markLessonComplete } from '../services/progressTracking';
import { toDirectItemFromRow } from '../services/quizBank';
import { useAppData } from '../hooks/useData';
import { shuffleArray } from '../utils/shared';
import useStore from '../contexts/store';

export default function UnitQuiz({ subjectCode, unitId, chapterNumber, subchapterNumber, courseId, lessonId, onClose }) {
  const { data: appData } = useAppData();
  const { user } = useStore();
  const quizBank = appData?.quizBank;
  const TOTAL = 10;

  const rows = useMemo(() => {
    if (!quizBank || !subjectCode) return [];
    
    let unitRows = [];
    
    if (chapterNumber != null) {
      const unitKey = `${subjectCode}|U${chapterNumber}`;
      unitRows = (quizBank.byUnit?.[unitKey] || []).slice();
    } else if (unitId) {
      const key = `${subjectCode}|${unitId}`;
      unitRows = (quizBank.byUnit?.[key] || []).slice();
    }
    
    // If still no rows and we have chapterNumber, try filtering by Chapter_Number field
    if (unitRows.length === 0 && chapterNumber != null) {
      const subjectRows = (quizBank.bySubject?.[subjectCode] || []).slice();
      
      unitRows = subjectRows.filter((row) => {
        const chapterField = row.Chapter_Number || row.chapter_number || row.chapterNo || row.chapter || '';
        const chapterStr = String(chapterField).trim();
        
        if (chapterStr === String(chapterNumber)) return true;
        
        const dotMatch = chapterStr.match(/^(\d+)[\.-]/);
        if (dotMatch && dotMatch[1] === String(chapterNumber)) return true;
        
        return false;
      });
    }
    
    // Filter by subchapter if provided (for video-specific practice)
    if (subchapterNumber != null && unitRows.length > 0) {
      unitRows = unitRows.filter((row) => {
        const subchapterField = row.Subchapter_Number || row.subchapter_number || row.subchapterNo || '';
        const subchapterStr = String(subchapterField).trim();
        return subchapterStr && subchapterStr === String(subchapterNumber);
      });
    }
    
    // Shuffle and cap at 10 questions
    return shuffleArray(unitRows).slice(0, TOTAL);
  }, [quizBank, subjectCode, unitId, chapterNumber, subchapterNumber]);

  const items = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => toDirectItemFromRow(r));
  }, [rows]);

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setIdx(0);
    setScore(0);
    setCanAdvance(false);
    setFinished(false);
  }, [subjectCode, unitId]);

  // Track quiz completion
  useEffect(() => {
    if (finished && user?.uid && courseId && items.length > 0) {
      const quizId = `${subjectCode}-U${chapterNumber}${subchapterNumber ? `-L${subchapterNumber}` : ''}`;
      const percentage = (score / items.length) * 100;
      
      trackQuizAttempt(user.uid, courseId, quizId, {
        score,
        totalQuestions: items.length,
        percentage,
        timeSpent: 0 // Could track this with a timer if needed
      }).catch(err => {
        console.error('[UnitQuiz] Error tracking quiz attempt:', err);
      });

      // Mark lesson as complete if score is 60% or better and lessonId is provided
      if (percentage >= 60 && lessonId) {
        markLessonComplete(user.uid, courseId, lessonId).catch(err => {
          console.error('[UnitQuiz] Error marking lesson complete:', err);
        });
      }
    }
  }, [finished, user?.uid, courseId, score, items.length, subjectCode, chapterNumber, subchapterNumber, lessonId]);

  const handleScore = (evt) => {
    if (!evt) return;
    if (evt.message === 'correct' && !canAdvance) {
      setScore((s) => s + 1);
      setCanAdvance(true);
    } else if (evt.message === 'exhausted_attempts') {
      setCanAdvance(true);
    }
  };

  const goNext = () => {
    if (!canAdvance) return;
    const next = idx + 1;
    if (next >= items.length) {
      setFinished(true);
    } else {
      setIdx(next);
      setCanAdvance(false);
    }
  };

  if (!subjectCode) {
    return (
      <div className="card">
        <h3>Unit Quiz</h3>
        <p className="text-muted">Choose a course and unit to start a 10-question quiz.</p>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="card" style={{ padding: '1rem' }}>
        <div className="quiz-card__header" style={{ marginBottom: '0.5rem' }}>
          <div className="quiz-card__title">
            <span className="quiz-card__label">Unit Quiz</span>
            <h3 className="quiz-card__heading">Results</h3>
          </div>
        </div>
        <p className="text-muted">You scored <strong>{score}</strong> out of <strong>{items.length || TOTAL}</strong>.</p>
        <div className="quiz-card__controls">
          <button className="button button--primary button--sm" onClick={() => {
            // restart
            setIdx(0);
            setScore(0);
            setCanAdvance(false);
            setFinished(false);
          }}>Retry Quiz</button>
          {onClose && (
            <button className="button button--ghost button--sm" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="card">
        <h3>Unit Quiz</h3>
        <p className="text-muted">
          No questions available for this chapter yet. 
          {chapterNumber && ` (Chapter ${chapterNumber})`}
        </p>
        {process.env.NODE_ENV === 'development' && (
          <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#f5f5f5', fontSize: '0.75rem' }}>
            <strong>Debug Info:</strong><br />
            Subject: {subjectCode}<br />
            Unit ID: {unitId}<br />
            Chapter Number: {chapterNumber || 'none'}<br />
            Questions found: {rows.length}
          </div>
        )}
      </div>
    );
  }

  const current = items[idx];
  const progress = `${idx + 1} / ${items.length}`;

  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div className="quiz-card__header" style={{ marginBottom: '0.5rem' }}>
        <div className="quiz-card__title">
          <span className="quiz-card__label">Unit Quiz</span>
          <h3 className="quiz-card__heading">Question {idx + 1}</h3>
        </div>
        <span className="chip chip--ghost">{progress}</span>
      </div>

      <DirectBankQuiz item={current} onScore={handleScore} />

      <div className="quiz-card__controls">
        <button
          type="button"
          className="button button--primary button--sm"
          onClick={goNext}
          disabled={!canAdvance}
        >
          {idx + 1 >= items.length ? 'Finish' : 'Next'}
        </button>
        {onClose && (
          <button type="button" className="button button--ghost button--sm" onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
}
