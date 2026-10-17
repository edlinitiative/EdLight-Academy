/**
 * CourseOverview — the landing screen for a course
 * ────────────────────────────────────────────────
 * An optional orientation step (PRD LJ-03): enough to decide whether the
 * course fits — what it covers, for which class, how it is organised — and
 * ONE action that enters the right lesson. A deep link to a lesson skips this
 * screen entirely (CourseDetail opens `?lesson=` directly).
 *
 * Honesty rules:
 *  - duration only when the lessons carry real lengths. `course.length` and
 *    lesson `duration` default to 15 min per lesson in the data layer, so a
 *    total that is just "lessons × 15" is a placeholder and is not shown;
 *  - outcomes only when authored (course.outcomes / learningOutcomes) — never
 *    a list made up from chapter titles;
 *  - instructors only when a verified one is bound (CourseInstructors);
 *  - completion ("terminées") and mastery stay two different lines.
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Clock, Layers, PlayCircle, ChevronRight, ArrowLeft, Check, GraduationCap, Info } from './icons';
import CourseInstructors from './CourseInstructors';
import MasteryBadge from './MasteryBadge';
import { summarize } from '../../shared/mastery';
import { subjectCover } from '../utils/subjectCovers';
import { videoThumb, firstThumb } from '../utils/videoThumb';
import { displayCourseName } from '../utils/courseName';
import { practiceHref } from '../utils/learningJourney';

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

/** Authored learning outcomes, if the course document carries any. */
function authoredOutcomes(course): string[] {
  const raw = course?.outcomes ?? course?.learningOutcomes ?? course?.learning_outcomes;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/\n+/) : [];
  return list.map((s) => String(s || '').replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 6);
}

