import React, { useEffect, useMemo, useState } from 'react';
import { useKatex, renderWithKatex } from '../utils/shared';
import EssayQuiz from './EssayQuiz';
import { useTranslation } from 'react-i18next';
import { logAnswerEvent } from '../services/answerEventsService';
import { recordReviewOutcome } from '../services/reviewService';
import useStore from '../contexts/store';
import AnswerStatus from './journey/practice/AnswerStatus';
import { isGradable } from './journey/practice/practiceScope';
import './journey/practice/practice.css';

export const MAX_ATTEMPTS = 3;

export default function DirectBankQuiz({
  item,
  onScore,
  hideHeader = false,
  onNext,
  canAdvance = false,
  isLast = false,
  onClose,
}) {
  const { t, i18n } = useTranslation();
  // New lines are written inline FR/HT (as on the quiz page): a brand-new
  // i18next key would fall back to French for Kreyòl readers.
  const isCreole = String(i18n?.language || useStore.getState().language || '').toLowerCase().startsWith('ht');
  const tx = (fr: string, ht: string) => (isCreole ? ht : fr);
  const katexReady = useKatex();
  const [selected, setSelected] = useState(null);
  const [textAns, setTextAns] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [attempts, setAttempts] = useState(0);
  // The answer that was just marked wrong. Two bugs lived here: the red
  // "wrong" styling followed WHATEVER option was selected next (so the right
  // answer looked wrong before it was checked), and the button — relabelled
  // "Réessayer" — re-graded the still-selected wrong answer, spending an
  // attempt on a choice already known to be wrong.
  const [lastWrong, setLastWrong] = useState<number | string | null>(null);
  // What the student gave on the attempt that closed the question, for the
  // "Ta réponse" row of the correction.
  const [finalAnswer, setFinalAnswer] = useState('');
  const maxAttempts = MAX_ATTEMPTS;
  // No key to compare with (missing answer, unusable options): the question
  // is shown and answered, but never marked wrong and never sent to review.
  const gradable = isGradable(item);
  const [ungraded, setUngraded] = useState(false);
  // Once a choice question is resolved, only the choices that carry the
  // outcome stay open — the student's answer and the right one — so the
  // explanation and the next action fit the screen (LJ audit #6). The
  // student can unfold the rest; nothing receives focus when they fold.
  const [showAllOptions, setShowAllOptions] = useState(false);

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
    setLastWrong(null);
    setFinalAnswer('');
    setUngraded(false);
    setShowAllOptions(false);
  }, [item]);

  const handleCheck = () => {
    if (!gradable) {
      const given = (item.kind === 'mcq' || item.kind === 'tf')
        ? String(item.options?.[selected] ?? '')
        : String(textAns).trim();
      if (!given) return;
      setFinalAnswer(given);
      setSubmitted(true);
      setCorrect(null);
      setUngraded(true);
      if (onScore) onScore({ correct: 0, message: 'ungraded', attemptsLeft: 0, attempt: 1, answer: given });
      return;
    }
    let isCorrect = false;
    if (item.kind === 'mcq' || item.kind === 'tf') {
      if (selected === null) return;
      isCorrect = selected === item.correctIndex;
    } else {
      // Collapse internal whitespace + strip surrounding punctuation so answers
      // like "42 " (trailing space), "42." or "  a  b" aren't false-negatives.
      // Accents are kept significant (they matter for FR/Bac grading).
      const norm = (s) => String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[\s.,;:!?'"()[\]]+|[\s.,;:!?'"()[\]]+$/g, '');
      const target = norm(item.correctText);
      const alt = Array.isArray(item.alternatives) ? item.alternatives.map(norm).filter(Boolean) : [];
      isCorrect = norm(textAns) === target || alt.includes(norm(textAns));
    }
    // First attempt only, so multi-try retries don't skew the signals:
    // crowd difficulty (Adaptive Engine) and the Revizyon review map — a
    // question you needed a hint for is still a question you didn't know.
    // What the student actually gave, as display text, so a parent can show
    // it back in a review ("ta réponse") without re-deriving it.
    const answer = (item.kind === 'mcq' || item.kind === 'tf')
      ? String(item.options?.[selected] ?? '')
      : String(textAns).trim();
    if (attempts === 0) {
      logAnswerEvent(item.stem, isCorrect);
      const uid = useStore.getState().user?.uid;
      if (uid && item.id) {
        recordReviewOutcome(uid, item.id, isCorrect, {
          subjectCode: item.subjectCode ?? undefined,
          unitNo: item.unitNo ?? undefined,
        });
      }
    }
    if (isCorrect) {
      setFinalAnswer(answer);
      setSubmitted(true);
      setCorrect(true);
      if (onScore) onScore({ correct: 1, message: 'correct', attemptsLeft: maxAttempts - attempts, attempt: attempts + 1, answer });
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    if (next >= maxAttempts) {
      setFinalAnswer(answer);
      setSubmitted(true);
      setCorrect(false);
      if (onScore) onScore({ correct: 0, message: 'exhausted_attempts', attemptsLeft: 0, attempt: next, answer });
    } else {
      // allow another try without submitting
      setCorrect(false);
      setLastWrong((item.kind === 'mcq' || item.kind === 'tf') ? selected : String(textAns).trim());
      if (onScore) onScore({ correct: 0, message: `attempt_${next}`, attemptsLeft: maxAttempts - next, attempt: next, answer });
    }
  };

  const Status = () => {
    if (!submitted) {
      if (!gradable) return null;
      const left = maxAttempts - attempts;
      return <span className="chip chip--ghost">{t('quizzes.triesLeft', '{{count}} essai restant', { count: left })}</span>;
    }
    // Once answered, the verdict lives in ONE place — the AnswerStatus of
    // the correction below (LJ audit #2/#6). A second "Correct" chip up here
    // only repeated it.
    return null;
  };

  const hintToShow = !submitted && attempts > 0 && derivedHints.length
    ? derivedHints[Math.min(attempts - 1, derivedHints.length - 1)]
    : '';
  const correctAnswerDisplay = useMemo(() => {
    if (item.kind === 'mcq' || item.kind === 'tf') return item.correctLabel ?? (Array.isArray(item.options) ? item.options[item.correctIndex] : '');
    return item.correctText || '';
  }, [item]);

  const isChoice = item.kind === 'mcq' || item.kind === 'tf';
  const keptIdx = new Set<number>([selected, item.correctIndex].filter((i) => typeof i === 'number'));
  const otherCount = Array.isArray(item.options) ? item.options.filter((_, i) => !keptIdx.has(i)).length : 0;
  const canFold = isChoice && submitted && !ungraded && otherCount > 0;
  const foldOptions = canFold && !showAllOptions;

  if (item.kind === 'essay') {
    return <EssayQuiz item={item} onScore={onScore} />;
  }

  return (
    <div className="direct-bank-quiz">
      {!hideHeader && (
        <div className="quiz-card__header" style={{ marginBottom: '0.5rem' }}>
          <div className="quiz-card__title">
            <span className="quiz-card__label">{t('quizzes.curriculumPractice', 'Exercices du programme')}</span>
          </div>
          <Status />
        </div>
      )}

      <div className="quiz-card__question" dangerouslySetInnerHTML={renderWithKatex(item.stem, katexReady)} />

      {item.context ? (
        <div className="hint-box" style={{ margin: '0.5rem 0' }}>
          <strong>{t('quizzes.context', 'Contexte')}:</strong> <span dangerouslySetInnerHTML={renderWithKatex(item.context, katexReady)} />
        </div>
      ) : null}

      {(item.kind === 'mcq' || item.kind === 'tf') ? (
        <div className={`quiz-card__options${foldOptions ? ' quiz-card__options--folded' : ''}`}>
          {item.options.map((label, idx) => {
            if (foldOptions && !keptIdx.has(idx)) return null;
            const isCorrectOpt = idx === item.correctIndex;
            const isSelectedOpt = selected === idx;
            let stateClass = '';
            if (submitted && !ungraded) {
              if (isCorrectOpt) stateClass = 'radio-option--correct';
              else if (isSelectedOpt) stateClass = 'radio-option--wrong';
            } else if (attempts > 0 && idx === lastWrong) {
              stateClass = 'radio-option--wrong';
            }
            return (
              <label key={idx} className={`radio-option ${stateClass}`.trim()}>
                <input
                  type="radio"
                  name="bank-answer"
                  value={idx}
                  checked={selected === idx}
                  onChange={() => setSelected(idx)}
                  disabled={submitted}
                />
                {/* The letter is drawn by CSS (attr) so the option's label text stays exactly its answer. */}
                <span className="radio-option__key" data-key={String.fromCharCode(65 + idx)} aria-hidden="true" />
                <span className="radio-option__text" dangerouslySetInnerHTML={renderWithKatex(label, katexReady)} />
              </label>
            );
          })}
          {canFold && (
            <button
              type="button"
              className="pq-fold"
              aria-expanded={!foldOptions}
              onClick={() => setShowAllOptions((v) => !v)}
            >
              {foldOptions
                ? (otherCount > 1
                  ? tx(`Voir les ${otherCount} autres choix`, `Wè ${otherCount} lòt chwa yo`)
                  : tx('Voir l’autre choix', 'Wè lòt chwa a'))
                : tx('Masquer les autres choix', 'Kache lòt chwa yo')}
            </button>
          )}
        </div>
      ) : (
        <div className="exam-take__short-answer-wrap">
          <textarea
            className="exam-take__short-answer-input"
            placeholder={t('quizzes.writeAnswerHere', 'Écrivez votre réponse ici…')}
            aria-label={t('quizzes.writeAnswerHere', 'Écrivez votre réponse ici…')}
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

      {/* One live region for every outcome, so a screen reader hears the
          verdict without the focus moving off the answer (LJ-08). Order is
          the anatomy: result, your response, expected answer, explanation. */}
      <div className="pq-live" aria-live="polite">
        {!submitted && attempts > 0 && (
          <div className="pq-correction pq-correction--open">
            <p className="pq-correction__verdict">
              <AnswerStatus kind="tryagain" tx={tx} />
              <span className="pq-correction__next">
                {tx(
                  `Même question : il te reste ${maxAttempts - attempts} essai${maxAttempts - attempts > 1 ? 's' : ''}.`,
                  `Menm kesyon an : ou rete ${maxAttempts - attempts} esè.`,
                )}
              </span>
            </p>
            {hintToShow && (
              <div className="pq-hint">
                <span className="pq-hint__label">{t('quizzes.hint', 'Indice')}</span>
                <span dangerouslySetInnerHTML={renderWithKatex(hintToShow, katexReady)} />
              </div>
            )}
          </div>
        )}

        {submitted && (() => {
          const kind = ungraded ? 'ungraded' : correct ? (attempts === 0 ? 'correct' : 'retry') : 'incorrect';
          // Authored text only. `good` explains the right answer; `wrong` is
          // the authored feedback on a miss. Nothing is generated to fill
          // the slot — when neither exists the student is told so.
          const why = correct ? item.good : (item.good || item.wrong);
          return (
            <div className={`pq-correction pq-correction--${kind}`}>
              <p className="pq-correction__verdict">
                <AnswerStatus kind={kind} tx={tx} tries={attempts + 1} />
                {kind === 'incorrect' && (
                  <span className="pq-correction__next">{tx('Plus d’essais pour cette question.', 'Pa gen esè ankò pou kesyon sa a.')}</span>
                )}
              </p>
              <dl className="pq-rows">
                {/* A right choice is still on screen, marked: repeating it
                    as "Ta réponse" said the same thing twice (LJ audit #6).
                    Typed answers and misses keep the row. */}
                {finalAnswer && (!isChoice || kind === 'incorrect' || kind === 'ungraded') && (
                  <div className="pq-row pq-row--yours">
                    <dt>{tx('Ta réponse', 'Repons ou')}</dt>
                    <dd dangerouslySetInnerHTML={renderWithKatex(finalAnswer, katexReady)} />
                  </div>
                )}
                {kind === 'incorrect' && correctAnswerDisplay && (
                  <div className="pq-row pq-row--expected">
                    <dt>{t('quizzes.correctAnswerLabel', 'Bonne réponse')}</dt>
                    <dd dangerouslySetInnerHTML={renderWithKatex(correctAnswerDisplay, katexReady)} />
                  </div>
                )}
                {kind === 'ungraded' && (
                  <div className="pq-row pq-row--expected">
                    <dt>{tx('Réponse attendue', 'Repons ki te tann')}</dt>
                    <dd>{tx('Aucun corrigé n’est enregistré pour cette question.', 'Pa gen koreksyon ki anrejistre pou kesyon sa a.')}</dd>
                  </div>
                )}
              </dl>
              {why ? (
                <div className="pq-why">
                  <p className="pq-why__label">{t('quizzes.explanation', 'Explication')}</p>
                  <div className="pq-why__body" dangerouslySetInnerHTML={renderWithKatex(why, katexReady)} />
                </div>
              ) : kind !== 'correct' && kind !== 'retry' ? (
                <p className="pq-why pq-why--none">
                  {kind === 'ungraded'
                    ? tx('Pas d’explication rédigée : compare ta réponse avec ta leçon.', 'Pa gen eksplikasyon ekri : konpare repons ou ak leson ou.')
                    : tx('Pas encore d’explication rédigée pour cette question. Relis la bonne réponse et ta leçon.', 'Poko gen eksplikasyon ekri pou kesyon sa a. Relize bon repons lan ak leson ou.')}
                </p>
              ) : null}
            </div>
          );
        })()}
      </div>

      {/* Unified action bar. `Vérifier` hides once answered when a parent
          provides `onNext`, so the primary action becomes `Suivant`. The
          standalone usages (no onNext/onClose) keep just the check button. */}
      <div className="quiz-card__controls">
        {(!submitted || !onNext) && (
          <button
            type="button"
            className={`button button--primary button--lg quiz-card__check${submitted ? ' quiz-card__check--done' : ''}`}
            onClick={handleCheck}
            disabled={submitted || ((item.kind === 'mcq' || item.kind === 'tf')
              ? selected === null || selected === lastWrong
              : textAns.trim().length === 0 || textAns.trim() === lastWrong)}
          >
            {submitted
              ? t('quizzes.answered', 'Répondu')
              : gradable ? t('quizzes.check', 'Vérifier') : tx('Valider ma réponse', 'Valide repons mwen')}
          </button>
        )}
        {/* Shown once the question is resolved, so the card never carries
            two primary buttons with one of them dead. */}
        {onNext && canAdvance && (
          <button
            type="button"
            className="button button--primary button--lg"
            onClick={onNext}
          >
            {isLast ? t('quizzes.finish', 'Terminer') : tx('Question suivante', 'Kesyon swivan')}
          </button>
        )}
        {onClose && (
          <button type="button" className="button button--ghost button--sm" onClick={onClose}>
            {t('common.close', 'Fermer')}
          </button>
        )}
      </div>
    </div>
  );
}
