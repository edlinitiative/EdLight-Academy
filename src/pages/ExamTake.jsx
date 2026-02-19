import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useStore from '../contexts/store';
import { TRACK_BY_CODE, parseTrackDirectives, getDirectiveForTrack } from '../config/trackConfig';
import FigureRenderer from '../components/FigureRenderer';
import InstructionRenderer from '../components/InstructionRenderer';
import MathKeyboard from '../components/MathKeyboard';
import { useKatex, renderWithKatex } from '../utils/shared';
import {
  flattenQuestions,
  gradeExam,
  gradeSingleQuestion,
  questionTypeMeta,
  normalizeSubject,
  normalizeLevel,
  normalizeExamTitle,
  subjectColor,
  parseConsignes,
} from '../utils/examUtils';

/** Format hierarchical question number for display (e.g. "A.1" → "A.1", "5" → "5") */
function formatQuestionLabel(q, globalIndex) {
  const num = q._displayNumber;
  if (num) return num;
  return String(globalIndex + 1);
}

/** Abbreviate question label for sidebar nav buttons (max ~4–5 visible chars) */
function formatNavLabel(q, globalIndex) {
  const num = q._displayNumber;
  if (!num) return String(globalIndex + 1);
  // Short labels are fine as-is ("1", "A.1", "B.3")
  if (num.length <= 4) return num;
  // Extract short prefix+digit: "A- COMPREHENSION 1" → "A-1", "EXERCICE 2" → "Ex.2"
  const m = num.match(/^([A-Z]+)[\-.]?\s*.*?(\d+)$/i);
  if (m) {
    let prefix = m[1];
    // Long prefixes like EXERCICE → abbreviate to 2-letter code
    if (prefix.length > 2) prefix = prefix.slice(0, 2) + '.';
    const short = prefix + m[2];
    if (short.length <= 5) return short;
    return short.slice(0, 4) + '…';
  }
  // Fallback: just truncate
  return num.slice(0, 3) + '…';
}

