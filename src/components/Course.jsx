import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';

export function CourseCard({ course, onPreview }) {
  const { enrolledCourses, progress, isAuthenticated } = useStore();
  const isEnrolled = enrolledCourses.some(c => c.id === course.id);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const isCreole = language === 'ht';
  const isFrench = language === 'fr';

  const units = course.modules || [];
  const lessonsCount = units.reduce((sum, unit) => sum + (unit.lessons?.length || 0), 0);
  const fallbackTotal = lessonsCount || units.length || course.videoCount || 1;
  const courseProgress = progress[course.id] || { completed: 0, total: fallbackTotal };
  const completed = courseProgress.completed || 0;
  const total = courseProgress.total || fallbackTotal || 1;
  const rawPercent = total ? Math.round((completed / total) * 100) : 0;
  const progressPercent = Number.isFinite(rawPercent) && rawPercent >= 0 ? Math.min(100, rawPercent) : 0;

  const formatDuration = (minutes) => {
    const totalMinutes = parseInt(minutes, 10) || 0;
    if (!totalMinutes) return t('courses.selfPaced');
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    const hourLabel = isFrench ? 'h' : (isCreole ? 'èdtan' : `hr${hours > 1 ? 's' : ''}`);
    const minuteLabel = isFrench ? 'min' : (isCreole ? 'minit' : 'min');

    if (hours && mins) return `${hours} ${hourLabel} ${mins} ${minuteLabel}`;
    if (hours) return `${hours} ${hourLabel}`;
    return `${mins} ${minuteLabel}`;
  };

  const levelLabel = course.level ? course.level.replace(/^NS([IVX]+)$/i, 'NS $1') : 'NS I';
  const subjectLabel = t(`subjects.${course.subject}`, { defaultValue: course.subject });
  const durationLabel = formatDuration(course.duration);

  const handleStart = () => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
      return;
    }
    // Navigate to the course detail page
    navigate(`/courses/${course.id}`);
  };

  const progressHeadline = isEnrolled
    ? t('courses.progressPercent', { percent: progressPercent })
    : `${t('courses.lessonsCount', { count: lessonsCount || course.videoCount || 0 })} • ${durationLabel}`;

  const progressCaption = isEnrolled
    ? t('courses.lessonsCompletedProgress', { completed, total })
    : t('courses.guidedPathCaption');

  return (
    <article className="course-card">
      <div className="course-card__head">
        <span className="course-card__badge">{subjectLabel} · {levelLabel}</span>
        {isEnrolled && <span className="chip chip--success">{t('courses.enrolled')}</span>}
      </div>

      <h3 className="course-card__title">{course.name}</h3>
      <p className="course-card__description">{course.description}</p>

      <div className="course-card__meta">
        <span className="course-meta__item"><strong>{units.length}</strong> {t('courses.modulesCount', { count: units.length })}</span>
        <span className="course-meta__item"><strong>{lessonsCount || course.videoCount}</strong> {t('courses.lessonsCount', { count: lessonsCount || course.videoCount || 0 })}</span>
        <span className="course-meta__item"><strong>{durationLabel}</strong></span>
      </div>

      <div className="course-card__footer">
        <div className="course-progress">
          <span>{progressHeadline}</span>
          <div className="progress-bar">
            <span className="progress-bar__fill" style={{ width: `${isEnrolled ? progressPercent : 12}%` }} />
          </div>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>{progressCaption}</span>
        </div>

        <div className="course-card__actions">
          <button className="button button--primary button--pill" onClick={handleStart}>
            {isEnrolled ? t('courses.continue') : t('courses.startCourse')}
          </button>
          <button className="course-card__cta" onClick={() => onPreview(course)}>
            {t('courses.details')} →
          </button>
        </div>
      </div>
    </article>
  );
}

