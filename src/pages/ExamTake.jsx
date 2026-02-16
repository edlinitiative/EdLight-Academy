import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FigureRenderer from '../components/FigureRenderer';
import InstructionRenderer from '../components/InstructionRenderer';
import { useKatex, renderWithKatex } from '../utils/shared';
import {
  flattenQuestions,
  gradeExam,
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

function isProofQuestion(question) {
  const text = question._displayText || question.question || '';
  const type = question.type || '';
  // Only activate for open-ended types that can't be auto-graded
  if (!['calculation', 'short_answer', 'essay'].includes(type)) return false;
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
  const { examIndex } = useParams();
  const navigate = useNavigate();
  const katexReady = useKatex();

  const { data: rawExams, isLoading, error } = useExamCatalog();

  const idx = parseInt(examIndex, 10);
  const exam = rawExams?.[idx];
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
  const [examStarted, setExamStarted] = useState(false);

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

  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    if (v == null || v === '') return false;
    // Proof steps stored as JSON — count as answered if any step has content or final answer
    if (typeof v === 'string' && v.startsWith('{') || v.startsWith('[')) {
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
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
    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentQ]);

  // Passage panel state (for comprehension sections)
  const [showPassage, setShowPassage] = useState(false);

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
        examTitle: normalizeExamTitle(exam),
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
            <button className="button button--primary" onClick={() => navigate('/exams')}>
              ← Retour aux examens
            </button>
          </div>
        </div>
      </section>
    );
  }

  const subject = normalizeSubject(exam.subject);
  const color = subjectColor(subject);

  // ── Exam Intro splash ───────────────────────────────────────────────────
  if (!examStarted) {
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
            <button className="exam-cover__back" onClick={() => navigate('/exams')}>
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

          {/* CTA */}
          <div className="exam-cover__cta">
            <button
              className="exam-cover__start-btn"
              style={{ background: color }}
              onClick={() => setExamStarted(true)}
            >
              <span>Commencer l'examen</span>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
            <p className="exam-cover__cta-hint">Bonne chance ! 🍀</p>
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
            <button className="button button--ghost button--sm" onClick={() => navigate('/exams')}>
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
                        let cls = 'exam-take__nav-btn';
                        if (isInCurrentGroup) cls += ' exam-take__nav-btn--current';
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
            return (
              <div className="card exam-take__question-card" key={qIdx}>
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

                {/* Question text — inline blanks for fill_blank, normal renderer otherwise */}
                {gq.type === 'fill_blank' && hasInlineBlanks(gq._displayText || gq.question) ? (
                  <div className="exam-take__question-text">
                    <FillBlankText
                      text={gq._displayText || gq.question}
                      index={qIdx}
                      value={answers[qIdx] ?? ''}
                      onChange={setAnswer}
                    />
                  </div>
                ) : (
                  <>
                    <div className="exam-take__question-text">
                      <InstructionRenderer text={gq._displayText || gq.question} />
                    </div>
                    <div className="exam-take__answer-area">
                      <QuestionInput
                        question={gq}
                        index={qIdx}
                        value={answers[qIdx] ?? ''}
                        onChange={setAnswer}
                      />
                    </div>
                  </>
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

      {/* Passage slide-over panel — kept for quick reference while scrolled down */}
      {showPassage && cleanInstructions && cleanInstructions.length > 200 && (
        <div className="exam-take__overlay" onClick={() => setShowPassage(false)}>
          <div className="exam-take__passage-panel" onClick={(e) => e.stopPropagation()}>
            <div className="exam-take__passage-panel-header">
              <h3>📖 Texte de référence</h3>
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
function FillBlankText({ text, index, value, onChange }) {
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

// ── Question Input Components ────────────────────────────────────────────────

function QuestionInput({ question, index, value, onChange }) {
  const type = question.type || 'unknown';

  // Route proof / demonstration questions to the step-by-step input
  if (isProofQuestion(question)) {
    return <ProofInput question={question} index={index} value={value} onChange={onChange} />;
  }

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
            <span className="exam-take__mcq-text"><MathText text={text} /></span>
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
