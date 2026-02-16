import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FigureRenderer from '../components/FigureRenderer';
import InstructionRenderer from '../components/InstructionRenderer';
import { useKatex, renderWithKatex } from '../utils/shared';
import { checkWithCAS } from '../utils/mathCAS';
import {
  questionTypeMeta,
  subjectColor,
  QUESTION_TYPE_META,
} from '../utils/examUtils';

/** Renders scaffold blank answers in the results view */
function ScaffoldResultDisplay({ answer, blanks }) {
  let values = [];
  try {
    const parsed = JSON.parse(answer);
    if (parsed && parsed.scaffold) values = parsed.scaffold;
  } catch { /* not scaffold JSON */ }

  if (!values.length) return <span>{answer}</span>;

  return (
    <div className="scaffold-result">
      {(blanks || []).map((blank, i) => (
        <div key={i} className="scaffold-result__item">
          <span className="scaffold-result__label">{blank.label || `#${i + 1}`} :</span>
          <span className="scaffold-result__value">{values[i] || '—'}</span>
        </div>
      ))}
    </div>
  );
}

const ExamResults = () => {
  const { examIndex } = useParams();
  const navigate = useNavigate();

  // Read result from sessionStorage
  const stored = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(`exam-result-${examIndex}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [examIndex]);

  if (!stored) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--message">
            <p>Aucun résultat trouvé pour cet examen.</p>
            <button className="button button--primary" onClick={() => navigate('/exams')}>
              ← Retour aux examens
            </button>
          </div>
        </div>
      </section>
    );
  }

  const { result, examTitle, subject, level } = stored;
  const { summary, results } = result;
  const color = subjectColor(subject);

  // Score ring percentage
  const pct = summary.percentage;
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (circumference * pct) / 100;

  // Grade label
  const gradeLabel = pct >= 80 ? 'Excellent !' : pct >= 60 ? 'Bien' : pct >= 40 ? 'Passable' : 'À améliorer';
  const gradeEmoji = pct >= 80 ? '🏆' : pct >= 60 ? '👍' : pct >= 40 ? '📖' : '💪';

  const ringColor = pct >= 60 ? 'var(--success-500)' : pct >= 40 ? 'var(--warning-500)' : 'var(--danger-500)';

  return (
    <section className="section exam-results">
      <div className="container">
        {/* Header */}
        <div className="page-header exam-results__header">
          <button className="button button--ghost button--sm" onClick={() => navigate('/exams')}>
            ← Retour aux examens
          </button>
          <h1 className="page-header__title">Résultats</h1>
          <p className="page-header__subtitle" style={{ color }}>
            {subject} — {examTitle || 'Examen'} {level && `(${level})`}
          </p>
        </div>

      {/* Score overview */}
      <div className="exam-results__overview" aria-label={`Score: ${pct}%`}>
        {/* Score ring */}
        <div className="exam-results__score-ring">
          <svg viewBox="0 0 120 120" className="exam-results__ring-svg">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="exam-results__score-text">
            <span className="exam-results__score-pct">{pct}%</span>
            <span className="exam-results__score-label">{gradeEmoji} {gradeLabel}</span>
          </div>
        </div>

        {/* Stats cards */}
        <div className="exam-results__stats-grid">
          <div className="exam-results__stat-card">
            <span className="exam-results__stat-number">{summary.earnedPoints}</span>
            <span className="exam-results__stat-label">Points obtenus / {summary.totalPoints}</span>
          </div>
          <div className="exam-results__stat-card exam-results__stat-card--correct">
            <span className="exam-results__stat-number">{summary.correctCount}</span>
            <span className="exam-results__stat-label">Réponses correctes</span>
          </div>
          <div className="exam-results__stat-card exam-results__stat-card--incorrect">
            <span className="exam-results__stat-number">{summary.incorrectCount}</span>
            <span className="exam-results__stat-label">Réponses incorrectes</span>
          </div>
          <div className="exam-results__stat-card">
            <span className="exam-results__stat-number">{summary.unanswered}</span>
            <span className="exam-results__stat-label">Sans réponse</span>
          </div>
          {summary.manualReview > 0 && (
            <div className="exam-results__stat-card exam-results__stat-card--manual">
              <span className="exam-results__stat-number">{summary.manualReview}</span>
              <span className="exam-results__stat-label">Correction manuelle</span>
            </div>
          )}
          <div className="exam-results__stat-card">
            <span className="exam-results__stat-number">{summary.autoGraded}</span>
            <span className="exam-results__stat-label">Auto-corrigées</span>
          </div>
        </div>
      </div>

      {/* Detailed results */}
      <div className="exam-results__details">
        <h2 className="exam-results__details-title">Détails par question</h2>

        {results.map((r, i) => {
          const meta = questionTypeMeta(r.question.type);
          return (
            <div key={i} className={`card exam-results__item exam-results__item--${r.status}`}>
              <div className="exam-results__item-header">
                <span className="exam-results__item-number">{r.question._displayNumber || `Q${i + 1}`}</span>
                <span className="exam-results__item-type">
                  {meta.icon} {meta.label}
                </span>
                <StatusBadge status={r.status} />
                {r.result.maxPoints > 0 && (
                  <span className="exam-results__item-points">
                    {r.result.awarded}/{r.result.maxPoints} pt{r.result.maxPoints !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="exam-results__item-question">
                <InstructionRenderer text={r.question._displayText || r.question.question} />
              </div>

              {/* Figure */}
              {r.question.has_figure && r.question.figure_description && (
                <FigureRenderer description={r.question.figure_description} compact />
              )}

              {/* User answer */}
              {r.userAnswer && (
                <div className="exam-results__item-answer">
                  <strong>Votre réponse :</strong>{' '}
                  {r.status === 'scaffold-complete' || (r.userAnswer.startsWith('{') && r.userAnswer.includes('"scaffold"'))
                    ? <ScaffoldResultDisplay answer={r.userAnswer} blanks={r.question.scaffold_blanks} />
                    : r.question.type === 'multiple_choice' && r.question.options
                      ? `${r.userAnswer.toUpperCase()}) ${r.question.options[r.userAnswer] || r.userAnswer}`
                      : <ProofOrPlainAnswer answer={r.userAnswer} correctAnswer={r.question.correct} />
                  }
                </div>
              )}

              {/* Correct answer */}
              {r.question.correct && (
                <div className="exam-results__item-correct">
                  <strong>Réponse correcte :</strong>{' '}
                  {r.question.type === 'multiple_choice' && r.question.options
                    ? `${r.question.correct.toUpperCase()}) ${r.question.options[r.question.correct] || r.question.correct}`
                    : String(r.question.correct)
                  }
                </div>
              )}

              {/* Explanation */}
              {r.question.explanation && (
                <div className="exam-results__item-explanation">
                  💡 {r.question.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="exam-results__actions">
        <button
          className="button button--primary"
          onClick={() => navigate(`/exams/${examIndex}`)}
        >
          🔄 Recommencer cet examen
        </button>
        <button className="button button--ghost" onClick={() => navigate('/exams')}>
          📝 Choisir un autre examen
        </button>
      </div>
      </div>
    </section>
  );
};

/**
 * Renders a user answer — if it's proof JSON, render steps + final answer
 * with CAS verification in a clean Khan Academy-style layout.
 */
function ProofOrPlainAnswer({ answer, correctAnswer }) {
  const katexReady = useKatex();

  // Try to parse as proof JSON
  let proofData = null;
  if (typeof answer === 'string' && (answer.startsWith('{') || answer.startsWith('['))) {
    try {
      const parsed = JSON.parse(answer);
      if (parsed && parsed.steps && Array.isArray(parsed.steps)) {
        proofData = { steps: parsed.steps, finalAnswer: parsed.finalAnswer || '' };
      } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].math !== undefined) {
        proofData = { steps: parsed, finalAnswer: '' };
      }
    } catch { /* not proof JSON */ }
  }

  if (!proofData) return <>{String(answer)}</>;

  // CAS-check the final answer
  let casVerdict = null;
  if (proofData.finalAnswer && correctAnswer) {
    casVerdict = checkWithCAS(proofData.finalAnswer, correctAnswer);
  }

  const filledSteps = proofData.steps.filter(s => s.math?.trim());

  return (
    <div className="ka-results">
      {/* Steps timeline */}
      <div className="ka-results__steps">
        {proofData.steps.map((step, i) => {
          const filled = !!step.math?.trim();
          return (
            <div key={i} className={`ka-results__step ${filled ? 'ka-results__step--done' : 'ka-results__step--empty'}`}>
              <div className="ka-results__step-dot">
                {filled ? (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <div className="ka-results__step-body">
                <div className="ka-results__step-math">
                  {step.math && (/\$/.test(step.math) || /\\[a-zA-Z]/.test(step.math))
                    ? <span dangerouslySetInnerHTML={renderWithKatex(step.math, katexReady)} />
                    : step.math || <span className="ka-results__empty">—</span>
                  }
                </div>
                {step.justification && (
                  <div className="ka-results__step-reason">↳ {step.justification}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Final answer with CAS badge */}
      {proofData.finalAnswer && (
        <div className={`ka-results__answer ${casVerdict ? (casVerdict.correct ? 'ka-results__answer--correct' : 'ka-results__answer--incorrect') : ''}`}>
          <div className="ka-results__answer-row">
            <span className="ka-results__answer-label">🎯 Résultat final</span>
            {casVerdict && (
              <span className={`ka-results__cas ${casVerdict.correct ? 'ka-results__cas--correct' : 'ka-results__cas--incorrect'}`}>
                {casVerdict.correct ? '✓ Correct' : '✗ Incorrect'}
              </span>
            )}
          </div>
          <div className="ka-results__answer-value">
            {(/\$/.test(proofData.finalAnswer) || /\\[a-zA-Z]/.test(proofData.finalAnswer))
              ? <span dangerouslySetInnerHTML={renderWithKatex(proofData.finalAnswer, katexReady)} />
              : proofData.finalAnswer
            }
          </div>
          {casVerdict && casVerdict.method === 'cas' && casVerdict.details?.valueA != null && (
            <div className="ka-results__cas-detail">
              ≈ {casVerdict.details.valueA.toFixed(4)}
              {!casVerdict.correct && casVerdict.details.valueB != null && ` ≠ ${casVerdict.details.valueB.toFixed(4)}`}
            </div>
          )}
        </div>
      )}

      {/* Summary line */}
      <div className="ka-results__summary">
        {filledSteps.length} étape{filledSteps.length !== 1 ? 's' : ''} complétée{filledSteps.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    correct:            { label: '✓ Correct', cls: 'exam-results__badge--correct' },
    incorrect:          { label: '✗ Incorrect', cls: 'exam-results__badge--incorrect' },
    manual:             { label: '👁 Révision', cls: 'exam-results__badge--manual' },
    unanswered:         { label: '— Vide', cls: 'exam-results__badge--unanswered' },
    'scaffold-complete': { label: '📝 Complété', cls: 'exam-results__badge--correct' },
  };
  const m = map[status] || map.unanswered;
  return <span className={`exam-results__badge ${m.cls}`}>{m.label}</span>;
}

export default ExamResults;
