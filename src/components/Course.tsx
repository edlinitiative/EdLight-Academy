import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { useTranslation } from 'react-i18next';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';

export function CourseCard({ course }) {
  const { enrolledCourses, progress } = useStore();
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

  // Course names are frequently just "Subject Level" (e.g. "Chimie NS I"), which
  // the coloured subject badge + level badge already convey. Pull out any
  // DISTINCT topic so the title never repeats the badges; '' when the name is
  // only subject + level.
  const distinctTitle = React.useMemo(() => {
    const esc = (v) => String(v || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let s = String(course.name || '').trim();
    s = s.replace(/\bN\.?\s?S\.?\s?(IV|III|II|I)\b/gi, ' ');        // "NS I", "N.S. II"
    s = s.replace(/\bniveau\s+secondaire\s+[ivx0-9]+/gi, ' ');         // "Niveau Secondaire ..."
    if (subjectLabel) s = s.replace(new RegExp(`\\b${esc(subjectLabel)}\\b`, 'ig'), ' ');
    if (course.subject) s = s.replace(new RegExp(`\\b${esc(course.subject)}\\b`, 'ig'), ' ');
    return s.replace(/[·\-–—|,]+/g, ' ').replace(/\s+/g, ' ').trim();
  }, [course.name, course.subject, subjectLabel]);

  const description = (course.description || '').trim();
  // Lead with the distinct topic when there is one; otherwise let the
  // description carry the card and only fall back to the subject if both are
  // empty (so the card is never blank).
  const heading = distinctTitle || (description ? '' : subjectLabel);

  const goToCourse = () => {
    // Open the course detail page directly. Signed-out visitors may preview a
    // few videos for free before being asked to create an account. The detail
    // page already shows the full syllabus, so a separate preview modal would
    // just duplicate it — tapping the card goes straight there.
    navigate(`/courses/${course.id}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToCourse();
    }
  };

  return (
    <article
      className="course-card"
      style={{ '--course-accent': course.color || 'var(--primary-500)' }}
      role="button"
      tabIndex={0}
      onClick={goToCourse}
      onKeyDown={handleKeyDown}
      aria-label={`${subjectLabel} · ${levelLabel} — ${course.name}`}
    >
      <div className="course-card__head">
        <div className="course-card__tags">
          <span
            className="course-card__badge"
            style={{ background: (course.color || '#0A66C2') + '1f', color: course.color || 'var(--primary-600)' }}
          >
            {subjectLabel}
          </span>
          <span className="course-card__badge course-card__badge--level">{levelLabel}</span>
        </div>
        {isEnrolled && <span className="chip chip--success">{t('courses.enrolled')}</span>}
      </div>

      {heading && <h3 className="course-card__title">{heading}</h3>}
      {description && <p className="course-card__description">{description}</p>}

      <div className="course-card__meta">
        <span className="course-meta__item"><strong>{units.length}</strong> {t('courses.modules')}</span>
        <span className="course-meta__item"><strong>{lessonsCount || course.videoCount}</strong> {t('courses.lessons')}</span>
        <span className="course-meta__item">{durationLabel}</span>
      </div>

      <div className="course-card__footer">
        {isEnrolled && (
          <div className="course-progress">
            <span>{t('courses.progressPercent', { percent: progressPercent })}</span>
            <div className="progress-bar">
              <span className="progress-bar__fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              {t('courses.lessonsCompletedProgress', { completed, total })}
            </span>
          </div>
        )}

        <span className="course-card__cta">
          {isEnrolled ? t('courses.continue') : t('courses.startCourse')} →
        </span>
      </div>
    </article>
  );
}

export function CourseModal({ course, onClose, onEnroll }) {
  const { enrolledCourses } = useStore();
  const navigate = useNavigate();
  const isEnrolled = enrolledCourses.some(c => c.id === course?.id);
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const isCreole = language === 'ht';
  const isFrench = language === 'fr';

  const modalRef = useRef(null);
  const bodyRef = useRef(null);

  // Lock background scroll, trap focus, and allow drag-down-to-dismiss (the
  // body is the scroll area, so the pull only starts when it's at the top).
  useBodyScrollLock();
  useFocusTrap(modalRef);
  const swipe = useSwipeToDismiss(onClose, { scrollRef: bodyRef });

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
    onEnroll(course);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <article
        className="course-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={course.name}
        style={swipe.style}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
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

        <div className="course-modal__body" ref={bodyRef}>
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