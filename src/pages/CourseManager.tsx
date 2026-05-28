import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, removeLessonFromCourse, updateCourse } from '../services/firebase';

export default function CourseManager() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [expandedCourse, setExpandedCourse] = useState(null);

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      setLoading(true);
      const coursesRef = collection(db, 'courses');
      const snapshot = await getDocs(coursesRef);
      const data = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setCourses(data);
    } catch (error) {
      console.error('Error loading courses:', error);
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveLesson(courseId, unitId, lessonId, lessonTitle) {
    if (!confirm(`Are you sure you want to remove "${lessonTitle}" from this course?`)) {
      return;
    }

    try {
      setMessage({ type: 'info', text: 'Removing lesson...' });
      await removeLessonFromCourse(courseId, unitId, lessonId);
      setMessage({ type: 'success', text: `✅ Successfully removed "${lessonTitle}"` });
      
      // Reload courses
      await loadCourses();
      
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error removing lesson:', error);
      setMessage({ type: 'error', text: `❌ Error: ${error.message}` });
      setTimeout(() => setMessage(null), 5000);
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="container">
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
            <div className="loading-spinner" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section" style={{ paddingTop: '2rem' }}>
      <div className="container">
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div>
            <span className="page-header__eyebrow">Admin</span>
            <h1>Course Structure Manager</h1>
            <p className="text-muted">View and manage course units and lessons</p>
          </div>
          <button className="button button--ghost button--pill" onClick={loadCourses}>
            Reload Courses
          </button>
        </div>

        {message && (
          <div 
            className={`form-message form-message--${message.type}`} 
            style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)' }}
          >
            {message.text}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {courses.map((course) => (
            <div key={course.id} className="card">
              <div 
                onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
                style={{ 
                  cursor: 'pointer', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '1rem',
                  borderBottom: expandedCourse === course.id ? '1px solid var(--border)' : 'none'
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{course.display_name || course.name}</h2>
                  <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                    {course.id} • {course.units?.length || 0} units • {course.number_of_lessons || 0} lessons
                  </p>
                </div>
                <span style={{ fontSize: '1.5rem', transform: expandedCourse === course.id ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  ▸
                </span>
              </div>

              {expandedCourse === course.id && (
                <div style={{ padding: '1rem' }}>
                  {(course.units || []).map((unit, unitIdx) => (
                    <div key={unit.unitId || unitIdx} style={{ marginBottom: '1.5rem', paddingLeft: '1rem', borderLeft: '3px solid var(--primary)' }}>
                      <h3 style={{ fontSize: '1.125rem', marginBottom: '0.75rem', color: 'var(--primary)' }}>
                        Unit {unitIdx + 1}: {unit.title}
                      </h3>
                      <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                        Unit ID: {unit.unitId || unit.id} • {unit.lessons?.length || 0} lessons
                      </p>

                      {(unit.lessons || []).length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {unit.lessons.map((lesson, lessonIdx) => (
                            <div 
                              key={lesson.lessonId || lessonIdx}
                              style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                padding: '0.75rem 1rem',
                                background: 'var(--surface)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                  <span className="badge" style={{ fontSize: '0.75rem' }}>
                                    {unitIdx + 1}.{lessonIdx + 1}
                                  </span>
                                  <span style={{ fontWeight: 500 }}>{lesson.title}</span>
                                  <span className="chip chip--ghost" style={{ fontSize: '0.75rem' }}>
                                    {lesson.type || 'lesson'}
                                  </span>
                                </div>
                                <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem', marginLeft: '2.5rem' }}>
                                  Lesson ID: {lesson.lessonId} • Order: {lesson.order}
                                </p>
                              </div>
                              <button
                                className="button button--ghost button--sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => handleRemoveLesson(course.id, unit.unitId || unit.id, lesson.lessonId, lesson.title)}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted" style={{ fontStyle: 'italic' }}>No lessons in this unit</p>
                      )}
                    </div>
                  ))}

                  {(!course.units || course.units.length === 0) && (
                    <p className="text-muted" style={{ fontStyle: 'italic' }}>No units found in this course</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {courses.length === 0 && (
          <div className="card card--message">
            <p className="text-muted">No courses found in Firestore.</p>
          </div>
        )}
      </div>
    </section>
  );
}
