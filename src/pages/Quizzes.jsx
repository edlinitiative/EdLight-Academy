import React, { useEffect, useMemo, useState } from 'react';
import DirectBankQuiz from '../components/DirectBankQuiz';
import { useAppData } from '../hooks/useData';

// Quizzes page: curriculum practice only (Course/Grade/Unit), polished layout
const Quizzes = () => {
  // Lock page scroll while on the Quizzes screen to keep a fixed, app-like viewport
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  const { data: appData } = useAppData();
  const quizBank = appData?.quizBank;
  const courses = appData?.courses || [];

  // Selection state
  const [subjectBase, setSubjectBase] = useState('');
  const [level, setLevel] = useState('');
  const [unit, setUnit] = useState('');

  // Derived options
  const subjectOptions = useMemo(() => {
    const uniq = new Map();
    for (const c of courses) uniq.set(c.subject, c.subject);
    const friendly = { CHEM: 'Chemistry', PHYS: 'Physics', MATH: 'Mathematics', ECON: 'Economics' };
    const arr = Array.from(uniq.values());
    return arr.map((s) => ({ value: s, label: friendly[s] || s }));
  }, [courses]);

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
    const course = courses.find((c) => c.id === courseCode);
    return (course?.modules || []).map((m) => ({ value: m.id, label: m.title || m.id }));
  }, [courses, courseCode]);

  useEffect(() => {
    if (!unitOptions.find((o) => o.value === unit)?.value) {
      setUnit(unitOptions[0]?.value || '');
    }
  }, [unitOptions, unit]);

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
        setBankMessage('Select a course, grade, and unit to begin.');
        return;
      }
      const { pickRandomQuestion, toDirectItemFromRow } = require('../services/quizBank');
      let row = pickRandomQuestion(quizBank.byUnit, courseCode, unit, quizBank.bySubject);
      if (!row && Array.isArray(quizBank.rows) && quizBank.rows.length > 0) {
        const idx = Math.floor(Math.random() * quizBank.rows.length);
        row = quizBank.rows[idx];
      }
      if (!row) {
        setBankMessage('No curriculum practice available for this selection yet.');
        return;
      }
      const direct = toDirectItemFromRow(row);
      setBankDirectItem(direct);
    } catch (e) {
      console.error('Curriculum practice failed', e);
      setBankMessage('Unable to load curriculum practice right now.');
    } finally {
      setIsLoadingBank(false);
    }
  };

  return (
    <section className="section practice-screen">
      <div className="container practice-screen__inner">
        <div className="practice-screen__header">
          <span className="page-header__eyebrow">Practice Hub</span>
          <h1>Curriculum Practice</h1>
          <p className="text-muted">Choose your course, grade, and unit to get a targeted question. You’ll get up to three tries with helpful hints before the full explanation.</p>
        </div>

        <div className="practice-layout practice-screen__content">
          {/* Left column: Filters */}
          <aside className="practice-aside practice-screen__aside aside-mini">
            <div className="card card--compact">
              <h3 className="card__title">Filters</h3>
              <div className="quiz-selectors quiz-selectors--vertical" style={{ marginTop: '0.25rem' }}>
                <div>
                  <label className="label">Course</label>
                  <select className="input-field" value={subjectBase} onChange={(e) => setSubjectBase(e.target.value)}>
                    {subjectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Grade</label>
                  <select className="input-field" value={level} onChange={(e) => setLevel(e.target.value)}>
                    {levelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Unit</label>
                  <select className="input-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
                    {unitOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Availability chips */}
              <div className="quiz-status" style={{ marginTop: '0.6rem' }}>
                {subjectBase && level && (
                  <span className="chip">{(subjectOptions.find(o => o.value === subjectBase)?.label) || subjectBase} · {level.replace(/^NS(.*)$/i, 'NS $1')}</span>
                )}
                {unit && (
                  <span className="chip chip--ghost">{(unitOptions.find(o => o.value === unit)?.label) || unit}</span>
                )}
                <span className="chip chip--success">{counts.count} question{counts.count === 1 ? '' : 's'} available</span>
              </div>
            </div>

            {/* Keep help and tips under filters */}
            <div className="card card--compact">
              <h3 className="card__title">How practice works</h3>
              <ul className="text-muted text-xs list--bulleted">
                <li>Three tries per question</li>
                <li>New hint after each incorrect try</li>
                <li>Reveal the correct answer and explanation after the third try</li>
                <li>Math formatting is supported</li>
              </ul>
            </div>
            <div className="card card--compact">
              <h3 className="card__title">Tips</h3>
              <ul className="text-muted text-xs list--bulleted">
                <li>If a unit has few questions, try another unit in the same course.</li>
                <li>Switch grades (NS I–IV) to broaden topics.</li>
                <li>We add new practice weekly—check back often.</li>
              </ul>
            </div>
          </aside>

          {/* Right column: Quiz panel */}
          <div className="practice-main practice-screen__main">
            <div className="quiz-stage">
              <div className="card quiz-card">
                <header className="quiz-card__header">
                  <div className="quiz-card__title">
                    <span className="quiz-card__label">Curriculum Practice</span>
                    <h3 className="quiz-card__heading">Targeted Question</h3>
                  </div>
                </header>
                <div className="quiz-card__controls">
                  <button
                    type="button"
                    onClick={generateCurriculumPractice}
                    className="button button--primary button--sm"
                    disabled={isLoadingBank}
                  >
                    {isLoadingBank ? 'Loading…' : (bankDirectItem ? 'Next Question' : 'Start Practice')}
                  </button>
                </div>
                {bankDirectItem && (
                  <div style={{ marginTop: '1rem' }}>
                    <DirectBankQuiz item={bankDirectItem} />
                  </div>
                )}
                {!bankDirectItem && bankMessage && (
                  <p className="text-muted" style={{ marginTop: '0.75rem' }}>{bankMessage}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Quizzes;