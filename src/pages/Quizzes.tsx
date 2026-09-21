import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, SlidersHorizontal, RotateCcw } from 'lucide-react';
import DirectBankQuiz, { MAX_ATTEMPTS } from '../components/DirectBankQuiz';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useAppData } from '../hooks/useData';
import { useFocusMode } from '../hooks/useFocusMode';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';
import { subjectThumbs } from './home/content';
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

/** A fixed deck for the quiz mode: distinct rows from the unit, shuffled. */
function buildQuizDeck(quizBank, courseCode, unit, toDirectItemFromRow) {
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
    if (deck.length >= QUIZ_LENGTH) break;
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

  // Every pre-existing string keeps its i18next key (FR + Kreyòl both live in
  // src/utils/i18n.ts, which this page must not edit). The handful of genuinely
  // new lines the redesign needs are written inline the way the sibling
  // /practice hub does it — `fallbackLng: 'fr'` means a brand-new key would
  // silently render French to Kreyòl readers, which is worse than this.
  const isCreole = String(i18n.language || '').toLowerCase().startsWith('ht');
  const tx = (fr: string, ht: string) => (isCreole ? ht : fr);

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

  // Generic default — first available subject.
  //
  // Gated on `queryDefaultsApplied` so it can never clobber a deep link: both
  // effects run in the same commit once `subjectOptions` first arrives, and
  // `subjectBase` still reads as '' here (a state update isn't visible to the
  // effect that queued it), so without the gate this always won the last write
  // and /quizzes?course=MATH landed on the first subject alphabetically.
  useEffect(() => {
    if (!queryDefaultsApplied) return;
    if (!subjectBase && subjectOptions[0]) setSubjectBase(subjectOptions[0].value);
  }, [queryDefaultsApplied, subjectOptions, subjectBase]);

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
      setLevel(levelOptions[0]?.value || '');
    }
  }, [levelOptions, level, pendingLevel]);

  const courseCode = subjectBase && level ? `${subjectBase}-${level}` : '';
  const unitOptions = useMemo(() => {
    // Course objects may store the normalized code on `code` (e.g. "CHEM-NSII")
    // or the original Firestore doc id on `id` (e.g. "chem-ns1"). Match either to be robust.
    const course = courses.find((c) => c.code === courseCode || c.id === courseCode);
    const modules = course?.modules || [];

    // Sort by order field (chapter number) to ensure proper unit sequence
    const sorted = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));

    return sorted.map((m) => ({ value: m.id, label: m.title || m.id }));
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

  const generateCurriculumPractice = async () => {
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

  const startQuiz = () => {
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
      deck = buildQuizDeck(quizBank, courseCode, unit, toDirectItemFromRow);
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
    tx(`${QUIZ_LENGTH} questions de l’unité choisie`, `${QUIZ_LENGTH} kesyon nan inite ou chwazi a`),
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
              {tx(
                'Un quiz mesure ce que vous savez aujourd’hui sur une unité. Pour une épreuve entière, chronométrée et enregistrée, passez un examen blanc.',
                'Yon kwiz mezire sa ou konnen jodi a sou yon inite. Pou yon eprèv antye, ak kwonomèt epi ki anrejistre, pase yon egzamen blan.',
              )}
            </p>
            <div className="qz-done-actions">
              <button type="button" className="button button--primary" onClick={startQuiz}>
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

          <p className="qz-crosslink">
            {tx('Besoin de conditions d’examen ?', 'Ou bezwen kondisyon egzamen?')}{' '}
            <Link to="/exams">{tx('Passer un examen blanc', 'Pase yon egzamen blan')}</Link>{' '}
            <span className="qz-crosslink__note">
              {tx('Durée et barème affichés avant de commencer.', 'Dire ak barèm parèt anvan ou kòmanse.')}
            </span>
          </p>
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
                  onClick={generateCurriculumPractice}
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
                onClick={generateCurriculumPractice}
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
          /* ── Setup: one purposeful surface. The old 16:5 cover banner and the
                three-card "Comment ça marche" grid are gone (§7: fewer
                equal-weight cards, fewer decorative icon tiles); their content
                lives in the fact line and the compact subject strip. ── */
          <>
            <header className="qz__head">
              <Link className="qz__back" to="/practice">
                <ChevronLeft size={15} aria-hidden="true" />
                {t('nav.practice', 'Pratiquer')}
              </Link>
              <h1 className="qz__title">{pageTitle}</h1>
              <p className="qz__subtitle">
                {t('quizzes.subtitle', 'Choisissez votre cours, niveau et unité pour vous entraîner avec des questions ciblées. Vous avez jusqu\'à trois essais avec des indices.')}
              </p>
              <ul className="qz-facts">
                {sharedFacts.map((fact) => (
                  <li key={fact} className="qz-facts__item">{fact}</li>
                ))}
              </ul>
            </header>

            {/* react-query is serving the last good copy while the refetch is
                failing — say so rather than passing stale content off as live. */}
            {isError && appData && (
              <p className="qz-stale" role="status">
                <span>{tx(
                  'Ces exercices viennent de la dernière copie enregistrée.',
                  'Egzèsis sa yo soti nan dènye kopi ki anrejistre a.',
                )}</span>
                <button type="button" className="qz-stale__retry" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? t('common.retrying', 'Nouvelle tentative…') : t('common.retry', 'Réessayer')}
                </button>
              </p>
            )}

            <div className="qz-setup">
              {subjectBase && subjectStrip}

              {selectors}

              {!hasQuestions && (
                <p className="qz-note" role="status">
                  {t('quizzes.noPractice', 'Aucun exercice disponible pour cette sélection pour le moment.')}{' '}
                  {tx('Choisissez une autre unité.', 'Chwazi yon lòt inite.')}
                </p>
              )}

              {/* ── Two activities, told apart (§6.4) ──────────────────────
                    Same unit, different errands: an open drill you leave when
                    you want, and a fixed set of QUIZ_LENGTH that ends with a
                    score. Each states its own facts, and `?mode=quiz` from
                    /practice decides which one leads. */}
              <div className={`qz-modes${preferQuiz ? ' qz-modes--quiz-first' : ''}`}>
                <div className="qz-mode qz-mode--drill">
                  <h2 className="qz-mode__title">{tx('S’entraîner', 'Pratike')}</h2>
                  <ul className="qz-mode__facts">
                    {drillFacts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={generateCurriculumPractice}
                    className={`button qz-cta ${preferQuiz ? 'button--ghost' : 'button--primary'}`}
                    disabled={isLoadingBank}
                  >
                    {ctaLabel}
                  </button>
                </div>

                <div className="qz-mode qz-mode--quiz">
                  <h2 className="qz-mode__title">
                    {tx(`Quiz de ${QUIZ_LENGTH} questions`, `Kwiz ${QUIZ_LENGTH} kesyon`)}
                  </h2>
                  <ul className="qz-mode__facts">
                    {quizFacts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={startQuiz}
                    className={`button qz-cta ${preferQuiz ? 'button--primary' : 'button--ghost'}`}
                    disabled={isLoadingBank || !hasQuestions}
                  >
                    {tx('Commencer le quiz', 'Kòmanse kwiz la')}
                  </button>
                </div>
              </div>

              <p className="qz-hint" role={bankMessage ? 'status' : undefined}>
                {bankMessage || t('quizzes.readyBody', 'Choisissez un cours, un niveau et une unité, puis cliquez sur « Commencer » pour démarrer.')}
              </p>
            </div>

            {/* §6.4: a quiz and an exam are not the same errand, and saying so
                once in plain words is cheaper than a student discovering it
                halfway through a timed paper. */}
            <p className="qz-crosslink">
              {tx(
                'Un quiz n’est pas un examen : ici rien n’est chronométré et aucune note n’est gardée. Un examen blanc est une épreuve officielle entière, chronométrée, et la tentative reste dans votre historique.',
                'Yon kwiz se pa yon egzamen : isit la pa gen kwonomèt epi pa gen nòt ki rete. Yon egzamen blan se yon eprèv ofisyèl antye, ak kwonomèt, epi tantativ la rete nan istorik ou.',
              )}{' '}
              <Link to="/exams">{tx('Passer un examen blanc', 'Pase yon egzamen blan')}</Link>{' '}
              <span className="qz-crosslink__note">
                {tx('Durée et barème affichés avant de commencer.', 'Dire ak barèm parèt anvan ou kòmanse.')}
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  );
};

export default Quizzes;
