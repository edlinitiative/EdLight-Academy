/**
 * LessonCompletionPanel — what a CONFIRMED completion offers next.
 *
 * Rendered only for a lesson the progress document (or a write the server
 * acknowledged in this visit) lists as complete — never for a pending, queued
 * or failed save. It replaces the old full-screen "Leçon terminée" sheet: the
 * acknowledgment is local and brief (a check that settles in ~800 ms, none at
 * all under reduced motion), and the next actions are usable immediately.
 *
 * One primary action:
 *  - the chapter's practice, with the REAL count of bank questions for the
 *    unit — and called the chapter, because the practice page scopes by unit;
 *  - when the bank has nothing for the unit, the next lesson, with an honest
 *    line and a quieter way to choose other practice;
 *  - at the end of a course, the course outline.
 * The evidence words come from learningJourney's EVIDENCE: "Terminée" and
 * "La maîtrise se construit avec la pratique." — a video is never mastery.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Target } from '../../icons';
import { EVIDENCE, practiceHref, trackJourney } from '../../../utils/learningJourney';
import type { ChapterPractice } from './chapterPractice';

export interface NextLesson { title: string; unit?: string }

export default function LessonCompletionPanel({
  isCreole,
  fresh,
  practice,
  courseCode,
  courseId,
  lessonId,
  unitTitle,
  next,
  onNext,
  onOutline,
}: {
  isCreole: boolean;
  /** The confirmation arrived in this visit: play the brief acknowledgment. */
  fresh: boolean;
  practice: ChapterPractice;
  courseCode: string | null | undefined;
  courseId: string;
  lessonId: string;
  unitTitle?: string;
  next: NextLesson | null;
  onNext: () => void;
  onOutline: () => void;
}) {
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);
  const ev = EVIDENCE.completed;

  const openPractice = () => {
    if (practice.status !== 'ready') return;
    trackJourney('practice_handoff_opened', {
      source: 'lesson_completion',
      course: courseCode || undefined,
      course_id: courseId,
      unit: practice.unit,
      lesson_id: lessonId,
      mode: 'quiz',
      count: practice.count,
      scope: 'unit',
    });
  };

  const nextButton = (primary: boolean) => next && (
    <button
      type="button"
      className={`button ${primary ? 'button--primary' : 'button--ghost'} lesson-done-panel__next`}
      onClick={onNext}
    >
      <span>{L('Leçon suivante', 'Pwochen leson')}</span>
      <span className="lesson-done-panel__sub">{next.title}</span>
    </button>
  );

  return (
    <section
      className={`lesson-done-panel${fresh ? ' is-fresh' : ''}`}
      aria-labelledby="lesson-done-panel-title"
    >
      <p className="lesson-done-panel__ack">
        <span className="lesson-done-panel__mark" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
        <span>
          <strong id="lesson-done-panel-title">{isCreole ? ev.ht : ev.fr}</strong>
          <span className="lesson-done-panel__help">{L(
            'La maîtrise se construit avec la pratique.',
            'Metriz la bati ak pratik.',
          )}</span>
        </span>
      </p>

      {practice.status === 'ready' && (
        <div className="lesson-done-panel__actions">
          <Link
            to={practice.href}
            className="button button--primary lesson-done-panel__practice"
            onClick={openPractice}
          >
            <Target size={18} aria-hidden="true" />
            <span>
              {L(
                `Pratiquer ce chapitre · ${practice.count} question${practice.count === 1 ? '' : 's'}`,
                `Pratike chapit sa a · ${practice.count} kesyon`,
              )}
            </span>
          </Link>
          {nextButton(false)}
          <p className="lesson-done-panel__scope">
            {unitTitle
              ? L(`Questions de tout le chapitre « ${unitTitle} ».`, `Kesyon sou tout chapit « ${unitTitle} ».`)
              : L('Questions de tout le chapitre.', 'Kesyon sou tout chapit la.')}
          </p>
        </div>
      )}

      {practice.status === 'loading' && (
        <div className="lesson-done-panel__actions" aria-busy="true">
          {/* The count isn't known yet: hold the place, never say "0". */}
          <span className="lesson-done-panel__placeholder" aria-hidden="true" />
          <span className="qz__sr-only" role="status">
            {L('Recherche des exercices du chapitre…', 'N ap chèche egzèsis chapit la…')}
          </span>
          {nextButton(false)}
        </div>
      )}

      {practice.status === 'none' && (
        <div className="lesson-done-panel__actions">
          {next ? nextButton(true) : (
            <button type="button" className="button button--primary" onClick={onOutline}>
              {L('Revoir le plan du cours', 'Gade plan kou a')}
            </button>
          )}
          <p className="lesson-done-panel__scope">
            {L('Ce chapitre n’a pas encore de questions d’entraînement.', 'Chapit sa a poko gen kesyon pou pratike.')}
            {courseCode && (
              <>
                {' '}
                <Link className="lesson-stage__notice-link" to={practiceHref({ course: courseCode, from: 'lesson' })}>
                  {L('Choisir d’autres exercices', 'Chwazi lòt egzèsis')}
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {!next && practice.status !== 'none' && (
        <p className="lesson-done-panel__scope">
          {L('C’était la dernière leçon de ce cours.', 'Sa te dènye leson kou sa a.')}{' '}
          <button type="button" className="lesson-stage__notice-link" onClick={onOutline}>
            {L('Revoir le plan du cours', 'Gade plan kou a')}
          </button>
        </p>
      )}
    </section>
  );
}