/** Render a short text span with inline KaTeX math ($..$ and $$..$$) */
function MathText({ text }) {
  const katexReady = useKatex();
  if (!text) return null;
  // If no math delimiters, render as plain text (avoids dangerouslySetInnerHTML)
  if (!/\$/.test(text) && !/\\\(/.test(text)) return <>{text}</>;
  return <span dangerouslySetInnerHTML={renderWithKatex(text, katexReady)} />;
}

/** Proof sub-type scaffolds — detected from question text */
const PROOF_SUBTYPES = [
  {
    key: 'simplify',
    re: /\b(simplifier|réduire|écrire.*sous.*forme|mettre.*sous.*forme)\b/i,
    label: 'Simplification',
    icon: '✨',
    scaffoldSteps: [
      { hint: 'Identifiez et simplifiez chaque terme séparément' },
      { hint: 'Combinez les termes semblables' },
      { hint: 'Écrivez le résultat sous la forme demandée' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Résultat simplifié',
  },
  {
    key: 'factor',
    re: /\b(factoriser)\b/i,
    label: 'Factorisation',
    icon: '🔗',
    scaffoldSteps: [
      { hint: 'Identifiez le facteur commun ou l\'identité remarquable' },
      { hint: 'Mettez en facteur' },
      { hint: 'Vérifiez en développant' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Forme factorisée',
  },
  {
    key: 'solve',
    re: /\b(résoudre|trouver.*solution|déterminer.*valeur|trouver.*valeur)\b/i,
    label: 'Résolution',
    icon: '🔍',
    scaffoldSteps: [
      { hint: 'Posez l\'équation ou identifiez les données' },
      { hint: 'Isolez l\'inconnue étape par étape' },
      { hint: 'Vérifiez la / les solution(s)' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Solution(s)',
  },
  {
    key: 'calculate',
    re: /\b(calculer|évaluer|déterminer)\b/i,
    label: 'Calcul',
    icon: '🧮',
    scaffoldSteps: [
      { hint: 'Posez le calcul avec les données' },
      { hint: 'Effectuez les opérations' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Résultat',
  },
  {
    key: 'prove',
    re: /\b(montrer\s+que|démontrer|prouver\s+que|déduire\s+que|vérifier\s+que|justifier\s+que|en\s+déduire)\b/i,
    label: 'Démonstration',
    icon: '📐',
    scaffoldSteps: [
      { hint: 'Partez de l\'hypothèse ou de l\'expression de départ' },
      { hint: 'Développez le raisonnement' },
      { hint: 'Concluez en retrouvant le résultat demandé' },
    ],
    askFinalAnswer: false,
    finalLabel: '',
  },
  {
    key: 'develop',
    re: /\b(développer|développer\s+et\s+réduire)\b/i,
    label: 'Développement',
    icon: '📖',
    scaffoldSteps: [
      { hint: 'Appliquez la distributivité ou l\'identité remarquable' },
      { hint: 'Réduisez les termes semblables' },
    ],
    askFinalAnswer: true,
    finalLabel: 'Forme développée',
  },
];

/** Default scaffold for unrecognized proof types */
const DEFAULT_SCAFFOLD = {
  key: 'generic', label: 'Raisonnement', icon: '💡',
  scaffoldSteps: [
    { hint: 'Première étape de votre raisonnement' },
    { hint: 'Continuez…' },
  ],
  askFinalAnswer: true, finalLabel: 'Résultat final',
};

function detectProofSubtype(text) {
  for (const st of PROOF_SUBTYPES) {
    if (st.re.test(text)) return st;
  }
  return DEFAULT_SCAFFOLD;
}

/** Detect proof / demonstration questions by their phrasing */
const PROOF_RE = /\b(montrer\s+que|démontrer|prouver\s+que|déduire\s+que|vérifier\s+que|justifier\s+que|en\s+déduire|simplifier|factoriser|développer\s+et\s+réduire|calculer\s+et\s+simplifier|résoudre\s+(dans|l['']équation)|déterminer)\b/i;

function isProofQuestion(question, subject) {
  const text = question._displayText || question.question || '';
  const type = question.type || '';
  // Only activate for open-ended math types — never for essays
  if (!['calculation', 'short_answer'].includes(type)) return false;
  // Never activate for non-math subjects (culture, history, languages, etc.)
  if (subject && !MATH_SUBJECTS.has(subject)) return false;
  // Must contain a proof/demonstration keyword
  return PROOF_RE.test(text);
}

/** Regex that matches blank placeholders: 4+ underscores OR 4+ dots */
const BLANK_RE = /_{4,}|\.{4,}/g;

/** Does the question text contain inline blank placeholders? (uses fresh regex to avoid lastIndex issues) */
function hasInlineBlanks(text) {
  return /_{4,}|\.{4,}/.test(text);
}

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
  const { level, examId } = useParams();
  const navigate = useNavigate();
  const katexReady = useKatex();

  const { data: rawExams, isLoading, error } = useExamCatalog();

  const idx = parseInt(examId, 10);
  const exam = rawExams?.[idx];
  const subject = useMemo(() => normalizeSubject(exam?.subject), [exam?.subject]);
  const color = useMemo(() => subjectColor(subject), [subject]);
  const questions = useMemo(() => (exam ? flattenQuestions(exam) : []), [exam]);

  const sectionGroups = useMemo(() => {
    const groups = [];
    for (let i = 0; i < questions.length; i++) {
      const title = String(questions[i]?.sectionTitle || '').trim() || 'Questions';
      const instructions = String(questions[i]?.sectionInstructions || '').trim();
      const last = groups[groups.length - 1];
      if (!last || last.title !== title || last.instructions !== instructions) {
        groups.push({ title, instructions, start: i, end: i });
      } else {
        last.end = i;
      }
    }
    return groups.map((g) => ({ ...g, count: g.end - g.start + 1 }));
  }, [questions]);

  // ── Sub-exercise groups: consecutive questions with same _subExGroup ──────
  // Each group = { start, end, group (letter or null), questions: [...indices] }
  // Ungrouped questions are each their own group.
  const questionGroups = useMemo(() => {
    const groups = [];
    for (let i = 0; i < questions.length; i++) {
      const g = questions[i]._subExGroup;
      const last = groups[groups.length - 1];
      if (g && last && last.group === g) {
        last.end = i;
        last.indices.push(i);
      } else {
        groups.push({ group: g, start: i, end: i, indices: [i] });
      }
    }
    return groups;
  }, [questions]);

  // ── Exam intro / consignes extraction ─────────────────────────────────────
  const [viewState, setViewState] = useState('cover'); // 'cover' | 'preview' | 'active'

  const examInfo = useMemo(() => {
    if (!exam) return null;
    // Collect all consignes from all sections and strip them from instructions
    let allRules = [];
    const cleanedSections = (exam.sections || []).map((sec) => {
      const raw = (sec.instructions || '').trim();
      const { rules, cleanedText } = parseConsignes(raw);
      if (rules.length) allRules.push(...rules);
      // Use null when no raw text existed; keep '' when all content was rules
      // (so '' means "rules were stripped, nothing left" — don't fall back)
      return { ...sec, _cleanInstructions: raw ? cleanedText : null, _hadRules: rules.length > 0 };
    });
    // Deduplicate rules (same rules often repeat across sections)
    const seen = new Set();
    const uniqueRules = allRules.filter((r) => {
      const key = r.toLowerCase().replace(/[^a-zà-ÿ0-9]/gi, '').slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { rules: uniqueRules, cleanedSections };
  }, [exam]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Feedback mode: 'end' (default — see all results after submit)
  //                'immediate' (see per-question result after answering)
  const [feedbackMode, setFeedbackMode] = useState(
    () => localStorage.getItem('edlight-exam-feedback-mode') || 'end'
  );
  // Per-question results for immediate mode  { [flatIndex]: gradeResult }
  const [questionResults, setQuestionResults] = useState({});
  // Track which questions are currently being AI-graded (essay)
  const [gradingInProgress, setGradingInProgress] = useState({});

  // Timer
  const durationMin = exam?.duration_minutes || 0;
  const [secondsLeft, setSecondsLeft] = useState(durationMin * 60);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!durationMin || submitted || viewState !== 'active') return;
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
  }, [durationMin, submitted, viewState]);

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

  // ── Immediate-mode: grade a single question ──────────────────────────────
  const ESSAY_MIN_WORDS = 50;

  const gradeQuestionImmediate = useCallback(async (qIndex) => {
    const q = questions[qIndex];
    const userAnswer = answers[qIndex];
    if (!q || userAnswer == null || userAnswer === '') return;
    // Don't re-grade if already graded
    if (questionResults[qIndex]) return;

    if (q.type === 'essay') {
      // Essay: needs AI grading — enforce minimum word count
      const wordCount = (userAnswer || '').trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < ESSAY_MIN_WORDS) return; // caller should show a warning

      setGradingInProgress((prev) => ({ ...prev, [qIndex]: true }));
      try {
        const response = await fetch('/api/grade-essay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q._displayText || q.question,
            context: q.sectionInstructions || '',
            answer: userAnswer,
            modelAnswer: q.model_answer || q.correct || '',
          }),
        });
        let essayResult;
        if (response.ok) {
          essayResult = await response.json();
        } else {
          essayResult = { isCorrect: false, feedback: 'Évaluation automatique indisponible.', score: 'N/A' };
        }
        const result = gradeSingleQuestion(q, userAnswer, essayResult, { subject });
        setQuestionResults((prev) => ({ ...prev, [qIndex]: result }));
      } catch {
        const result = gradeSingleQuestion(q, userAnswer, {
          isCorrect: false,
          feedback: 'Erreur de connexion — votre réponse sera évaluée manuellement.',
          score: 'N/A',
        }, { subject });
        setQuestionResults((prev) => ({ ...prev, [qIndex]: result }));
      } finally {
        setGradingInProgress((prev) => ({ ...prev, [qIndex]: false }));
      }
    } else if (q.scaffold_text && q.scaffold_blanks && q.answer_parts && !MATH_SUBJECTS.has(subject)) {
      // Non-math scaffold: try exact match first, then AI for long-text blanks
      const result = gradeSingleQuestion(q, userAnswer, null, { subject });
      const hasUngradedLongBlanks = (result.result?.blankResults || []).some(
        (br) => !br.correct && (br.expectedAnswer || '').length > 25
      );

      if (hasUngradedLongBlanks) {
        // Re-grade the failed long-text blanks with AI
        setGradingInProgress((prev) => ({ ...prev, [qIndex]: true }));
        try {
          const failedLong = (result.result.blankResults || []).filter(
            (br) => !br.correct && (br.expectedAnswer || '').length > 25
          );
          const response = await fetch('/api/grade-scaffold', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: q._displayText || q.question || '',
              blanks: failedLong.map((br) => ({
                index: br.blankIndex,
                label: br.label,
                userAnswer: br.userValue,
                expectedAnswer: br.expectedAnswer,
                alternatives: br.alternatives || [],
              })),
            }),
          });
          if (response.ok) {
            const { results: aiResults } = await response.json();
            const blankResults = [...result.result.blankResults];
            (aiResults || []).forEach((r) => {
              if (r.isCorrect && blankResults[r.index]) {
                blankResults[r.index] = { ...blankResults[r.index], correct: true, aiGraded: true };
              }
            });
            const correctBlanks = blankResults.filter((r) => r.correct).length;
            const totalBlanks = blankResults.length;
            const ratio = totalBlanks > 0 ? correctBlanks / totalBlanks : 0;
            const pts = q.points || 1;
            const awarded = Math.round(pts * ratio * 100) / 100;
            const merged = {
              ...result,
              status: correctBlanks === totalBlanks ? 'correct' : correctBlanks > 0 ? 'partial' : 'incorrect',
              result: { ...result.result, awarded, blankResults },
            };
            setQuestionResults((prev) => ({ ...prev, [qIndex]: merged }));
          } else {
            setQuestionResults((prev) => ({ ...prev, [qIndex]: result }));
          }
        } catch {
          setQuestionResults((prev) => ({ ...prev, [qIndex]: result }));
        } finally {
          setGradingInProgress((prev) => ({ ...prev, [qIndex]: false }));
        }
      } else {
        setQuestionResults((prev) => ({ ...prev, [qIndex]: result }));
      }
    } else {
      // Non-essay: grade locally
      const result = gradeSingleQuestion(q, userAnswer, null, { subject });
      setQuestionResults((prev) => ({ ...prev, [qIndex]: result }));
    }
  }, [questions, answers, questionResults, subject]);

  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    if (v == null || v === '') return false;
    // Proof steps stored as JSON — count as answered if any step has content or final answer
    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
      try {
        const parsed = JSON.parse(v);
        // New format: { steps, finalAnswer }
        if (parsed && parsed.steps) {
          return parsed.steps.some((s) => s.math?.trim()) || !!parsed.finalAnswer?.trim();
        }
        // Legacy array format
        if (Array.isArray(parsed)) {
          return parsed.some((s) => s.math?.trim());
        }
      } catch { /* not JSON */ }
    }
    return true;
  }).length;
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  // Keyboard navigation (move by group)
  useEffect(() => {
    const handler = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        e.target?.isContentEditable
      ) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentQ((p) => {
          const gi = questionGroups.findIndex((g) => p >= g.start && p <= g.end);
          const next = questionGroups[gi + 1];
          return next ? next.start : p;
        });
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentQ((p) => {
          const gi = questionGroups.findIndex((g) => p >= g.start && p <= g.end);
          const prev = questionGroups[gi - 1];
          return prev ? prev.start : p;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [questions.length, questionGroups]);

  // Scroll question content into view on question change
  const contentRef = useRef(null);
  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    contentRef.current?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
  }, [currentQ]);

  // Passage panel state (for comprehension sections)
  const [showPassage, setShowPassage] = useState(false);

  // Escape key closes overlays (confirm modal / passage panel)
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (showConfirm) setShowConfirm(false);
      if (showPassage) setShowPassage(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [showConfirm, showPassage]);

  // Track-specific section directive for the current user's track
  // NOTE: This useMemo MUST be before any early returns to comply with Rules of Hooks.
  const userTrack = useStore.getState().track;
  const trackDirective = useMemo(() => {
    const q = questions[currentQ];
    if (!userTrack || !q?.sectionInstructions) return null;
    const directives = parseTrackDirectives(q.sectionInstructions);
    if (!directives.length) return null;
    return getDirectiveForTrack(directives, userTrack);
  }, [userTrack, questions, currentQ]);
  const trackInfo = userTrack ? TRACK_BY_CODE[userTrack] : null;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    clearInterval(timerRef.current);
    setSubmitted(true);

    // Get the user's track for coefficient-weighted scoring
    const currentTrack = useStore.getState().track;
    const examSubject = normalizeSubject(exam.subject);

    // In immediate mode, pass pre-graded results so they aren't re-graded
    const result = gradeExam(
      questions, answers,
      feedbackMode === 'immediate' ? questionResults : {},
      { track: currentTrack, subject: examSubject }
    );

    // Store in sessionStorage for ExamResults page
    sessionStorage.setItem(
      `exam-result-${idx}`,
      JSON.stringify({
        examIndex: idx,
        examTitle: normalizeExamTitle(exam),
        subject: examSubject,
        level: normalizeLevel(exam.level),
        track: currentTrack,
        result,
        timestamp: Date.now(),
      })
    );

    navigate(`/exams/${level}/${idx}/results`);
  }, [questions, answers, questionResults, feedbackMode, idx, exam, level, navigate]);

  // ── Render gates ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--centered card--loading">
            <div className="loading-spinner" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !exam) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--message">
            <p>Examen introuvable.</p>
            <button className="button button--primary" onClick={() => navigate(`/exams/${level || ''}`)}>
              ← Retour aux examens
            </button>
          </div>
        </div>
      </section>
    );
  }

  // subject and color are now declared at the top of the component (before hooks)

  // ── Exam Intro splash ───────────────────────────────────────────────────
  if (viewState === 'cover') {
    const sectionSummary = (exam.sections || []).map((sec, i) => ({
      title: sec.section_title || `Section ${i + 1}`,
      qCount: (sec.questions || []).length,
    }));
    const totalQ = sectionSummary.reduce((s, x) => s + x.qCount, 0);

    const ruleIcon = (rule) => {
      const r = rule.toLowerCase();
      if (r.includes('interdit')) return '🚫';
      if (r.includes('silence')) return '🤫';
      if (r.includes('obligatoire')) return '⚠️';
      if (r.includes('durée') || r.includes('heure')) return '⏰';
      if (r.includes('coefficient')) return '📊';
      return 'ℹ️';
    };

    return (
      <section className="exam-cover" style={{ '--cover-accent': color }}>
        {/* Decorative background shapes */}
        <div className="exam-cover__bg">
          <div className="exam-cover__orb exam-cover__orb--1" />
          <div className="exam-cover__orb exam-cover__orb--2" />
          <div className="exam-cover__orb exam-cover__orb--3" />
          <div className="exam-cover__grid" />
        </div>

        <div className="exam-cover__inner">
          {/* Navigation */}
          <nav className="exam-cover__nav">
            <button className="exam-cover__back" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Retour
            </button>
            <div className="exam-cover__brand">
              <span className="exam-cover__brand-icon">🎓</span>
              <span>EdLight Academy</span>
            </div>
          </nav>

          {/* Hero card */}
          <div className="exam-cover__hero">
            <div className="exam-cover__badge" style={{ background: color, color: '#fff' }}>
              {subject}
            </div>
            <h1 className="exam-cover__title">{normalizeExamTitle(exam)}</h1>
            {exam.year && <p className="exam-cover__year">{exam.year}</p>}

            {/* Stats row */}
            <div className="exam-cover__stats">
              {durationMin > 0 && (
                <div className="exam-cover__stat">
                  <span className="exam-cover__stat-value">{durationMin}</span>
                  <span className="exam-cover__stat-label">minutes</span>
                </div>
              )}
              {exam.total_points > 0 && (
                <div className="exam-cover__stat">
                  <span className="exam-cover__stat-value">{exam.total_points}</span>
                  <span className="exam-cover__stat-label">points</span>
                </div>
              )}
              <div className="exam-cover__stat">
                <span className="exam-cover__stat-value">{totalQ}</span>
                <span className="exam-cover__stat-label">questions</span>
              </div>
              <div className="exam-cover__stat">
                <span className="exam-cover__stat-value">{sectionSummary.length}</span>
                <span className="exam-cover__stat-label">{sectionSummary.length > 1 ? 'sections' : 'section'}</span>
              </div>
            </div>
          </div>

          {/* Two-column body */}
          <div className="exam-cover__body">
            {/* Sections panel */}
            <div className="exam-cover__panel exam-cover__panel--sections">
              <h2 className="exam-cover__panel-heading">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Structure
              </h2>
              <ol className="exam-cover__section-list">
                {sectionSummary.map((sec, i) => (
                  <li key={i} className="exam-cover__section-row">
                    <span className="exam-cover__section-dot" style={{ background: color }} />
                    <span className="exam-cover__section-name">{sec.title}</span>
                    <span className="exam-cover__section-qty">{sec.qCount}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Rules panel */}
            {examInfo?.rules?.length > 0 && (
              <div className="exam-cover__panel exam-cover__panel--rules">
                <h2 className="exam-cover__panel-heading">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Consignes
                </h2>
                <ul className="exam-cover__rules-list">
                  {examInfo.rules.map((rule, i) => (
                    <li key={i} className="exam-cover__rule-item">
                      <span className="exam-cover__rule-icon">{ruleIcon(rule)}</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Feedback mode selector */}
          <div className="exam-cover__feedback-mode">
            <h2 className="exam-cover__panel-heading">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Mode de correction
            </h2>
            <div className="exam-cover__feedback-options">
              <label
                className={`exam-cover__feedback-option ${feedbackMode === 'immediate' ? 'exam-cover__feedback-option--selected' : ''}`}
                style={feedbackMode === 'immediate' ? { borderColor: color, background: color + '0a' } : undefined}
              >
                <input
                  type="radio"
                  name="feedbackMode"
                  value="immediate"
                  checked={feedbackMode === 'immediate'}
                  onChange={() => { setFeedbackMode('immediate'); localStorage.setItem('edlight-exam-feedback-mode', 'immediate'); }}
                  className="exam-cover__feedback-radio"
                />
                <div className="exam-cover__feedback-content">
                  <span className="exam-cover__feedback-icon">⚡</span>
                  <div>
                    <strong>Résultat immédiat</strong>
                    <p>Voir la correction après chaque question</p>
                  </div>
                </div>
              </label>
              <label
                className={`exam-cover__feedback-option ${feedbackMode === 'end' ? 'exam-cover__feedback-option--selected' : ''}`}
                style={feedbackMode === 'end' ? { borderColor: color, background: color + '0a' } : undefined}
              >
                <input
                  type="radio"
                  name="feedbackMode"
                  value="end"
                  checked={feedbackMode === 'end'}
                  onChange={() => { setFeedbackMode('end'); localStorage.setItem('edlight-exam-feedback-mode', 'end'); }}
                  className="exam-cover__feedback-radio"
                />
                <div className="exam-cover__feedback-content">
                  <span className="exam-cover__feedback-icon">📋</span>
                  <div>
                    <strong>Résultat à la fin</strong>
                    <p>Voir tous les résultats après avoir soumis l'examen</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* CTA */}
          <div className="exam-cover__cta">
            <button
              className="exam-cover__start-btn"
              style={{ background: color }}
              onClick={() => setViewState('preview')}
              type="button"
            >
              <span>Aperçu de l'examen</span>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
            <p className="exam-cover__cta-hint">Bonne chance ! 🍀</p>
          </div>
        </div>
      </section>
    );
  }

  // ── Preview mode (read-only continuous view) ───────────────────────────────
  if (viewState === 'preview') {
    return (
      <section className="section exam-take exam-take--preview">
        <div className="container">
          {/* Top bar */}
          <div className="exam-take__topbar">
            <div className="exam-take__topbar-left">
              <button className="button button--ghost button--sm" onClick={() => setViewState('cover')} type="button">
                ← Retour
              </button>
              <div className="exam-take__exam-info">
                <span className="exam-take__subject" style={{ color }}>{subject}</span>
                <span className="exam-take__title-short">{normalizeExamTitle(exam)}</span>
              </div>
            </div>
            <div className="exam-take__topbar-right">
              <div className="exam-take__timer-box" style={{ background: 'rgba(10, 102, 194, 0.08)' }}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{durationMin} min</span>
              </div>
            </div>
          </div>

          <div className="exam-take__preview-scroll">
            <div className="exam-take__preview-notice">
              <span className="exam-take__preview-notice-icon">👁️</span>
              <div>
                <strong>Aperçu de l'examen</strong>
                <p>Prenez le temps de lire toutes les questions. Quand vous êtes prêt, cliquez sur "Commencer" pour débuter le chronomètre.</p>
              </div>
            </div>

            {/* Render all sections and questions continuously */}
            {exam.sections?.map((section, secIdx) => {
              const secQuestions = questions.filter(q => q.sectionTitle === section.section_title);
              if (!secQuestions.length) return null;

              const cleanedEntry = examInfo?.cleanedSections?.[secIdx];
              const cleanInstructions = cleanedEntry?._hadRules
                ? (cleanedEntry._cleanInstructions || '')
                : (section.instructions || '');

              return (
                <div key={secIdx} className="exam-take__preview-section">
                  {/* Section header */}
                  <div className="exam-take__preview-section-header">
                    <h2>{section.section_title || `Section ${secIdx + 1}`}</h2>
                    {cleanInstructions && cleanInstructions.length <= 200 && (
                      <div className="exam-take__preview-section-instructions">
                        <InstructionRenderer text={cleanInstructions} />
                      </div>
                    )}
                  </div>

                  {/* Reading passage */}
                  {cleanInstructions && cleanInstructions.length > 200 && (
                    <div className="exam-take__preview-passage">
                      <div className="exam-take__preview-passage-label">📖 Texte de référence</div>
                      <InstructionRenderer text={cleanInstructions} />
                    </div>
                  )}

                  {/* Questions organized by sub-exercise group (A, B, C, etc.) */}
                  {(() => {
                    // Build sub-groups: consecutive questions with same _subExGroup
                    const subGroups = [];
                    for (let i = 0; i < secQuestions.length; i++) {
                      const q = secQuestions[i];
                      const g = q._subExGroup;
                      const last = subGroups[subGroups.length - 1];
                      if (g && last && last.group === g) {
                        last.end = i;
                        last.indices.push(i);
                      } else {
                        subGroups.push({ group: g, start: i, end: i, indices: [i] });
                      }
                    }
                    
                    return subGroups.map((subGroup, subGroupIdx) => {
                      const subGroupQs = subGroup.indices.map(i => secQuestions[i]);
                      const firstInGroup = subGroupQs[0];
                      const showSubExDirective = firstInGroup._subExDirective?.trim();
                      const wordPool = firstInGroup._wordPool?.trim();
                      
                      // Within this sub-group, group by type
                      const typeGroups = [];
                      let currentTypeGroup = null;
                      
                      subGroupQs.forEach((q) => {
                        const globalIdx = questions.indexOf(q);
                        const qMeta = questionTypeMeta(q.type);
                        
                        if (!currentTypeGroup || currentTypeGroup.type !== q.type) {
                          currentTypeGroup = { type: q.type, meta: qMeta, questions: [] };
                          typeGroups.push(currentTypeGroup);
                        }
                        currentTypeGroup.questions.push({ ...q, globalIdx });
                      });
                      
                      return (
                        <div key={subGroupIdx} className="exam-take__preview-subex-group">
                          {/* Sub-exercise directive (A., B., C., etc.) */}
                          {showSubExDirective && (
                            <div className="exam-take__preview-subex-directive">
                              <InstructionRenderer text={showSubExDirective} />
                            </div>
                          )}
                          
                          {/* Word pool (if present) */}
                          {wordPool && (
                            <div className="exam-take__preview-word-pool">
                              <div className="exam-take__preview-word-pool-label">📚 Vocabulaire</div>
                              <InstructionRenderer text={wordPool} />
                            </div>
                          )}
                          
                          {/* Type groups within this sub-exercise */}
                          {typeGroups.map((group, typeGroupIdx) => (
                            <div key={typeGroupIdx} className="exam-take__preview-type-group">
                              {/* Type header - shown once per type within sub-group */}
                              <div className="exam-take__preview-type-header">
                                <span className="exam-take__preview-type-label" style={{ background: color + '18', color }}>
                                  {group.meta.icon} {group.meta.label}
                                </span>
                              </div>
                              
                              {/* Questions in this type group */}
                              {group.questions.map((q) => (
                                <div key={q.globalIdx} className="exam-take__preview-question">
                                  {/* Compact single-line question header */}
                                  <div className="exam-take__preview-question-line">
                                    <span className="exam-take__preview-question-number">
                                      {formatQuestionLabel(q, q.globalIdx)}
                                    </span>
                                    {q.points && (
                                      <span className="exam-take__preview-question-points">
                                        ({q.points} pt{q.points !== 1 ? 's' : ''})
                                      </span>
                                    )}
                                    <span className="exam-take__preview-question-inline-text">
                                      <InstructionRenderer text={q._displayText || q.question} inline={true} />
                                    </span>
                                  </div>

                                  {q.has_figure && q.figure_description && (
                                    <FigureRenderer description={q.figure_description} />
                                  )}

                                  {q.temporal_note && (
                                    <div className="exam-take__temporal-note">
                                      <span className="exam-take__temporal-note-icon">🕐</span>
                                      <span className="exam-take__temporal-note-text">{q.temporal_note}</span>
                                    </div>
                                  )}

                                  {/* Show MCQ options in preview */}
                                  {q.type === 'mcq' && q.options && (
                                    <div className="exam-take__preview-mcq-options">
                                      {q.options.map((opt, i) => (
                                        <div key={i} className="exam-take__preview-mcq-option">
                                          <span className="exam-take__preview-mcq-letter">{String.fromCharCode(65 + i)}.</span>
                                          <span><MathText text={opt} /></span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              );
            })}

            {/* CTA to start exam */}
            <div className="exam-take__preview-cta">
              <button
                className="button button--primary button--lg"
                style={{ background: color }}
                onClick={() => setViewState('active')}
                type="button"
              >
                <span>Commencer l'examen</span>
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <p className="exam-take__preview-cta-hint">Le chronomètre démarrera quand vous cliquerez sur ce bouton. Bonne chance ! 🍀</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Active exam ────────────────────────────────────────────────────────────
  const question = questions[currentQ];
  if (!question) return null;

  // Current group: all questions displayed together on this page
  const currentGroupIdx = questionGroups.findIndex((g) => currentQ >= g.start && currentQ <= g.end);
  const currentGrp = questionGroups[currentGroupIdx] || { start: currentQ, end: currentQ, indices: [currentQ], group: null };
  const groupQuestions = currentGrp.indices.map((i) => ({ ...questions[i], _flatIdx: i }));
  const isLastGroup = currentGroupIdx >= questionGroups.length - 1;
  const isFirstGroup = currentGroupIdx <= 0;

  const meta = questionTypeMeta(question.type);
  const isTimerWarning = durationMin && secondsLeft < 300; // < 5 min

  // Get cleaned instructions (consignes stripped) for current question's section
  const currentSectionIdx = (exam.sections || []).findIndex(
    (s) => s.section_title === question.sectionTitle
  );
  // Use cleaned instructions when available; only fall back to raw if no rules
  // were extracted (i.e. cleaning wasn't applied). When rules WERE extracted and
  // cleanedText is '' it means ALL text was consignes — don't show anything.
  const cleanedEntry = examInfo?.cleanedSections?.[currentSectionIdx];
  const cleanInstructions = cleanedEntry?._hadRules
    ? (cleanedEntry._cleanInstructions || '')
    : (question.sectionInstructions || '');

  return (
    <section className="section exam-take">
      <div className="container">
        {/* Top bar */}
        <div className="exam-take__topbar">
          <div className="exam-take__topbar-left">
            <button className="button button--ghost button--sm" onClick={() => navigate(`/exams/${level || ''}`)} type="button">
              ← Examens
            </button>
            <div className="exam-take__exam-info">
              <span className="exam-take__subject" style={{ color }}>{subject}</span>
              <span className="exam-take__title-short">{normalizeExamTitle(exam)}</span>
            </div>
          </div>

          <div className="exam-take__topbar-right">
            <span className="exam-take__progress">
              {answeredCount}/{questions.length}
            </span>
            {durationMin > 0 && (
              <span
                className={`exam-take__timer ${isTimerWarning ? 'exam-take__timer--warning' : ''}`}
                aria-live={isTimerWarning ? 'polite' : 'off'}
                aria-atomic="true"
                aria-label={`Temps restant: ${formatTime(secondsLeft)}`}
              >
                <span aria-hidden="true">⏱</span> {formatTime(secondsLeft)}
              </span>
            )}
            <button
              className="button button--primary button--sm"
              onClick={() => setShowConfirm(true)}
              type="button"
            >
              Soumettre
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="exam-take__progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="exam-take__progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Main area: sidebar + question */}
        <div className="exam-take__body">
          {/* Question navigation sidebar */}
          <aside className="exam-take__nav" style={{ '--nav-accent': color }}>
            {/* Progress ring header */}
            <div className="exam-take__nav-progress">
              <div className="exam-take__nav-ring-wrap">
                <svg className="exam-take__nav-ring" viewBox="0 0 48 48" aria-hidden="true">
                  <circle className="exam-take__nav-ring-bg" cx="24" cy="24" r="19" />
                  <circle
                    className="exam-take__nav-ring-fill"
                    cx="24" cy="24" r="19"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 19}`,
                      strokeDashoffset: `${2 * Math.PI * 19 * (1 - progressPct / 100)}`,
                    }}
                  />
                </svg>
                <span className="exam-take__nav-ring-pct">{progressPct}<small>%</small></span>
              </div>
              <div className="exam-take__nav-progress-meta">
                <span className="exam-take__nav-progress-title">Progression</span>
                <span className="exam-take__nav-progress-detail">{answeredCount} sur {questions.length}</span>
              </div>
            </div>

            <div className="exam-take__nav-divider" />

            <div className="exam-take__nav-sections" role="navigation" aria-label="Navigation des questions par section">
              {sectionGroups.map((sec) => {
                const isCurrentSection = currentQ >= sec.start && currentQ <= sec.end;
                const secAnswered = Array.from({ length: sec.count }).filter((_, off) => {
                  const a = answers[sec.start + off];
                  return a != null && a !== '';
                }).length;
                const secDone = secAnswered === sec.count;
                return (
                  <div key={`${sec.start}-${sec.end}-${sec.title}`} className={`exam-take__nav-section ${isCurrentSection ? 'exam-take__nav-section--active' : ''}`}>
                    <div className={`exam-take__nav-section-title ${isCurrentSection ? 'exam-take__nav-section-title--current' : ''}`}>
                      <span className="exam-take__nav-section-name">{sec.title}</span>
                      <span className={`exam-take__nav-section-badge ${secDone ? 'exam-take__nav-section-badge--done' : ''}`}>
                        {secDone ? '✓' : `${secAnswered}/${sec.count}`}
                      </span>
                    </div>
                    <div className="exam-take__nav-section-grid">
                      {Array.from({ length: sec.count }).map((_, offset) => {
                        const i = sec.start + offset;
                        const q = questions[i];
                        const hasAnswer = answers[i] != null && answers[i] !== '';
                        const isInCurrentGroup = i >= currentGrp.start && i <= currentGrp.end;
                        const qResult = questionResults[i];
                        let cls = 'exam-take__nav-btn';
                        if (isInCurrentGroup) cls += ' exam-take__nav-btn--current';
                        else if (qResult?.status === 'correct' || qResult?.status === 'scaffold-complete') cls += ' exam-take__nav-btn--correct';
                        else if (qResult?.status === 'incorrect') cls += ' exam-take__nav-btn--incorrect';
                        else if (qResult?.status === 'partial') cls += ' exam-take__nav-btn--partial';
                        else if (hasAnswer) cls += ' exam-take__nav-btn--answered';
                        const label = formatNavLabel(q, i);
                        const targetGroup = questionGroups.find((g) => i >= g.start && i <= g.end);
                        return (
                          <button
                            key={i}
                            className={cls}
                            onClick={() => setCurrentQ(targetGroup ? targetGroup.start : i)}
                            title={`Question ${formatQuestionLabel(q, i)}`}
                            type="button"
                            aria-label={`Aller à la question ${formatQuestionLabel(q, i)}`}
                          >
                            {label}
                            {hasAnswer && !isInCurrentGroup && <span className="exam-take__nav-btn-check" aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Question content */}
          <div className="exam-take__content" ref={contentRef}>
          {/* Section context — title bar (short instructions inline, long passages separate) */}
          {question.sectionTitle && (
            <SectionHeader
              title={question.sectionTitle}
              instructions={cleanInstructions && cleanInstructions.length <= 200 ? cleanInstructions : ''}
            />
          )}

          {/* Track-specific directive banner */}
          {trackDirective && trackInfo && (
            <div
              className="exam-take__track-banner"
              style={{ '--track-color': trackInfo.color }}
            >
              <span className="exam-take__track-banner-icon">{trackInfo.icon}</span>
              <div className="exam-take__track-banner-text">
                <strong>{trackInfo.shortLabel}</strong> — {trackDirective}
              </div>
            </div>
          )}

          {/* Reading passage panel — always visible for comprehension sections */}
          {cleanInstructions && cleanInstructions.length > 200 && (
            <ReadingPassage text={cleanInstructions} />
          )}

          {/* Sub-exercise directive header — shown once for the group */}
          {groupQuestions[0]._subExDirective && (
            <div className="exam-take__subex-header">
              <span className="exam-take__subex-label">{groupQuestions[0]._subExGroup}.</span>
              <span className="exam-take__subex-directive"><MathText text={groupQuestions[0]._subExDirective.replace(/^[A-Z][.\-)\s]+/, '')} /></span>
            </div>
          )}

          {/* Word pool callout — shown once for the group */}
          {groupQuestions[0]._wordPool && (
            <div className="exam-take__word-pool">
              <span className="exam-take__word-pool-label">Banque de mots :</span>{' '}
              <span className="exam-take__word-pool-words">{groupQuestions[0]._wordPool}</span>
            </div>
          )}

          {/* Render all questions in the current group together */}
          {groupQuestions.map((gq) => {
            const qMeta = questionTypeMeta(gq.type);
            const qIdx = gq._flatIdx;
            const isLocked = feedbackMode === 'immediate' && !!questionResults[qIdx];
            return (
              <div className={`card exam-take__question-card ${isLocked ? 'exam-take__question-card--locked' : ''}`} key={qIdx}>
                <div className="exam-take__question-header">
                  <span className="exam-take__question-number">
                    <span className="exam-take__question-num-label">{formatQuestionLabel(gq, qIdx)}</span>
                    {groupQuestions.length === 1 && (
                      <span className="exam-take__question-num-total"> / {questions.length}</span>
                    )}
                  </span>
                  <span className="exam-take__question-type" style={{ background: color + '18', color }}>
                    {qMeta.icon} {qMeta.label}
                  </span>
                  {gq.points && (
                    <span className="exam-take__question-points">
                      {gq.points} pt{gq.points !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Figure — rendered from description */}
                {gq.has_figure && gq.figure_description && (
                  <FigureRenderer description={gq.figure_description} />
                )}

                {/* Temporal context note — shown for questions with time-sensitive answers */}
                {gq.temporal_note && (
                  <div className="exam-take__temporal-note">
                    <span className="exam-take__temporal-note-icon">🕐</span>
                    <span className="exam-take__temporal-note-text">{gq.temporal_note}</span>
                  </div>
                )}

                {/* Question text — inline blanks for fill_blank, normal renderer otherwise */}
                {gq.type === 'fill_blank' && hasInlineBlanks(gq._displayText || gq.question) ? (
                  <div className="exam-take__question-text">
                    <FillBlankText
                      text={gq._displayText || gq.question}
                      index={qIdx}
                      value={answers[qIdx] ?? ''}
                      onChange={setAnswer}
                      disabled={isLocked}
                    />
                  </div>
                ) : (
                  <>
                    <div className="exam-take__question-text">
                      <InstructionRenderer text={gq._displayText || gq.question} />
                    </div>
                    {/* Show scaffold as primary input when scaffold data exists, otherwise QuestionInput */}
                    {!gq.correct && gq.scaffold_text && gq.scaffold_blanks ? (
                      <div className="exam-take__answer-area">
                        <ScaffoldedAnswer
                          question={gq}
                          index={qIdx}
                          value={answers[qIdx] ?? ''}
                          onChange={setAnswer}
                          disabled={isLocked}
                          mathMode={MATH_SUBJECTS.has(subject)}
                        />
                      </div>
                    ) : (
                      <div className="exam-take__answer-area">
                        <QuestionInput
                          question={gq}
                          index={qIdx}
                          value={answers[qIdx] ?? ''}
                          onChange={setAnswer}
                          disabled={isLocked}
                          subject={subject}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Progressive hints (available for ALL question types) */}
                {!isProofQuestion(gq, subject) && gq.hints && gq.hints.length > 0 && (
                  <QuestionHints hints={gq.hints} />
                )}

                {/* ── Immediate feedback mode: "Vérifier" button + inline result ── */}
                {feedbackMode === 'immediate' && !questionResults[qIdx] && (
                  <div className="exam-take__check-answer">
                    {gq.type === 'essay' ? (
                      <>
                        <button
                          className="button button--primary button--sm"
                          type="button"
                          disabled={
                            !answers[qIdx] ||
                            (answers[qIdx] || '').trim().split(/\s+/).filter(Boolean).length < ESSAY_MIN_WORDS ||
                            gradingInProgress[qIdx]
                          }
                          onClick={() => gradeQuestionImmediate(qIdx)}
                        >
                          {gradingInProgress[qIdx] ? (
                            <><span className="loading-spinner loading-spinner--inline" /> Évaluation en cours…</>
                          ) : (
                            '🤖 Évaluer ma rédaction'
                          )}
                        </button>
                        <span className="exam-take__check-hint">
                          {(answers[qIdx] || '').trim().split(/\s+/).filter(Boolean).length < ESSAY_MIN_WORDS
                            ? `Minimum ${ESSAY_MIN_WORDS} mots requis (${(answers[qIdx] || '').trim().split(/\s+/).filter(Boolean).length} actuellement)`
                            : `${(answers[qIdx] || '').trim().split(/\s+/).filter(Boolean).length} mots — prêt pour l'évaluation`
                          }
                        </span>
                      </>
                    ) : (
                      <button
                        className="button button--primary button--sm"
                        type="button"
                        disabled={!answers[qIdx] || answers[qIdx] === ''}
                        onClick={() => gradeQuestionImmediate(qIdx)}
                      >
                        ✓ Vérifier ma réponse
                      </button>
                    )}
                  </div>
                )}

                {/* ── Inline result (immediate mode) ── */}
                {feedbackMode === 'immediate' && questionResults[qIdx] && (
                  <ImmediateFeedback
                    result={questionResults[qIdx]}
                    question={gq}
                    color={color}
                  />
                )}
              </div>
            );
          })}

          {/* Group counter */}
          {groupQuestions.length > 1 && (
            <div className="exam-take__group-counter">
              {groupQuestions[0]._subExGroup ? `Groupe ${groupQuestions[0]._subExGroup}` : 'Groupe'} — {groupQuestions.length} questions ({groupQuestions[0]._flatIdx + 1}–{groupQuestions[groupQuestions.length - 1]._flatIdx + 1} sur {questions.length})
            </div>
          )}

          {/* Navigation — moves by group */}
          <div className="exam-take__question-nav">
            <button
              className="button button--ghost"
              disabled={isFirstGroup}
              onClick={() => {
                const prev = questionGroups[currentGroupIdx - 1];
                if (prev) setCurrentQ(prev.start);
              }}
              type="button"
            >
              ← Précédent
            </button>
            {!isLastGroup ? (
              <button
                className="button button--primary"
                onClick={() => {
                  const next = questionGroups[currentGroupIdx + 1];
                  if (next) setCurrentQ(next.start);
                }}
                type="button"
              >
                Suivant →
              </button>
            ) : (
              <button
                className="button button--primary"
                onClick={() => setShowConfirm(true)}
                type="button"
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
          <div
            className="exam-take__modal card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-submit-dialog-title"
            aria-describedby="exam-submit-dialog-desc"
          >
            <h3 id="exam-submit-dialog-title">Soumettre l'examen ?</h3>
            <p id="exam-submit-dialog-desc">
              Vous avez répondu à <strong>{answeredCount}</strong> sur{' '}
              <strong>{questions.length}</strong> questions.
              {answeredCount < questions.length && (
                <span className="exam-take__modal-warning">
                  {' '}⚠️ {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? 's' : ''} sans réponse.
                </span>
              )}
            </p>
            <div className="exam-take__modal-actions">
              <button className="button button--ghost" onClick={() => setShowConfirm(false)} type="button">
                Continuer l'examen
              </button>
              <button className="button button--primary" onClick={handleSubmit} type="button">
                Soumettre maintenant
              </button>
              </div>
            </div>
          </div>
      )}

      {/* Passage slide-over panel — kept for quick reference while scrolled down */}
      {showPassage && cleanInstructions && cleanInstructions.length > 200 && (
        <div className="exam-take__overlay" onClick={() => setShowPassage(false)}>
          <div
            className="exam-take__passage-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-passage-title"
          >
            <div className="exam-take__passage-panel-header">
              <h3 id="exam-passage-title">📖 Texte de référence</h3>
              <button className="exam-take__passage-panel-close" onClick={() => setShowPassage(false)} type="button">✕</button>
            </div>
            <div className="exam-take__passage-panel-body">
              <InstructionRenderer text={cleanInstructions} />
            </div>
          </div>
        </div>
      )}
      </div>
      </section>
  );
};

// ── Section Header (short instructions inline) ─────────────────────────────

function SectionHeader({ title, instructions }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasInstructions = !!instructions?.trim();

  return (
    <div className="exam-take__section-header">
      <div
        className="exam-take__section-header-top"
        onClick={() => hasInstructions && setCollapsed((c) => !c)}
        role={hasInstructions ? 'button' : undefined}
        tabIndex={hasInstructions ? 0 : undefined}
        onKeyDown={(e) => { if (hasInstructions && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setCollapsed((c) => !c); } }}
      >
        <h3>{title}</h3>
        {hasInstructions && (
          <button
            className="exam-take__section-toggle"
            type="button"
            aria-label={collapsed ? 'Afficher les instructions' : 'Masquer les instructions'}
            tabIndex={-1}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
      </div>
      {hasInstructions && !collapsed && (
        <InstructionRenderer text={instructions} />
      )}
    </div>
  );
}

// ── Reading Passage (always-visible panel for comprehension text) ────────────

function ReadingPassage({ text }) {
  const [expanded, setExpanded] = useState(true);
  if (!text) return null;

  return (
    <div className={`exam-take__reading-passage ${expanded ? '' : 'exam-take__reading-passage--collapsed'}`}>
      <div className="exam-take__reading-passage-bar" onClick={() => setExpanded((e) => !e)}>
        <span className="exam-take__reading-passage-icon">📖</span>
        <span className="exam-take__reading-passage-label">Texte de référence</span>
        <button
          className="exam-take__reading-passage-toggle"
          type="button"
          aria-label={expanded ? 'Réduire le texte' : 'Afficher le texte'}
          tabIndex={-1}
        >
          {expanded ? '▲ Réduire' : '▼ Afficher le texte'}
        </button>
      </div>
      {expanded && (
        <div className="exam-take__reading-passage-body">
          <InstructionRenderer text={text} />
        </div>
      )}
    </div>
  );
}

// ── Fill-in-the-blank inline renderer ────────────────────────────────────────

/**
 * Renders question text with inline <input> fields replacing blank placeholders.
 * Supports single and multiple blanks. Values stored as pipe-separated string.
 * Parenthetical hints like (plan) are shown as subtle labels above the input.
 */
function FillBlankText({ text, index, value, onChange, disabled }) {
  // Split text on blank placeholders, keeping surrounding text
  const parts = text.split(BLANK_RE);
  const blankCount = parts.length - 1;

  // For multiple blanks, store values pipe-separated: "val1|val2|val3"
  const values = blankCount > 1
    ? (value || '').split('|').concat(Array(blankCount).fill('')).slice(0, blankCount)
    : [value || ''];

  const handleChange = (blankIdx, newVal) => {
    if (blankCount <= 1) {
      onChange(index, newVal);
    } else {
      const updated = [...values];
      updated[blankIdx] = newVal;
      onChange(index, updated.join('|'));
    }
  };

  // Detect parenthetical hint right after a blank, e.g. " (plan)"
  const hintRe = /^\s*\(([^)]+)\)/;

  return (
    <div className="exam-take__fill-blank-text">
      {parts.map((segment, i) => {
        // Check if this segment starts with a parenthetical hint for the PREVIOUS blank
        let hint = '';
        let cleanSegment = segment;
        if (i > 0) {
          const hintMatch = segment.match(hintRe);
          if (hintMatch) {
            hint = hintMatch[1];
            cleanSegment = segment.slice(hintMatch[0].length);
          }
        }

        return (
          <React.Fragment key={i}>
            {/* Inline blank input (before this text segment, except for first) */}
            {i > 0 && (
              <span className="exam-take__inline-blank-wrap">
                {hint && <span className="exam-take__inline-blank-hint">{hint}</span>}
                <input
                  type="text"
                  className="exam-take__inline-blank"
                  value={values[i - 1]}
                  onChange={(e) => handleChange(i - 1, e.target.value)}
                  placeholder={hint || '…'}
                  autoComplete="off"
                  spellCheck="false"
                  disabled={disabled}
                  style={hint ? { minWidth: `${Math.max(hint.length * 0.6 + 2, 5)}em` } : undefined}
                />
              </span>
            )}
            {/* Text segment */}
            {cleanSegment && <span><MathText text={cleanSegment} /></span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Question Hints (progressive reveal for ALL question types) ───────────────

function QuestionHints({ hints }) {
  const [revealed, setRevealed] = useState(0);

  if (!hints || !Array.isArray(hints) || hints.length === 0) return null;

  const canReveal = revealed < hints.length;

  return (
    <div className="qa-hints">
      {/* Revealed hints */}
      {hints.slice(0, revealed).map((hint, i) => (
        <div key={i} className="qa-hints__item" style={{ animationDelay: `${i * 0.05}s` }}>
          <span className="qa-hints__icon">💡</span>
          <span className="qa-hints__text"><MathText text={hint} /></span>
        </div>
      ))}

      {/* Reveal button */}
      {canReveal && (
        <button
          type="button"
          className="qa-hints__btn"
          onClick={() => setRevealed(r => r + 1)}
        >
          💡 {revealed === 0 ? 'Obtenir un indice' : 'Indice suivant'}{' '}
          <span className="qa-hints__counter">({revealed}/{hints.length})</span>
        </button>
      )}
    </div>
  );
}

// ── Scaffolded Answer (Khan Academy-inspired step-by-step) ───────────────────

// Subjects that benefit from the MathKeyboard (formulas, equations, symbols).
const MATH_SUBJECTS = new Set([
  'Mathématiques', 'Physique', 'Chimie', 'SVT', 'Informatique',
]);

function ScaffoldedAnswer({ question, index, value, onChange, mathMode = false }) {
  const template = question.scaffold_text;
  const blanks = question.scaffold_blanks || [];
  const answerParts = question.answer_parts || [];
  const hasGrading = answerParts.length > 0;

  const [validated, setValidated] = React.useState({});
  const [aiFeedback, setAiFeedback] = React.useState({});
  const [checked, setChecked] = React.useState(false);
  const [grading, setGrading] = React.useState(false);
  const [showSolution, setShowSolution] = React.useState(false);
  const [focusedBlank, setFocusedBlank] = React.useState(null);
  const inputRefs = useRef([]);

  // Parse stored JSON → array of blank values
  const blankValues = useMemo(() => {
    if (!value) return blanks.map(() => '');
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.scaffold && Array.isArray(parsed.scaffold)) {
        return blanks.map((_, i) => parsed.scaffold[i] || '');
      }
    } catch { /* not JSON yet */ }
    return blanks.map(() => '');
  }, [value, blanks]);

  const serialize = useCallback((newValues) => {
    onChange(index, JSON.stringify({ scaffold: newValues }));
  }, [index, onChange]);

  const setBlank = useCallback((blankIdx, val) => {
    const updated = [...blankValues];
    updated[blankIdx] = val;
    if (checked) { setChecked(false); setValidated({}); setAiFeedback({}); }
    serialize(updated);
  }, [blankValues, serialize, checked]);

  // Normalize for comparison
  const normalize = useCallback((s) => (s || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^\$+|\$+$/g, '').replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\,/g, '').replace(/\s+/g, ' ').trim(), []);

  // Minimum expected answer length to trigger AI grading (short answers grade fine by exact match)
  const AI_THRESHOLD = 25;

  // Check all blanks: exact match first, then AI for long-text blanks that fail
  const checkAnswers = useCallback(async () => {
    if (!hasGrading) return;
    setGrading(true);
    const results = {};
    const needsAI = [];

    // ── Pass 1: exact / numeric matching (instant) ──
    blanks.forEach((_, bi) => {
      const userVal = (blankValues[bi] || '').trim();
      if (!userVal) { results[bi] = undefined; return; }
      const part = answerParts[bi];
      if (!part) { results[bi] = undefined; return; }
      const allAcceptable = [part.answer, ...(part.alternatives || [])];
      const userNorm = normalize(userVal);
      let isCorrect = false;
      for (const ans of allAcceptable) {
        const expected = normalize(ans);
        if (!expected) continue;
        if (userNorm === expected) { isCorrect = true; break; }
        const u = parseFloat(userNorm.replace(/,/g, '.'));
        const e = parseFloat(expected.replace(/,/g, '.'));
        if (!isNaN(u) && !isNaN(e) && Math.abs(u - e) <= Math.max(Math.abs(e) * 0.01, 0.01)) {
          isCorrect = true; break;
        }
        // Fuzzy word-subset match for non-math subjects
        if (!mathMode) {
          const fuzzyNorm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
          const fu = fuzzyNorm(userVal);
          const fe = fuzzyNorm(ans || '');
          if (fu === fe) { isCorrect = true; break; }
          const expectedWords = fe.split(' ').filter(w => w.length >= 3);
          const userWords = fu.split(' ').filter(w => w.length >= 3);
          if (expectedWords.length > 1 && userWords.length > 0) {
            const matchCount = userWords.filter(uw => expectedWords.some(ew => ew === uw)).length;
            if (matchCount > 0) { isCorrect = true; break; }
          }
        }
      }
      if (isCorrect) {
        results[bi] = true;
      } else {
        // If the expected answer is long text, queue for AI; otherwise mark wrong
        const expectedLen = (part.answer || '').trim().length;
        if (!mathMode && expectedLen > AI_THRESHOLD) {
          needsAI.push({
            index: bi,
            label: blanks[bi]?.label || `Étape ${bi + 1}`,
            userAnswer: userVal,
            expectedAnswer: part.answer,
            alternatives: part.alternatives || [],
          });
          results[bi] = 'pending'; // placeholder
        } else {
          results[bi] = false;
        }
      }
    });

    // ── Pass 2: AI grading for long-text blanks that failed exact match ──
    if (needsAI.length > 0) {
      // Show the exact-match results immediately, with pending blanks loading
      setValidated({ ...results });
      setChecked(true);

      try {
        const response = await fetch('/api/grade-scaffold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question._displayText || question.question || '',
            blanks: needsAI,
          }),
        });
        if (response.ok) {
          const { results: aiResults } = await response.json();
          const newFeedback = {};
          (aiResults || []).forEach(r => {
            results[r.index] = !!r.isCorrect;
            if (r.feedback) newFeedback[r.index] = r.feedback;
          });
          setAiFeedback(newFeedback);
        } else {
          // API failure — mark pending blanks as false with note
          needsAI.forEach(b => { results[b.index] = false; });
        }
      } catch {
        needsAI.forEach(b => { results[b.index] = false; });
      }
    }

    setValidated(results);
    setChecked(true);
    setGrading(false);
  }, [hasGrading, answerParts, blankValues, blanks, normalize, mathMode, question]);

  // Handle Enter key → move to next blank or check
  const handleKeyDown = useCallback((e, bi) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (bi < blanks.length - 1) {
        inputRefs.current[bi + 1]?.focus();
      } else {
        checkAnswers();
      }
    }
  }, [blanks.length, checkAnswers]);

  const filledCount = blankValues.filter(v => v.trim()).length;
  const correctCount = Object.values(validated).filter(v => v === true).length;
  const incorrectCount = Object.values(validated).filter(v => v === false).length;
  const totalBlanks = blanks.length;

  if (!template || totalBlanks === 0) return null;

  // Extract the solution text (everything before the first {{n}} marker)
  const firstBlankPos = template.search(/\{\{\d+\}\}/);
  const solutionText = firstBlankPos > 0 ? template.slice(0, firstBlankPos).trim() : '';

  const allCorrect = checked && correctCount === totalBlanks;
  const allFilled = filledCount === totalBlanks;

  return (
    <div className={`ka-scaffold ${allCorrect ? 'ka-scaffold--complete' : ''}`}>
      {/* ── Feedback banner (KA-style: appears after checking) ── */}
      {checked && allCorrect && (
        <div className="ka-scaffold__banner ka-scaffold__banner--correct">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          <span>Correct !</span>
        </div>
      )}
      {checked && incorrectCount > 0 && (
        <div className="ka-scaffold__banner ka-scaffold__banner--incorrect">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          <span>Incorrect — réessayez.</span>
        </div>
      )}

      {/* ── Blank inputs — flat KA-style label + input rows ── */}
      <div className="ka-scaffold__fields">
        {blanks.map((blank, bi) => {
          const vState = validated[bi];
          let fieldClass = 'ka-scaffold__field';
          if (vState === true) fieldClass += ' ka-scaffold__field--correct';
          else if (vState === false) fieldClass += ' ka-scaffold__field--wrong';
          else if (vState === 'pending') fieldClass += ' ka-scaffold__field--pending';

          return (
            <div key={bi} className={fieldClass}>
              {blank.label && (
                <label className="ka-scaffold__label" htmlFor={`scaffold-${index}-${bi}`}>
                  <MathText text={blank.label} />
                  {totalBlanks > 1 && <> =</>}
                </label>
              )}
              <div className="ka-scaffold__input-wrap">
                {mathMode ? (
                  <MathKeyboard
                    ref={el => inputRefs.current[bi] = el}
                    id={`scaffold-${index}-${bi}`}
                    value={blankValues[bi] || ''}
                    onChange={val => setBlank(bi, val)}
                    onFocus={() => setFocusedBlank(bi)}
                    onBlur={() => setFocusedBlank(null)}
                    onKeyDown={e => handleKeyDown(e, bi)}
                    placeholder="Votre réponse"
                    ariaLabel={blank.label || `Étape ${bi + 1}`}
                    disabled={allCorrect}
                    compact={totalBlanks > 4}
                  />
                ) : (
                  <input
                    ref={el => inputRefs.current[bi] = el}
                    id={`scaffold-${index}-${bi}`}
                    className="ka-scaffold__text-input"
                    type="text"
                    value={blankValues[bi] || ''}
                    onChange={e => setBlank(bi, e.target.value)}
                    onFocus={() => setFocusedBlank(bi)}
                    onBlur={() => setFocusedBlank(null)}
                    onKeyDown={e => handleKeyDown(e, bi)}
                    placeholder="Votre réponse"
                    aria-label={blank.label || `Étape ${bi + 1}`}
                    disabled={allCorrect}
                  />
                )}
              </div>
              {/* Show AI grading spinner for pending blanks */}
              {vState === 'pending' && (
                <div className="ka-scaffold__ai-loading">
                  <span className="ka-scaffold__spinner" /> Évaluation en cours…
                </div>
              )}
              {/* Show AI feedback when available */}
              {aiFeedback[bi] && vState !== 'pending' && (
                <div className={`ka-scaffold__ai-feedback ${vState === true ? 'ka-scaffold__ai-feedback--correct' : 'ka-scaffold__ai-feedback--wrong'}`}>
                  {aiFeedback[bi]}
                </div>
              )}
              {/* Show correct answer on wrong attempt */}
              {vState === false && answerParts[bi] && (
                <div className="ka-scaffold__correction">
                  Réponse : <MathText text={answerParts[bi].answer} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Hint toggle — KA-style collapsible ── */}
      {solutionText && (
        <div className="ka-scaffold__hint-area">
          <button
            className="ka-scaffold__hint-btn"
            onClick={() => setShowSolution(s => !s)}
            type="button"
          >
            {showSolution ? 'Masquer la démarche' : 'Voir la démarche'}
          </button>
          {showSolution && (
            <div className="ka-scaffold__hint-body">
              {solutionText.split('\n').map((line, li) => (
                <React.Fragment key={li}>
                  {li > 0 && <br />}
                  <MathText text={line} />
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom bar: progress dots + Check — KA-style ── */}
      <div className="ka-scaffold__bottom">
        <div className="ka-scaffold__dots">
          {blanks.map((_, bi) => {
            let dotClass = 'ka-scaffold__dot';
            if (validated[bi] === true) dotClass += ' ka-scaffold__dot--correct';
            else if (validated[bi] === false) dotClass += ' ka-scaffold__dot--wrong';
            else if (blankValues[bi]?.trim()) dotClass += ' ka-scaffold__dot--filled';
            if (focusedBlank === bi) dotClass += ' ka-scaffold__dot--active';
            return (
              <button
                key={bi}
                className={dotClass}
                onClick={() => inputRefs.current[bi]?.focus()}
                title={`Étape ${bi + 1}`}
                type="button"
                aria-label={`Aller à l'étape ${bi + 1}`}
              />
            );
          })}
        </div>

        <button
          className={`ka-scaffold__check ${allCorrect ? 'ka-scaffold__check--done' : ''}`}
          onClick={checkAnswers}
          disabled={!allFilled || allCorrect || grading}
          type="button"
        >
          {grading ? 'Évaluation…' : allCorrect ? 'Terminé ✓' : checked ? 'Revérifier' : 'Vérifier'}
        </button>
      </div>
    </div>
  );
}

// ── Immediate Feedback Card (shown inline after grading a question) ─────────

function ImmediateFeedback({ result, question, color }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const { status, essayFeedback } = result;

  const statusConfig = {
    correct: { icon: '✓', label: 'Correct', cls: 'exam-take__feedback--correct' },
    partial: { icon: '◐', label: 'Partiellement correct', cls: 'exam-take__feedback--partial' },
    incorrect: { icon: '✗', label: 'Incorrect', cls: 'exam-take__feedback--incorrect' },
    'scaffold-complete': { icon: '✓', label: 'Complété', cls: 'exam-take__feedback--correct' },
    manual: { icon: '👁', label: 'Évaluation manuelle', cls: 'exam-take__feedback--manual' },
    unanswered: { icon: '—', label: 'Sans réponse', cls: 'exam-take__feedback--unanswered' },
  };
  const cfg = statusConfig[status] || statusConfig.manual;

  const awarded = result.result?.awarded ?? 0;
  const maxPts = result.result?.maxPoints ?? (question.points || 1);

  return (
    <div className={`exam-take__feedback ${cfg.cls}`}>
      {/* Status banner */}
      <div className="exam-take__feedback-banner">
        <span className="exam-take__feedback-icon">{cfg.icon}</span>
        <span className="exam-take__feedback-label">{cfg.label}</span>
        <span className="exam-take__feedback-score">{awarded}/{maxPts} pt{maxPts > 1 ? 's' : ''}</span>
      </div>

      {/* Essay AI feedback */}
      {essayFeedback && (
        <div className="exam-take__feedback-essay">
          <div className="exam-take__feedback-essay-score">
            <span>🤖 Note IA :</span> <strong>{essayFeedback.score}</strong>
          </div>
          {essayFeedback.feedback && (
            <p className="exam-take__feedback-essay-text">{essayFeedback.feedback}</p>
          )}
        </div>
      )}

      {/* Correct answer (for non-essay auto-gradable) */}
      {status === 'incorrect' && question.correct && question.type !== 'essay' && (
        <div className="exam-take__feedback-correct">
          <span className="exam-take__feedback-correct-label">Réponse correcte :</span>{' '}
          <strong><MathText text={
            question.type === 'multiple_choice' && question.options
              ? `${question.correct.toUpperCase()}. ${question.options[question.correct] || question.correct}`
              : question.correct
          } /></strong>
        </div>
      )}

      {/* Scaffold blank results */}
      {result.result?.blankResults && (
        <div className="exam-take__feedback-blanks">
          {result.result.blankResults.map((br, i) => (
            <div key={i} className={`exam-take__feedback-blank ${br.correct ? 'exam-take__feedback-blank--ok' : 'exam-take__feedback-blank--wrong'}`}>
              <span>{br.correct ? '✓' : '✗'} {br.label}:</span>{' '}
              {!br.correct && <><span className="exam-take__feedback-blank-user">{br.userValue || '—'}</span> → <strong><MathText text={br.expectedAnswer} /></strong></>}
              {br.correct && <strong><MathText text={br.userValue} /></strong>}
            </div>
          ))}
        </div>
      )}

      {/* Explanation toggle */}
      {(question.explanation || question.model_answer) && (
        <div className="exam-take__feedback-explain">
          <button
            className="exam-take__feedback-explain-btn"
            type="button"
            onClick={() => setShowExplanation((s) => !s)}
          >
            {showExplanation ? '▲ Masquer l\'explication' : '▼ Voir l\'explication'}
          </button>
          {showExplanation && (
            <div className="exam-take__feedback-explain-body">
              {question.explanation && (
                <div className="exam-take__feedback-explain-text">
                  <InstructionRenderer text={question.explanation} />
                </div>
              )}
              {question.model_answer && (
                <div className="exam-take__feedback-explain-model">
                  <strong>Réponse modèle :</strong>
                  <InstructionRenderer text={question.model_answer} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Question Input Components ────────────────────────────────────────────────

function QuestionInput({ question, index, value, onChange, disabled, subject }) {
  const type = question.type || 'unknown';

  // Route proof / demonstration questions to the step-by-step input
  if (isProofQuestion(question, subject)) {
    return <ProofInput question={question} index={index} value={value} onChange={onChange} disabled={disabled} />;
  }

  switch (type) {
    case 'multiple_choice':
      return <MCQInput question={question} index={index} value={value} onChange={onChange} disabled={disabled} />;
    case 'multiple_select':
      return <MultiSelectInput question={question} index={index} value={value} onChange={onChange} disabled={disabled} />;
    case 'true_false':
      return <TrueFalseInput index={index} value={value} onChange={onChange} disabled={disabled} />;
    case 'fill_blank':
    case 'calculation':
    case 'short_answer':
      return <TextInput type={type} index={index} value={value} onChange={onChange} disabled={disabled} />;
    case 'essay':
      return <EssayInput index={index} value={value} onChange={onChange} disabled={disabled} />;
    case 'matching':
      return <MatchingInput question={question} index={index} value={value} onChange={onChange} disabled={disabled} />;
    default:
      return <TextInput type={type} index={index} value={value} onChange={onChange} disabled={disabled} />;
  }
}

// ── Proof / Demonstration Step-by-Step Input (Khan Academy style) ─────────

const JUSTIFICATION_OPTIONS = [
  '', 'Par définition', 'Par hypothèse', 'Par simplification', 'Par factorisation',
  'Par substitution', 'Par identité remarquable', 'Par calcul', 'Par développement',
  'Par récurrence', 'Par l\'absurde', 'Par contraposée', 'D\'après le théorème',
  'En utilisant la propriété', 'On en déduit que', 'Autre',
];

/** Encouraging micro-feedback messages */
const ENCOURAGEMENTS = [
  'Bien joué ! 🎉',
  'Super ! Continue 💪',
  'Bravo ! 👏',
  'Excellent travail ! ⭐',
  'Bien raisonné ! 🧠',
];

function ProofInput({ question, index, value, onChange }) {
  const katexReady = useKatex();
  const questionText = question?._displayText || question?.question || '';
  const subtype = useMemo(() => detectProofSubtype(questionText), [questionText]);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [encouragement, setEncouragement] = useState('');

  // Parse stored JSON value → { steps, finalAnswer }
  const { steps, finalAnswer } = useMemo(() => {
    if (!value) {
      return {
        steps: subtype.scaffoldSteps.map(() => ({ math: '', justification: '' })),
        finalAnswer: '',
      };
    }
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.steps && Array.isArray(parsed.steps)) {
        return { steps: parsed.steps, finalAnswer: parsed.finalAnswer || '' };
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { steps: parsed, finalAnswer: '' };
      }
    } catch { /* not JSON yet */ }
    if (typeof value === 'string' && value.trim()) {
      return { steps: [{ math: value, justification: '' }], finalAnswer: '' };
    }
    return {
      steps: subtype.scaffoldSteps.map(() => ({ math: '', justification: '' })),
      finalAnswer: '',
    };
  }, [value, subtype]);

  // Count completed steps for progress
  const completedCount = steps.filter(s => s.math?.trim()).length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const serialize = useCallback((newSteps, newFinal) => {
    onChange(index, JSON.stringify({ steps: newSteps, finalAnswer: newFinal }));
  }, [index, onChange]);

  const setStepField = useCallback((stepIdx, field, val) => {
    const updated = steps.map((s, i) => i === stepIdx ? { ...s, [field]: val } : s);
    // Show encouragement when a step is first completed
    if (field === 'math' && val.trim() && !steps[stepIdx].math?.trim()) {
      setEncouragement(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
      setTimeout(() => setEncouragement(''), 2000);
    }
    serialize(updated, finalAnswer);
  }, [steps, finalAnswer, serialize]);

  const addStep = useCallback(() => {
    serialize([...steps, { math: '', justification: '' }], finalAnswer);
  }, [steps, finalAnswer, serialize]);

  const removeStep = useCallback((stepIdx) => {
    if (steps.length <= 1) return;
    serialize(steps.filter((_, i) => i !== stepIdx), finalAnswer);
  }, [steps, finalAnswer, serialize]);

  const setFinalAnswer = useCallback((val) => {
    serialize(steps, val);
  }, [steps, serialize]);

  const revealNextHint = useCallback(() => {
    setHintsRevealed(h => Math.min(h + 1, subtype.scaffoldSteps.length));
  }, [subtype]);

  const canRevealHint = hintsRevealed < subtype.scaffoldSteps.length;

  return (
    <div className="ka-proof">
      {/* Header with type badge and progress */}
      <div className="ka-proof__header">
        <div className="ka-proof__header-left">
          <span className="ka-proof__type-badge">{subtype.icon || '📐'} {subtype.label}</span>
        </div>
        <div className="ka-proof__header-right">
          <div className="ka-proof__progress">
            <div className="ka-proof__progress-bar">
              <div className="ka-proof__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="ka-proof__progress-text">{completedCount}/{totalSteps}</span>
          </div>
        </div>
      </div>

      {/* Encouragement toast */}
      {encouragement && (
        <div className="ka-proof__encouragement">{encouragement}</div>
      )}

      {/* Steps timeline */}
      <div className="ka-proof__timeline">
        {steps.map((step, i) => {
          const isDone = !!step.math?.trim();
          const isActive = !isDone && (i === 0 || !!steps[i - 1]?.math?.trim());
          const hint = subtype.scaffoldSteps[i]?.hint || '';
          const hintVisible = i < hintsRevealed;

          return (
            <div key={i} className={`ka-step ${isDone ? 'ka-step--done' : ''} ${isActive ? 'ka-step--active' : ''}`}>
              {/* Timeline connector */}
              <div className="ka-step__rail">
                <div className="ka-step__dot">
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span className="ka-step__dot-number">{i + 1}</span>
                  )}
                </div>
                {i < totalSteps - 1 && <div className="ka-step__connector" />}
              </div>

              {/* Step content */}
              <div className="ka-step__content">
                <div className="ka-step__label">Étape {i + 1}</div>

                {/* Hint pill (revealed progressively) */}
                {hintVisible && hint && !isDone && (
                  <div className="ka-step__hint">
                    <span className="ka-step__hint-icon">💡</span>
                    {hint}
                  </div>
                )}

                {/* Math input */}
                <textarea
                  className="ka-step__input"
                  value={step.math}
                  onChange={(e) => setStepField(i, 'math', e.target.value)}
                  placeholder={isDone ? '' : 'Écrivez votre expression ici…'}
                  rows={1}
                  spellCheck="false"
                />

                {/* Live KaTeX preview */}
                {step.math && (/\$/.test(step.math) || /\\[a-zA-Z]/.test(step.math)) && katexReady && (
                  <div className="ka-step__preview">
                    <span dangerouslySetInnerHTML={renderWithKatex(step.math, katexReady)} />
                  </div>
                )}

                {/* Justification (collapsible, minimal) */}
                <JustificationPicker
                  value={step.justification}
                  onChange={(val) => setStepField(i, 'justification', val)}
                />

                {/* Remove button */}
                {totalSteps > 1 && (
                  <button
                    type="button"
                    className="ka-step__remove"
                    onClick={() => removeStep(i)}
                    aria-label="Supprimer cette étape"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="ka-proof__actions">
        <button type="button" className="ka-proof__add-btn" onClick={addStep}>
          + Ajouter une étape
        </button>
        {canRevealHint && (
          <button type="button" className="ka-proof__hint-btn" onClick={revealNextHint}>
            💡 Obtenir un indice
          </button>
        )}
      </div>

      {/* Final Answer field (Khan-style answer box) */}
      {subtype.askFinalAnswer && (
        <div className="ka-proof__answer">
          <div className="ka-proof__answer-header">
            <span className="ka-proof__answer-icon">🎯</span>
            <label className="ka-proof__answer-label">{subtype.finalLabel || 'Résultat final'}</label>
            <span className="ka-proof__answer-badge">Vérifié automatiquement</span>
          </div>
          <input
            className="ka-proof__answer-input"
            type="text"
            value={finalAnswer}
            onChange={(e) => setFinalAnswer(e.target.value)}
            placeholder={`Votre ${(subtype.finalLabel || 'résultat').toLowerCase()}…`}
          />
          {finalAnswer && (/\$/.test(finalAnswer) || /\\[a-zA-Z]/.test(finalAnswer)) && katexReady && (
            <div className="ka-proof__answer-preview">
              <span dangerouslySetInnerHTML={renderWithKatex(finalAnswer, katexReady)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsible justification picker — click to expand, minimal when collapsed */
function JustificationPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);

  if (!open && !value) {
    return (
      <button type="button" className="ka-justify__toggle" onClick={() => setOpen(true)}>
        + Justification
      </button>
    );
  }

  return (
    <div className="ka-justify">
      <select
        className="ka-justify__select"
        value={JUSTIFICATION_OPTIONS.includes(value) ? value : (value ? 'Autre' : '')}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'Autre') {
            if (JUSTIFICATION_OPTIONS.includes(value)) onChange('');
          } else {
            onChange(val);
          }
        }}
      >
        <option value="">— Choisir —</option>
        {JUSTIFICATION_OPTIONS.slice(1).map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {value && !JUSTIFICATION_OPTIONS.includes(value) && (
        <input
          className="ka-justify__custom"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Justification personnalisée…"
        />
      )}
      {!value && (
        <button type="button" className="ka-justify__close" onClick={() => setOpen(false)}>✕</button>
      )}
    </div>
  );
}

function MCQInput({ question, index, value, onChange, disabled }) {
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
            <span className="exam-take__mcq-text"><MathText text={text} /></span>
          </label>
        );
      })}
    </div>
  );
}

function MultiSelectInput({ question, index, value, onChange, disabled }) {
  const options = question.options || {};
  const entries = Object.entries(options);

  // Parse stored JSON array of selected keys
  const selected = useMemo(() => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* not JSON */ }
    return [];
  }, [value]);

  const toggle = useCallback((key) => {
    const next = selected.includes(key)
      ? selected.filter(k => k !== key)
      : [...selected, key];
    onChange(index, JSON.stringify(next));
  }, [selected, index, onChange]);

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
    <div className="exam-take__mcq-options exam-take__mcq-options--multi">
      <p className="exam-take__multi-hint">☑️ Plusieurs réponses possibles</p>
      {entries.map(([key, text]) => {
        const isSelected = selected.includes(key);
        return (
          <label
            key={key}
            className={`exam-take__mcq-option ${isSelected ? 'exam-take__mcq-option--selected' : ''}`}
          >
            <input
              type="checkbox"
              value={key}
              checked={isSelected}
              onChange={() => toggle(key)}
              className="exam-take__mcq-checkbox"
              disabled={disabled}
            />
            <span className="exam-take__mcq-key">{key.toUpperCase()}</span>
            <span className="exam-take__mcq-text"><MathText text={text} /></span>
          </label>
        );
      })}
    </div>
  );
}

function TrueFalseInput({ index, value, onChange, disabled }) {
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
              disabled={disabled}
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function TextInput({ type, index, value, onChange, disabled }) {
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
      disabled={disabled}
    />
  );
}

function EssayInput({ index, value, onChange, disabled }) {
  const wordCount = (value || '').trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="exam-take__essay-wrap">
      <textarea
        className="exam-take__essay-input"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        placeholder="Rédigez votre réponse ici…"
        rows={8}
        disabled={disabled}
      />
      <div className="exam-take__essay-wordcount">
        {wordCount} mot{wordCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

function MatchingInput({ question, index, value, onChange, disabled }) {
  const options = question.options || {};
  const entries = Object.entries(options);

  // If we have structured matching pairs (key→value), render a proper matching UI
  if (entries.length > 0) {
    // Parse stored JSON value → { [key]: selectedValue }
    const selections = useMemo(() => {
      try { return value ? JSON.parse(value) : {}; } catch { return {}; }
    }, [value]);

    // Get unique target values (the right-hand side to match to)
    const targets = useMemo(() => {
      const vals = entries.map(([, v]) => v);
      return [...new Set(vals)].sort();
    }, [entries]);

    const setMatch = (key, val) => {
      const next = { ...selections, [key]: val };
      onChange(index, JSON.stringify(next));
    };

    const matchedCount = entries.filter(([k]) => selections[k]).length;

    return (
      <div className="exam-take__matching-structured">
        <div className="exam-take__matching-progress">
          {matchedCount}/{entries.length} associés
        </div>
        <div className="exam-take__matching-pairs">
          {entries.map(([key]) => (
            <div className="exam-take__matching-pair" key={key}>
              <span className="exam-take__matching-item">{key}</span>
              <span className="exam-take__matching-arrow">→</span>
              <select
                className="exam-take__matching-select"
                value={selections[key] || ''}
                onChange={(e) => setMatch(key, e.target.value)}
                disabled={disabled}
              >
                <option value="">— Choisir —</option>
                {targets.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback for matching without structured options: text input
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
        disabled={disabled}
      />
    </div>
  );
}

export default ExamTake;
