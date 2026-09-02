import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, SlidersHorizontal, RotateCcw, Target, Lightbulb, BookOpen } from 'lucide-react';
import DirectBankQuiz from '../components/DirectBankQuiz';
import { ErrorState } from '../components/StateViews';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import { useAppData } from '../hooks/useData';
import { useFocusMode } from '../hooks/useFocusMode';
import { useTranslation } from 'react-i18next';
import { subjectThumbs } from './home/content';
import './Quizzes.css';

// Quizzes page: curriculum practice only (Course/Grade/Unit), polished layout
const Quizzes = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { data: appData, isLoading, isError, isFetching, refetch } = useAppData();
  const quizBank = appData?.quizBank;
  const courses = appData?.courses || [];

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
    };
  }, [location.search]);

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

  // Taking a practice question is a focused task: hide the bottom tab bar +
  // footer while one is on screen so it reads like a dedicated quiz.
  useFocusMode(!!bankDirectItem);

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
      let row = pickRandomQuestion(quizBank.byUnit, courseCode, unit, quizBank.bySubject);
      if (!row && Array.isArray(quizBank.rows) && quizBank.rows.length > 0) {
        const idx = Math.floor(Math.random() * quizBank.rows.length);
        row = quizBank.rows[idx];
      }
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

  const subjectLabel = subjectOptions.find((o) => o.value === subjectBase)?.label || subjectBase;
  const levelLabel = level ? level.replace(/^NS(.*)$/i, 'NS $1') : '';
  const unitLabel = unitOptions.find((o) => o.value === unit)?.label || '';
  const countLabel = t('quizzes.questionsAvailable', '{{count}} question disponible', { count: counts.count });

  const ctaLabel = isLoadingBank
    ? t('common.loading', 'Chargement…')
    : bankDirectItem
      ? t('quizzes.nextQuestion', 'Question suivante')
      : t('quizzes.startPractice', 'Commencer');

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
          <Skeleton width={260} height={32} style={{ marginBottom: '0.75rem' }} />
          <SkeletonText lines={2} lastWidth="60%" />
          <div className="qz-card" style={{ marginTop: '1.5rem' }}>
            <Skeleton width="100%" height={132} radius={12} style={{ marginBottom: '1.25rem' }} />
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

  return (
    <section className="section qz">
      <div className="container qz__container">
        <header className="qz__head">
          <h1 className="qz__title">{t('quizzes.curriculumPractice', 'Quiz du programme')}</h1>
          <p className="qz__subtitle">
            {t('quizzes.subtitle', 'Choisissez votre cours, niveau et unité pour vous entraîner avec des questions ciblées. Vous avez jusqu\'à trois essais avec des indices.')}
          </p>
        </header>

        {bankDirectItem ? (
          /* ── In practice: the question owns the column; the selection sits
                above it as a compact, re-openable context bar. ── */
          <>
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
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                <span className="qz-context__toggle-label">{t('quizzes.selectArea', 'Choisir une zone d\'exercice')}</span>
              </button>
            </div>

            {showSelectors && (
              <div className="qz-card qz-card--tight">
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
                className="button button--primary"
                disabled={isLoadingBank}
              >
                <RotateCcw size={16} aria-hidden="true" /> {ctaLabel}
              </button>
            </div>
          </>
        ) : (
          /* ── Setup: one purposeful card, sized to its content. No giant
                empty panel waiting for a question. ── */
          <>
            <div className="qz-card">
              {subjectBase && (
                <div className="qz-cover">
                  <img
                    className="qz-cover__img"
                    src={subjectThumbs[subjectBase] || subjectThumbs.MATH}
                    alt=""
                    width={760}
                    height={425}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="qz-cover__overlay">
                    <span className="qz-cover__eyebrow">{t('quizzes.curriculumPractice', 'Quiz du programme')}</span>
                    <span className="qz-cover__title">{subjectLabel}</span>
                    {levelLabel && <span className="qz-cover__sub">{levelLabel}</span>}
                  </div>
                </div>
              )}

              {selectors}

              {/* Plain text, not a pill: the subject/level chip that used to
                  sit here only repeated the two selects directly above it.
                  The count stays because this is now its only home — the
                  page header no longer carries it. */}
              <p className="qz-count">{countLabel}</p>

              <button
                type="button"
                onClick={generateCurriculumPractice}
                className="button button--primary qz-cta"
                disabled={isLoadingBank}
              >
                {ctaLabel}
              </button>

              <p className="qz-hint" role={bankMessage ? 'status' : undefined}>
                {bankMessage || t('quizzes.readyBody', 'Choisissez un cours, un niveau et une unité, puis cliquez sur « Commencer » pour démarrer.')}
              </p>
            </div>

            <div className="qz-how">
              <h2 className="qz-how__title">{t('quizzes.howItWorks', 'Comment ça marche')}</h2>
              <ul className="qz-how__list">
                <li className="qz-how__item">
                  <span className="qz-how__icon"><Target size={16} aria-hidden="true" /></span>
                  {t('quizzes.howItWorksTry', 'Trois essais par question')}
                </li>
                <li className="qz-how__item">
                  <span className="qz-how__icon"><Lightbulb size={16} aria-hidden="true" /></span>
                  {t('quizzes.howItWorksHints', 'Indices progressifs après chaque mauvaise réponse')}
                </li>
                <li className="qz-how__item">
                  <span className="qz-how__icon"><BookOpen size={16} aria-hidden="true" /></span>
                  {t('quizzes.howItWorksExplain', 'Explication complète après le troisième essai')}
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default Quizzes;
