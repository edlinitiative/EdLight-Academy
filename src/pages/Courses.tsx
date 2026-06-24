import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight, Target } from 'lucide-react';
import { useCourses } from '../hooks/useData';
import { useAllProgress, calculateCompletionPercentage } from '../hooks/useProgress';
import { CourseCard } from '../components/Course';
import { EmptyState, ErrorState } from '../components/StateViews';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';

const SUBJECT_ORDER = ['MATH', 'PHYS', 'CHEM', 'ECON'];
const LEVEL_ORDER = ['NSI', 'NSII', 'NSIII', 'NSIV'];

function countCourseLessons(course) {
  const units = Array.isArray(course?.modules) ? course.modules : [];
  const lessonsCount = units.reduce((sum, u) => sum + (u?.lessons?.length || 0), 0);
  return lessonsCount || units.length || course?.videoCount || 0;
}

function levelLabel(level) {
  return String(level || '').replace(/^NS(.*)$/i, 'NS $1');
}

/**
 * Courses — a calm, subject-first catalog.
 *
 * Instead of dumping all 16 courses in one grid, the page guides the learner
 * through Matière → Niveau → Cours: first pick a subject tile (with progress),
 * then see only that subject's NS levels. Search cuts across everything, and a
 * "Reprendre" strip surfaces in-progress courses up front.
 */
