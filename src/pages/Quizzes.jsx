import React, { useEffect, useMemo, useState } from 'react';
import DirectBankQuiz from '../components/DirectBankQuiz';
import { useAppData } from '../hooks/useData';

// Quizzes page: curriculum practice only (Course/Grade/Unit), polished layout
const Quizzes = () => {
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
    // Course objects may store the normalized code on `code` (e.g. "CHEM-NSII")
    // or the original Firestore doc id on `id` (e.g. "chem-ns1"). Match either to be robust.
    const course = courses.find((c) => c.code === courseCode || c.id === courseCode);
    const modules = course?.modules || [];
    
    // Sort by order field (chapter number) to ensure proper unit sequence
    const sorted = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    return sorted.map((m) => ({ value: m.id, label: m.title || m.id }));
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
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Practice Hub</span>
            <h1>Curriculum Practice</h1>
            <p className="text-muted">Choose your course, grade, and unit to practice with targeted questions. Get up to three tries with helpful hints.</p>
          </div>
        </div>

        <div className="quiz-layout">
          {/* Filters Section */}
          <div className="quiz-filters">
            <div className="card">
              <h3 className="card__title">Select Practice Area</h3>
              <div className="quiz-selectors">
                <div className="form-group">
                  <label className="label">Course</label>
                  <select className="input-field" value={subjectBase} onChange={(e) => setSubjectBase(e.target.value)}>
                    {subjectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Grade Level</label>
                  <select className="input-field" value={level} onChange={(e) => setLevel(e.target.value)}>
                    {levelOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Unit</label>
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
                  {counts.count} question{counts.count === 1 ? '' : 's'} available
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
                {isLoadingBank ? 'Loading…' : (bankDirectItem ? 'Next Question' : 'Start Practice')}
              </button>
            </div>

            {/* Help cards */}
            <div className="card card--compact">
              <h3 className="card__title">How It Works</h3>
              <ul className="list--bulleted text-muted">
                <li>Three tries per question</li>
                <li>Progressive hints after each incorrect answer</li>
                <li>Full explanation revealed after third try</li>
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
                  <h3>Ready to Practice?</h3>
                  <p className="text-muted">
                    {bankMessage || 'Select a course, grade, and unit, then click "Start Practice" to begin.'}
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