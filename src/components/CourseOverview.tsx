/**
 * CourseOverview — the landing screen for a course
 * ────────────────────────────────────────────────
 * An optional orientation step (PRD LJ-03): enough to decide whether the
 * course fits — what it covers, for which class, how it is organised — and
 * ONE action that enters the right lesson. A deep link to a lesson skips this
 * screen entirely (CourseDetail opens `?lesson=` directly).
 *
 * Stitch web redesign (DIRECTION-WEB §2.3/2.4): no image band; the header is
 * type only, the chapters carry the pictures — each on its subject mat
 * (SubjectFrame), with the honest artwork when a chapter has no good still.
 *
 * Honesty rules:
 *  - the summary only when authored — the generated "Cours de … enseigné en
 *    vidéo par EdLight" template is hidden (utils/lessonCopy);
 *  - duration only when the lessons carry real lengths. `course.length` and
 *    lesson `duration` default to 15 min per lesson in the data layer, so a
 *    total that is just "lessons × 15" is a placeholder and is not shown;
 *  - outcomes ("Ce que tu sauras faire") only when authored — never a list
 *    made up from chapter titles;
 *  - instructors only when a verified one is bound (CourseInstructors);
 *  - evidence words stay separate statements (terminées · pratiquées ·
 *    maîtrisées), never summed; a chapter with none says nothing.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Clock, Layers, ChevronRight, ChevronDown, ArrowLeft, Check, Info, Circle, Play } from './icons';
import CourseInstructors from './CourseInstructors';
import SubjectFrame from './journey/media/SubjectFrame';
import { lessonFrame } from '../utils/lessonFrames';
import { authoredDescription } from '../utils/lessonCopy';
import { displayCourseName } from '../utils/courseName';
import { EVIDENCE, practiceHref } from '../utils/learningJourney';
import './CourseOverview.css';

function getLessons(module) {
  return Array.isArray(module?.lessons) ? module.lessons : [];
}

/** The data layer's per-lesson fallback length, in minutes. */
const PLACEHOLDER_LESSON_MINUTES = 15;

/** Real minutes for a set of lessons, or 0 when they only carry the placeholder. */
export function realLessonMinutes(lessons: Array<{ duration?: unknown }>): number {
  if (!lessons.length) return 0;
  const mins = lessons.map((l) => parseInt(String(l?.duration ?? ''), 10));
  // Any lesson still on the fallback makes the total partly invented: say nothing.
  if (mins.some((m) => !Number.isFinite(m) || m <= 0 || m === PLACEHOLDER_LESSON_MINUTES)) return 0;
  return mins.reduce((a, b) => a + b, 0);
}

/** One lesson's real minutes, or 0. */
function lessonMinutes(l: { duration?: unknown }): number {
  const m = parseInt(String(l?.duration ?? ''), 10);
  return Number.isFinite(m) && m > 0 && m !== PLACEHOLDER_LESSON_MINUTES ? m : 0;
}

/** Authored learning outcomes, if the course document carries any. */
function authoredOutcomes(course): string[] {
  const raw = course?.outcomes ?? course?.learningOutcomes ?? course?.learning_outcomes;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\n+/) : [];
  return list.map((s) => String(s || '').replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 6);
}

/** Independent evidence counts over a set of lessons (same rules as Home). */
function evidenceOf(lessons: any[], completed: Set<string>, mastery: any) {
  let done = 0; let practised = 0; let mastered = 0;
  for (const l of lessons) {
    if (!l?.id) continue;
    const rec = mastery?.[l.id];
    if (completed.has(l.id) || rec?.completed) done += 1;
    if (typeof rec?.bestPct === 'number') practised += 1;
    if (rec?.masteredAt) mastered += 1;
  }
  return { done, practised, mastered };
}

