import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FigureRenderer from '../components/FigureRenderer';
import {
  flattenQuestions,
  gradeExam,
  questionTypeMeta,
  normalizeSubject,
  normalizeLevel,
  subjectColor,
} from '../utils/examUtils';

/** Shared catalog query — same queryKey so it shares cache with ExamBrowser */
function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      return res.json();
    },
    staleTime: Infinity,
  });
}

const ExamTake = () => {
  const { examIndex } = useParams();
  const navigate = useNavigate();

  const { data: rawExams, isLoading, error } = useExamCatalog();

  const idx = parseInt(examIndex, 10);
  const exam = rawExams?.[idx];
  const questions = useMemo(() => (exam ? flattenQuestions(exam) : []), [exam]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Timer
  const durationMin = exam?.duration_minutes || 0;
  const [secondsLeft, setSecondsLeft] = useState(durationMin * 60);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!durationMin || submitted) return;
    setSecondsLeft(durationMin * 60);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [durationMin, submitted]);

  // Auto-submit when timer hits 0
  useEffect(() => {
    if (durationMin && secondsLeft === 0 && !submitted) {
      handleSubmit();
    }
  }, [secondsLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── Answer handling ────────────────────────────────────────────────────────
  const setAnswer = useCallback((qIndex, value) => {
    setAnswers((prev) => ({ ...prev, [qIndex]: value }));
  }, []);

  const answeredCount = Object.keys(answers).filter((k) => answers[k] !== '' && answers[k] != null).length;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    clearInterval(timerRef.current);
    setSubmitted(true);

    const result = gradeExam(questions, answers);

    // Store in sessionStorage for ExamResults page
    sessionStorage.setItem(
      `exam-result-${idx}`,
      JSON.stringify({
        examIndex: idx,
        examTitle: exam.exam_title,
        subject: normalizeSubject(exam.subject),
        level: normalizeLevel(exam.level),
        result,
        timestamp: Date.now(),
      })
    );

    navigate(`/exams/${idx}/results`);
  }, [questions, answers, idx, exam, navigate]);

  // ── Render gates ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="section">
        <div className="card card--centered card--loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="section">
        <div className="card card--message">
          <p>Examen introuvable.</p>
          <button className="button button--primary" onClick={() => navigate('/exams')}>
            ← Retour aux examens
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentQ];
  if (!question) return null;

  const meta = questionTypeMeta(question.type);
  const subject = normalizeSubject(exam.subject);
  const color = subjectColor(subject);
  const isTimerWarning = durationMin && secondsLeft < 300; // < 5 min

  return (
    <div className="section exam-take">
      {/* Top bar */}
      <div className="exam-take__topbar">
        <div className="exam-take__topbar-left">
          <button className="button button--ghost button--sm" onClick={() => navigate('/exams')}>
            ← Examens
          </button>
          <div className="exam-take__exam-info">
            <span className="exam-take__subject" style={{ color }}>{subject}</span>
            <span className="exam-take__title-short">{exam.exam_title || 'Examen'}</span>
          </div>
        </div>

        <div className="exam-take__topbar-right">
          <span className="exam-take__progress">
            {answeredCount}/{questions.length} répondu{answeredCount !== 1 ? 'es' : 'e'}
          </span>
          {durationMin > 0 && (
            <span className={`exam-take__timer ${isTimerWarning ? 'exam-take__timer--warning' : ''}`} aria-live="polite" aria-label={`Temps restant: ${formatTime(secondsLeft)}`}>
              <span aria-hidden="true">⏱</span> {formatTime(secondsLeft)}
            </span>
          )}
          <button
            className="button button--primary button--sm"
            onClick={() => setShowConfirm(true)}
          >
            Soumettre
          </button>
        </div>
      </div>

      {/* Main area: sidebar + question */}
      <div className="exam-take__body">
        {/* Question navigation sidebar */}
        <aside className="exam-take__nav">
          <div className="exam-take__nav-header">Questions</div>
          <div className="exam-take__nav-grid">
            {questions.map((q, i) => {
              const hasAnswer = answers[i] != null && answers[i] !== '';
              const isCurrent = i === currentQ;
              let cls = 'exam-take__nav-btn';
              if (isCurrent) cls += ' exam-take__nav-btn--current';
              else if (hasAnswer) cls += ' exam-take__nav-btn--answered';
              return (
                <button
                  key={i}
                  className={cls}
                  onClick={() => setCurrentQ(i)}
                  title={`Question ${i + 1}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Question content */}
        <div className="exam-take__content">
          {/* Section header if new section */}
          {question.sectionTitle && (
            (currentQ === 0 || questions[currentQ - 1]?.sectionTitle !== question.sectionTitle) && (
              <div className="exam-take__section-header">
                <h3>{question.sectionTitle}</h3>
                {question.sectionInstructions && (
                  <p className="exam-take__section-instructions">{question.sectionInstructions}</p>
                )}
              </div>
            )
          )}

          <div className="card exam-take__question-card">
            <div className="exam-take__question-header">
              <span className="exam-take__question-number">
                Question {currentQ + 1} / {questions.length}
              </span>
              <span className="exam-take__question-type" style={{ background: color + '18', color }}>
                {meta.icon} {meta.label}
              </span>
              {question.points && (
                <span className="exam-take__question-points">
                  {question.points} pt{question.points !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Figure — rendered from description */}
            {question.has_figure && question.figure_description && (
              <FigureRenderer description={question.figure_description} />
            )}

            <div className="exam-take__question-text">
              {question.question}
            </div>

            {/* Answer input — varies by type */}
            <div className="exam-take__answer-area">
              <QuestionInput
                question={question}
                index={currentQ}
                value={answers[currentQ] ?? ''}
                onChange={setAnswer}
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="exam-take__question-nav">
            <button
              className="button button--ghost"
              disabled={currentQ === 0}
              onClick={() => setCurrentQ((p) => p - 1)}
            >
              ← Précédent
            </button>
            {currentQ < questions.length - 1 ? (
              <button
                className="button button--primary"
                onClick={() => setCurrentQ((p) => p + 1)}
              >
                Suivant →
              </button>
            ) : (
              <button
                className="button button--primary"
                onClick={() => setShowConfirm(true)}
              >
                Terminer l'examen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="exam-take__overlay" onClick={() => setShowConfirm(false)}>
          <div className="exam-take__modal card" onClick={(e) => e.stopPropagation()}>
            <h3>Soumettre l'examen ?</h3>
            <p>
              Vous avez répondu à <strong>{answeredCount}</strong> sur{' '}
              <strong>{questions.length}</strong> questions.
              {answeredCount < questions.length && (
                <span className="exam-take__modal-warning">
                  {' '}⚠️ {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? 's' : ''} sans réponse.
                </span>
              )}
            </p>
            <div className="exam-take__modal-actions">
              <button className="button button--ghost" onClick={() => setShowConfirm(false)}>
                Continuer l'examen
              </button>
              <button className="button button--primary" onClick={handleSubmit}>
                Soumettre maintenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Question Input Components ────────────────────────────────────────────────

function QuestionInput({ question, index, value, onChange }) {
  const type = question.type || 'unknown';

  switch (type) {
    case 'multiple_choice':
      return <MCQInput question={question} index={index} value={value} onChange={onChange} />;
    case 'true_false':
      return <TrueFalseInput index={index} value={value} onChange={onChange} />;
    case 'fill_blank':
    case 'calculation':
    case 'short_answer':
      return <TextInput type={type} index={index} value={value} onChange={onChange} />;
    case 'essay':
      return <EssayInput index={index} value={value} onChange={onChange} />;
    case 'matching':
      return <MatchingInput question={question} index={index} value={value} onChange={onChange} />;
    default:
      return <TextInput type={type} index={index} value={value} onChange={onChange} />;
  }
}

function MCQInput({ question, index, value, onChange }) {
  const options = question.options || {};
  const entries = Object.entries(options);

  if (entries.length === 0) {
    return (
      <div className="exam-take__no-options">
        <p>Options non disponibles pour cette question. Tapez votre réponse :</p>
        <input
          className="exam-take__text-input"
          type="text"
          value={value}
          onChange={(e) => onChange(index, e.target.value)}
          placeholder="Votre réponse…"
        />
      </div>
    );
  }

  return (
    <div className="exam-take__mcq-options">
      {entries.map(([key, text]) => {
        const isSelected = value === key;
        return (
          <label
            key={key}
            className={`exam-take__mcq-option ${isSelected ? 'exam-take__mcq-option--selected' : ''}`}
          >
            <input
              type="radio"
              name={`q-${index}`}
              value={key}
              checked={isSelected}
              onChange={() => onChange(index, key)}
              className="exam-take__mcq-radio"
            />
            <span className="exam-take__mcq-key">{key.toUpperCase()}</span>
            <span className="exam-take__mcq-text">{text}</span>
          </label>
        );
      })}
    </div>
  );
}

function TrueFalseInput({ index, value, onChange }) {
  return (
    <div className="exam-take__tf-options">
      {[
        { key: 'vrai', label: '✅ Vrai' },
        { key: 'faux', label: '❌ Faux' },
      ].map(({ key, label }) => {
        const isSelected = value === key;
        return (
          <label
            key={key}
            className={`exam-take__tf-option ${isSelected ? 'exam-take__tf-option--selected' : ''}`}
          >
            <input
              type="radio"
              name={`q-${index}`}
              value={key}
              checked={isSelected}
              onChange={() => onChange(index, key)}
              className="exam-take__tf-radio"
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function TextInput({ type, index, value, onChange }) {
  const placeholders = {
    fill_blank: 'Complétez le blanc…',
    calculation: 'Entrez votre résultat…',
    short_answer: 'Votre réponse…',
  };

  return (
    <input
      className="exam-take__text-input"
      type="text"
      value={value}
      onChange={(e) => onChange(index, e.target.value)}
      placeholder={placeholders[type] || 'Votre réponse…'}
    />
  );
}

function EssayInput({ index, value, onChange }) {
  return (
    <textarea
      className="exam-take__essay-input"
      value={value}
      onChange={(e) => onChange(index, e.target.value)}
      placeholder="Rédigez votre réponse ici…"
      rows={8}
    />
  );
}

function MatchingInput({ question, index, value, onChange }) {
  // For matching, store as JSON string of pairs
  // Simple fallback: just a text area
  return (
    <div className="exam-take__matching">
      <p className="exam-take__matching-hint">
        Entrez vos correspondances (ex: 1-B, 2-A, 3-C)
      </p>
      <input
        className="exam-take__text-input"
        type="text"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder="1-B, 2-A, 3-C…"
      />
    </div>
  );
}

export default ExamTake;
