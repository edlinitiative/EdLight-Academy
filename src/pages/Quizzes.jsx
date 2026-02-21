import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DirectBankQuiz from '../components/DirectBankQuiz';
import { useAppData } from '../hooks/useData';
import { useTranslation } from 'react-i18next';

// Quizzes page: curriculum practice only (Course/Grade/Unit), polished layout
const Quizzes = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { data: appData } = useAppData();
  const quizBank = appData?.quizBank;
  const courses = appData?.courses || [];

  // Selection state
  const [subjectBase, setSubjectBase] = useState('');
  const [level, setLevel] = useState('');
  const [unit, setUnit] = useState('');

  const [queryDefaultsApplied, setQueryDefaultsApplied] = useState(false);
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

  // Apply deep-link defaults once (e.g. /quizzes?course=CHEM-NSII&unit=U3)
  useEffect(() => {
    if (queryDefaultsApplied) return;
    if (!subjectOptions.length) return;

    const { course, unit: qUnit } = queryDefaults;
    if (course) {
      const [subj, lvl] = course.split('-');
      if (subj) setSubjectBase(subj);
      if (lvl) setLevel(lvl);
    }

    if (qUnit) {
      setPendingUnit(qUnit);
    }

    setQueryDefaultsApplied(true);
  }, [queryDefaultsApplied, queryDefaults, subjectOptions]);

  // Initialize defaults when data loads
  useEffect(() => {
    if (!subjectBase && subjectOptions[0]) setSubjectBase(subjectOptions[0].value);
  }, [subjectOptions, subjectBase]);

  const levelOptions = useMemo(() => {
    const lvls = new Set(courses.filter((c) => c.subject === subjectBase).map((c) => c.level));
    const ordered = ['NSI', 'NSII', 'NSIII', 'NSIV'];
    const list = Array.from(lvls);
    list.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));
    return list.map((l) => ({ value: l, label: l.replace(/^NS(.*)$/i, 'NS $1') }));
  }, [courses, subjectBase]);

  useEffect(() => {
    if (!levelOptions.find((o) => o.value === level)?.value) {
      setLevel(levelOptions[0]?.value || '');
    }
  }, [levelOptions, level]);

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
    } catch (e) {
      console.error('Curriculum practice failed', e);
      setBankMessage(t('quizzes.unableToLoad', 'Impossible de charger les exercices pour le moment.'));
    } finally {
      setIsLoadingBank(false);
    }
  };

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">{t('quizzes.practiceHub', 'Espace d\'exercices')}</span>
            <h1>{t('quizzes.curriculumPractice', 'Exercices du programme')}</h1>
            <p className="text-muted">{t('quizzes.subtitle', 'Choisissez votre cours, niveau et unité pour vous entraîner avec des questions ciblées. Vous avez jusqu\'à trois essais avec des indices.')}</p>
          </div>
        </div>

        <div className="quiz-layout">
          {/* Filters Section */}
          <div className="quiz-filters">
            <div className="card">
              <h3 className="card__title">{t('quizzes.selectArea', 'Choisir une zone d\'exercice')}</h3>
              <div className="quiz-selectors">
                <div className="form-group">
                  <label className="label">{t('quizzes.course', 'Matière')}</label>
                  <select className="input-field" value={subjectBase} onChange={(e) => setSubjectBase(e.target.value)}>
                    {subjectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">{t('quizzes.gradeLevel', 'Niveau')}</label>
                  <select className="input-field" value={level} onChange={(e) => setLevel(e.target.value)}>
                    {levelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">{t('quizzes.unit', 'Unité')}</label>
                  <select className="input-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
                    {unitOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Status chips */}
              <div className="quiz-status">
                <span className="chip chip--success">
                  {t('quizzes.questionsAvailable', '{{count}} question disponible', { count: counts.count })}
                </span>
                {subjectBase && level && (
                  <span className="chip">
                    {(subjectOptions.find(o => o.value === subjectBase)?.label) || subjectBase} · {level.replace(/^NS(.*)$/i, 'NS $1')}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={generateCurriculumPractice}
                className="button button--primary"
                disabled={isLoadingBank}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {isLoadingBank ? t('common.loading', 'Chargement…') : (bankDirectItem ? t('quizzes.nextQuestion', 'Question suivante') : t('quizzes.startPractice', 'Commencer'))}
              </button>
            </div>

            {/* Help cards */}
            <div className="card card--compact">
              <h3 className="card__title">{t('quizzes.howItWorks', 'Comment ça marche')}</h3>
              <ul className="list--bulleted text-muted">
                <li>{t('quizzes.howItWorksTry', 'Trois essais par question')}</li>
                <li>{t('quizzes.howItWorksHints', 'Indices progressifs après chaque mauvaise réponse')}</li>
                <li>{t('quizzes.howItWorksExplain', 'Explication complète après le troisième essai')}</li>
              </ul>
            </div>
          </div>

          {/* Quiz Panel */}
          <div className="quiz-panel">
            {bankDirectItem ? (
              <div className="card">
                <DirectBankQuiz item={bankDirectItem} />
              </div>
            ) : (
              <div className="card quiz-placeholder">
                <div className="quiz-placeholder__content">
                  <h3>{t('quizzes.ready', 'Prêt à vous entraîner ?')}</h3>
                  <p className="text-muted">
                    {bankMessage || t('quizzes.readyBody', 'Choisissez un cours, un niveau et une unité, puis cliquez sur « Commencer » pour démarrer.')}
                  </p>
                  {!bankMessage && (
                    <div className="quiz-placeholder__icon">📚</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Quizzes;