export default function CourseOverview({
  course,
  modules = [],
  progress = null,
  isEnrolled = false,
  resumeTarget = { module: 0, lesson: 0 },
  hasProgress = false,
  onStart,
  onSelectModule,
  onSelectLesson,
  mastery = null,
  staleLesson = false,
  backTo = '/courses',
  progressFailed = false,
  onRetryProgress,
}: {
  course: any;
  modules?: any[];
  progress?: any;
  isEnrolled?: boolean;
  resumeTarget?: { module: number; lesson: number };
  hasProgress?: boolean;
  onStart: () => void;
  /** Kept for callers that open a chapter at its first unfinished lesson. */
  onSelectModule?: (idx: number) => void;
  /** Open one lesson from an expanded chapter. */
  onSelectLesson?: (moduleIdx: number, lessonIdx: number) => void;
  mastery?: any;
  /** The `?lesson=` this page was opened with doesn't exist in the course. */
  staleLesson?: boolean;
  /** The catalogue URL to return to (with its filters when known). */
  backTo?: string;
  /** The student's progress / mastery read failed — never drawn as 0/N. */
  progressFailed?: boolean;
  onRetryProgress?: () => void;
}) {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isCreole = i18n.language === 'ht';
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);

  const totalModules = modules.length;
  const allLessons = useMemo(() => modules.flatMap((m) => getLessons(m)), [modules]);
  const totalLessons = allLessons.length || course.videoCount || 0;

  const completedSet = useMemo(() => new Set<string>(progress?.completedLessons || []), [progress?.completedLessons]);
  const masteryMap = mastery || {};
  const courseEvidence = useMemo(() => evidenceOf(allLessons, completedSet, masteryMap), [allLessons, completedSet, masteryMap]);
  const percent = totalLessons > 0 ? Math.min(100, Math.round((courseEvidence.done / totalLessons) * 100)) : 0;
  const allDone = totalLessons > 0 && allLessons.every((l) => l?.id && completedSet.has(l.id));

  const totalMinutes = realLessonMinutes(allLessons);
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hourLabel = isCreole ? 'èdtan' : 'h';
    const minLabel = isCreole ? 'minit' : 'min';
    if (hours && mins) return `${hours} ${hourLabel} ${mins} ${minLabel}`;
    if (hours) return `${hours} ${hourLabel}`;
    return `${mins} ${minLabel}`;
  };

  const description = authoredDescription(course.description) || '';
  const outcomes = authoredOutcomes(course);
  const subject = course.subject || course.code || '';

  const resumeLesson = getLessons(modules[resumeTarget.module])[resumeTarget.lesson];
  const resumeLessonTitle = resumeLesson?.title || '';

  // ONE action, named after what it opens.
  const ctaLabel = allDone
    ? L('Revoir le cours', 'Revize kou a')
    : resumeLessonTitle
      ? (hasProgress
          ? L(`Continuer : ${resumeLessonTitle}`, `Kontinye : ${resumeLessonTitle}`)
          : L(`Commencer : ${resumeLessonTitle}`, `Kòmanse : ${resumeLessonTitle}`))
      : (hasProgress ? L('Continuer', 'Kontinye') : L('Commencer', 'Kòmanse'));

  // The course's practice, as a quiet alternative — not a second primary.
  const coursePracticeHref = course.code ? practiceHref({ course: course.code }) : '/quizzes';

  const [descOpen, setDescOpen] = useState(false);
  const longDesc = description.length > 180;

  // The chapter the CTA resumes starts open; any chapter toggles.
  const [open, setOpen] = useState<Set<number>>(() => new Set([resumeTarget.module]));
  useEffect(() => { setOpen(new Set([resumeTarget.module])); }, [course.id, resumeTarget.module]);
  const toggle = (idx: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  const showProgress = isEnrolled && totalLessons > 0;
  const hasRail = showProgress || progressFailed || outcomes.length > 0;

  const evidenceLine = (e: { done: number; practised: number; mastered: number }) => {
    const parts: string[] = [];
    if (e.done > 0) parts.push(L(`${e.done} terminée${e.done > 1 ? 's' : ''}`, `${e.done} fini`));
    if (e.practised > 0) parts.push(L(`${e.practised} pratiquée${e.practised > 1 ? 's' : ''}`, `${e.practised} pratike`));
    if (e.mastered > 0) parts.push(L(`${e.mastered} maîtrisée${e.mastered > 1 ? 's' : ''}`, `${e.mastered} metrize`));
    return parts.join(' · ');
  };

  return (
    <div className={`co${hasRail ? ' co--rail' : ''}`}>
      <div className="co__main">
      <div className="co__head">
        <button type="button" className="co__back" onClick={() => navigate(backTo)}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{L('Catalogue', 'Katalòg')}<span className="qz__sr-only"> : {L('retour', 'retounen')}</span></span>
        </button>

        {staleLesson && (
          <p className="co__notice" role="status">
            <Info size={16} aria-hidden="true" />
            {L(
              'Cette leçon n’est plus disponible dans ce cours. Voici le cours ; reprends où tu en es.',
              'Leson sa a pa disponib ankò nan kou sa a. Men kou a ; kontinye kote ou te rive a.',
            )}
          </p>
        )}

        <h1 className="co__title">{displayCourseName(course.name || course.title)}</h1>
        {description && (
          <>
            <p className={`co__desc${longDesc && !descOpen ? ' is-clamped' : ''}`}>{displayCourseName(description)}</p>
            {longDesc && (
              <button type="button" className="co__more" aria-expanded={descOpen} onClick={() => setDescOpen((o) => !o)}>
                {descOpen ? L('Voir moins', 'Wè mwens') : L('Lire la suite', 'Li rès la')}
              </button>
            )}
          </>
        )}
        <ul className="co__meta">
          <li><Layers size={16} aria-hidden="true" /> {L(`${totalModules} chapitre${totalModules === 1 ? '' : 's'}`, `${totalModules} chapit`)}</li>
          <li><BookOpen size={16} aria-hidden="true" /> {L(`${totalLessons} leçon${totalLessons === 1 ? '' : 's'}`, `${totalLessons} leson`)}</li>
          {totalMinutes > 0 && <li><Clock size={16} aria-hidden="true" /> {formatDuration(totalMinutes)}</li>}
        </ul>
      </div>

      <div className="co__actions">
        <button type="button" className="co__solid" onClick={onStart}>
          <span className="co__solid-label">{ctaLabel}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="co__tonal" onClick={() => navigate(coursePracticeHref)}>
          {L('S’entraîner sur ce cours', 'Pratike sou kou sa a')}
        </button>
      </div>

      {totalModules > 0 && (
        <section className="co__content" aria-labelledby="course-outline-title">
          <h2 id="course-outline-title" className="co__section-title">{L('Contenu du cours', 'Sa ki nan kou a')}</h2>
          <ol className="co__chapters">
            {modules.map((module, idx) => {
              const lessons = getLessons(module);
              const ev = evidenceOf(lessons, completedSet, masteryMap);
              const moduleDone = lessons.length > 0 && ev.done >= lessons.length;
              const moduleMinutes = realLessonMinutes(lessons);
              const still = lessons.map((l) => lessonFrame(l?.videoUrl)).find(Boolean) || null;
              const isOpen = open.has(idx) && lessons.length > 0;
              const listId = `co-ch-${module.id ?? idx}`;
              const evText = isEnrolled ? evidenceLine(ev) : '';
              return (
                <li key={module.id || idx} className={`co__chapter${isOpen ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="co__chapter-head"
                    aria-expanded={lessons.length > 0 ? isOpen : undefined}
                    aria-controls={lessons.length > 0 ? listId : undefined}
                    onClick={() => (lessons.length > 0 ? toggle(idx) : onSelectModule?.(idx))}
                  >
                    <span className="co__thumb">
                      <SubjectFrame subject={subject} still={still} size="md" />
                      <span className="co__num" aria-hidden="true">{moduleDone ? <Check size={14} weight="bold" /> : idx + 1}</span>
                    </span>
                    <span className="co__chapter-body">
                      <span className="co__chapter-title">
                        <span className="qz__sr-only">{L(`Chapitre ${idx + 1} : `, `Chapit ${idx + 1} : `)}</span>
                        {module.title}
                      </span>
                      <span className="co__chapter-meta">
                        {L(`${lessons.length} leçon${lessons.length === 1 ? '' : 's'}`, `${lessons.length} leson`)}
                        {moduleMinutes > 0 ? ` · ${formatDuration(moduleMinutes)}` : ''}
                      </span>
                      {evText && <span className="co__chapter-ev co__chapter-ev--phone">{evText}</span>}
                    </span>
                    {evText && <span className="co__chapter-ev co__chapter-ev--wide">{evText}</span>}
                    {lessons.length > 0
                      ? <ChevronDown size={20} className="co__chev" aria-hidden="true" />
                      : <ChevronRight size={20} className="co__chev" aria-hidden="true" />}
                  </button>
                  {isOpen && (
                    <ul className="co__lessons" id={listId}>
                      {lessons.map((lsn, lidx) => {
                        const done = !!lsn?.id && completedSet.has(lsn.id);
                        const current = hasProgress && !allDone && idx === resumeTarget.module && lidx === resumeTarget.lesson;
                        const mins = lessonMinutes(lsn);
                        return (
                          <li key={lsn.id ?? lidx}>
                            <button
                              type="button"
                              className={`co__lesson${current ? ' is-current' : ''}${done ? ' is-done' : ''}`}
                              aria-current={current ? 'step' : undefined}
                              onClick={() => (onSelectLesson ? onSelectLesson(idx, lidx) : onSelectModule?.(idx))}
                            >
                              <span className="co__lesson-glyph" aria-hidden="true">
                                {done ? <Check size={16} weight="bold" /> : current ? <Play size={14} weight="fill" /> : <Circle size={16} />}
                              </span>
                              {(done || current) && (
                                <span className="qz__sr-only">
                                  {[current ? L('En cours', 'An kou') : '', done ? (isCreole ? EVIDENCE.completed.ht : EVIDENCE.completed.fr) : ''].filter(Boolean).join(', ')} :{' '}
                                </span>
                              )}
                              <span className="co__lesson-title"><span className="co__lesson-num">{idx + 1}.{lidx + 1}</span> {lsn.title}</span>
                              {current
                                ? <span className="co__lesson-tail co__lesson-tail--current" aria-hidden="true">{L('En cours', 'An kou')}</span>
                                : mins > 0 ? <span className="co__lesson-tail">{mins} min</span> : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      </div>
      <aside className="co__rail">
      {progressFailed && totalLessons > 0 ? (
        <section className="co__card co__progress co__progress--failed" aria-labelledby="co-progress-title">
          <h2 id="co-progress-title" className="co__card-title">{L('Ta progression', 'Pwogrè ou')}</h2>
          <p className="co__progress-fail" role="alert">
            {L('Ta progression n’a pas pu se charger. Rien n’est perdu : elle est enregistrée sur ton compte.',
              'Pwogrè ou pa t ka chaje. Anyen pa pèdi : li anrejistre sou kont ou.')}
          </p>
          <button type="button" className="co__tonal co__retry" onClick={onRetryProgress}>{L('Réessayer', 'Eseye ankò')}</button>
        </section>
      ) : showProgress && (
        <section className="co__card co__progress" aria-labelledby="co-progress-title">
          <h2 id="co-progress-title" className="co__card-title">{L('Ta progression', 'Pwogrè ou')}</h2>
          <p className="co__progress-big">
            <strong>{courseEvidence.done}/{totalLessons}</strong>
            <span>{L('leçons terminées', 'leson fini')}</span>
            <span className="co__progress-pct">{percent} %</span>
          </p>
          <div className="co__bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <dl className="co__triple">
            <div><dt>{L('terminées', 'fini')}</dt><dd>{courseEvidence.done}</dd></div>
            <div><dt>{L('pratiquées', 'pratike')}</dt><dd>{courseEvidence.practised}</dd></div>
            <div><dt>{L('maîtrisées', 'metrize')}</dt><dd>{courseEvidence.mastered}</dd></div>
          </dl>
          <details className="co__words">
            <summary>{L('Que veulent dire ces mots ?', 'Kisa mo sa yo vle di ?')}</summary>
            <ul>
              {(['completed', 'practised', 'mastered'] as const).map((k) => (
                <li key={k}><strong>{isCreole ? EVIDENCE[k].ht : EVIDENCE[k].fr}</strong> — {isCreole ? EVIDENCE[k].helpHt : EVIDENCE[k].helpFr}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {outcomes.length > 0 && (
        <section className="co__card co__outcomes" aria-labelledby="course-outcomes-title">
          <h2 id="course-outcomes-title" className="co__card-title">{L('Ce que tu sauras faire', 'Sa w ap konn fè')}</h2>
          <ul>
            {outcomes.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </section>
      )}

      <div className="co__instructors">
        <CourseInstructors courseId={course.id} />
      </div>
      </aside>
    </div>
  );
}
