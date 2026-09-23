import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, RotateCcw, Target, Brain, Timer, Languages } from 'lucide-react';
import DirectBankQuiz, { MAX_ATTEMPTS } from '../components/DirectBankQuiz';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useAppData } from '../hooks/useData';
import { useFocusMode } from '../hooks/useFocusMode';
import useStore from '../contexts/store';
import { GRADES, gradeProfile } from '../config/trackConfig';
import { useTranslation } from 'react-i18next';
import { subjectThumbs } from './home/content';
import { loadDueReviewIds } from '../services/reviewService';
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
 */
const QUIZ_LENGTH = 10;

/**
 * A student's class → the catalog level that carries their programme. Only the
 * four secondary years map onto a level: 7ᵉ, 8ᵉ, 9ᵉ and Post-Bac have no
 * `NS*` courses of their own, so they keep the first available level.
 *
 * The same four-entry literal already lives in Courses.tsx, which owns the
 * /courses picker. It is a label mapping, not state — nothing is derived or
 * remembered here, so this is not a second progress model (§10). The
 * authoritative grade itself is read from the store, never guessed.
 */
const GRADE_TO_LEVEL: Record<string, string> = {
  NS1: 'NSI', NS2: 'NSII', NS3: 'NSIII', NS4: 'NSIV',
};

/** gradeProfile().examLevel → the level path, so the exam link lands on the
 *  student's own papers rather than the generic browser. Mirrors the map in
 *  Practice.tsx, which sends students here in the first place. */
const EXAM_LEVEL_TO_PATH: Record<string, string> = {
  baccalaureat: '/exams/terminale',
  universite: '/exams/university',
  '9eme_af': '/exams/9e',
};

/** A fixed deck for the quiz mode: distinct rows from the unit, shuffled. */
function buildQuizDeck(quizBank, courseCode, unit, toDirectItemFromRow, length = QUIZ_LENGTH) {
  const unitKey = unit && courseCode ? `${courseCode}|${unit}` : '';
  const pool = (unitKey && quizBank?.byUnit?.[unitKey]) || quizBank?.bySubject?.[courseCode] || [];
  const rows = [...pool];
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
    // Essays cannot be auto-scored, so they would break the score at the end.
    if (!item || item.kind === 'essay') continue;
    if (id) seen.add(id);
    deck.push(item);
    if (deck.length >= length) break;
  }
  return deck;
}

