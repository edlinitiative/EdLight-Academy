/**
 * LessonPracticeCard — practice comes first after the video (RECHECK item 3,
 * Stitch web direction §2.1).
 *
 *  - The scope is said truthfully: the session the handoff opens is the
 *    CHAPTER's (the practice page scopes by unit), so the line reads
 *    "N questions sur {chapitre}", never "sur cette leçon".
 *  - Question 1 is live: a real bank question of that chapter, answerable in
 *    place. The pick shows right/wrong and the right answer immediately — the
 *    preview is the activity, not a picture of it. No qualifying question, no
 *    preview.
 *  - "Commencer l'exercice" is the page's ONE solid button. It is the exact
 *    practice handoff (practiceHref) the completion flow uses.
 *  - Everything else is tonal: Flashcards, and the in-page lesson exercises
 *    when the bank tags questions to this lesson (those attribute the score
 *    to the lesson for its mastery ladder).
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from '../../icons';
import { trackJourney } from '../../../utils/learningJourney';
import type { ChapterPractice } from './chapterPractice';
import type { PreviewQuestion } from './previewQuestion';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function LessonPracticeCard({
  isCreole,
  practice,
  sessionCount,
  unitTitle,
  question,
  signedIn,
  solid = true,
  lessonQuestions,
  courseCode,
  courseId,
  lessonId,
  onLessonExercises,
  onFlashcards,
  otherPracticeHref,
  children,
}: {
  isCreole: boolean;
  practice: ChapterPractice;
  /** Questions the quiz session will hold (≤10); 0 = unknown. */
  sessionCount: number;
  unitTitle?: string;
  question: PreviewQuestion | null;
  signedIn: boolean;
  /** False when another solid owns the screen (the exhausted-preview gate). */
  solid?: boolean;
  /** Bank rows tagged to this lesson; null while the bank loads. */
  lessonQuestions: number | null;
  courseCode?: string | null;
  courseId: string;
  lessonId?: string;
  onLessonExercises: () => void;
  onFlashcards: () => void;
  otherPracticeHref?: string | null;
  /** Extra unit-level content (the chapter test card). */
  children?: React.ReactNode;
}) {
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [question?.id, question?.stem]);

  const ready = practice.status === 'ready';
  const n = sessionCount;
  const meta = [
    n > 0
      ? (unitTitle
          ? L(`${n} question${n > 1 ? 's' : ''} sur ${unitTitle}`, `${n} kesyon sou ${unitTitle}`)
          : L(`${n} question${n > 1 ? 's' : ''} du chapitre`, `${n} kesyon nan chapit la`))
      : (unitTitle ? L(`Questions sur ${unitTitle}`, `Kesyon sou ${unitTitle}`) : L('Questions du chapitre', 'Kesyon chapit la')),
    signedIn ? '' : L('sans compte', 'san kont'),
  ].filter(Boolean).join(' · ');

  const openPractice = () => {
    if (!ready) return;
    trackJourney('practice_handoff_opened', {
      source: 'lesson',
      course: courseCode || undefined,
      course_id: courseId,
      unit: practice.unit,
      lesson_id: lessonId,
      mode: 'quiz',
      count: practice.count,
      scope: 'unit',
      preview_answered: picked != null,
    });
  };

  const answered = picked != null && question;
  const right = answered && picked === question!.correctIndex;

  return (
    <section className="lx-practice" aria-labelledby="lesson-practice-title">
      <div className="lx-practice__head">
        <h2 id="lesson-practice-title" className="lx-practice__title">
          {/* "cette leçon" only when the bank really tags questions to it;
              the session itself is always the chapter's (meta line). */}
          {lessonQuestions != null && lessonQuestions > 0
            ? L('S’exercer sur cette leçon', 'Egzèse sou leson sa a')
            : L('S’exercer sur ce chapitre', 'Egzèse sou chapit sa a')}
        </h2>
        {practice.status !== 'none' && <p className="lx-practice__meta">{meta}</p>}
      </div>

      {practice.status === 'loading' && (
        <div className="lx-practice__well lx-practice__well--loading" aria-busy="true">
          <span className="qz__sr-only" role="status">{L('Recherche des exercices du chapitre…', 'N ap chèche egzèsis chapit la…')}</span>
        </div>
      )}

      {ready && question && (
        <div className="lx-practice__well">
          <p className="lx-practice__stem" id="lx-preview-stem">{question.stem}</p>
          <div className={`lx-practice__answers${question.options.length > 2 ? '' : ' lx-practice__answers--two'}`} role="group" aria-labelledby="lx-preview-stem">
            {question.options.map((opt, i) => {
              const state = !answered ? '' : i === question.correctIndex ? ' is-right' : i === picked ? ' is-wrong' : ' is-dim';
              return (
                <button
                  key={`${i}-${opt}`}
                  type="button"
                  className={`lx-answer${state}`}
                  aria-pressed={picked === i}
                  disabled={!!answered}
                  onClick={() => setPicked(i)}
                >
                  <span className="lx-answer__letter" aria-hidden="true">
                    {answered && i === question.correctIndex ? <Check size={14} weight="bold" /> : answered && i === picked ? <X size={14} weight="bold" /> : LETTERS[i]}
                  </span>
                  <span className="lx-answer__text">{opt}</span>
                </button>
              );
            })}
          </div>
          <p className="lx-practice__verdict" role="status" aria-live="polite">
            {answered ? (right
              ? L('Juste. La suite dans l’exercice.', 'Se sa. Rès la nan egzèsis la.')
              : L(`Pas tout à fait : c’était « ${question.options[question.correctIndex]} ».`, `Pa tout bon : se te « ${question.options[question.correctIndex]} ».`)) : ''}
          </p>
        </div>
      )}

      {practice.status === 'none' ? (
        <p className="lx-practice__note">
          {L('Ce chapitre n’a pas encore de questions d’entraînement.', 'Chapit sa a poko gen kesyon pou pratike.')}
          {otherPracticeHref && (
            <>
              {' '}
              <Link className="lx-link" to={otherPracticeHref}>{L('Choisir d’autres exercices', 'Chwazi lòt egzèsis')}</Link>
            </>
          )}
        </p>
      ) : null}

      <div className="lx-practice__actions">
        {ready ? (
          <Link to={practice.href} className={solid ? 'lx-solid' : 'lx-tonal'} onClick={openPractice}>
            {L('Commencer l’exercice', 'Kòmanse egzèsis la')}
          </Link>
        ) : practice.status === 'loading' ? (
          <button type="button" className={solid ? 'lx-solid' : 'lx-tonal'} disabled>
            {L('Commencer l’exercice', 'Kòmanse egzèsis la')}
          </button>
        ) : null}
        <button type="button" className="lx-tonal" onClick={onFlashcards}>
          {L('Flashcards', 'Kat etid')}
        </button>
        {lessonQuestions != null && lessonQuestions > 0 && (
          <button type="button" className="lx-quiet" onClick={onLessonExercises}>
            {L(`Exercices de la leçon · ${lessonQuestions}`, `Egzèsis leson an · ${lessonQuestions}`)}
          </button>
        )}
      </div>

      {children}
    </section>
  );
}
