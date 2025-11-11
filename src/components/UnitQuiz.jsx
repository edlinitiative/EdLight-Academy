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
    if (!quizBank || !subjectCode || !unitId) return [];
    const key = `${subjectCode}|${unitId}`;
    let unitRows = (quizBank.byUnit?.[key] || []).slice();
    
    // If chapterNumber is provided, filter to only questions from that chapter
    if (chapterNumber != null) {
      unitRows = unitRows.filter((row) => {
        const chapterField = row.Chapter_Number || row.chapter_number || row.chapterNo || row.chapter || '';
        const chapterStr = String(chapterField).trim();
        // Match exact chapter (e.g., "1", "2") or dotted format (e.g., "1.1" -> chapter 1)
        if (chapterStr === String(chapterNumber)) return true;
        const dotMatch = chapterStr.match(/^(\d+)[\.-]/);
        return dotMatch && dotMatch[1] === String(chapterNumber);
      });
    }
    
    // Strictly unit-only selection, cap at 10
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

  if (!subjectCode || !unitId) {
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
        <p className="text-muted">No questions available for this unit yet. Try a different unit or check back soon.</p>
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