export default function Courses() {
  const navigate = useNavigate();
  const { data: courses = [], isLoading, isError, isFetching, refetch } = useCourses();
  const [filter, setFilter] = useState('all');
  const [subject, setSubject] = useState('all');
  const { enrolledCourses, progress: storeProgress } = useStore();
  const { t } = useTranslation();

  const { progress: allProgress } = useAllProgress();
  const progressByCourseId = useMemo(() => {
    const m = new Map();
    for (const p of allProgress || []) if (p?.courseId) m.set(p.courseId, p);
    return m;
  }, [allProgress]);

  // Best-effort completion %: prefer cross-device Firestore progress, fall back
  // to the local store so the figure still works while signed out / offline.
  const coursePercent = useCallback((course) => {
    const total = countCourseLessons(course);
    const fp = progressByCourseId.get(course.id);
    if (fp) return calculateCompletionPercentage(fp, total || 0);
    const sp = storeProgress?.[course.id];
    if (sp && sp.total) return Math.min(100, Math.round(((sp.completed || 0) / sp.total) * 100));
    return 0;
  }, [progressByCourseId, storeProgress]);

  const isEnrolled = useCallback(
    (course) => enrolledCourses.some((c) => c.id === course.id),
    [enrolledCourses],
  );

  // Group the catalog by subject — the basis for the Matière → Niveau → Cours flow.
  const subjectGroups = useMemo(() => {
    const map = new Map();
    for (const c of courses) {
      if (!c?.subject) continue;
      if (!map.has(c.subject)) map.set(c.subject, []);
      map.get(c.subject).push(c);
    }
    const list = Array.from(map.entries()).map(([code, items]) => {
      const sorted = [...items].sort(
        (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
      );
      const enrolledItems = sorted.filter(isEnrolled);
      const pct = enrolledItems.length
        ? Math.round(enrolledItems.reduce((s, c) => s + coursePercent(c), 0) / enrolledItems.length)
        : 0;
      const resume = sorted.find((c) => { const p = coursePercent(c); return p > 0 && p < 100; }) || null;
      return {
        code,
        items: sorted,
        accent: sorted[0]?.color || 'var(--primary-500)',
        enrolledCount: enrolledItems.length,
        pct,
        resume,
      };
    });
    list.sort((a, b) => {
      const ia = SUBJECT_ORDER.indexOf(a.code); const ib = SUBJECT_ORDER.indexOf(b.code);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return list;
  }, [courses, isEnrolled, coursePercent]);

  const goToSubjects = () => { setSubject('all'); setFilter('all'); };

  if (isLoading) {
    return (
      <section className="section">
        <div className="container">
          <div className="page-header" style={{ marginBottom: '2rem' }}>
            <div>
              <div className="skeleton" style={{ height: 22, width: 120, borderRadius: 999, marginBottom: '0.75rem' }} />
              <div className="skeleton" style={{ height: 32, width: '60%', marginBottom: '0.5rem' }} />
              <div className="skeleton" style={{ height: 16, width: '40%' }} />
            </div>
          </div>
          <div className="grid grid--courses">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton skeleton-card__badge" />
                <div className="skeleton skeleton-card__title" />
                <div className="skeleton skeleton-card__line" />
                <div className="skeleton skeleton-card__line--short" />
                <div className="skeleton skeleton-card__bar" />
                <div className="skeleton skeleton-card__btn" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError && courses.length === 0) {
    return (
      <section className="section">
        <div className="container">
          <ErrorState onRetry={() => refetch()} retrying={isFetching} />
        </div>
      </section>
    );
  }

  // Selected subject (level view). When none is chosen we show the picker.
  const activeGroup = subject !== 'all' ? subjectGroups.find((g) => g.code === subject) : null;
  const subjectLabelFull = activeGroup
    ? t(`subjects.${activeGroup.code}`, { defaultValue: activeGroup.code })
    : '';

  const levelsForSubject = activeGroup
    ? [...new Set(activeGroup.items.map((c) => c.level))].sort(
        (a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b),
      )
    : [];

  const levelViewCourses = activeGroup
    ? activeGroup.items.filter((c) => {
        if (filter === 'enrolled') return isEnrolled(c);
        if (filter.startsWith('NS')) return c.level === filter;
        return true;
      })
    : [];

  // In-progress courses for the "Reprendre" strip on the subject picker.
  const resumeCourses = enrolledCourses
    .map((c) => courses.find((x) => x.id === c.id) || c)
    .map((c) => ({ course: c, pct: coursePercent(c) }))
    .filter(({ pct }) => pct > 0 && pct < 100)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  return (
    <section className="section">
      <div className="container">
        {/* Header — adapts to the active view (picker / level / search) */}
        <div className="page-header page-header--no-eyebrow courses-header">
          <div className="courses-header__lead">
            {activeGroup ? (
              <>
                <button type="button" className="courses-breadcrumb" onClick={goToSubjects}>
                  <ChevronLeft size={16} /> {t('courses.backToSubjects')}
                </button>
                <h1 className="courses-header__title" style={{ color: activeGroup.accent }}>
                  {subjectLabelFull}
                </h1>
                <button
                  type="button"
                  className="button button--ghost button--pill button--sm courses-header__practice"
                  onClick={() => navigate(`/quizzes?course=${activeGroup.code}`)}
                >
                  <Target size={15} /> {t('courses.practiceCta', "S'entraîner")}
                </button>
              </>
            ) : (
              <>
                <h1 className="courses-header__title">{t('courses.chooseSubject')}</h1>
                <p className="text-muted courses-header__sub">{t('courses.chooseSubjectSubtitle')}</p>
              </>
            )}
          </div>
        </div>

        {/* Level filter — compact dropdown (level view only) */}
        {activeGroup && (
          <div className="courses-levels-select">
            <select
              id="level-filter"
              className="level-select"
              aria-label={t('courses.levelLabel', 'Niveau')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{t('courses.allLevels', 'Tous les niveaux')}</option>
              {activeGroup.enrolledCount > 0 && (
                <option value="enrolled">{t('courses.myCourses', 'Mes cours')}</option>
              )}
              {levelsForSubject.map((lvl) => (
                <option key={lvl} value={lvl}>{levelLabel(lvl)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Content */}
        {activeGroup ? (
          levelViewCourses.length > 0 ? (
            <div className="grid grid--courses">
              {levelViewCourses.map((course) => <CourseCard key={course.id} course={course} />)}
            </div>
          ) : (
            <EmptyState
              title={t('courses.noCoursesTitle')}
              message={t('courses.noCoursesSubtitle')}
              action={{ label: t('courses.resetFilters'), onClick: () => setFilter('all') }}
            />
          )
        ) : (
          <>
            {resumeCourses.length > 0 && (
              <div className="courses-resume" data-reveal>
                <h2 className="courses-resume__title">{t('courses.resumeTitle')}</h2>
                <div className="courses-resume__list">
                  {resumeCourses.map(({ course, pct }) => {
                    const sLabel = t(`subjects.${course.subject}`, { defaultValue: course.subject });
                    return (
                      <button
                        key={course.id}
                        type="button"
                        className="resume-course"
                        style={{ '--course-accent': course.color || 'var(--primary-500)' } as React.CSSProperties}
                        onClick={() => navigate(`/courses/${course.id}`)}
                      >
                        <span className="resume-course__info">
                          <span className="resume-course__name">{course.name || course.title}</span>
                          <span className="resume-course__meta">{sLabel} · {levelLabel(course.level)}</span>
                          <span className="progress-bar resume-course__bar">
                            <span className="progress-bar__fill" style={{ width: `${pct}%` }} />
                          </span>
                        </span>
                        <span className="resume-course__cta">{pct}% <ArrowRight size={16} /></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="subjects-grid">
              {subjectGroups.map((g) => {
                const label = t(`subjects.${g.code}`, { defaultValue: g.code });
                return (
                  <button
                    key={g.code}
                    type="button"
                    className="subject-tile"
                    onClick={() => { setSubject(g.code); setFilter('all'); }}
                    aria-label={label}
                  >
                    <span className="subject-tile__glyph" aria-hidden="true">{label.charAt(0)}</span>
                    <span className="subject-tile__body">
                      <span className="subject-tile__name">{label}</span>
                      <span className="subject-tile__stat">
                        {t('courses.levelCount', { count: g.items.length })}
                        {g.enrolledCount > 0 && <> · {g.enrolledCount} {t('courses.enrolledShort')}</>}
                      </span>
                      {g.enrolledCount > 0 && (
                        <span className="subject-tile__progress">
                          <span className="progress-bar">
                            <span className="progress-bar__fill" style={{ width: `${g.pct}%` }} />
                          </span>
                          <span className="subject-tile__pct">{g.pct}%</span>
                        </span>
                      )}
                    </span>
                    {g.enrolledCount > 0
                      ? <ChevronRight size={18} className="subject-tile__chevron" aria-hidden="true" />
                      : <span className="subject-tile__startcta">{t('courses.start', 'Commencer')} <ChevronRight size={15} /></span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}