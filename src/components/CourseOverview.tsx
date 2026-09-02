/**
 * CourseOverview — the landing screen for a course
 * ────────────────────────────────────────────────
 * Shown first when a learner opens /courses/:id, BEFORE dropping them into a
 * video. Gives context the old "straight into YouTube" flow lacked: objectives,
 * the module list, estimated time, and current progress — then a single clear
 * "Commencer / Reprendre" action that enters the right lesson.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Clock, Layers, PlayCircle, Target, ChevronRight, ArrowLeft, Check } from 'lucide-react';
import CourseInstructors from './CourseInstructors';
import MasteryBadge from './MasteryBadge';
import { summarize } from '../../shared/mastery';

function getLessons(module) {
  return Array.isArray(module?.lessons) ? module.lessons : [];
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
}) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isFrench = i18n.language === 'fr';
  const isCreole = i18n.language === 'ht';


  const totalModules = modules.length;
  const totalLessons = modules.reduce((sum, m) => sum + getLessons(m).length, 0) || course.videoCount || 0;

  const completedCount = progress?.completedLessons?.length || 0;
  const percent = totalLessons > 0 ? Math.min(100, Math.round((completedCount / totalLessons) * 100)) : 0;

  // Handed down from CourseDetail, which owns the single read. Mastery is NOT
  // on the progress doc — it lives in users/{uid}/mastery/lessons, shared with
  // the mobile app. It answers a different question from the bar above it:
  // "Progression" is how much of the course you've been through, mastery is
  // how well you actually know it.
  const masteryMap = mastery || {};
  const allLessonIds = useMemo(
    () => modules.flatMap((m) => getLessons(m).map((l) => l?.id).filter(Boolean)),
    [modules],
  );
  const courseMastery = useMemo(() => summarize(allLessonIds, masteryMap), [allLessonIds, masteryMap]);

  // Estimated time: prefer the course total, else sum module/lesson durations.
  const totalMinutes = parseInt(course.duration, 10)
    || modules.reduce((sum, m) => {
      const md = parseInt(m.duration, 10) || 0;
      if (md) return sum + md;
      return sum + getLessons(m).reduce((s, l) => s + (parseInt(l.duration, 10) || 0), 0);
    }, 0);

  const formatDuration = (minutes) => {
    const total = parseInt(minutes, 10) || 0;
    if (!total) return t('courses.selfPaced', 'À votre rythme');
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    const hourLabel = isFrench ? 'h' : (isCreole ? 'èdtan' : 'h');
    const minLabel = isFrench ? 'min' : (isCreole ? 'minit' : 'min');
    if (hours && mins) return `${hours} ${hourLabel} ${mins} ${minLabel}`;
    if (hours) return `${hours} ${hourLabel}`;
    return `${mins} ${minLabel}`;
  };

  const accent = course.color || 'var(--primary-500)';
  const description = (course.description || '').trim();

  const ctaLabel = hasProgress
    ? t('courses.continue', 'Continuer')
    : t('courses.start', 'Commencer');

  const resumeModuleTitle = modules[resumeTarget.module]?.title || '';
  const resumeLessonTitle = getLessons(modules[resumeTarget.module])[resumeTarget.lesson]?.title || '';

  // Practice deep-link: subject + level lands the Quiz page on the right unit.
  const practiceHref = `/quizzes?course=${course.subject}${course.level ? `-${course.level}` : ''}`;

  return (
    <div className="course-overview" style={{ '--course-accent': accent } as React.CSSProperties}>
      <button type="button" className="course-overview__back" onClick={() => navigate('/courses')}>
        <ArrowLeft size={16} /> {t('courses.returnToCatalog', 'Retour au catalogue')}
      </button>

      <header className="course-overview__hero">
        {/* No badge pills: the title already carries subject + level
            ("Mathématiques NS1") — repeating them as chips was noise. */}
        <h1 className="course-overview__title">{course.name || course.title}</h1>
        {description && <p className="course-overview__desc">{description}</p>}

        <div className="course-overview__meta">
          <span className="course-overview__meta-item"><Layers size={16} /> {t('courses.modulesCount', { count: totalModules, defaultValue: `${totalModules} modules` })}</span>
          <span className="course-overview__meta-item"><BookOpen size={16} /> {t('courses.lessonsCount', { count: totalLessons, defaultValue: `${totalLessons} leçons` })}</span>
          <span className="course-overview__meta-item"><Clock size={16} /> {formatDuration(totalMinutes)}</span>
        </div>

        {isEnrolled && hasProgress && (
          <div className="course-overview__progress">
            <div className="course-overview__progress-head">
              <span>{t('courses.progress', 'Progression')}</span>
              <strong>{percent}%</strong>
            </div>
            <div className="progress-bar">
              <span className="progress-bar__fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="course-overview__progress-meta text-muted">
              {completedCount}/{totalLessons} {t('courses.completedLower', 'terminés')}
            </span>
            {/* Mastery, not consumption. Hidden until something has actually
                been earned — a 0% mastery line under a progress bar you just
                moved reads as being told off. */}
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
            <PlayCircle size={18} /> {ctaLabel}
            {hasProgress && resumeLessonTitle && (
              <span className="course-overview__cta-sub">{resumeModuleTitle ? `${resumeModuleTitle} · ` : ''}{resumeLessonTitle}</span>
            )}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => navigate(practiceHref)}
          >
            <Target size={16} /> {t('courses.practiceCta', "S'entraîner")}
          </button>
        </div>
      </header>

      <CourseInstructors courseId={course.id} />

      {totalModules > 0 && (
        <section className="course-overview__content">
          <h2 className="course-overview__content-title">
            <BookOpen size={18} /> {t('courses.courseContent', 'Contenu du cours')}
          </h2>
          <ol className="course-overview__modules">
            {modules.map((module, idx) => {
              const lessons = getLessons(module);
              const moduleLessonIds = lessons.map((l) => l.id);
              const doneInModule = moduleLessonIds.filter((id) => progress?.completedLessons?.includes(id)).length;
              const moduleDone = lessons.length > 0 && doneInModule >= lessons.length;
              // The chapter's own mastery. `summarize` takes a group's level to
              // be its WEAKEST lesson's, so a green chapter means nothing in it
              // is still shaky — which is what makes one worth earning.
              const unit = summarize(moduleLessonIds.filter(Boolean), masteryMap);
              return (
                <li key={module.id || idx}>
                  <button
                    type="button"
                    className={`course-overview__module ${moduleDone ? 'is-done' : ''}`}
                    onClick={() => onSelectModule?.(idx)}
                  >
                    <span className="course-overview__module-index">
                      {moduleDone ? <Check size={16} /> : String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="course-overview__module-body">
                      <span className="course-overview__module-title">
                        {module.title}
                        {/* Renders nothing at `none`, so an untouched course
                            shows a clean list rather than a column of markers. */}
                        <MasteryBadge level={unit.level} isCreole={isCreole} />
                      </span>
                      <span className="course-overview__module-meta">
                        {t('courses.lessonsCount', { count: lessons.length, defaultValue: `${lessons.length} leçons` })}
                        {module.duration ? ` · ${formatDuration(module.duration)}` : ''}
                        {isEnrolled && lessons.length > 0 ? ` · ${doneInModule}/${lessons.length}` : ''}
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
    </div>
  );
}