export function CourseModal({ course, onClose, onEnroll }) {
  const { isAuthenticated, enrolledCourses } = useStore();
  const navigate = useNavigate();
  const isEnrolled = enrolledCourses.some(c => c.id === course?.id);
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const isCreole = language === 'ht';
  const isFrench = language === 'fr';

  if (!course) return null;

  const units = course.modules || [];
  const lessonsCount = units.reduce((sum, unit) => sum + (unit.lessons?.length || 0), 0);

  const levelLabel = course.level ? course.level.replace(/^NS([IVX]+)$/i, 'NS $1') : 'NS I';
  const subjectLabel = t(`subjects.${course.subject}`, { defaultValue: course.subject });

  const formatDuration = (minutes) => {
    const totalMinutes = parseInt(minutes, 10) || 0;
    if (!totalMinutes) return t('courses.selfPaced');
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    const hourLabel = isFrench ? 'h' : (isCreole ? 'èdtan' : `hr${hours > 1 ? 's' : ''}`);
    const minuteLabel = isFrench ? 'min' : (isCreole ? 'minit' : 'min');

    if (hours && mins) return `${hours} ${hourLabel} ${mins} ${minuteLabel}`;
    if (hours) return `${hours} ${hourLabel}`;
    return `${mins} ${minuteLabel}`;
  };

  const handleEnroll = () => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
      return;
    }
    onEnroll(course);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <article className="course-modal" onClick={(e) => e.stopPropagation()}>
        <header className="course-modal__header">
          <div className="course-modal__header-content">
            <div className="course-modal__badges">
              <span className="chip chip--primary" style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}>
                {subjectLabel}
              </span>
              <span className="chip chip--ghost" style={{ fontSize: '0.8125rem', padding: '0.35rem 0.75rem' }}>
                {levelLabel}
              </span>
            </div>
            <h2 className="course-modal__title">{course.name}</h2>
            {course.instructor && (
              <p className="course-modal__instructor">
                <span style={{ opacity: 0.7 }}>{t('courses.taughtBy')}</span> <strong>{course.instructor}</strong>
              </p>
            )}
          </div>
          <button className="course-modal__close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </header>

        <div className="course-modal__body">
          <section className="course-modal__meta">
            <div className="course-modal__meta-item">
              <svg className="course-modal__meta-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <div>
                <span className="course-modal__meta-label">{t('courses.duration')}</span>
                <strong className="course-modal__meta-value">{formatDuration(course.duration)}</strong>
              </div>
            </div>
            <div className="course-modal__meta-item">
              <svg className="course-modal__meta-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <div>
                <span className="course-modal__meta-label">{t('courses.modules')}</span>
                <strong className="course-modal__meta-value">{units.length}</strong>
              </div>
            </div>
            <div className="course-modal__meta-item">
              <svg className="course-modal__meta-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <span className="course-modal__meta-label">{t('courses.lessons')}</span>
                <strong className="course-modal__meta-value">{lessonsCount || course.videoCount || 0}</strong>
              </div>
            </div>
          </section>

          {course.description && (
            <div className="course-modal__description">
              <h3 className="course-modal__section-title">{t('courses.aboutThisCourse')}</h3>
              <p className="course-modal__descriptor">{course.description}</p>
            </div>
          )}

          {units.length > 0 && (
            <div className="course-modal__syllabus-wrapper">
              <h3 className="course-modal__section-title">{t('courses.syllabus')}</h3>
              <div className="course-modal__syllabus">
                {units.map((unit, idx) => (
                  <div key={unit.id} className="syllabus-item">
                    <div className="syllabus-item__left">
                      <span className="syllabus-item__index">{String(idx + 1).padStart(2, '0')}</span>
                      <div className="syllabus-item__meta">
                        <strong className="syllabus-item__title">{unit.title}</strong>
                        <span className="syllabus-item__subtitle">
                          {t('courses.lessonsCount', { count: unit.lessons?.length || 0 })}
                          {unit.duration && ` · ${formatDuration(unit.duration)}`}
                        </span>
                      </div>
                    </div>
                    <div className="syllabus-item__right">
                      <span className="syllabus-item__chevron" aria-hidden>›</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="course-modal__footer">
          {isEnrolled ? (
            <>
              <button
                className="button button--primary button--pill"
                onClick={() => {
                  onClose();
                  navigate(`/courses/${course.id}`);
                }}
                style={{ flex: 1, minWidth: '150px' }}
              >
                {t('courses.continueLearning')}
              </button>
              <button
                className="button button--secondary button--pill"
                onClick={() => {
                  onClose();
                  navigate('/dashboard');
                }}
                style={{ flex: 1, minWidth: '150px' }}
              >
                {t('courses.viewDashboard')}
              </button>
            </>
          ) : (
            <>
              <button 
                className="button button--primary button--pill" 
                onClick={handleEnroll}
                style={{ flex: 1, minWidth: '150px' }}
              >
                {t('courses.enroll')}
              </button>
              <button 
                className="button button--ghost button--pill" 
                onClick={onClose}
                style={{ flex: 1, minWidth: '150px' }}
              >
                {t('common.cancel')}
              </button>
            </>
          )}
        </footer>
      </article>
    </div>
  );
}