// Quizzes page: curriculum practice only (Course/Grade/Unit), polished layout
const Quizzes = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { data: appData, isLoading, isError, isFetching, refetch } = useAppData();
  const quizBank = appData?.quizBank;
  const courses = appData?.courses || [];
  const userId = useStore((state) => state.user?.uid);
  // §5 requires the grade-appropriate emphasis to survive the redesign, and
  // this page is where it was missing: an NS4 student used to land on NS I
  // because that is simply the first level in the catalog.
  const grade = useStore((state) => state.grade);
  const profile = gradeProfile(grade);
  /** `examLevel: null` (7ᵉ, 8ᵉ, NS1–NS3) — no national paper is theirs to sit. */
  const examsRelevant = profile.examLevel !== null;
  const examHref = (profile.examLevel && EXAM_LEVEL_TO_PATH[profile.examLevel]) || '/exams';
  const myLevel = grade ? GRADE_TO_LEVEL[grade] : '';

  // Every pre-existing string keeps its i18next key (FR + Kreyòl both live in
  // src/utils/i18n.ts, which this page must not edit). The handful of genuinely
  // new lines the redesign needs are written inline the way the sibling
  // /practice hub does it — `fallbackLng: 'fr'` means a brand-new key would
  // silently render French to Kreyòl readers, which is worse than this.
  const isCreole = String(i18n.language || '').toLowerCase().startsWith('ht');
  const tx = (fr: string, ht: string) => (isCreole ? ht : fr);

  /**
   * The student's own class, short enough to sit inside a sentence. The picker
   * labels carry a qualifier ("NS4 · Terminale (Bac)") that would nest a
   * parenthesis inside a parenthesis here, so the qualifier is trimmed — the
   * label itself is never rewritten, only cut at its own separator.
   */
  const myGradeLabel = React.useMemo(() => {
    const g = GRADES.find((x) => x.code === grade);
    if (!g) return '';
    return (isCreole ? g.labelHt : g.label).split(' · ')[0].split(' (')[0].trim();
  }, [grade, isCreole]);

  const setLanguage = useStore((state) => state.setLanguage);

  // The configurator's length. buildQuizDeck caps at what the unit holds, so
  // 20 on a 12-question unit is a 12-question quiz — the count shown says so.
  const [quizLength, setQuizLength] = useState(QUIZ_LENGTH);
  const [mode, setMode] = useState<'practice' | 'quiz'>('practice');

  // Missed questions still due for review (Revizyon), for the diagnostic and
  // the per-chapter "à revoir" column. Real data only: the review map stores
  // misses, not a success rate, so no rate is shown anywhere on this page.
  const [dueIds, setDueIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    if (!userId) { setDueIds(null); return undefined; }
    loadDueReviewIds(userId)
      .then((ids) => { if (live) setDueIds(new Set(ids.map(String))); })
      .catch(() => { if (live) setDueIds(new Set()); });
    return () => { live = false; };
  }, [userId]);

  // Selection state
  const [subjectBase, setSubjectBase] = useState('');
  const [level, setLevel] = useState('');
  const [unit, setUnit] = useState('');

  const [queryDefaultsApplied, setQueryDefaultsApplied] = useState(false);
  const [pendingLevel, setPendingLevel] = useState(null);
  const [pendingUnit, setPendingUnit] = useState(null);

  // Derived options
  const subjectOptions = useMemo(() => {
    const uniq = new Map();
    for (const c of courses) uniq.set(c.subject, c.subject);
    const friendly = {
      CHEM: t('subjects.CHEM', 'Chimie'),
      PHYS: t('subjects.PHYS', 'Physique'),
      MATH: t('subjects.MATH', 'Mathématiques'),
      ECON: t('subjects.ECON', 'Économie'),
    };
    const arr = Array.from(uniq.values());
    return arr.map((s) => ({ value: s, label: friendly[s] || s }));
  }, [courses, i18n.language, t]);

  const queryDefaults = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      course: (params.get('course') || '').trim(),
      unit: (params.get('unit') || '').trim(),
      // /practice sends ?mode=quiz for "take a short quiz". It only decides
      // which button leads; both activities stay available either way.
      mode: (params.get('mode') || '').trim().toLowerCase(),
    };
  }, [location.search]);

  const preferQuiz = queryDefaults.mode === 'quiz';

  // Apply deep-link defaults once (e.g. /quizzes?course=CHEM-NSII&unit=U3).
  // The subject is validated against the options we actually have: a stale or
  // bogus ?course= must fall through to the generic default below rather than
  // stranding the page on a subject with no levels or units.
  useEffect(() => {
    if (queryDefaultsApplied) return;
    if (!subjectOptions.length) return;

    const { course, unit: qUnit } = queryDefaults;
    if (course) {
      const [subj, lvl] = course.split('-');
      if (subj && subjectOptions.some((o) => o.value === subj)) {
        setSubjectBase(subj);
        // Staged like `pendingUnit`, not written straight to `level`:
        // `levelOptions` derives from `subjectBase`, so it is still empty in
        // this commit and the level guard below would immediately reset a
        // direct write. The guard claims it once the options exist.
        if (lvl) setPendingLevel(lvl);
      }
    }

    if (qUnit) {
      setPendingUnit(qUnit);
    }

    setQueryDefaultsApplied(true);
  }, [queryDefaultsApplied, queryDefaults, subjectOptions]);

  /**
   * The subject to open on: the first one that actually ships a course at the
   * student's own class.
   *
   * Without this half of the rule the level default below can never fire.
   * Chimie is the first subject in the catalog and ships NS1 only, so an NS4
   * student opened this page on "Chimie · NS I" — the level dropdown had a
   * single option and their class never got a look in. Skipping subjects that
   * have nothing at their level is the smallest honest fix; when none does
   * (7ᵉ, 8ᵉ, 9ᵉ, Post-Bac have no `NS*` courses of their own) the first
   * subject stands, exactly as before.
   */
  const defaultSubject = useMemo(() => {
    if (!subjectOptions.length) return '';
    const mine = myLevel
      ? subjectOptions.find((o) => courses.some((c) => c.subject === o.value && c.level === myLevel))
      : undefined;
    return (mine || subjectOptions[0]).value;
  }, [subjectOptions, courses, myLevel]);

  // Generic default.
  //
  // Gated on `queryDefaultsApplied` so it can never clobber a deep link: both
  // effects run in the same commit once `subjectOptions` first arrives, and
  // `subjectBase` still reads as '' here (a state update isn't visible to the
  // effect that queued it), so without the gate this always won the last write
  // and /quizzes?course=MATH landed on the first subject alphabetically.
  useEffect(() => {
    if (!queryDefaultsApplied) return;
    if (!subjectBase && defaultSubject) setSubjectBase(defaultSubject);
  }, [queryDefaultsApplied, defaultSubject, subjectBase]);

  const levelOptions = useMemo(() => {
    const lvls = new Set(courses.filter((c) => c.subject === subjectBase).map((c) => c.level));
    const ordered = ['NSI', 'NSII', 'NSIII', 'NSIV'];
    const list = Array.from(lvls);
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
      // Options for the deep-linked subject haven't arrived yet — leaving
      // `level` alone here is what keeps the request alive across commits.
      if (!levelOptions.length) return;
      // They have arrived and the level isn't among them (e.g. ?course=CHEM-NSII
      // when Chimie only ships NS I) — drop it and take the default below.
      setPendingLevel(null);
    }

    if (!levelOptions.find((o) => o.value === level)?.value) {
      // The student's own class first, the first available level only as a
      // fallback. A deep link has already returned above, so this never
      // overrides ?course=MATH-NSII.
      const mine = myLevel && levelOptions.some((o) => o.value === myLevel) ? myLevel : '';
      setLevel(mine || levelOptions[0]?.value || '');
    }
  }, [levelOptions, level, pendingLevel, myLevel]);

  const courseCode = subjectBase && level ? `${subjectBase}-${level}` : '';
  const unitOptions = useMemo(() => {
    // Course objects may store the normalized code on `code` (e.g. "CHEM-NSII")
    // or the original Firestore doc id on `id` (e.g. "chem-ns1"). Match either to be robust.
    const course = courses.find((c) => c.code === courseCode || c.id === courseCode);
    const modules = course?.modules || [];

    // Sort by order field (chapter number) to ensure proper unit sequence
    const sorted = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));

    // The value is the quiz bank's unit key (`U{n}`), NOT the module's
    // Firestore id. The bank indexes `byUnit` as `${course}|U${unit_no}`, so
    // keying on `m.id` never matched and every "unit" silently fell back to
    // the whole subject — choosing a unit changed nothing about the questions.
    return sorted.map((m) => {
      const n = Number(m.unit_no || m.order);
      return { value: Number.isFinite(n) && n > 0 ? `U${n}` : m.id, label: m.title || m.id };
    });
  }, [courses, courseCode]);

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
      // Don't override unit while waiting for options to catch up.
      if (unit) return;
    }

    if (!unitOptions.find((o) => o.value === unit)?.value) {
      setUnit(unitOptions[0]?.value || '');
    }
  }, [unitOptions, unit, pendingUnit]);

  // Availability counts
  const counts = useMemo(() => {
    const unitKey = unit && courseCode ? `${courseCode}|${unit}` : '';
    const unitCount = (quizBank?.byUnit && unitKey && quizBank.byUnit[unitKey]?.length) || 0;
    const subjCount = (quizBank?.bySubject && courseCode && quizBank.bySubject[courseCode]?.length) || 0;
    return { unitCount, subjCount, count: unitCount || subjCount || 0 };
  }, [quizBank, courseCode, unit]);

  const unitSel = unit;

  // One row per real unit of the course: its question count in the bank and,
  // for a signed-in student, how many of its questions they missed and have
  // not yet got right (Revizyon). Nothing else is claimed per chapter.
  const unitRows = useMemo(() => unitOptions.map((o) => {
    const rows = (quizBank?.byUnit && courseCode && quizBank.byUnit[`${courseCode}|${o.value}`]) || [];
    const due = dueIds ? rows.filter((r) => r?.id && dueIds.has(String(r.id))).length : null;
    return { ...o, count: rows.length, due };
  }), [unitOptions, quizBank, courseCode, dueIds]);
  const courseDue = useMemo(() => {
    if (!dueIds || !courseCode) return null;
    const rows = quizBank?.bySubject?.[courseCode] || [];
    return rows.filter((r) => r?.id && dueIds.has(String(r.id))).length;
  }, [dueIds, quizBank, courseCode]);
  const weakest = useMemo(
    () => unitRows.filter((r) => (r.due || 0) > 0).sort((a, b) => (b.due || 0) - (a.due || 0))[0] || null,
    [unitRows],
  );

  // Quiz panel state
  const [bankDirectItem, setBankDirectItem] = useState(null);
  const [bankMessage, setBankMessage] = useState('');
  const [isLoadingBank, setIsLoadingBank] = useState(false);
  // While a question is on screen the selectors collapse behind a disclosure,
  // so switching unit mid-session never means leaving the page.
  const [showSelectors, setShowSelectors] = useState(false);

  // ── Quiz mode (a fixed deck of QUIZ_LENGTH) ──────────────────────────────
  // The deck is frozen when the session starts; the selectors are not touched
  // mid-quiz, so "question 4 / 10" keeps meaning what it said.
  const [quizDeck, setQuizDeck] = useState(null);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizMissed, setQuizMissed] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [quizFinished, setQuizFinished] = useState(false);

  useEffect(() => {
    setCanAdvance(false);
    setOutcome(null);
    setAttemptsLeft(MAX_ATTEMPTS);
  }, [quizIdx]);

  const inQuiz = !!quizDeck && !quizFinished;

  // Taking a practice question is a focused task: hide the bottom tab bar +
  // footer while one is on screen so it reads like a dedicated quiz. The
  // completion screen releases it — that screen's whole job is to offer the
  // next action, and the nav is part of that.
  useFocusMode(!!bankDirectItem || inQuiz);

  const generateCurriculumPractice = async (unitArg?: string) => {
    // A chapter row starts ITS unit; the unit chip then follows so the
    // context bar and the next question agree with what was clicked.
    const unit = typeof unitArg === 'string' && unitArg ? unitArg : unitSel;
    if (unit !== unitSel) setUnit(unit);
    try {
      setIsLoadingBank(true);
      setBankDirectItem(null);
      setBankMessage('');
      if (!quizBank || !courseCode || !unit) {
        setBankMessage(t('quizzes.selectToBegin', 'Choisissez un cours, un niveau et une unité pour commencer.'));
        return;
      }
      const { pickRandomQuestion, toDirectItemFromRow } = require('../services/quizBank');
      /*
       * No whole-bank fallback. This used to reach for
       * `quizBank.rows[random]` when the selection came back empty, which
       * served a question from AN UNRELATED SUBJECT to a student who had just
       * chosen Chimie NS2 — and made the honest "aucun exercice disponible"
       * message below unreachable, because a row was always found.
       *
       * The sensible fallback already exists one layer down:
       * `pickRandomQuestion` tries the exact unit, then any question in the
       * SAME subject, and returns null only when the subject itself is empty.
       * That is precisely when a student should be told so.
       */
      const row = pickRandomQuestion(quizBank.byUnit, courseCode, unit, quizBank.bySubject);
      if (!row) {
        setBankMessage(t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.'));
        return;
      }
      const direct = toDirectItemFromRow(row);
      setBankDirectItem(direct);
      setShowSelectors(false);
    } catch (e) {
      console.error('Curriculum practice failed', e);
      setBankMessage(t('quizzes.unableToLoad', 'Impossible de charger les exercices pour le moment.'));
    } finally {
      setIsLoadingBank(false);
    }
  };

  /** Leave the question and return to the selection screen (also restores nav chrome). */
  const endPractice = () => {
    setBankDirectItem(null);
    setBankMessage('');
    setShowSelectors(false);
  };

  const resetQuiz = () => {
    setQuizDeck(null);
    setQuizIdx(0);
    setQuizScore(0);
    setQuizMissed(0);
    setQuizFinished(false);
    setCanAdvance(false);
    setOutcome(null);
    setAttemptsLeft(MAX_ATTEMPTS);
  };

  const startQuiz = (unitArg?: string) => {
    const unit = typeof unitArg === 'string' && unitArg ? unitArg : unitSel;
    if (unit !== unitSel) setUnit(unit);
    setBankDirectItem(null);
    setBankMessage('');
    setShowSelectors(false);
    resetQuiz();
    if (!quizBank || !courseCode || !unit) {
      setBankMessage(t('quizzes.selectToBegin', 'Choisissez un cours, un niveau et une unité pour commencer.'));
      return;
    }
    let deck = [];
    try {
      const { toDirectItemFromRow } = require('../services/quizBank');
      deck = buildQuizDeck(quizBank, courseCode, unit, toDirectItemFromRow, quizLength);
    } catch (e) {
      console.error('Quiz build failed', e);
      setBankMessage(t('quizzes.unableToLoad', 'Impossible de charger les exercices pour le moment.'));
      return;
    }
    if (deck.length === 0) {
      setBankMessage(t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.'));
      return;
    }
    setQuizDeck(deck);
  };

  /** DirectBankQuiz reports every attempt; only the resolved ones move the deck. */
  const handleQuizScore = (evt) => {
    if (!evt) return;
    if (evt.message === 'correct') {
      if (!canAdvance) setQuizScore((s) => s + 1);
      setCanAdvance(true);
      setOutcome('correct');
    } else if (evt.message === 'exhausted_attempts') {
      if (!canAdvance) setQuizMissed((m) => m + 1);
      setCanAdvance(true);
      setOutcome('out');
      setAttemptsLeft(0);
    } else if (typeof evt.attemptsLeft === 'number') {
      setAttemptsLeft(evt.attemptsLeft);
    }
  };

  const goNextQuizQuestion = () => {
    if (!canAdvance) return;
    const next = quizIdx + 1;
    if (next >= (quizDeck?.length ?? 0)) setQuizFinished(true);
    else setQuizIdx(next);
  };

  const subjectLabel = subjectOptions.find((o) => o.value === subjectBase)?.label || subjectBase;
  const levelLabel = level ? level.replace(/^NS(.*)$/i, 'NS $1') : '';
  const unitLabel = unitOptions.find((o) => o.value === unit)?.label || '';
  const countLabel = t('quizzes.questionsAvailable', '{{count}} question disponible', { count: counts.count });
  const hasQuestions = counts.count > 0;

  const ctaLabel = isLoadingBank
    ? t('common.loading', 'Chargement…')
    : bankDirectItem
      ? t('quizzes.nextQuestion', 'Question suivante')
      : t('quizzes.startPractice', 'Commencer');

  const pageTitle = t('quizzes.curriculumPractice', 'Quiz du programme');

  /**
   * What these activities actually are — §6.4 asks for purpose, expected time
   * when known, timed/untimed and whether results are saved, so a quiz is
   * never mistaken for an exam. Every line below is a fact about the code on
   * this page: `DirectBankQuiz` has no timer, gives MAX_ATTEMPTS tries with
   * hints, reveals the explanation on the last one, and persists no score. It
   * does feed the Revizyon review map, but only for a signed-in user
   * (`recordReviewOutcome` no-ops without a uid), so that line is gated.
   *
   * No duration is claimed for either mode: nothing on this page measures or
   * limits time, and a made-up "≈15 min" is exactly what §6.4 forbids.
   */
  const sharedFacts = [
    tx('Non chronométré', 'San kwonomèt'),
    tx('Aucune note enregistrée', 'Pa gen nòt ki anrejistre'),
    ...(userId
      ? [tx('Les erreurs reviennent dans Révision', 'Erè yo ap tounen nan Revizyon')]
      : [tx('Connectez-vous pour garder la trace de vos erreurs', 'Konekte pou kenbe mak erè ou yo')]),
  ];

  const drillFacts = [
    tx('Une question à la fois, autant que vous voulez', 'Yon kesyon alafwa, otan ou vle'),
    t('quizzes.howItWorksHints', 'Indices progressifs après chaque mauvaise réponse'),
    t('quizzes.howItWorksExplain', 'Explication complète après le troisième essai'),
  ];

  const quizFacts = [
    tx(`${quizLength} questions de l’unité choisie`, `${quizLength} kesyon nan inite ou chwazi a`),
    tx('Du début à la fin, score affiché à l’arrivée', 'Depi kòmansman jiska fen, nòt parèt nan fen an'),
    tx('Le score n’est pas enregistré', 'Nòt la pa anrejistre'),
  ];

  /** The three dropdowns — shared by the setup card and the in-practice disclosure. */
  const selectors = (
    <div className="qz-fields">
      <div className="qz-field">
        <label className="qz-field__label" htmlFor="qz-subject">{t('quizzes.course', 'Matière')}</label>
        <span className="qz-field__control">
          <select
            id="qz-subject"
            className="qz-field__select"
            value={subjectBase}
            onChange={(e) => setSubjectBase(e.target.value)}
          >
            {subjectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={16} className="qz-field__chevron" aria-hidden="true" />
        </span>
      </div>
      <div className="qz-field">
        <label className="qz-field__label" htmlFor="qz-level">{t('quizzes.gradeLevel', 'Niveau')}</label>
        <span className="qz-field__control">
          <select
            id="qz-level"
            className="qz-field__select"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {levelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={16} className="qz-field__chevron" aria-hidden="true" />
        </span>
      </div>
      <div className="qz-field qz-field--wide">
        <label className="qz-field__label" htmlFor="qz-unit">{t('quizzes.unit', 'Unité')}</label>
        <span className="qz-field__control">
          <select
            id="qz-unit"
            className="qz-field__select"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            {unitOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={16} className="qz-field__chevron" aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  /** Subject/level/unit + how many questions back it. Same strip in both states. */
  const subjectStrip = (
    <div className="qz-strip">
      <img
        className="qz-strip__thumb"
        src={subjectThumbs[subjectBase] || subjectThumbs.MATH}
        alt=""
        width={112}
        height={80}
        loading="lazy"
        decoding="async"
      />
      <div className="qz-strip__text">
        <span className="qz-strip__subject">
          {subjectLabel}{levelLabel ? ` · ${levelLabel}` : ''}
        </span>
        {unitLabel && <span className="qz-strip__unit">{unitLabel}</span>}
      </div>
      <span className="qz-strip__count">{countLabel}</span>
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

  // ── Quiz mode: the fixed deck, then a completion screen ──────────────────
  if (quizDeck && !quizFinished) {
    const item = quizDeck[quizIdx];
    const isLast = quizIdx === quizDeck.length - 1;
    return (
      <section className="section qz qz--taking">
        <div className="container qz__container">
          <h1 className="qz__sr-only">{pageTitle}</h1>

          <div className="qz-context">
            <div className="qz-context__text">
              <span className="qz-context__subject">
                {subjectLabel}{levelLabel ? ` · ${levelLabel}` : ''}
              </span>
              {unitLabel && <span className="qz-context__unit">{unitLabel}</span>}
            </div>
            <span className="qz-progress" aria-label={tx('Progression', 'Pwogrè')}>
              {quizIdx + 1} / {quizDeck.length}
            </span>
          </div>

          {/* A progress bar, because "4 / 10" alone does not show how much is
              left at a glance. Both carry the same fact (§7). */}
          <div className="qz-bar" role="presentation">
            <div className="qz-bar__fill" style={{ width: `${((quizIdx + 1) / quizDeck.length) * 100}%` }} />
          </div>

          <div className="qz-quizmeta">
            <span className="qz-quizmeta__item">
              {outcome === 'correct'
                ? <><Check size={14} aria-hidden="true" /> {t('quizzes.correctChip', 'Correct')}</>
                : outcome === 'out'
                  ? t('quizzes.outOfTries', 'Plus d\'essais')
                  : t('quizzes.triesLeft', '{{count}} essai restant', { count: attemptsLeft })}
            </span>
            <span className="qz-quizmeta__item">
              {tx(`${quizScore} bonne${quizScore === 1 ? '' : 's'} réponse${quizScore === 1 ? '' : 's'}`, `${quizScore} bon repons`)}
            </span>
            <span className="qz-quizmeta__item">{tx('Non chronométré', 'San kwonomèt')}</span>
          </div>

          <div className="qz-question">
            <DirectBankQuiz item={item} onScore={handleQuizScore} onNext={undefined} onClose={undefined} />
          </div>

          <div className="qz-next">
            <button
              type="button"
              onClick={goNextQuizQuestion}
              className="button button--primary qz-next__primary"
              disabled={!canAdvance}
            >
              {isLast
                ? tx('Voir mon score', 'Wè nòt mwen')
                : t('quizzes.nextQuestion', 'Question suivante')}
            </button>
            <button type="button" onClick={resetQuiz} className="qz-next__end">
              {tx('Quitter le quiz', 'Kite kwiz la')}
            </button>
          </div>
          <p className="qz-hint">
            {canAdvance
              ? tx('Rien n’est enregistré : quitter maintenant ne perd aucune note.', 'Pa gen anyen ki anrejistre : si ou kite kounye a ou pa pèdi okenn nòt.')
              : tx('Répondez pour continuer. Vous avez trois essais avec des indices.', 'Reponn pou kontinye. Ou gen twa esè ak endis.')}
          </p>
        </div>
      </section>
    );
  }

  if (quizDeck && quizFinished) {
    const total = quizDeck.length;
    return (
      <section className="section qz">
        <div className="container qz__container">
          <header className="qz__head">
            <Link className="qz__back" to="/practice">
              <ChevronLeft size={15} aria-hidden="true" />
              {t('nav.practice', 'Pratiquer')}
            </Link>
            <h1 className="qz__title">{tx('Quiz terminé', 'Kwiz fini')}</h1>
            <p className="qz__subtitle">
              {tx(
                `${quizScore} bonne${quizScore === 1 ? '' : 's'} réponse${quizScore === 1 ? '' : 's'} du premier coup sur ${total} questions, en ${subjectLabel}${unitLabel ? ` — ${unitLabel}` : ''}.`,
                `${quizScore} bon repons premye fwa sou ${total} kesyon, nan ${subjectLabel}${unitLabel ? ` — ${unitLabel}` : ''}.`,
              )}
            </p>
            <ul className="qz-facts">
              <li className="qz-facts__item">{tx('Ce score n’est pas enregistré', 'Nòt sa a pa anrejistre')}</li>
              <li className="qz-facts__item">
                {userId
                  ? tx('Les questions ratées sont dans Révision', 'Kesyon ou rate yo nan Revizyon')
                  : tx('Connectez-vous pour retrouver vos erreurs plus tard', 'Konekte pou jwenn erè ou yo pita')}
              </li>
            </ul>
          </header>

          <div className="qz-setup">
            <p className="qz-hint" style={{ marginTop: 0 }}>
              {examsRelevant
                ? tx(
                  'Un quiz mesure ce que vous savez aujourd’hui sur une unité. Pour une épreuve entière, chronométrée et enregistrée, passez un examen blanc.',
                  'Yon kwiz mezire sa ou konnen jodi a sou yon inite. Pou yon eprèv antye, ak kwonomèt epi ki anrejistre, pase yon egzamen blan.',
                )
                : tx(
                  'Un quiz mesure ce que vous savez aujourd’hui sur une unité. À votre niveau, refaire un quiz ou changer d’unité vaut mieux qu’une épreuve officielle.',
                  'Yon kwiz mezire sa ou konnen jodi a sou yon inite. Nan nivo ou, refè yon kwiz oswa chanje inite pi bon pase yon eprèv ofisyèl.',
                )}
            </p>
            <div className="qz-done-actions">
              <button type="button" className="button button--primary" onClick={() => startQuiz()}>
                {tx('Refaire un quiz', 'Refè yon kwiz')}
              </button>
              {quizMissed > 0 && userId && (
                <Link className="button button--ghost" to="/revision">
                  {tx('Revoir mes erreurs', 'Revize erè m yo')}
                </Link>
              )}
              <button type="button" className="button button--ghost" onClick={() => { resetQuiz(); }}>
                {tx('Changer d’unité', 'Chanje inite')}
              </button>
            </div>
          </div>

          {examsRelevant && (
            <p className="qz-crosslink">
              {tx('Besoin de conditions d’examen ?', 'Ou bezwen kondisyon egzamen?')}{' '}
              <Link to={examHref}>{tx('Passer un examen blanc', 'Pase yon egzamen blan')}</Link>{' '}
              <span className="qz-crosslink__note">
                {tx('Durée et barème affichés avant de commencer.', 'Dire ak barèm parèt anvan ou kòmanse.')}
              </span>
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className={`section qz${bankDirectItem ? ' qz--taking' : ''}`}>
      <div className="container qz__container">
        {bankDirectItem ? (
          /* ── In practice (§6.5): the question owns the column. The page
                header steps aside — it survives as a visually hidden <h1> so
                the document keeps exactly one heading for screen readers —
                and the selection collapses into a re-openable context bar. ── */
          <>
            <h1 className="qz__sr-only">{pageTitle}</h1>

            <div className="qz-context">
              <img
                className="qz-context__thumb"
                src={subjectThumbs[subjectBase] || subjectThumbs.MATH}
                alt=""
                width={96}
                height={64}
                loading="lazy"
                decoding="async"
              />
              <div className="qz-context__text">
                <span className="qz-context__subject">
                  {subjectLabel}{levelLabel ? ` · ${levelLabel}` : ''}
                </span>
                {unitLabel && <span className="qz-context__unit">{unitLabel}</span>}
              </div>
              <button
                type="button"
                className="qz-context__toggle"
                onClick={() => setShowSelectors((v) => !v)}
                aria-expanded={showSelectors}
                aria-controls="qz-selection-panel"
                /* The label is hidden below 560px, which would otherwise leave
                   this icon-only button with no accessible name. */
                aria-label={t('quizzes.selectArea', 'Choisir une zone d\'exercice')}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                <span className="qz-context__toggle-label">{t('quizzes.selectArea', 'Choisir une zone d\'exercice')}</span>
              </button>
            </div>

            {showSelectors && (
              <div className="qz-setup qz-setup--tight" id="qz-selection-panel">
                {selectors}
                <p className="qz-count">{countLabel}</p>
                <button
                  type="button"
                  onClick={() => generateCurriculumPractice()}
                  className="button button--primary qz-cta"
                  disabled={isLoadingBank}
                >
                  {isLoadingBank ? t('common.loading', 'Chargement…') : t('quizzes.startPractice', 'Commencer')}
                </button>
              </div>
            )}

            <div className="qz-question">
              <DirectBankQuiz
                item={bankDirectItem}
                onScore={undefined}
                onNext={undefined}
                onClose={undefined}
              />
            </div>

            {bankMessage && <p className="qz-message" role="status">{bankMessage}</p>}

            <div className="qz-next">
              <button
                type="button"
                onClick={() => generateCurriculumPractice()}
                className="button button--primary qz-next__primary"
                disabled={isLoadingBank}
              >
                <RotateCcw size={16} aria-hidden="true" /> {ctaLabel}
              </button>
              <button type="button" onClick={endPractice} className="qz-next__end">
                {tx('Terminer la pratique', 'Fini pratik la')}
              </button>
            </div>
          </>
        ) : (
          /* ── The hub (Ted's "Entraînement & Quiz" mockup) ─────────────────
                A header card with the discipline, level and chapter chips and
                the language toggle; the selected series with its two modes;
                the course's chapters as a table; a side console with the
                real diagnostic and the configurator. Every number is read
                from the bank or the Revizyon map — no rate, no timer, no XP
                is invented. ── */
          <>
            <header className="qz-hub__head">
              <nav className="qz-crumbs" aria-label={tx('Fil d’Ariane', 'Chemen')}>
                <Link to="/practice">{t('nav.practice', 'Pratiquer')}</Link>
                <span aria-hidden="true">/</span>
                <span>{subjectLabel}{levelLabel ? ` · ${levelLabel}` : ''}</span>
                <span aria-hidden="true">/</span>
                <strong>{pageTitle}</strong>
              </nav>

              <div className="qz-hub__titlerow">
                <h1 className="qz__title">{tx('Entraînement et quiz', 'Antrènman ak kwiz')}</h1>
                <div className="qz-lang" role="group" aria-label={tx('Langue', 'Lang')}>
                  <Languages size={15} aria-hidden="true" />
                  <button type="button" className={!isCreole ? 'is-on' : ''} aria-pressed={!isCreole} onClick={() => setLanguage('fr')}>Français</button>
                  <button type="button" className={isCreole ? 'is-on' : ''} aria-pressed={isCreole} onClick={() => setLanguage('ht')}>Kreyòl</button>
                </div>
              </div>

              <div className="qz-pick">
                <span className="qz-pick__label">{t('quizzes.course', 'Matière')}</span>
                <div className="qz-pick__chips">
                  {subjectOptions.map((o) => (
                    <button key={o.value} type="button" className={`qz-chip${subjectBase === o.value ? ' is-on' : ''}`} aria-pressed={subjectBase === o.value} onClick={() => setSubjectBase(o.value)}>
                      {subjectBase === o.value && <Check size={14} aria-hidden="true" />}{o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="qz-pick">
                <span className="qz-pick__label">{t('quizzes.gradeLevel', 'Niveau')}</span>
                <div className="qz-pick__chips">
                  {levelOptions.map((o) => (
                    <button key={o.value} type="button" className={`qz-chip${level === o.value ? ' is-on' : ''}`} aria-pressed={level === o.value} onClick={() => setLevel(o.value)}>
                      {o.label}
                      {myLevel === o.value && <span className="qz-chip__mine">{tx('ta classe', 'klas ou')}</span>}
                    </button>
                  ))}
                </div>
              </div>
              {unitOptions.length > 0 && (
                <div className="qz-pick">
                  <span className="qz-pick__label">{t('quizzes.unit', 'Unité')}</span>
                  <div className="qz-pick__chips">
                    {unitOptions.map((o) => (
                      <button key={o.value} type="button" className={`qz-chip qz-chip--soft${unit === o.value ? ' is-on' : ''}`} aria-pressed={unit === o.value} onClick={() => setUnit(o.value)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </header>

            {isError && appData && (
              <p className="qz-stale" role="status">
                <span>{tx('Ces exercices viennent de la dernière copie enregistrée.', 'Egzèsis sa yo soti nan dènye kopi ki anrejistre a.')}</span>
                <button type="button" className="qz-stale__retry" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? t('common.retrying', 'Nouvelle tentative…') : t('common.retry', 'Réessayer')}
                </button>
              </p>
            )}

            <div className="qz-hub">
              <div className="qz-hub__main">
                {/* The selected series and its two activities (§6.4). */}
                <section className="qz-card qz-series" aria-labelledby="qz-series-title">
                  <div className="qz-series__bar">
                    <span className="qz-badge">{tx('Série choisie', 'Seri ou chwazi')}</span>
                    <h2 id="qz-series-title" className="qz-series__title">{unitLabel || subjectLabel}</h2>
                    <span className="qz-series__count">{countLabel}</span>
                  </div>
                  <div className="qz-series__body">
                    {!hasQuestions && (
                      <p className="qz-note" role="status">
                        {t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.')}{' '}
                        {tx('Choisissez une autre unité.', 'Chwazi yon lòt inite.')}
                      </p>
                    )}
                    <div className={`qz-modes${preferQuiz ? ' qz-modes--quiz-first' : ''}`}>
                      <div className="qz-mode qz-mode--drill">
                        <h3 className="qz-mode__title"><Target size={17} aria-hidden="true" /> {tx('S’entraîner', 'Pratike')}</h3>
                        <ul className="qz-mode__facts">{drillFacts.map((f) => <li key={f}>{f}</li>)}</ul>
                        <button type="button" onClick={() => generateCurriculumPractice()} className={`button qz-cta ${preferQuiz ? 'button--ghost' : 'button--primary'}`} disabled={isLoadingBank || !hasQuestions}>
                          {ctaLabel}
                        </button>
                      </div>
                      <div className="qz-mode qz-mode--quiz">
                        <h3 className="qz-mode__title"><Timer size={17} aria-hidden="true" /> {tx(`Quiz de ${quizLength} questions`, `Kwiz ${quizLength} kesyon`)}</h3>
                        <ul className="qz-mode__facts">{quizFacts.map((f) => <li key={f}>{f}</li>)}</ul>
                        <button type="button" onClick={() => startQuiz()} className={`button qz-cta ${preferQuiz ? 'button--primary' : 'button--ghost'}`} disabled={isLoadingBank || !hasQuestions}>
                          {tx('Commencer le quiz', 'Kòmanse kwiz la')}
                        </button>
                      </div>
                    </div>
                    <ul className="qz-facts qz-facts--row">
                      {sharedFacts.map((fact) => <li key={fact} className="qz-facts__item">{fact}</li>)}
                    </ul>
                    {bankMessage && <p className="qz-hint" role="status">{bankMessage}</p>}
                  </div>
                </section>

                {/* Every chapter of the course, with what the bank holds. */}
                {unitRows.length > 0 && (
                  <section className="qz-card qz-chapters" aria-labelledby="qz-chapters-title">
                    <div className="qz-card__head">
                      <div>
                        <h2 id="qz-chapters-title" className="qz-card__title">{tx('Séries par chapitre', 'Seri pa chapit')}</h2>
                        <p className="qz-card__sub">{subjectLabel}{levelLabel ? ` · ${levelLabel}` : ''}</p>
                      </div>
                      <span className="qz-badge qz-badge--muted">
                        {tx(`${unitRows.length} chapitres · ${counts.subjCount} questions`, `${unitRows.length} chapit · ${counts.subjCount} kesyon`)}
                      </span>
                    </div>
                    <table className="qz-table">
                      <thead>
                        <tr>
                          <th scope="col">{tx('Chapitre', 'Chapit')}</th>
                          <th scope="col">{tx('Questions', 'Kesyon')}</th>
                          <th scope="col">{tx('État', 'Eta')}</th>
                          <th scope="col" className="qz-table__act"><span className="qz__sr-only">{tx('Actions', 'Aksyon')}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {unitRows.map((r, i) => (
                          <tr key={r.value} className={unit === r.value ? 'is-current' : undefined}>
                            <th scope="row">
                              <span className="qz-table__no">{String(i + 1).padStart(2, '0')}</span>
                              <span className="qz-table__name">{r.label}</span>
                            </th>
                            <td data-label={tx('Questions', 'Kesyon')}>{r.count || '—'}</td>
                            <td data-label={tx('État', 'Eta')}>
                              {r.count === 0
                                ? <span className="qz-state qz-state--none">{tx('Bientôt', 'Talè')}</span>
                                : r.due && r.due > 0
                                  ? <span className="qz-state qz-state--due">{tx(`${r.due} à revoir`, `${r.due} pou revize`)}</span>
                                  : <span className="qz-state">{userId ? '—' : tx('Non suivi', 'Pa swiv')}</span>}
                            </td>
                            <td className="qz-table__act">
                              <button type="button" className="qz-act" disabled={!r.count || isLoadingBank} onClick={() => generateCurriculumPractice(r.value)}>
                                {tx('S’entraîner', 'Pratike')}
                              </button>
                              <button type="button" className="qz-act qz-act--primary" disabled={!r.count || isLoadingBank} onClick={() => startQuiz(r.value)}>
                                {tx('Quiz', 'Kwiz')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </div>

              <aside className="qz-hub__side">
                {/* Diagnostic — the student's own missed questions, nothing
                    estimated. Signed out there is nothing to diagnose. */}
                <section className="qz-card qz-diag" aria-labelledby="qz-diag-title">
                  <span className="qz-card__eyebrow">{tx('Diagnostic', 'Dyagnostik')}</span>
                  <h2 id="qz-diag-title" className="qz-card__title"><Brain size={18} aria-hidden="true" /> {tx('Tes erreurs à revoir', 'Erè ou pou revize')}</h2>
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
                        <Link className="button button--primary button--sm" to="/revision">{tx('Revoir mes erreurs', 'Revize erè m yo')}</Link>
                        {weakest && (
                          <button type="button" className="button button--ghost button--sm" onClick={() => generateCurriculumPractice(weakest.value)}>
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
                  <h2 id="qz-config-title" className="qz-card__title"><SlidersHorizontal size={18} aria-hidden="true" /> {tx('Ta session', 'Sesyon ou')}</h2>
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
                      {counts.count > 0 && counts.count < quizLength && (
                        <p className="qz-config__note">{tx(`Cette unité a ${counts.count} questions : le quiz en aura ${counts.count}.`, `Inite sa a gen ${counts.count} kesyon : kwiz la ap genyen ${counts.count}.`)}</p>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="button button--primary qz-cta"
                    disabled={isLoadingBank || !hasQuestions}
                    onClick={() => (mode === 'quiz' ? startQuiz() : generateCurriculumPractice())}
                  >
                    {mode === 'quiz' ? tx('Lancer le quiz', 'Lanse kwiz la') : tx('Commencer l’entraînement', 'Kòmanse pratik la')}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                  {unitLabel && <p className="qz-config__note">{tx('Sur : ', 'Sou : ')}{unitLabel}</p>}
                </section>

                <section className="qz-card qz-examlink">
                  <h2 className="qz-card__title">{tx('Un quiz n’est pas un examen', 'Yon kwiz se pa yon egzamen')}</h2>
                  <p className="qz-card__sub">
                    {tx('Ici, rien n’est chronométré et aucune note n’est gardée. Un examen blanc est une épreuve officielle entière, chronométrée.', 'Isit la pa gen kwonomèt epi pa gen nòt ki rete. Yon egzamen blan se yon eprèv ofisyèl antye, ak kwonomèt.')}
                  </p>
                  <Link to={examHref} className="qz-examlink__cta">
                    {examsRelevant ? tx('Passer un examen blanc', 'Pase yon egzamen blan') : tx('Voir les épreuves officielles', 'Wè eprèv ofisyèl yo')}
                    <ChevronRight size={15} aria-hidden="true" />
                  </Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default Quizzes;
