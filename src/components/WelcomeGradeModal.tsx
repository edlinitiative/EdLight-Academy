/**
 * WelcomeGradeModal (web) — one-time "Quelle classe ?" prompt, mirroring the
 * mobile one. Shown once for signed-in users (existing users default to
 * gradeChosen=false). The grade drives adaptive content (see gradeProfile /
 * pickHomeSuggestion). One tap picks a grade; "Passer" skips without a grade.
 * Never blocks — both paths set gradeChosen so it won't ask again.
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap } from 'lucide-react';
import useStore from '../contexts/store';
import { GRADES } from '../config/trackConfig';
import './WelcomeGradeModal.css';

export default function WelcomeGradeModal() {
  const hydrated = useStore((s) => s.hydrated);
  const authConfirmed = useStore((s) => s.authConfirmed);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const gradeChosen = useStore((s) => s.gradeChosen);
  const language = useStore((s) => s.language);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Wait for authConfirmed so the prompt appears over the real dashboard, and
  // only for signed-in learners (grade is a personalisation for their account).
  const visible = hydrated && authConfirmed && isAuthenticated && !gradeChosen;

  // Lock body scroll while the sheet is up (matches ExamPreviewModal).
  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [visible]);

  // Esc skips (non-blocking, so dismissing is a valid "Passer").
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGradeChosen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, setGradeChosen]);

  if (!visible) return null;

  const choose = (code: string) => {
    setGrade(code);
    setGradeChosen(true);
  };

  return createPortal(
    <div
      className="grade-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('Tu es en quelle classe ?', 'Ki klas ou ye ?')}
      onClick={() => setGradeChosen(true)}
    >
      <div className="grade-modal__panel" onClick={(e) => e.stopPropagation()}>
        <span className="grade-modal__icon">
          <GraduationCap size={30} />
        </span>

        <h2 className="grade-modal__title">{t('Tu es en quelle classe ?', 'Ki klas ou ye ?')}</h2>
        <p className="grade-modal__subtitle">
          {t('Pour te proposer le bon contenu.', 'Pou n ba w bon kontni an.')}
        </p>

        <div className="grade-modal__grid">
          {GRADES.map((g) => (
            <button
              key={g.code}
              type="button"
              className="grade-modal__chip"
              onClick={() => choose(g.code)}
              aria-label={isCreole ? g.labelHt : g.label}
            >
              {isCreole ? g.labelHt : g.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="grade-modal__skip"
          onClick={() => setGradeChosen(true)}
        >
          {t('Passer', 'Sote')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
