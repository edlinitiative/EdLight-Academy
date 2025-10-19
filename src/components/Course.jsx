import React from 'react';
import useStore from '../contexts/store';

export function CourseCard({ course, onPreview }) {
  const { enrolledCourses, progress, isAuthenticated } = useStore();
  const isEnrolled = enrolledCourses.some(c => c.id === course.id);
  const courseProgress = progress[course.id] || { completed: 0, total: course.modules };
  const progressPercent = Math.round((courseProgress.completed / courseProgress.total) * 100);

  const handleStart = () => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
      return;
    }
    // TODO: Navigate to course content
  };

  return (
    <div className="card course-card-hover" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span className="badge">{course.badge}</span>
        {isEnrolled && <span className="enrollment-badge">Enrolled</span>}
        <span className="text-small text-gray">{course.level}</span>
      </div>
      
      <h3>{course.title}</h3>
      <p className="text-gray" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        {course.description}
      </p>
      
      {isEnrolled && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span className="text-small">{progressPercent}% Complete</span>
            <span className="text-small text-gray">
              {courseProgress.completed}/{courseProgress.total} Modules
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: progressPercent + '%' }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn" onClick={handleStart}>
          {isEnrolled ? 'Continue' : 'Start'}
        </button>
        <button className="btn-outline" onClick={() => onPreview(course)}>
          Preview
        </button>
      </div>
    </div>
  );
}

export function CourseModal({ course, onClose, onEnroll }) {
  const { isAuthenticated, enrolledCourses } = useStore();
  const isEnrolled = enrolledCourses.some(c => c.id === course?.id);

  const handleEnroll = () => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
      return;
    }
    onEnroll(course);
  };

  if (!course) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="badge" style={{ marginBottom: '0.5rem' }}>{course.badge}</span>
            <h2>{course.title}</h2>
            <p className="text-gray">Level: {course.level}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ marginBottom: '1rem', lineHeight: '1.8' }}>{course.fullDescription}</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1.5rem' }}>
            <div>
              <h4>Duration</h4>
              <p className="text-gray">{course.duration}</p>
            </div>
            <div>
              <h4>Modules</h4>
              <p className="text-gray">{course.modules} modules</p>
            </div>
            <div>
              <h4>Students</h4>
              <p className="text-gray">{course.students.toLocaleString()}</p>
            </div>
            <div>
              <h4>Rating</h4>
              <p className="text-gray">⭐ {course.rating}/5.0</p>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <h4>Instructor</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
              <div className="user-avatar" style={{ fontSize: '1rem' }}>
                {course.instructor.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <p>{course.instructor}</p>
                <p className="text-small text-gray">Course Instructor</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isEnrolled ? (
            <>
              <button className="btn" onClick={onClose}>Continue Learning</button>
              <button className="btn-outline" onClick={onClose}>View Resources</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={handleEnroll}>Enroll Now</button>
              <button className="btn-outline" onClick={onClose}>Maybe Later</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}