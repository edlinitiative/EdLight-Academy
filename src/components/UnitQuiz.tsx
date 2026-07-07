import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import DirectBankQuiz, { MAX_ATTEMPTS } from './DirectBankQuiz';
import { trackQuizAttempt, markLessonComplete } from '../services/progressTracking';
import { toDirectItemFromRow } from '../services/quizBank';
import { useAppData } from '../hooks/useData';
import { shuffleArray } from '../utils/shared';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';

export default function UnitQuiz({ subjectCode, unitId, chapterNumber, subchapterNumber, courseId, lessonId, onClose, limit = 10, shuffle = true }) {
  const { t } = useTranslation();
  const { data: appData } = useAppData();
  const { user } = useStore();
  const quizBank = appData?.quizBank;
  const shouldLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0;
  const shouldShuffle = !!shuffle;

  const rows = useMemo(() => {
    if (!quizBank || !subjectCode) return [];

    const toInt = (v) => {
      if (v == null || v === '') return null;
      const m = String(v).match(/\d+/);
      return m ? parseInt(m[0], 10) : null;
    };
    
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
      const targetChapter = toInt(chapterNumber);
      
      unitRows = subjectRows.filter((row) => {
        const chapterField = row.Chapter_Number || row.chapter_number || row.chapterNo || row.chapter || '';
        const chapterInt = toInt(chapterField);
        if (targetChapter == null || chapterInt == null) return false;
        return chapterInt === targetChapter;
      });
    }
    
    // Filter by subchapter if provided (for video-specific practice)
    if (subchapterNumber != null && unitRows.length > 0) {
      const targetSub = toInt(subchapterNumber);
      unitRows = unitRows.filter((row) => {
        const subchapterField = row.Subchapter_Number || row.subchapter_number || row.subchapterNo || '';
        const subInt = toInt(subchapterField);
        if (targetSub == null || subInt == null) return false;
        return subInt === targetSub;
      });
    }
    
    const base = shouldShuffle ? shuffleArray(unitRows) : unitRows;
    return shouldLimit ? base.slice(0, limit) : base;
  }, [quizBank, subjectCode, unitId, chapterNumber, subchapterNumber, shouldShuffle, shouldLimit, limit]);

  const items = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => toDirectItemFromRow(r));
  }, [rows]);

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [finished, setFinished] = useState(false);
  // `outcome`: null (unanswered) | 'correct' | 'out'. `attemptsLeft` drives the
  // header status chip. Both are lifted here from DirectBankQuiz (which hides its
  // own header when embedded) so the header shows a single, non-duplicated status.
  const [outcome, setOutcome] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    setIdx(0);
    setScore(0);
    setCanAdvance(false);
    setFinished(false);
    startedAtRef.current = Date.now();
  }, [subjectCode, unitId]);

  // Reset per-question status whenever the active question changes.
  useEffect(() => {
    setCanAdvance(false);
    setOutcome(null);
    setAttemptsLeft(MAX_ATTEMPTS);
  }, [idx]);

  // Track quiz completion
  useEffect(() => {
    if (finished && user?.uid && courseId && items.length > 0) {
      const quizId = `${subjectCode}-U${chapterNumber}${subchapterNumber ? `-L${subchapterNumber}` : ''}`;
      const percentage = (score / items.length) * 100;
      const timeSpent = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
      
      trackQuizAttempt(user.uid, courseId, quizId, {
        score,
        totalQuestions: items.length,
        percentage,
        timeSpent
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
    if (evt.message === 'correct') {
      if (!canAdvance) setScore((s) => s + 1);
      setCanAdvance(true);
      setOutcome('correct');
    } else if (evt.message === 'exhausted_attempts') {
      setCanAdvance(true);
      setOutcome('out');
      setAttemptsLeft(0);
    } else if (typeof evt.attemptsLeft === 'number') {
      setAttemptsLeft(evt.attemptsLeft);
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
        <h3>{t('quizzes.unitQuiz', 'Quiz de l\'unité')}</h3>
        <p className="text-muted">{t('quizzes.unitQuizSelect', 'Choisissez un cours et une unité pour démarrer un quiz de 10 questions.')}</p>
      </div>
    );
  }

  if (finished) {
    const pct = items.length ? Math.round((score / items.length) * 100) : 0;
    return (
      <div className="card unit-quiz">
        <div className="unit-quiz__header">
          <div className="unit-quiz__heading">
            <span className="quiz-card__label">{t('quizzes.curriculumPractice', 'Quiz du programme')}</span>
            <h3 className="quiz-card__heading">{t('quizzes.results', 'Résultats')}</h3>
          </div>
          <span className={`chip ${pct >= 60 ? 'chip--success' : 'chip--warning'}`}>{pct}%</span>
        </div>
        <p className="text-muted" style={{ margin: 0 }}>
          {t('quizzes.scoreOutOf', 'Votre score : {{score}} sur {{total}}.', { score, total: items.length })}
        </p>
        <div className="quiz-card__controls">
          <button className="button button--primary button--sm" onClick={() => {
            // restart
            setIdx(0);
            setScore(0);
            setCanAdvance(false);
            setFinished(false);
          }}>{t('quizzes.retry', 'Recommencer')}</button>
          {onClose && (
            <button className="button button--ghost button--sm" onClick={onClose}>{t('common.close', 'Fermer')}</button>
          )}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="card">
        <h3>{t('quizzes.unitQuiz', 'Quiz de l\'unité')}</h3>
        <p className="text-muted">
          {t('quizzes.noQuestions', 'Aucune question disponible pour ce chapitre pour le moment.')}
          {chapterNumber && ` (${t('courses.chapter', 'Chapitre')} ${chapterNumber})`}
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
    <div className="card unit-quiz">
      <div className="unit-quiz__header">
        <div className="unit-quiz__heading">
          <span className="quiz-card__label">{t('quizzes.curriculumPractice', 'Quiz du programme')}</span>
          <h3 className="quiz-card__heading">{t('quizzes.questionN', 'Question {{n}}', { n: idx + 1 })}</h3>
        </div>
        <div className="unit-quiz__meta">
          <span className="chip chip--ghost">{progress}</span>
          {outcome === 'correct' ? (
            <span className="chip chip--success"><Check size={14} /> {t('quizzes.correctChip', 'Correct')}</span>
          ) : outcome === 'out' ? (
            <span className="chip chip--danger">{t('quizzes.outOfTries', 'Plus d\'essais')}</span>
          ) : (
            <span className="chip chip--ghost">{t('quizzes.triesLeft', '{{count}} essai restant', { count: attemptsLeft })}</span>
          )}
        </div>
      </div>

      <DirectBankQuiz
        item={current}
        onScore={handleScore}
        hideHeader
        onNext={goNext}
        canAdvance={canAdvance}
        isLast={idx + 1 >= items.length}
        onClose={onClose}
      />
    </div>
  );
}
