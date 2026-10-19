import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from '../components/icons';
import DirectBankQuiz, { MAX_ATTEMPTS } from '../components/DirectBankQuiz';
import QuizResult, { entryStatus, type QuizLogEntry } from '../components/QuizResult';
import LearnSwitch from '../components/LearnSwitch';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import PracticeEntry, { ModeRules, ScopeNotice, type PracticeMode } from '../components/journey/practice/PracticeEntry';
import {
  COURSE_WIDE, countQuizzable, findCourse, isGradable, matchUnit, poolRows, resolvePracticeScope, unitOptionsFor,
} from '../components/journey/practice/practiceScope';
import { useJourneyOnce } from '../components/journey/practice/useJourneyOnce';
import { readPracticeHandoff, trackJourney } from '../utils/learningJourney';
import { toDirectItemFromRow } from '../services/quizBank';
import { useAppData } from '../hooks/useData';
import { useFocusMode } from '../hooks/useFocusMode';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { useTranslation } from 'react-i18next';
import { subjectThumbs } from './home/content';
import { loadDueReviewIds } from '../services/reviewService';
import '../components/journey/practice/practice.css';
import './Quizzes.css';

/**
 * Two activities live on this page, and §6.4 requires them to be told apart:
 *
 *   • DRILL — one question at a time, as many as you like, three tries with
 *     hints. Nothing is scored. This is "practice a subject or skill".
 *   • QUIZ — a fixed set of QUIZ_LENGTH questions from the chosen unit, start
 *     to finish, with a score at the end. This is "take a short quiz".
 *
 * Neither is timed and neither writes a grade anywhere; both feed the Revizyon
 * review map through DirectBankQuiz when a student is signed in. Every fact
 * line below states exactly that and nothing more — no invented durations.
 *
 * Arriving from a lesson (LJ-06) — `/quizzes?course=…&unit=…&lesson=…&from=lesson`
 * — the page resolves the scope against the loaded bank in the same render
 * and shows a compact confirmation instead of the selectors. A scope the bank
 * cannot serve is explained, never silently widened.
 */
const QUIZ_LENGTH = 10;

/**
 * A student's class → the catalog level that carries their programme. Only the
 * four secondary years map onto a level: 7ᵉ, 8ᵉ, 9ᵉ and Post-Bac have no
 * `NS*` courses of their own, so they keep the first available level.
 */
const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
};

/** gradeProfile().examLevel → the level path, so the exam link lands on the
 *  student's own papers rather than the generic browser. */
const EXAM_LEVEL_TO_PATH: Record<string, string> = {
  baccalaureat: '/exams/terminale',
  universite: '/exams/university',
  '9eme_af': '/exams/9e',
};

/**
 * A fixed deck for the quiz mode: distinct, auto-gradable rows of exactly the
 * chosen scope, shuffled. No widening: an empty unit yields an empty deck
 * (the page says so) — `COURSE_WIDE` is the only way to draw from the whole
 * course, and only an explicit choice sets it.
 */
function buildQuizDeck(quizBank, courseCode: string, unit: string, length = QUIZ_LENGTH) {
  const rows = [...poolRows(quizBank, courseCode, unit)];
  // Fisher-Yates: a stable `sort(() => Math.random() - 0.5)` is not a shuffle.
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const deck = [];
  const seen = new Set();
  for (const row of rows) {
    const id = row?.id ? String(row.id) : '';
    if (id && seen.has(id)) continue;
    const item = toDirectItemFromRow(row);
    // Essays and key-less questions cannot be auto-scored, so they would
    // make the score at the end a lie.
    if (!isGradable(item)) continue;
    if (id) seen.add(id);
    deck.push(item);
    if (deck.length >= length) break;
  }
  return deck;
}

interface Session {
  mode: PracticeMode;
  courseCode: string;
  unit: string;
  subjectLabel: string;
  levelLabel: string;
  unitLabel: string;
  /** Where the student came from (handoff `from`), for attribution only. */
  source: string;
  start: number;
}

