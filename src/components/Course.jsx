import React from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';

export function CourseCard({ course, onPreview }) {
  const { enrolledCourses, progress, isAuthenticated } = useStore();
  const isEnrolled = enrolledCourses.some(c => c.id === course.id);
  const navigate = useNavigate();

  const subjectNames = {
    CHEM: 'Chemistry',
    PHYS: 'Physics',
    MATH: 'Mathematics',
    ECON: 'Economics'
  };

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
    if (!totalMinutes) return 'Self-paced';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours && mins) return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min`;
    if (hours) return `${hours} hr${hours > 1 ? 's' : ''}`;
    return `${mins} min`;
  };

  const levelLabel = course.level ? course.level.replace(/^NS([IVX]+)$/i, 'NS $1') : 'NS I';
  const subjectLabel = subjectNames[course.subject] || course.subject;
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
    ? `${progressPercent}% complete`
    : `${lessonsCount || course.videoCount} lessons • ${durationLabel}`;

  const progressCaption = isEnrolled
    ? `${completed}/${total} lessons completed`
    : 'Guided path with quizzes and mastery checks';

  return (
    <article className="course-card">
      <div className="course-card__head">
        <span className="course-card__badge">{subjectLabel} · {levelLabel}</span>
        {isEnrolled && <span className="chip chip--success">Enrolled</span>}
      </div>

      <h3 className="course-card__title">{course.name}</h3>
      <p className="course-card__description">{course.description}</p>

      <div className="course-card__meta">
        <span className="course-meta__item"><strong>{units.length}</strong> units</span>
        <span className="course-meta__item"><strong>{lessonsCount || course.videoCount}</strong> lessons</span>
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
          <button className="button button--primary button--pill button--sm" onClick={handleStart}>
            {isEnrolled ? 'Continue' : 'Start Course'}
          </button>
          <button className="course-card__cta" onClick={() => onPreview(course)}>
            Course Details →
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

  if (!course) return null;

  const units = course.modules || [];
  const lessonsCount = units.reduce((sum, unit) => sum + (unit.lessons?.length || 0), 0);

  const subjectNames = {
    CHEM: 'Chemistry',
    PHYS: 'Physics',
    MATH: 'Mathematics',
    ECON: 'Economics'
  };

  const levelLabel = course.level ? course.level.replace(/^NS([IVX]+)$/i, 'NS $1') : 'NS I';
  const subjectLabel = subjectNames[course.subject] || course.subject;

  const formatDuration = (minutes) => {
    const totalMinutes = parseInt(minutes, 10) || 0;
    if (!totalMinutes) return 'Self-paced';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours && mins) return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min`;
    if (hours) return `${hours} hr${hours > 1 ? 's' : ''}`;
    return `${mins} min`;
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
          <div>
            <span className="chip chip--ghost">{subjectLabel} · {levelLabel}</span>
            <h2 className="course-modal__title">{course.name}</h2>
          </div>
          <button className="course-modal__close" onClick={onClose} aria-label="Close">
            X
          </button>
        </header>

        <section className="course-modal__meta">
          <div className="course-modal__meta-item">
            <span>Duration</span>
            <strong>{formatDuration(course.duration)}</strong>
          </div>
          <div className="course-modal__meta-item">
            <span>Units</span>
            <strong>{units.length}</strong>
          </div>
          <div className="course-modal__meta-item">
            <span>Lessons</span>
            <strong>{lessonsCount || course.videoCount}</strong>
          </div>
          <div className="course-modal__meta-item">
            <span>Instructor</span>
            <strong>{course.instructor}</strong>
          </div>
        </section>

        <p className="course-modal__descriptor">{course.description}</p>

        <section className="course-modal__syllabus">
          {units.map((unit) => (
            <div key={unit.id} className="syllabus-item">
              <div>
                <strong>{unit.title}</strong>
                <span>{unit.lessons?.length || 0} lessons</span>
              </div>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>Aligned to NS standards</span>
            </div>
          ))}
        </section>

        <footer className="course-modal__footer">
          {isEnrolled ? (
            <>
              <button
                className="button button--light button--pill"
                onClick={() => {
                  onClose();
                  navigate(`/courses/${course.id}`);
                }}
              >
                Continue Learning
              </button>
              <button
                className="button button--ghost button--pill"
                onClick={() => {
                  onClose();
                  navigate('/dashboard');
                }}
              >
                View Dashboard
              </button>
            </>
          ) : (
            <>
              <button className="button button--primary button--pill" onClick={handleEnroll}>
                Enroll Now
              </button>
              <button className="button button--ghost button--pill" onClick={onClose}>
                Maybe Later
              </button>
            </>
          )}
        </footer>
      </article>
    </div>
  );
}