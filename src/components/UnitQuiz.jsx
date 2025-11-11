import React, { useEffect, useMemo, useState } from 'react';
import DirectBankQuiz from './DirectBankQuiz';

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function UnitQuiz({ subjectCode, unitId, chapterNumber, onClose }) {
  const { data: appData } = require('../hooks/useData').useAppData();
  const quizBank = appData?.quizBank;
  const TOTAL = 10;

  const rows = useMemo(() => {
    if (!quizBank || !subjectCode) return [];
    
    console.log(`[UnitQuiz] Input params:`, { subjectCode, unitId, chapterNumber });
    
    // Build the unit key for quizBank lookup
    // quizBank.byUnit uses keys like "CHEM-NSI|U1" where U1 comes from unit_no
    // If we have chapterNumber (unit_no), use it to build the key
    let unitRows = [];
    
    if (chapterNumber != null) {
      // Use chapterNumber (unit_no) to build the correct key
      const unitKey = `${subjectCode}|U${chapterNumber}`;
      unitRows = (quizBank.byUnit?.[unitKey] || []).slice();
      console.log(`[UnitQuiz] Looking for questions with key: ${unitKey}, found: ${unitRows.length}`);
      
      // Debug: show available keys
      if (unitRows.length === 0 && quizBank.byUnit) {
        const availableKeys = Object.keys(quizBank.byUnit).filter(k => k.startsWith(subjectCode));
        console.log(`[UnitQuiz] Available keys for ${subjectCode}:`, availableKeys);
      }
    } else if (unitId) {
      // Fallback to unitId if provided (might not match quizBank format)
      const key = `${subjectCode}|${unitId}`;
      unitRows = (quizBank.byUnit?.[key] || []).slice();
      console.log(`[UnitQuiz] Looking for questions with key: ${key}, found: ${unitRows.length}`);
    }
    
    // If still no rows and we have chapterNumber, try filtering by Chapter_Number field
    if (unitRows.length === 0 && chapterNumber != null) {
      // Fallback: get all questions for this subject and filter by Chapter_Number
      const subjectRows = (quizBank.bySubject?.[subjectCode] || []).slice();
      console.log(`[UnitQuiz] Fallback: filtering ${subjectRows.length} subject questions by Chapter_Number=${chapterNumber}`);
      
      if (subjectRows.length === 0 && quizBank.bySubject) {
        const availableSubjects = Object.keys(quizBank.bySubject);
        console.log(`[UnitQuiz] Available subjects:`, availableSubjects);
      }
      
      unitRows = subjectRows.filter((row) => {
        const chapterField = row.Chapter_Number || row.chapter_number || row.chapterNo || row.chapter || '';
        const chapterStr = String(chapterField).trim();
        
        // Match exact chapter number
        if (chapterStr === String(chapterNumber)) return true;
        
        // Also handle dotted format (e.g., "1.1" means chapter 1)
        const dotMatch = chapterStr.match(/^(\d+)[\.-]/);
        if (dotMatch && dotMatch[1] === String(chapterNumber)) return true;
        
        return false;
      });
      
      console.log(`[UnitQuiz] After Chapter_Number filter: ${unitRows.length} questions`);
    }
    
    // Shuffle and cap at 10 questions
    return shuffle(unitRows).slice(0, TOTAL);
  }, [quizBank, subjectCode, unitId, chapterNumber]);

  const items = useMemo(() => {
    if (!rows.length) return [];
    const { toDirectItemFromRow } = require('../services/quizBank');
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