const Quizzes = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { data: appData, isLoading, isError, isFetching, refetch } = useAppData();
  const quizBank = appData?.quizBank;
  const courses = useMemo(() => appData?.courses || [], [appData]);
  const userId = useStore((state) => state.user?.uid);
  const toggleAuthModal = useStore((state) => state.toggleAuthModal);
  const grade = useStore((state) => state.grade);
  const profile = gradeProfile(grade);
  /** `examLevel: null` (7ᵉ, 8ᵉ, NS1–NS3) — no national paper is theirs to sit. */
  const examsRelevant = profile.examLevel !== null;
  const examHref = (profile.examLevel && EXAM_LEVEL_TO_PATH[profile.examLevel]) || '/exams';
  const myLevel = grade ? GRADE_TO_LEVEL[grade] : '';

  // Pre-existing strings keep their i18next keys; new lines are inline FR/HT
  // (`fallbackLng: 'fr'` would show a new key in French to Kreyòl readers).
  const isCreole = String(i18n.language || '').toLowerCase().startsWith('ht');
  const tx = (fr: string, ht: string) => (isCreole ? ht : fr);


  const [quizLength, setQuizLength] = useState(QUIZ_LENGTH);
  const [mode, setMode] = useState<PracticeMode>('practice');

  // Missed questions still due for review (Revizyon), for the diagnostic and
  // the per-chapter "à revoir" column. Real data only.
  const [dueIds, setDueIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    if (!userId) { setDueIds(null); return undefined; }
    loadDueReviewIds(userId)
      .then((ids) => { if (live) setDueIds(new Set(ids.map(String))); })
      .catch(() => { if (live) setDueIds(new Set()); });
    return () => { live = false; };
  }, [userId]);

  // ── The handoff (LJ-06) ──────────────────────────────────────────────────
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const handoff = useMemo(() => readPracticeHandoff(params), [params]);
  const source = handoff?.from || 'general';
  /** Resolved in render from loaded data: no frame where the count is a guess. */
  const scope = useMemo(
    () => (appData ? resolvePracticeScope(handoff, courses, quizBank, toDirectItemFromRow) : null),
    [appData, handoff, courses, quizBank],
  );
  const [entryDismissed, setEntryDismissed] = useState(false);
  const [entryMode, setEntryMode] = useState<PracticeMode>(() => (handoff?.mode === 'practice' ? 'practice' : 'quiz'));
  useJourneyOnce('practice_handoff_opened', scope && handoff ? location.search : null, {
    status: scope?.status,
    course: scope?.courseCode || handoff?.course,
    unit: scope?.unit?.value || handoff?.unit,
    lesson: handoff?.lesson,
    from: source,
  });

  // Selection state
  const [subjectBase, setSubjectBase] = useState('');
  const [level, setLevel] = useState('');
  const [unit, setUnit] = useState('');

  const [queryDefaultsApplied, setQueryDefaultsApplied] = useState(false);
  const [pendingLevel, setPendingLevel] = useState(null);
  const [pendingUnit, setPendingUnit] = useState(null);

  const friendlySubject = useMemo(() => ({
    CHEM: t('subjects.CHEM', 'Chimie'),
    PHYS: t('subjects.PHYS', 'Physique'),
    MATH: t('subjects.MATH', 'Mathématiques'),
    ECON: t('subjects.ECON', 'Économie'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [i18n.language, t]);

  const subjectOptions = useMemo(() => {
    const uniq = new Map();
    for (const c of courses) uniq.set(c.subject, c.subject);
    return Array.from(uniq.values()).map((s: string) => ({ value: s, label: friendlySubject[s] || s }));
  }, [courses, friendlySubject]);

  const queryDefaults = useMemo(() => ({
    // /practice links carry ?matiere=ECON&niveau=NSI (the Pratiquer tab is
    // this page now); they mean the same course as ?course=ECON-NSI.
    course: ((params.get('course') || '').trim()
      || [params.get('matiere'), params.get('niveau')].filter(Boolean).join('-')).trim(),
    unit: (params.get('unit') || '').trim(),
    mode: (params.get('mode') || '').trim().toLowerCase(),
  }), [params]);

  const preferQuiz = queryDefaults.mode === 'quiz';
  useEffect(() => { if (preferQuiz) setMode('quiz'); }, [preferQuiz]);

  // Apply deep-link defaults once. The course is matched by catalog id
  // ("chem-ns1") or code ("CHEM-NSI") — a link in either shape lands on the
  // same course; one that matches nothing falls to the generic default and
  // the ScopeNotice above the hub says so.
  useEffect(() => {
    if (queryDefaultsApplied) return;
    if (!subjectOptions.length) return;
    const c = findCourse(courses, queryDefaults.course);
    if (c) {
      setSubjectBase(c.subject);
      // Staged, not written to `level`: `levelOptions` is still empty in
      // this commit and the level guard below would reset a direct write.
      if (c.level) setPendingLevel(c.level);
      const u = scope?.unit || matchUnit(unitOptionsFor(c), queryDefaults.unit);
      if (u) setPendingUnit(u.value);
    }
    setQueryDefaultsApplied(true);
  }, [queryDefaultsApplied, queryDefaults, subjectOptions, courses, scope]);

  /** The first subject that ships a course at the student's own class. */
  const defaultSubject = useMemo(() => {
    if (!subjectOptions.length) return '';
    const mine = myLevel
      ? subjectOptions.find((o) => courses.some((c) => c.subject === o.value && c.level === myLevel))
      : undefined;
    return (mine || subjectOptions[0]).value;
  }, [subjectOptions, courses, myLevel]);

  // Generic default, gated on `queryDefaultsApplied` so it never clobbers a
  // deep link (both effects run in the commit where the options arrive).
  useEffect(() => {
    if (!queryDefaultsApplied) return;
    if (!subjectBase && defaultSubject) setSubjectBase(defaultSubject);
  }, [queryDefaultsApplied, defaultSubject, subjectBase]);

  const levelOptions = useMemo(() => {
    const lvls = new Set(courses.filter((c) => c.subject === subjectBase).map((c) => c.level));
    const ordered = ['NSI', 'NSII', 'NSIII', 'NSIV'];
    const list = Array.from(lvls) as string[];
    list.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));
    return list.map((l) => ({ value: l, label: l.replace(/^NS(.*)$/i, 'NS $1') }));
  }, [courses, subjectBase]);

  useEffect(() => {
    if (pendingLevel) {
      const target = String(pendingLevel).trim().toLowerCase();
      const match = levelOptions.find((o) => String(o.value).toLowerCase() === target);
      if (match) {
        setLevel(match.value);
        setPendingLevel(null);
        return;
      }
      if (!levelOptions.length) return;
      setPendingLevel(null);
    }
    if (!levelOptions.find((o) => o.value === level)?.value) {
      const mine = myLevel && levelOptions.some((o) => o.value === myLevel) ? myLevel : '';
      setLevel(mine || levelOptions[0]?.value || '');
    }
  }, [levelOptions, level, pendingLevel, myLevel]);

  const courseCode = subjectBase && level ? `${subjectBase}-${level}` : '';
  const currentCourse = useMemo(
    () => courses.find((c) => c.code === courseCode || c.id === courseCode),
    [courses, courseCode],
  );
  // The value is the quiz bank's unit key (`U{n}`), not the module's id: the
  // bank indexes `byUnit` as `${course}|U${unit_no}`.
  const unitOptions = useMemo(() => unitOptionsFor(currentCourse), [currentCourse]);

  useEffect(() => {
    const normalize = (v) => String(v || '').trim().toLowerCase();
    if (pendingUnit) {
      const target = normalize(pendingUnit);
      const match = unitOptions.find((o) => normalize(o.value) === target || normalize(o.label) === target);
      if (match) {
        setUnit(match.value);
        setPendingUnit(null);
        return;
      }
      if (unit) return;
    }
    if (!unitOptions.find((o) => o.value === unit)?.value) {
      setUnit(unitOptions[0]?.value || '');
    }
  }, [unitOptions, unit, pendingUnit]);

  /**
   * The hub is "ready" once its selection has settled. Before that, counts
   * read 0 for a commit or two while the effects above catch up, and the page
   * used to flash "Aucun exercice disponible" / "0 question" (LJ-06).
   */
  const hubReady = queryDefaultsApplied && !!subjectBase && !!level && !pendingLevel && !pendingUnit
    && (unitOptions.length === 0 || !!unit);

  // Availability counts — strictly the selected unit (no silent widening).
  const counts = useMemo(() => {
    const rows = unit ? poolRows(quizBank, courseCode, unit) : poolRows(quizBank, courseCode, COURSE_WIDE);
    return { count: rows.length, quizzable: countQuizzable(rows, toDirectItemFromRow) };
  }, [quizBank, courseCode, unit]);

  const unitRows = useMemo(() => unitOptions.map((o) => {
    const rows = poolRows(quizBank, courseCode, o.value);
    const due = dueIds ? rows.filter((r) => r?.id && dueIds.has(String(r.id))).length : null;
    return { ...o, count: rows.length, due };
  }), [unitOptions, quizBank, courseCode, dueIds]);
  const courseDue = useMemo(() => {
    if (!dueIds || !courseCode) return null;
    const rows = poolRows(quizBank, courseCode, COURSE_WIDE);
    return rows.filter((r) => r?.id && dueIds.has(String(r.id))).length;
  }, [dueIds, quizBank, courseCode]);
  const weakest = useMemo(
    () => unitRows.filter((r) => (r.due || 0) > 0).sort((a, b) => (b.due || 0) - (a.due || 0))[0] || null,
    [unitRows],
  );

  // ── Sessions ─────────────────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [bankMessage, setBankMessage] = useState('');
  const [showSelectors, setShowSelectors] = useState(false);

  // Quiz: the deck is frozen at start, so "question 4 sur 10" keeps meaning
  // what it said.
  const [quizDeck, setQuizDeck] = useState(null);
  const [quizIdx, setQuizIdx] = useState(0);
  // One entry per session question: tries, found or not, every answer. The
  // result's score and review list are both read from this.
  const [quizLog, setQuizLog] = useState<QuizLogEntry[]>([]);
  const [canAdvance, setCanAdvance] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The student chose "Voir mon bilan maintenant": the summary says the quiz
  // was interrupted, not finished (LJ audit #7). Scoring is unchanged.
  const [quizEndedEarly, setQuizEndedEarly] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Practice: an open run, logged the same way so it can end on a summary.
  const [practiceDeck, setPracticeDeck] = useState<any[]>([]);
  const [practiceLog, setPracticeLog] = useState<QuizLogEntry[]>([]);
  const [practiceDone, setPracticeDone] = useState(false);
  const bankDirectItem = practiceDeck.length && !practiceDone ? practiceDeck[practiceDeck.length - 1] : null;

  useEffect(() => { setCanAdvance(false); }, [quizIdx]);
  // "Vérifier" leaves the layout once the question is resolved and
  // "Question suivante" takes its place. Focus that was on the check button
  // would otherwise fall to <body>; hand it to the action that replaced it.
  // Focus anywhere else (an option, the fold control) is left alone.
  useEffect(() => {
    if (!canAdvance) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const lost = !active || active === document.body
      || (active instanceof HTMLElement && active.classList.contains('quiz-card__check'));
    if (lost) nextRef.current?.focus({ preventScroll: true });
  }, [canAdvance]);

  const inQuiz = !!quizDeck && !quizFinished;
  useFocusMode(!!bankDirectItem || inQuiz);

  const labelsFor = (code: string, unitVal: string) => {
    const c = findCourse(courses, code);
    const lvl = String(c?.level || '');
    return {
      subjectLabel: friendlySubject[c?.subject] || c?.subject || '',
      levelLabel: lvl ? lvl.replace(/^NS(.*)$/i, 'NS $1') : '',
      unitLabel: unitVal === COURSE_WIDE
        ? tx('Tout le cours', 'Tout kou a')
        : unitOptionsFor(c).find((o) => o.value === unitVal)?.label || '',
    };
  };

  const openSession = (m: PracticeMode, code: string, unitVal: string, src: string, count: number): Session => {
    const s: Session = { mode: m, courseCode: code, unit: unitVal, source: src, start: Date.now(), ...labelsFor(code, unitVal) };
    setSession(s);
    trackJourney('practice_started', { mode: m, course: code, unit: unitVal, source: src, count, signedIn: !!userId });
    return s;
  };

  const resetQuiz = () => {
    setQuizDeck(null);
    setQuizIdx(0);
    setQuizLog([]);
    setQuizFinished(false);
    setCanAdvance(false);
    setConfirmLeave(false);
    setQuizEndedEarly(false);
  };
  const resetPractice = () => {
    setPracticeDeck([]);
    setPracticeLog([]);
    setPracticeDone(false);
    setShowSelectors(false);
  };
  /** Back to where the session started from (confirmation or hub). */
  const endSession = () => {
    resetQuiz();
    resetPractice();
    setSession(null);
    setBankMessage('');
  };

  const drawPracticeItem = (code: string, unitVal: string, lastId?: string) => {
    const rows = poolRows(quizBank, code, unitVal);
    if (!rows.length) return null;
    let row = rows[Math.floor(Math.random() * rows.length)];
    // Avoid serving the question just answered when there is any other.
    for (let k = 0; k < 4 && rows.length > 1 && lastId && String(row?.id) === lastId; k += 1) {
      row = rows[Math.floor(Math.random() * rows.length)];
    }
    try { return toDirectItemFromRow(row); } catch { return null; }
  };

  const startPractice = (code = courseCode, unitVal = unit, src = 'general') => {
    resetQuiz();
    resetPractice();
    setBankMessage('');
    if (!quizBank || !code || !unitVal) {
      setBankMessage(t('quizzes.selectToBegin', 'Choisissez un cours, un niveau et une unité pour commencer.'));
      return;
    }
    const item = drawPracticeItem(code, unitVal);
    if (!item) {
      setBankMessage(t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.'));
      return;
    }
    openSession('practice', code, unitVal, src, poolRows(quizBank, code, unitVal).length);
    setPracticeDeck([item]);
    setPracticeLog([{ tries: 0, solved: false, answers: [] }]);
  };

  const nextPracticeQuestion = () => {
    if (!session) return;
    const item = drawPracticeItem(session.courseCode, session.unit, bankDirectItem?.id ? String(bankDirectItem.id) : undefined);
    if (!item) return;
    setPracticeDeck((d) => [...d, item]);
    setPracticeLog((l) => [...l, { tries: 0, solved: false, answers: [] }]);
    setShowSelectors(false);
  };

  const startQuiz = (code = courseCode, unitVal = unit, src = 'general', length = quizLength) => {
    resetPractice();
    resetQuiz();
    setBankMessage('');
    if (!quizBank || !code || !unitVal) {
      setBankMessage(t('quizzes.selectToBegin', 'Choisissez un cours, un niveau et une unité pour commencer.'));
      return;
    }
    let deck = [];
    try {
      deck = buildQuizDeck(quizBank, code, unitVal, length);
    } catch (e) {
      console.error('Quiz build failed', e);
      setBankMessage(t('quizzes.unableToLoad', 'Impossible de charger les exercices pour le moment.'));
      return;
    }
    if (deck.length === 0) {
      setBankMessage(t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.'));
      return;
    }
    openSession('quiz', code, unitVal, src, deck.length);
    setQuizDeck(deck);
  };

  /** One reducer for both modes: DirectBankQuiz reports every attempt. */
  const applyScore = (log: QuizLogEntry[], idx: number, evt): QuizLogEntry[] => {
    const next = log.slice();
    const prev = next[idx] || { tries: 0, solved: false, answers: [] };
    if (prev.solved || prev.ungraded) return log;
    next[idx] = {
      tries: typeof evt.attempt === 'number' ? evt.attempt : prev.tries + 1,
      solved: evt.message === 'correct',
      answers: typeof evt.answer === 'string' ? [...prev.answers, evt.answer] : prev.answers,
      ungraded: evt.message === 'ungraded' || undefined,
    };
    return next;
  };

  const handleQuizScore = (evt) => {
    if (!evt) return;
    if (!canAdvance) {
      const idx = quizIdx;
      setQuizLog((log) => applyScore(log, idx, evt));
    }
    if (evt.message === 'correct' || evt.message === 'exhausted_attempts' || evt.message === 'ungraded') {
      setCanAdvance(true);
    }
  };

  const handlePracticeScore = (evt) => {
    if (!evt) return;
    const idx = practiceDeck.length - 1;
    setPracticeLog((log) => applyScore(log, idx, evt));
  };

  const goNextQuizQuestion = () => {
    if (!canAdvance) return;
    const next = quizIdx + 1;
    if (next >= (quizDeck?.length ?? 0)) setQuizFinished(true);
    else setQuizIdx(next);
  };

  /** Leaving a quiz with answers in it asks first (LJ-07): nothing is lost silently. */
  const requestLeaveQuiz = () => {
    const answered = quizLog.some((e) => e && (e.tries > 0 || e.ungraded));
    if (!answered) { endSession(); return; }
    setConfirmLeave(true);
  };

  const finishPractice = () => {
    const answered = practiceLog.some((e) => e && (e.tries > 0 || e.ungraded));
    if (!answered) { endSession(); return; }
    setPracticeDone(true);
  };

  // practice_completed — once per session, when its summary is reached.
  const completedLog = quizFinished ? quizLog : practiceDone ? practiceLog : null;
  const completedDeck = quizFinished ? quizDeck : practiceDone ? practiceDeck : null;
  const tally = useMemo(() => {
    if (!completedDeck) return null;
    const st = completedDeck.map((_, i) => entryStatus(completedLog?.[i]));
    const c = (k) => st.filter((x) => x === k).length;
    return { total: st.length, correct: c('correct'), retry: c('retry'), incorrect: c('incorrect'), unanswered: c('unanswered'), ungraded: c('ungraded') };
  }, [completedDeck, completedLog]);
  useJourneyOnce('practice_completed', session && tally ? String(session.start) : null, {
    mode: session?.mode,
    course: session?.courseCode,
    unit: session?.unit,
    source: session?.source,
    ...(tally || {}),
    signedIn: !!userId,
  });

  // A finished practice session advances its study-plan task (P0 validation
  // P-2), once per session. '*' (course-wide) only completes course tasks.
  const planSentFor = useRef<number | null>(null);
  useEffect(() => {
    if (!userId || !session || !tally || planSentFor.current === session.start) return;
    planSentFor.current = session.start;
    const graded = tally.total - tally.ungraded;
    if (graded <= 0 || tally.total - tally.unanswered <= 0) return;
    const pct = Math.round((tally.correct / graded) * 100);
    const unitId = session.unit && session.unit !== '*' ? session.unit : null;
    import('../services/studyPlanService')
      .then((m) => m.recordPlanEvent(userId, { kind: 'practice', course: session.courseCode, unit: unitId }, pct))
      .catch(() => {});
  }, [userId, session, tally]);

  const subjectLabel = subjectOptions.find((o) => o.value === subjectBase)?.label || subjectBase;
  const levelLabel = level ? level.replace(/^NS(.*)$/i, 'NS $1') : '';
  const unitLabel = unitOptions.find((o) => o.value === unit)?.label || '';
  const countLabel = t('quizzes.questionsAvailable', '{{count}} question disponible', { count: counts.count });
  const hasQuestions = counts.count > 0;
  const pageTitle = t('quizzes.curriculumPractice', 'Quiz du programme');

  const lessonHref = (lessonId?: string) => (scope?.course && lessonId
    ? `/courses/${scope.course.id}?lesson=${encodeURIComponent(lessonId)}`
    : null);
  const fromLesson = source === 'lesson' && !!scope?.lesson;
  const sessionContext = session
    ? [session.subjectLabel, session.levelLabel, session.unitLabel].filter(Boolean).join(' · ')
    : '';
  /** The page heading names this session, never the generic "Quiz du programme" (LJ audit #8). */
  const sessionHeading = session
    ? `${session.mode === 'quiz' ? tx('Quiz', 'Kwiz') : tx('Entraînement libre', 'Pratik lib')}${sessionContext ? ` · ${sessionContext}` : ''}`
    : pageTitle;
  const reviewHrefFor = (s: Session | null) => {
    if (!s) return '/revision';
    const q = new URLSearchParams({ course: s.courseCode, from: 'result' });
    if (s.unit && s.unit !== COURSE_WIDE) q.set('unit', s.unit);
    return `/revision?${q.toString()}`;
  };
  const scopeIdsFor = (s: Session | null) => (s
    ? poolRows(quizBank, s.courseCode, s.unit).map((r) => String(r?.id || '')).filter(Boolean)
    : undefined);

  /** The three dropdowns — shown in the in-practice disclosure. */
  const selectors = (
    <div className="qz-fields">
      <div className="qz-field">
        <label className="qz-field__label" htmlFor="qz-subject">{t('quizzes.course', 'Matière')}</label>
        <span className="qz-field__control">
          <select id="qz-subject" className="qz-field__select" value={subjectBase} onChange={(e) => setSubjectBase(e.target.value)}>
            {subjectOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
          <ChevronDown size={16} className="qz-field__chevron" aria-hidden="true" />
        </span>
      </div>
      <div className="qz-field">
        <label className="qz-field__label" htmlFor="qz-level">{t('quizzes.gradeLevel', 'Niveau')}</label>
        <span className="qz-field__control">
          <select id="qz-level" className="qz-field__select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {levelOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
          <ChevronDown size={16} className="qz-field__chevron" aria-hidden="true" />
        </span>
      </div>
      <div className="qz-field qz-field--wide">
        <label className="qz-field__label" htmlFor="qz-unit">{t('quizzes.unit', 'Unité')}</label>
        <span className="qz-field__control">
          <select id="qz-unit" className="qz-field__select" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {unitOptions.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
          <ChevronDown size={16} className="qz-field__chevron" aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  if (isError && !appData) {
    return (
      <section className="section qz">
        <div className="container qz__container">
          <ErrorState onRetry={() => refetch()} retrying={isFetching} />
        </div>
      </section>
    );
  }

  if (isLoading && !appData) {
    // A handoff waits in the shape of its confirmation — no number is drawn
    // until the bank has answered, so "0 questions" never flashes (LJ-06).
    if (handoff) {
      return (
        <section className="section qz qz--entry">
          <div className="container qz__container" aria-busy="true">
            <div className="pe" aria-label={tx('Chargement de ta pratique…', 'N ap chaje pratik ou…')}>
              <Skeleton width={180} height={14} />
              <Skeleton width="70%" height={34} />
              <Skeleton width="45%" height={16} />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Skeleton width={150} height={44} radius={999} />
                <Skeleton width={170} height={44} radius={999} />
              </div>
              <SkeletonText lines={3} lastWidth="55%" />
              <Skeleton width={220} height={52} radius={12} />
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="section qz">
        <div className="container qz__container" aria-busy="true">
          <Skeleton width={260} height={34} style={{ marginBottom: '0.75rem' }} />
          <SkeletonText lines={2} lastWidth="60%" />
          <div className="qz-setup" style={{ marginTop: '1.75rem' }}>
            <Skeleton width="100%" height={56} radius={12} style={{ marginBottom: '1.25rem' }} />
            <div className="qz-fields">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="qz-field">
                  <Skeleton width={70} height={12} style={{ marginBottom: '0.45rem' }} />
                  <Skeleton width="100%" height={42} radius={10} />
                </div>
              ))}
            </div>
            <Skeleton width="100%" height={46} radius={10} style={{ marginTop: '1.25rem' }} />
          </div>
        </div>
      </section>
    );
  }

  // ── Session summary (quiz or practice) ───────────────────────────────────
  if (session && completedDeck) {
    const isQuiz = session.mode === 'quiz';
    const next = fromLesson && scope?.nextLesson ? { title: scope.nextLesson.title, href: lessonHref(scope.nextLesson.id) || '' } : null;
    return (
      <section className="section qz qz--result">
        <div className="container qz__container">
          <QuizResult
            deck={completedDeck}
            log={completedLog || []}
            mode={session.mode}
            title={isQuiz
              ? (quizEndedEarly ? tx('Quiz interrompu', 'Kwiz la kanpe anvan fen') : tx('Quiz terminé', 'Kwiz fini'))
              : tx('Entraînement terminé', 'Pratik fini')}
            interrupted={isQuiz && quizEndedEarly}
            context={sessionContext}
            tx={tx}
            signedIn={!!userId}
            uid={userId}
            onSignIn={toggleAuthModal}
            onReplay={() => (isQuiz
              ? startQuiz(session.courseCode, session.unit, session.source, quizDeck?.length || quizLength)
              : startPractice(session.courseCode, session.unit, session.source))}
            onChangeUnit={() => { endSession(); setEntryDismissed(true); }}
            examHref={examsRelevant ? examHref : null}
            sessionStart={session.start}
            reviewHref={reviewHrefFor(session)}
            scopeIds={scopeIdsFor(session)}
            nextLesson={next && next.href ? next : null}
            backHref={fromLesson ? (lessonHref(scope?.lesson?.id) || '/practice') : '/practice'}
            backLabel={fromLesson ? tx('Retour à la leçon', 'Retounen nan leson an') : undefined}
          />
        </div>
      </section>
    );
  }

  // ── Quiz in progress: the fixed deck ─────────────────────────────────────
  if (quizDeck && !quizFinished) {
    const item = quizDeck[quizIdx];
    const isLast = quizIdx === quizDeck.length - 1;
    const answeredCount = quizLog.filter((e) => e && (e.tries > 0 || e.ungraded)).length;
    return (
      <section className="section qz qz--taking">
        <div className="container qz__container">
          <div className="qz-top qz-top--session">
            <button type="button" onClick={requestLeaveQuiz} className="qz-top__quit" aria-expanded={confirmLeave} aria-controls="qz-leave">
              <ChevronLeft size={18} aria-hidden="true" />
              {tx('Quitter', 'Kite')}
            </button>
            {/* The one quiet orientation line is also the page heading, so a
                screen reader hears the same "Quiz · Chimie · NS I · …". */}
            <h1 className="qz-top__where">
              <span className="qz__sr-only">{tx('Quiz', 'Kwiz')} · </span>
              {sessionContext || pageTitle}
            </h1>
            <span className="qz-top__count">
              {tx(`Question ${quizIdx + 1} sur ${quizDeck.length}`, `Kesyon ${quizIdx + 1} sou ${quizDeck.length}`)}
            </span>
          </div>

          <div
            className="qz-bar"
            role="progressbar"
            aria-label={tx('Progression du quiz', 'Pwogrè kwiz la')}
            aria-valuemin={0}
            aria-valuemax={quizDeck.length}
            aria-valuenow={quizIdx + 1}
          >
            <div className="qz-bar__fill" style={{ width: `${((quizIdx + 1) / quizDeck.length) * 100}%` }} />
          </div>

          {confirmLeave && (
            <div className="pq-leave" id="qz-leave" role="region" aria-labelledby="qz-leave-title">
              <p className="pq-leave__title" id="qz-leave-title">{tx('Quitter le quiz ?', 'Kite kwiz la ?')}</p>
              <p>
                {tx(`Tu as répondu à ${answeredCount} question${answeredCount > 1 ? 's' : ''} sur ${quizDeck.length}. Le quiz ne reprendra pas plus tard.`,
                  `Ou reponn ${answeredCount} kesyon sou ${quizDeck.length}. Kwiz la p ap rekòmanse pita.`)}
                {' '}
                {userId
                  ? tx('Les erreurs déjà faites au premier essai vont quand même dans ta Révision.', 'Erè ou deja fè premye fwa yo ale nan Revizyon ou kanmenm.')
                  : tx('Sans compte, rien n’est gardé.', 'San kont, anyen pa kenbe.')}
              </p>
              <div className="pq-leave__actions">
                <button type="button" className="button button--primary" onClick={() => setConfirmLeave(false)}>
                  {tx('Continuer le quiz', 'Kontinye kwiz la')}
                </button>
                <button type="button" className="button button--ghost" onClick={() => { setConfirmLeave(false); setQuizEndedEarly(true); setQuizFinished(true); }}>
                  {tx('Voir mon bilan maintenant', 'Wè rezilta m kounye a')}
                </button>
                <button type="button" className="qr-actions__text" onClick={endSession}>
                  {tx('Quitter sans bilan', 'Kite san rezilta')}
                </button>
              </div>
            </div>
          )}

          <div className="qz-question">
            <DirectBankQuiz item={item} onScore={handleQuizScore} onNext={undefined} onClose={undefined} />
          </div>

          {canAdvance ? (
            <div className="qz-next">
              <button ref={nextRef} type="button" onClick={goNextQuizQuestion} className="button button--primary button--lg qz-next__primary">
                {isLast ? tx('Voir mon bilan', 'Wè rezilta m') : t('quizzes.nextQuestion', 'Question suivante')}
              </button>
            </div>
          ) : (
            <p className="qz-hint">
              {tx(`${MAX_ATTEMPTS} essais, avec un indice après chaque erreur. Pas de chrono.`, `${MAX_ATTEMPTS} esè, ak yon endis apre chak erè. Pa gen kwonomèt.`)}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ── Open practice in progress ────────────────────────────────────────────
  if (bankDirectItem && session) {
    const current = practiceLog[practiceLog.length - 1];
    const st = entryStatus(current);
    const resolved = !!current && (current.solved || current.ungraded || (current.tries >= MAX_ATTEMPTS));
    const seen = practiceDeck.length;
    return (
      <section className="section qz qz--taking">
        <div className="container qz__container">
          <h1 className="qz__sr-only">{sessionHeading}</h1>
          <div className="qz-top">
            <button type="button" onClick={finishPractice} className="qz-top__quit">
              <ChevronLeft size={18} aria-hidden="true" />
              {tx('Terminer', 'Fini')}
            </button>
            <span className="qz-top__where">{sessionContext}</span>
            <span className="qz-top__count">
              {tx(`Entraînement libre · ${seen} vue${seen > 1 ? 's' : ''}`, `Pratik lib · ${seen} wè`)}
            </span>
          </div>

          <div className="qz-context qz-context--slim">
            <div className="qz-context__text">
              <span className="qz-context__subject">{session.subjectLabel}{session.levelLabel ? ` · ${session.levelLabel}` : ''}</span>
              {session.unitLabel && <span className="qz-context__unit">{session.unitLabel}</span>}
            </div>
            <button
              type="button"
              className="qz-context__toggle"
              onClick={() => setShowSelectors((v) => !v)}
              aria-expanded={showSelectors}
              aria-controls="qz-selection-panel"
              aria-label={t('quizzes.selectArea', 'Choisir une zone d\'exercice')}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span className="qz-context__toggle-label">{t('quizzes.selectArea', 'Choisir une zone d\'exercice')}</span>
            </button>
          </div>

          {showSelectors && (
            <div className="qz-setup qz-setup--tight" id="qz-selection-panel">
              {selectors}
              <p className="qz-count">{hubReady ? countLabel : t('common.loading', 'Chargement…')}</p>
              <p className="qz-config__note">{tx('Changer de chapitre recommence un nouvel entraînement.', 'Chanje chapit rekòmanse yon nouvo pratik.')}</p>
              <button type="button" onClick={() => startPractice(courseCode, unit, session.source)} className="button button--ghost qz-cta" disabled={!hasQuestions}>
                {tx('Recommencer sur ce chapitre', 'Rekòmanse sou chapit sa a')}
              </button>
            </div>
          )}

          <div className="qz-question">
            <DirectBankQuiz item={bankDirectItem} onScore={handlePracticeScore} onNext={undefined} onClose={undefined} />
          </div>

          {bankMessage && <p className="qz-message" role="status">{bankMessage}</p>}

          <div className="qz-next">
            <button
              type="button"
              onClick={nextPracticeQuestion}
              className={`button ${resolved ? 'button--primary' : 'button--ghost'} button--lg qz-next__primary`}
            >
              {resolved ? tx('Autre question', 'Lòt kesyon') : tx('Passer : autre question', 'Sote : lòt kesyon')}
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
          <p className="qz-hint">
            {st === 'unanswered'
              ? tx('Une question passée compte « sans réponse », pas comme une erreur.', 'Yon kesyon ou sote konte « san repons », pa tankou yon erè.')
              : tx('« Autre question » tire une nouvelle question du même chapitre.', '« Lòt kesyon » bay yon nouvo kesyon nan menm chapit la.')}
          </p>
        </div>
      </section>
    );
  }

  // ── Arriving with context: the compact confirmation (LJ-06) ──────────────
  if (scope?.status === 'ok' && !entryDismissed && scope.courseCode && scope.unit) {
    const quizMax = Math.min(QUIZ_LENGTH, scope.quizCount);
    const effectiveMode: PracticeMode = quizMax > 0 ? entryMode : 'practice';
    const labels = labelsFor(scope.courseCode, scope.unit.value);
    return (
      <section className="section qz qz--entry">
        <div className="container qz__container">
          <LearnSwitch />
          {bankMessage && <p className="qz-message" role="status">{bankMessage}</p>}
          <PracticeEntry
            scope={scope}
            subjectLabel={labels.subjectLabel}
            levelLabel={labels.levelLabel}
            thumb={subjectThumbs[scope.course?.subject] || undefined}
            mode={effectiveMode}
            onMode={setEntryMode}
            quizLength={quizMax}
            tries={MAX_ATTEMPTS}
            signedIn={!!userId}
            onSignIn={toggleAuthModal}
            onStart={() => (effectiveMode === 'quiz'
              ? startQuiz(scope.courseCode, scope.unit!.value, source, QUIZ_LENGTH)
              : startPractice(scope.courseCode, scope.unit!.value, source))}
            onChange={() => setEntryDismissed(true)}
            backHref={fromLesson ? lessonHref(scope.lesson?.id) : null}
            tx={tx}
          />
        </div>
      </section>
    );
  }

  const showNotice = !!scope && ['unknown-course', 'unknown-unit', 'empty-unit'].includes(scope.status);
  const quizMaxHub = Math.min(quizLength, counts.quizzable);

  return (
    <section className="section qz">
      <div className="container qz__container">
        <LearnSwitch />
        {/* One title line, then the filters as chips — no hero (Ted). */}
        <header className="qz-top">
          <h1 className="qz-top__title">{tx('Entraînement et quiz', 'Antrènman ak kwiz')}</h1>
          <div className="qz-top__chips">
            <div className="qz-chips" role="group" aria-label={t('quizzes.course', 'Matière')}>
              {subjectOptions.map((o) => (
                <button key={o.value} type="button" aria-pressed={subjectBase === o.value} className={subjectBase === o.value ? 'is-on' : ''} onClick={() => setSubjectBase(o.value)}>{o.label}</button>
              ))}
            </div>
            <div className="qz-chips" role="group" aria-label={t('quizzes.gradeLevel', 'Niveau')}>
              {levelOptions.map((o) => (
                <button key={o.value} type="button" aria-pressed={level === o.value} className={level === o.value ? 'is-on' : ''} onClick={() => setLevel(o.value)}>
                  {o.label}{myLevel === o.value && <small>{tx('ta classe', 'klas ou')}</small>}
                </button>
              ))}
            </div>
          </div>
        </header>

        {showNotice && (
          <ScopeNotice
            scope={scope!}
            courseLabel={scope?.courseCode ? [labelsFor(scope.courseCode, '').subjectLabel, labelsFor(scope.courseCode, '').levelLabel].filter(Boolean).join(' ') : ''}
            onCourseWide={scope?.courseCode ? () => startPractice(scope.courseCode!, COURSE_WIDE, source) : undefined}
            tx={tx}
          />
        )}

        <div className="qz-hub">
          <div className="qz-hub__main">
            {hubReady && !hasQuestions && (
              <p className="qz-note" role="status">
                {t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.')}{' '}
                {tx('Choisissez une autre unité.', 'Chwazi yon lòt inite.')}
              </p>
            )}
            {bankMessage && <p className="qz-hint" role="status">{bankMessage}</p>}

            {unitRows.length > 0 && (
              <section className="qz-shelf" aria-labelledby="qz-chapters-title">
                <div className="qz-chapters__head">
                  <h2 id="qz-chapters-title">{tx('Les chapitres', 'Chapit yo')}</h2>
                  <span>{subjectLabel}{levelLabel ? ` · ${levelLabel}` : ''}</span>
                </div>
                <ol className="qz-chaps">
                  {unitRows.map((r, i) => (
                    <li key={r.value} className={`qz-chap${unit === r.value ? ' is-current' : ''}${!r.count ? ' is-empty' : ''}`}>
                      <button type="button" className="qz-chap__pick" onClick={() => setUnit(r.value)} aria-pressed={unit === r.value} disabled={!r.count}>
                        <span className="qz-chap__no">{String(i + 1).padStart(2, '0')}</span>
                        <span className="qz-chap__name">{r.label}</span>
                        <span className="qz-chap__meta">
                          {r.count ? tx(`${r.count} questions`, `${r.count} kesyon`) : tx('Bientôt', 'Talè')}
                          {r.due && r.due > 0 ? <em>{tx(`${r.due} à revoir`, `${r.due} pou revize`)}</em> : null}
                        </span>
                      </button>
                      <span className="qz-chap__acts">
                        <button type="button" className="qz-act" disabled={!r.count} onClick={() => startPractice(courseCode, r.value, source)}>
                          {tx('S’entraîner', 'Pratike')}
                        </button>
                        <button type="button" className="qz-act qz-act--primary" disabled={!r.count} onClick={() => startQuiz(courseCode, r.value, source)}>
                          {tx('Quiz', 'Kwiz')}
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>

          <aside className="qz-hub__side">
            <section className="qz-card qz-diag" aria-labelledby="qz-diag-title">
              <span className="qz-card__eyebrow">{tx('Diagnostic', 'Dyagnostik')}</span>
              <h2 id="qz-diag-title" className="qz-card__title">{tx('Tes erreurs à revoir', 'Erè ou pou revize')}</h2>
              {!userId ? (
                <p className="qz-card__sub">{tx('Connecte-toi : tes erreurs seront gardées et reviendront ici.', 'Konekte : erè ou yo ap kenbe epi y ap tounen isit la.')}</p>
              ) : courseDue === null ? (
                <p className="qz-card__sub">{t('common.loading', 'Chargement…')}</p>
              ) : courseDue === 0 ? (
                <p className="qz-card__sub">{tx('Aucune question ratée en attente dans ce cours.', 'Pa gen kesyon ou rate k ap tann nan kou sa a.')}</p>
              ) : (
                <>
                  <p className="qz-diag__big"><strong>{courseDue}</strong> {tx(courseDue === 1 ? 'question ratée' : 'questions ratées', 'kesyon ou rate')}</p>
                  {weakest && (
                    <p className="qz-diag__weak">
                      {tx('Surtout dans ', 'Sitou nan ')}<strong>{weakest.label}</strong> ({weakest.due})
                    </p>
                  )}
                  <div className="qz-diag__actions">
                    <Link className="button button--primary button--sm" to={`/revision?${new URLSearchParams({ course: courseCode, from: 'practice' }).toString()}`}>{tx('Revoir mes erreurs', 'Revize erè m yo')}</Link>
                    {weakest && (
                      <button type="button" className="button button--ghost button--sm" onClick={() => startPractice(courseCode, weakest.value, source)}>
                        {tx('Travailler ce chapitre', 'Travay chapit sa a')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* Configurator — only what the two activities really support. */}
            <section className="qz-card qz-config" aria-labelledby="qz-config-title">
              <span className="qz-card__eyebrow">{tx('Sur mesure', 'Sou mezi')}</span>
              <h2 id="qz-config-title" className="qz-card__title">{tx('Ta session', 'Sesyon ou')}</h2>
              <p className="qz-config__label">{tx('Activité', 'Aktivite')}</p>
              <div className="qz-seg" role="radiogroup" aria-label={tx('Activité', 'Aktivite')}>
                <button type="button" role="radio" aria-checked={mode === 'practice'} className={mode === 'practice' ? 'is-on' : ''} onClick={() => setMode('practice')}>{tx('Entraînement libre', 'Pratik lib')}</button>
                <button type="button" role="radio" aria-checked={mode === 'quiz'} className={mode === 'quiz' ? 'is-on' : ''} onClick={() => setMode('quiz')}>{tx('Quiz avec score', 'Kwiz ak nòt')}</button>
              </div>
              {mode === 'quiz' && (
                <>
                  <p className="qz-config__label">{tx('Nombre de questions', 'Kantite kesyon')}</p>
                  <div className="qz-seg" role="radiogroup" aria-label={tx('Nombre de questions', 'Kantite kesyon')}>
                    {[5, 10, 20].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={quizLength === n} className={quizLength === n ? 'is-on' : ''} onClick={() => setQuizLength(n)}>{n}</button>
                    ))}
                  </div>
                  {hubReady && counts.quizzable > 0 && counts.quizzable < quizLength && (
                    <p className="qz-config__note">{tx(`Cette unité a ${counts.quizzable} questions corrigeables : le quiz en aura ${counts.quizzable}.`, `Inite sa a gen ${counts.quizzable} kesyon ki ka korije : kwiz la ap genyen ${counts.quizzable}.`)}</p>
                  )}
                </>
              )}
              {hubReady && (
                <div className="qz-config__rules">
                  <ModeRules mode={mode} count={quizMaxHub || quizLength} tries={MAX_ATTEMPTS} tx={tx} />
                </div>
              )}
              <button
                type="button"
                className="button button--primary qz-cta"
                disabled={!hubReady || !hasQuestions || (mode === 'quiz' && counts.quizzable === 0)}
                onClick={() => (mode === 'quiz' ? startQuiz(courseCode, unit, source) : startPractice(courseCode, unit, source))}
              >
                {mode === 'quiz' ? tx('Lancer le quiz', 'Lanse kwiz la') : tx('Commencer l’entraînement', 'Kòmanse pratik la')}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {unitLabel && <p className="qz-config__note">{tx('Sur : ', 'Sou : ')}{unitLabel}{hubReady ? ` · ${countLabel}` : ''}</p>}
            </section>

            <section className="qz-card qz-examlink" aria-label={tx('Examens', 'Egzamen')}>
              <p className="qz-card__sub qz-examlink__line">
                {tx('Un quiz n’est pas un examen : rien n’est chronométré ni noté.', 'Yon kwiz se pa yon egzamen : pa gen kwonomèt ni nòt.')}
              </p>
              <Link to={examHref} className="qz-examlink__cta">
                {examsRelevant ? tx('Passer un examen blanc', 'Pase yon egzamen blan') : tx('Voir les épreuves officielles', 'Wè eprèv ofisyèl yo')}
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default Quizzes;
