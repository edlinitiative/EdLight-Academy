import React, { useMemo, useState } from 'react';
import { Check, X, BookOpen, Lightbulb, ArrowRight, RotateCcw, Trophy } from 'lucide-react';
import InstructionRenderer from './InstructionRenderer';
import FigureRenderer from './FigureRenderer';
import { gradeSingleQuestion, questionTypeMeta } from '../utils/examUtils';

/**
 * A self-contained "practice your mistakes" loop.
 *
 * It takes the list of questions the student missed (from the results page),
 * presents them one at a time, and grades each attempt LIVE using the shared
 * `gradeSingleQuestion` util. Crucially it NEVER writes to Firestore or
 * sessionStorage, so re-practising can't overwrite the student's saved
 * best score — it's pure, pressure-free training.
 *
 * - Auto-gradable types (MC / true-false / short answer / fill-in) get a real
 *   input and immediate correct/incorrect feedback.
 * - Richer types (essay, scaffold, proof…) fall back to a flashcard reveal:
 *   think → reveal the model answer → self-assess.
 */
function isLiveGradable(q) {
  if (!q) return false;
  if (q.type === 'multiple_choice' && q.options && q.correct) return true;
  if (q.type === 'true_false') return true;
  if ((q.type === 'fill_blank' || q.type === 'short_answer') && (q.correct || q.final_answer)) return true;
  return false;
}

