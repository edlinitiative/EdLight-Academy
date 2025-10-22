import React, { useEffect, useMemo, useState } from 'react';
import DirectBankQuiz from './DirectBankQuiz';

// Curriculum-only quiz component. If subjectCode/unitId are provided, uses those.
// Otherwise, shows selectors for Course (subject), Grade (level), and Unit.
export function QuizComponent({ onComplete, subjectCode, unitId, videoId }) {
  const { data: appData } = require('../hooks/useData').useAppData();
  const quizBank = appData?.quizBank;
  const courses = appData?.courses || [];

  // Derive initial selection from props or default to first available
  const initialCourseCode = useMemo(() => subjectCode || courses[0]?.id || '', [subjectCode, courses]);
  const parseCourseCode = (code) => {
    const [subj, lvl] = (code || '').split('-');
    return { subj: subj || '', lvl: lvl || '' };
  };
  const { subj: initSubj, lvl: initLvl } = parseCourseCode(initialCourseCode);
  const [subjectBase, setSubjectBase] = useState(initSubj);
  const [level, setLevel] = useState(initLvl);
  const [unit, setUnit] = useState(unitId || '');
  const [bankDirectItem, setBankDirectItem] = useState(null);
  const [bankMessage, setBankMessage] = useState('');
  const [isLoadingBank, setIsLoadingBank] = useState(false);

  // Options for selectors
  const subjectOptions = useMemo(() => {
    const uniq = new Map();
    for (const c of courses) {
      uniq.set(c.subject, c.subject);
    }
    // Map internal subjects to friendly labels
    const friendly = { CHEM: 'Chemistry', PHYS: 'Physics', MATH: 'Mathematics', ECON: 'Economics' };
    return Array.from(uniq.values()).map((s) => ({ value: s, label: friendly[s] || s }));
  }, [courses]);

  const levelOptions = useMemo(() => {
    const lvls = new Set(
      courses.filter((c) => c.subject === subjectBase).map((c) => c.level)
    );
    // Ensure NSI default if empty
    const ordered = ['NSI', 'NSII', 'NSIII', 'NSIV'];
    const list = Array.from(lvls);
    list.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));
    return list.map((l) => ({ value: l, label: l.replace(/^NS(.*)$/i, 'NS $1') }));
  }, [courses, subjectBase]);

  const courseCode = subjectBase && level ? `${subjectBase}-${level}` : '';
  const unitOptions = useMemo(() => {
    const course = courses.find((c) => c.id === courseCode);
    const items = (course?.modules || []).map((m) => ({ value: m.id, label: m.title || m.id }));
    return items;
  }, [courses, courseCode]);

  useEffect(() => {
    // When subject changes, pick first available level
    if (!levelOptions.find((o) => o.value === level)?.value) {
      setLevel(levelOptions[0]?.value || '');
    }
  }, [subjectBase, levelOptions, level]);

  useEffect(() => {
    // When course changes, default to first unit if not provided
    if (!unitOptions.find((o) => o.value === unit)?.value) {
      setUnit(unitOptions[0]?.value || '');
    }
  }, [courseCode, unitOptions, unit]);

  useEffect(() => {
    // If props provided subject/unit, sync into selectors on mount
    if (subjectCode) {
      const { subj, lvl } = parseCourseCode(subjectCode);
      if (subj) setSubjectBase(subj);
      if (lvl) setLevel(lvl);
    }
    if (unitId) setUnit(unitId);
  }, [subjectCode, unitId]);

  const generateCurriculumPractice = async () => {
    try {
      setIsLoadingBank(true);
      setBankDirectItem(null);
      setBankMessage('');
      const subjCode = courseCode;
      const unitKey = unit;
      if (!subjCode || !unitKey || !quizBank) {
        setIsLoadingBank(false);
        setBankMessage('Select a course, grade, and unit to begin.');
        return;
      }
      const { pickRandomQuestion, toDirectItemFromRow } = require('../services/quizBank');
      let row = null;
      // Best: exact video match when available via props
      if (quizBank.byVideoId && videoId) {
        const arr = quizBank.byVideoId[videoId] || [];
        if (arr.length > 0) row = arr[Math.floor(Math.random() * arr.length)];
      }
      // Next: subject+unit
      if (!row) {
        row = pickRandomQuestion(quizBank.byUnit, subjCode, unitKey, quizBank.bySubject);
      }
      // Fallback: any row from the bank if subject-based lookup failed
      if (!row && Array.isArray(quizBank.rows) && quizBank.rows.length > 0) {
        const idx = Math.floor(Math.random() * quizBank.rows.length);
        row = quizBank.rows[idx];
      }
      if (!row) {
        setBankMessage('No curriculum practice available for this selection yet.');
        setIsLoadingBank(false);
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
    <div className="card quiz-card">
      <header className="quiz-card__header">
        <div className="quiz-card__title">
          <span className="quiz-card__label">Curriculum Practice</span>
          <h3 className="quiz-card__heading">Practice by Course, Grade, and Unit</h3>
        </div>
      </header>

      <div className="quiz-selectors" style={{ marginBottom: '0.75rem' }}>
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

      {/* Selection summary and availability */}
      {quizBank && (
        <div className="quiz-status">
          {subjectBase && level && (
            <span className="chip">{subjectOptions.find(o => o.value === subjectBase)?.label || subjectBase} · {level.replace(/^NS(.*)$/i, 'NS $1')}</span>
          )}
          {unit && (
            <span className="chip chip--ghost">{unitOptions.find(o => o.value === unit)?.label || unit}</span>
          )}
          {(() => {
            const courseCode = subjectBase && level ? `${subjectBase}-${level}` : '';
            const unitKey = unit ? `${courseCode}|${unit}` : '';
            const unitCount = (quizBank.byUnit && unitKey && quizBank.byUnit[unitKey]?.length) || 0;
            const subjCount = (quizBank.bySubject && courseCode && quizBank.bySubject[courseCode]?.length) || 0;
            const count = unitCount || subjCount || 0;
            return <span className="chip chip--success">{count} question{count === 1 ? '' : 's'} available</span>;
          })()}
        </div>
      )}

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
  );
}