import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useCourses } from '../hooks/useData';
import { CourseCard } from '../components/Course';
import { EmptyState, ErrorState } from '../components/StateViews';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';

export default function Courses() {
  const { data: courses = [], isLoading, isError, isFetching, refetch } = useCourses();
  const [filter, setFilter] = useState('all');
  const [subject, setSubject] = useState('all');
  const [query, setQuery] = useState('');
  const { enrolledCourses } = useStore();
  const { t } = useTranslation();

  const subjectOptions = useMemo(() => {
    const set = new Set();
    for (const c of courses) if (c?.subject) set.add(c.subject);
    return Array.from(set);
  }, [courses]);

  const resetAllFilters = () => {
    setFilter('all');
    setSubject('all');
    setQuery('');
  };

  const filterLabels = {
    all: t('common.all', 'Tout'),
    enrolled: t('courses.myCourses', 'Mes cours'),
    NSI: 'NS I',
    NSII: 'NS II',
    NSIII: 'NS III',
    NSIV: 'NS IV'
  };

  // Compact subject-pill labels so the filter row stays narrow (the full
  // subject names — Mathématiques, Économie, Physique — are still used
  // everywhere else via t('subjects.X')).
  const subjectShortLabels = {
    MATH: 'Maths',
    ECON: 'Econ',
    PHYS: 'Phys',
    CHEM: 'Chimie',
  };

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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCourses = courses.filter(course => {
    if (filter === 'enrolled' && !enrolledCourses.some(c => c.id === course.id)) return false;
    if (
      (filter === 'NSI' || filter === 'NSII' || filter === 'NSIII' || filter === 'NSIV') &&
      course.level !== filter
    ) return false;
    if (subject !== 'all' && course.subject !== subject) return false;
    if (normalizedQuery) {
      const subjectLabel = t(`subjects.${course.subject}`, { defaultValue: course.subject || '' });
      const haystack = [course.title, course.name, subjectLabel, course.level, course.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  return (
    <section className="section">
      <div className="container">
        <div className="page-header page-header--no-eyebrow">
          <div>
            <p className="page-header__count">
              {t('courses.countLabel', '{{count}} cours', { count: filteredCourses.length })}
            </p>
          </div>
          <div className="page-header__actions">
            <div className="courses-search">
              <Search size={16} className="courses-search__icon" aria-hidden="true" />
              <input
                type="search"
                className="courses-search__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('courses.searchPlaceholder')}
                aria-label={t('courses.searchLabel')}
              />
            </div>
            <div className="filter-group">
              {Object.entries(filterLabels).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={["filter-pill", filter === key ? 'filter-pill--active' : ''].join(' ')}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {subjectOptions.length > 1 && (
              <div className="filter-group filter-group--subjects">
                <button
                  type="button"
                  className={["filter-pill", subject === 'all' ? 'filter-pill--active' : ''].join(' ')}
                  onClick={() => setSubject('all')}
                >
                  {t('courses.allSubjects')}
                </button>
                {subjectOptions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={["filter-pill", subject === s ? 'filter-pill--active' : ''].join(' ')}
                    onClick={() => setSubject(s)}
                  >
                    {subjectShortLabels[s] || t(`subjects.${s}`, { defaultValue: s })}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {filteredCourses.length > 0 ? (
          <div className="grid grid--courses">
            {filteredCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={t('courses.noCoursesTitle')}
            message={t('courses.noCoursesSubtitle')}
            action={{ label: t('courses.resetFilters'), onClick: resetAllFilters }}
          />
        )}
      </div>
    </section>
  );
}