function ReviewSession({ items, color = '#6366f1', subject, onClose }) {
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [graded, setGraded] = useState(null); // gradeSingleQuestion result | { status: 'revealed' }
  const [outcomes, setOutcomes] = useState({}); // { [idx]: 'got' | 'missed' }

  const total = items.length;
  const item = items[idx];
  const q = item?.question;
  const meta = q ? questionTypeMeta(q.type) : null;
  const live = isLiveGradable(q);
  const finished = idx >= total;

  const correctText = useMemo(() => {
    if (!q) return '';
    if (q.type === 'multiple_choice' && q.options && q.correct) {
      return `${String(q.correct).toUpperCase()}) ${q.options[q.correct] || ''}`;
    }
    if (q.type === 'true_false') {
      return String(q.correct || q.final_answer || '').toLowerCase() === 'faux' ? 'Faux' : 'Vrai';
    }
    return String(q.correct || q.final_answer || q.model_answer || '');
  }, [q]);

  const record = (gotIt) => setOutcomes((o) => ({ ...o, [idx]: gotIt ? 'got' : 'missed' }));

  const next = () => {
    setAnswer('');
    setGraded(null);
    setIdx((i) => i + 1);
  };

  const checkLive = () => {
    const res = gradeSingleQuestion(q, answer, undefined, {});
    setGraded(res);
    record(res.status === 'correct');
  };

  const reveal = () => setGraded({ status: 'revealed' });

  const restart = () => {
    setIdx(0);
    setAnswer('');
    setGraded(null);
    setOutcomes({});
  };

  // ── Summary screen ────────────────────────────────────────────────────────
  if (finished) {
    const got = Object.values(outcomes).filter((o) => o === 'got').length;
    const pct = total > 0 ? Math.round((got / total) * 100) : 0;
    const tone = pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low';
    return (
      <div className="review-session__backdrop" role="dialog" aria-modal="true" aria-label="Bilan de l'entraînement">
        <div className="review-session" style={{ '--review-accent': color } as React.CSSProperties}>
          <div className="review-session__summary">
            <div className={`review-session__summary-ring review-session__summary-ring--${tone}`}>
              <Trophy size={30} />
            </div>
            <h2 className="review-session__summary-title">Entraînement terminé !</h2>
            <p className="review-session__summary-score">
              {got} / {total} maîtrisée{got !== 1 ? 's' : ''} ({pct}%)
            </p>
            <p className="review-session__summary-text">
              {pct >= 75
                ? 'Excellent progrès — vous avez comblé l\u2019essentiel de vos lacunes.'
                : pct >= 50
                  ? 'Bon travail. Refaites les questions encore difficiles pour les ancrer.'
                  : 'Continuez : reprenez ces questions, la r\u00e9p\u00e9tition fait la ma\u00eetrise.'}
            </p>
            <div className="review-session__summary-actions">
              <button className="button button--primary" onClick={restart} type="button">
                <RotateCcw size={16} /> Recommencer
              </button>
              <button className="button button--ghost" onClick={onClose} type="button">
                Fermer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active question ───────────────────────────────────────────────────────
  const progressPct = Math.round((idx / total) * 100);
  const showFeedback = !!graded;
  const isCorrect = graded?.status === 'correct';

  return (
    <div className="review-session__backdrop" role="dialog" aria-modal="true" aria-label="Entra\u00eenement sur les erreurs">
      <div className="review-session" style={{ '--review-accent': color } as React.CSSProperties}>
        {/* Header */}
        <div className="review-session__head">
          <div className="review-session__head-info">
            <span className="review-session__eyebrow">Entra\u00eenement{subject ? ` · ${subject}` : ''}</span>
            <span className="review-session__counter">Question {idx + 1} / {total}</span>
          </div>
          <button className="review-session__close" onClick={onClose} type="button" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {/* Progress */}
        <div className="review-session__progress">
          <div className="review-session__progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Body */}
        <div className="review-session__body">
          {meta && (
            <span className="review-session__type">{meta.label}</span>
          )}
          <div className="review-session__question">
            <InstructionRenderer text={q._displayText || q.question} inline={false} />
          </div>

          {q.has_figure && q.figure_description && (
            <FigureRenderer description={q.figure_description} compact />
          )}

          {/* ── Live-gradable input ── */}
          {live && !showFeedback && (
            <div className="review-session__input">
              {q.type === 'multiple_choice' && q.options && (
                <div className="review-session__options">
                  {Object.entries(q.options).map(([key, text]) => (
                    <label key={key} className={`review-session__option ${answer === key ? 'review-session__option--selected' : ''}`}>
                      <input type="radio" name="rev-opt" value={key} checked={answer === key} onChange={() => setAnswer(key)} />
                      <span className="review-session__option-key">{key.toUpperCase()}</span>
                      <span className="review-session__option-text"><InstructionRenderer text={String(text)} inline /></span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'true_false' && (
                <div className="review-session__tf">
                  {[{ k: 'vrai', l: 'Vrai' }, { k: 'faux', l: 'Faux' }].map(({ k, l }) => (
                    <button
                      key={k}
                      type="button"
                      className={`review-session__tf-btn ${answer === k ? 'review-session__tf-btn--selected' : ''}`}
                      onClick={() => setAnswer(k)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}

              {(q.type === 'fill_blank' || q.type === 'short_answer') && (
                <input
                  className="review-session__text"
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Votre r\u00e9ponse\u2026"
                  onKeyDown={(e) => { if (e.key === 'Enter' && answer.trim()) checkLive(); }}
                  autoFocus
                />
              )}
            </div>
          )}

          {/* ── Live feedback ── */}
          {live && showFeedback && (
            <div className={`review-session__feedback ${isCorrect ? 'review-session__feedback--correct' : 'review-session__feedback--incorrect'}`}>
              <div className="review-session__feedback-head">
                {isCorrect ? <><Check size={18} /> Correct !</> : <><X size={18} /> Pas tout \u00e0 fait</>}
              </div>
              {!isCorrect && (
                <div className="review-session__feedback-answer">
                  <strong>Bonne r\u00e9ponse :</strong> <InstructionRenderer text={correctText} inline />
                </div>
              )}
            </div>
          )}

          {/* ── Reveal (flashcard) mode for rich types ── */}
          {!live && !showFeedback && (
            <p className="review-session__think">
              <Lightbulb size={15} /> R\u00e9fl\u00e9chissez \u00e0 votre r\u00e9ponse, puis r\u00e9v\u00e9lez la solution.
            </p>
          )}

          {!live && showFeedback && (
            <div className="review-session__reveal">
              {correctText && (
                <div className="review-session__reveal-answer">
                  <strong>R\u00e9ponse mod\u00e8le :</strong>
                  <InstructionRenderer text={correctText} inline={false} />
                </div>
              )}
            </div>
          )}

          {/* Explanation (shown after any feedback) */}
          {showFeedback && q.explanation && (
            <details className="review-session__explain" open={!isCorrect}>
              <summary><BookOpen size={14} /> Explication</summary>
              <div className="review-session__explain-body">
                <InstructionRenderer text={q.explanation} inline={false} />
              </div>
            </details>
          )}
        </div>

        {/* Footer actions */}
        <div className="review-session__foot">
          {!showFeedback && live && (
            <button className="button button--primary" onClick={checkLive} type="button" disabled={!answer.trim()}>
              V\u00e9rifier
            </button>
          )}
          {!showFeedback && !live && (
            <button className="button button--primary" onClick={reveal} type="button">
              Voir la r\u00e9ponse
            </button>
          )}

          {showFeedback && !live && (
            <div className="review-session__selfmark">
              <span className="review-session__selfmark-q">L'aviez-vous trouv\u00e9 ?</span>
              <button className="button button--ghost review-session__selfmark-no" onClick={() => { record(false); next(); }} type="button">
                <X size={15} /> Pas encore
              </button>
              <button className="button button--primary review-session__selfmark-yes" onClick={() => { record(true); next(); }} type="button">
                <Check size={15} /> Je savais
              </button>
            </div>
          )}

          {showFeedback && live && (
            <button className="button button--primary" onClick={next} type="button">
              {idx + 1 < total ? <>Suivante <ArrowRight size={16} /></> : 'Voir le bilan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReviewSession;