/** "NSI" → "NS I" (the catalogue's spelling of a class). */
function levelLabel(level?: string) {
  return level ? String(level).replace(/^NS\s*(.*)$/i, 'NS $1') : '';
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
  mastery = null,
  staleLesson = false,
  backTo = '/courses',
}: {
  course: any;
  modules?: any[];
  progress?: any;
  isEnrolled?: boolean;
  resumeTarget?: { module: number; lesson: number };
  hasProgress?: boolean;
  onStart: () => void;
  onSelectModule?: (idx: number) => void;
  mastery?: any;
  /** The `?lesson=` this page was opened with doesn't exist in the course. */
  staleLesson?: boolean;
  /** The catalogue URL to return to (with its filters when known). */
  backTo?: string;
}) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isCreole = i18n.language === 'ht';
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);

  const totalModules = modules.length;
  const allLessons = useMemo(() => modules.flatMap((m) => getLessons(m)), [modules]);
  const totalLessons = allLessons.length || course.videoCount || 0;

  const completedLessons: string[] = progress?.completedLessons || [];
  const completedCount = completedLessons.length;
  const percent = totalLessons > 0 ? Math.min(100, Math.round((completedCount / totalLessons) * 100)) : 0;
  const allDone = totalLessons > 0 && allLessons.every((l) => l?.id && completedLessons.includes(l.id));

  // Handed down from CourseDetail, which owns the single read. Mastery is NOT
  // on the progress doc — it lives in users/{uid}/mastery/lessons, shared with
  // the mobile app. It answers a different question from the bar above it.
  const masteryMap = mastery || {};
  const allLessonIds = useMemo(() => allLessons.map((l) => l?.id).filter(Boolean), [allLessons]);
  const courseMastery = useMemo(() => summarize(allLessonIds, masteryMap), [allLessonIds, masteryMap]);

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

  const accent = course.color || 'var(--primary-500)';
  const description = (course.description || '').trim();
  const outcomes = authoredOutcomes(course);
  const level = levelLabel(course.level);

  const resumeModuleTitle = modules[resumeTarget.module]?.title || '';
  const resumeLesson = getLessons(modules[resumeTarget.module])[resumeTarget.lesson];
  const resumeLessonTitle = resumeLesson?.title || '';
  // The frame of the lesson the CTA opens — what "Commencer" actually starts.
  const resumeFrame = videoThumb(resumeLesson?.videoUrl, 'hq');

  // ONE action, named after what it opens.
  const ctaLabel = allDone
    ? L('Revoir le cours', 'Revize kou a')
    : hasProgress
      ? L('Reprendre', 'Kontinye')
      : L('Commencer', 'Kòmanse');
  const ctaSub = resumeLessonTitle
    ? `${hasProgress && resumeModuleTitle ? `${resumeModuleTitle} · ` : ''}${resumeLessonTitle}`
    : '';

  // The course's practice, as a quiet alternative — not a second primary.
  const coursePracticeHref = course.code ? practiceHref({ course: course.code }) : '/quizzes';

  // The subject's cover art, the one the catalogue and the home hero use.
  const cover = subjectCover(course.subject);
  // A course description can run to seven lines; two are enough to decide,
  // and the student who wants the rest asks for it.
  const [descOpen, setDescOpen] = useState(false);
  const longDesc = (description || '').length > 180;

  return (
    <div className="course-overview" style={{ '--course-accent': accent } as React.CSSProperties}>
      <button type="button" className="course-overview__back" onClick={() => navigate(backTo)}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('courses.returnToCatalog', 'Retour au catalogue')}
      </button>

      {staleLesson && (
        <p className="course-overview__notice" role="status">
          <Info size={16} aria-hidden="true" />
          {L(
            'Cette leçon n’est plus disponible dans ce cours. Voici le cours ; reprends où tu en es.',
            'Leson sa a pa disponib ankò nan kou sa a. Men kou a ; kontinye kote ou te rive a.',
          )}
        </p>
      )}

      <header className={`course-overview__hero${cover || resumeFrame ? ' course-overview__hero--art' : ''}${resumeFrame ? ' course-overview__hero--frame' : ''}`}>
        {resumeFrame && (
          // The same action as the button below, as a picture of what it
          // opens. Pointer-only: keyboard and screen readers get one control.
          <button type="button" className="course-overview__preview" onClick={onStart} tabIndex={-1} aria-hidden="true">
            <img src={resumeFrame} alt="" decoding="async" />
            <span className="course-overview__preview-play"><PlayCircle size={30} /></span>
            <span className="course-overview__preview-cap">
              <span>{hasProgress ? ctaLabel : t('courses.firstLesson', 'Première leçon')}</span>
              <strong>{resumeLessonTitle}</strong>
            </span>
          </button>
        )}
        {cover && !resumeFrame && (
          <img
            className="course-overview__cover"
            src={cover}
            alt=""
            aria-hidden="true"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="course-overview__intro">
          <h1 className="course-overview__title">{displayCourseName(course.name || course.title)}</h1>
          {description && (
            <p className={`course-overview__desc${longDesc && !descOpen ? ' is-clamped' : ''}`}>{displayCourseName(description)}</p>
          )}
          {longDesc && (
            <button
              type="button"
              className="course-overview__more"
              aria-expanded={descOpen}
              onClick={() => setDescOpen((o) => !o)}
            >
              {descOpen ? t('common.showLess', 'Voir moins') : t('common.readMore', 'Lire la suite')}
            </button>
          )}

          <ul className="course-overview__meta">
            {level && (
              <li className="course-overview__meta-item">
                <GraduationCap size={16} aria-hidden="true" /> {L(`Classe : ${level}`, `Klas : ${level}`)}
              </li>
            )}
            <li className="course-overview__meta-item">
              <Layers size={16} aria-hidden="true" /> {L(`${totalModules} chapitre${totalModules === 1 ? '' : 's'}`, `${totalModules} chapit`)}
            </li>
            <li className="course-overview__meta-item">
              <BookOpen size={16} aria-hidden="true" /> {L(`${totalLessons} leçon${totalLessons === 1 ? '' : 's'} vidéo`, `${totalLessons} leson videyo`)}
            </li>
            {totalMinutes > 0 && (
              <li className="course-overview__meta-item">
                <Clock size={16} aria-hidden="true" /> {formatDuration(totalMinutes)}
              </li>
            )}
          </ul>

          {outcomes.length > 0 && (
            <section className="course-overview__outcomes" aria-labelledby="course-outcomes-title">
              <h2 id="course-outcomes-title" className="course-overview__outcomes-title">
                {L('Ce que tu vas apprendre', 'Sa w ap aprann')}
              </h2>
              <ul>
                {outcomes.map((o) => (
                  <li key={o}><Check size={15} aria-hidden="true" /> {o}</li>
                ))}
              </ul>
            </section>
          )}

          {isEnrolled && hasProgress && (
            <div className="course-overview__progress">
              <div className="course-overview__progress-head">
                <span>{t('courses.progress', 'Progression')}</span>
                <strong>{percent}%</strong>
              </div>
              <div className="progress-bar" aria-hidden="true">
                <span className="progress-bar__fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="course-overview__progress-meta">
                {L(
                  `${completedCount} leçon${completedCount === 1 ? '' : 's'} terminée${completedCount === 1 ? '' : 's'} sur ${totalLessons}`,
                  `${completedCount} leson fini sou ${totalLessons}`,
                )}
              </span>
              {/* Mastery, not consumption. Hidden until something has
                  actually been earned. */}
              {courseMastery.points > 0 && (
                <div className="course-overview__mastery">
                  <span className="course-overview__mastery-label">
                    {t('courses.masteryLabel', 'Maîtrise')}
                  </span>
                  <span className="course-overview__mastery-track" aria-hidden="true">
                    <span
                      className="course-overview__mastery-fill"
                      style={{ width: `${courseMastery.points}%` }}
                    />
                  </span>
                  <strong className="course-overview__mastery-pct">{courseMastery.points}%</strong>
                  {courseMastery.mastered > 0 && (
                    <span className="course-overview__mastery-count text-muted">
                      {t('courses.masteredCount', {
                        count: courseMastery.mastered,
                        defaultValue: `${courseMastery.mastered} maîtrisées`,
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="course-overview__actions">
            <button type="button" className="button button--primary course-overview__cta" onClick={onStart}>
              <PlayCircle size={18} aria-hidden="true" />
              <span className="course-overview__cta-label">
                {ctaLabel}
                {ctaSub && <span className="course-overview__cta-sub">{ctaSub}</span>}
              </span>
            </button>
            <button type="button" className="course-overview__alt" onClick={() => navigate(coursePracticeHref)}>
              {L('ou s’entraîner sur ce cours', 'oswa pratike sou kou sa a')}
            </button>
          </div>
        </div>
      </header>

      {totalModules > 0 && (
        <section className="course-overview__content" aria-labelledby="course-outline-title">
          <h2 id="course-outline-title" className="course-overview__content-title">
            {t('courses.courseContent', 'Contenu du cours')}
          </h2>
          <ol className="course-overview__modules">
            {modules.map((module, idx) => {
              const lessons = getLessons(module);
              const moduleLessonIds = lessons.map((l) => l.id);
              const doneInModule = moduleLessonIds.filter((id) => completedLessons.includes(id)).length;
              const moduleDone = lessons.length > 0 && doneInModule >= lessons.length;
              const moduleMinutes = realLessonMinutes(lessons);
              // The chapter's own mastery. `summarize` takes a group's level to
              // be its WEAKEST lesson's, so a green chapter means nothing in it
              // is still shaky — which is what makes one worth earning.
              const unit = summarize(moduleLessonIds.filter(Boolean), masteryMap);
              const thumb = firstThumb(lessons);
              return (
                <li key={module.id || idx}>
                  <button
                    type="button"
                    className={`course-overview__module ${moduleDone ? 'is-done' : ''}`}
                    onClick={() => onSelectModule?.(idx)}
                  >
                    {thumb ? (
                      <span className="course-overview__module-thumb">
                        <img src={thumb.src} alt="" loading="lazy" decoding="async" width={320} height={180} />
                        <span className="course-overview__module-num" aria-hidden="true">
                          {moduleDone ? <Check size={13} /> : idx + 1}
                        </span>
                      </span>
                    ) : (
                      <span className="course-overview__module-index" aria-hidden="true">
                        {moduleDone ? <Check size={16} /> : String(idx + 1).padStart(2, '0')}
                      </span>
                    )}
                    <span className="course-overview__module-body">
                      <span className="course-overview__module-title">
                        <span className="qz__sr-only">{L(`Chapitre ${idx + 1} : `, `Chapit ${idx + 1} : `)}</span>
                        {module.title}
                        <MasteryBadge level={unit.level} isCreole={isCreole} />
                      </span>
                      <span className="course-overview__module-meta">
                        {L(`${lessons.length} leçon${lessons.length === 1 ? '' : 's'}`, `${lessons.length} leson`)}
                        {moduleMinutes > 0 ? ` · ${formatDuration(moduleMinutes)}` : ''}
                        {isEnrolled && lessons.length > 0 && doneInModule > 0
                          ? (moduleDone
                              ? ` · ${L('chapitre terminé', 'chapit fini')}`
                              : ` · ${L(`${doneInModule}/${lessons.length} terminées`, `${doneInModule}/${lessons.length} fini`)}`)
                          : ''}
                      </span>
                      {unit.points > 0 && (
                        <span className="course-overview__module-mastery" aria-hidden="true">
                          <span
                            className="course-overview__module-mastery-fill"
                            style={{ width: `${unit.points}%` }}
                          />
                        </span>
                      )}
                    </span>
                    <ChevronRight size={18} className="course-overview__module-chevron" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <CourseInstructors courseId={course.id} />
    </div>
  );
}
