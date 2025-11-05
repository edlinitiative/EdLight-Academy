import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { CourseCard, CourseModal } from '../components/Course';
import useStore from '../contexts/store';

export default function Courses() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [filter, setFilter] = useState('all');
  const { enrolledCourses, isAuthenticated } = useStore();
  
  const filterLabels = {
    all: 'All',
    enrolled: 'My Courses',
    NSI: 'NS I',
    NSII: 'NS II',
    NSIII: 'NS III',
    NSIV: 'NS IV'
  };

  if (isLoading) {
    return (
      <section className="section">
        <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '320px' }}>
          <div className="loading-spinner" />
        </div>
      </section>
    );
  }

  const courses = data?.courses || [];

  const filteredCourses = courses.filter(course => {
    if (filter === 'enrolled') {
      return enrolledCourses.some(c => c.id === course.id);
    }
    if (filter === 'NSI' || filter === 'NSII' || filter === 'NSIII' || filter === 'NSIV') {
      return course.level === filter;
    }
    return true;
  });

  const handleEnroll = (course) => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
      return;
    }
    useStore.getState().enrollInCourse(course);
    setSelectedCourse(null);
    navigate(`/courses/${course.id}`);
  };

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Course Catalog</span>
            <h1>Explore the EdLight Academy Curriculum</h1>
            <p className="text-muted">Filter by level or return to the lessons you already started.</p>
          </div>
          <div className="page-header__actions">
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
            <button
              type="button"
              className="button button--ghost button--pill"
              onClick={() => navigate('/dashboard')}
            >
              View Dashboard
            </button>
          </div>
        </div>

        {filteredCourses.length > 0 ? (
          <div className="grid grid--courses">
            {filteredCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onPreview={() => setSelectedCourse(course)}
              />
            ))}
          </div>
        ) : (
          <div className="card text-center" style={{ padding: '3rem 2.5rem' }}>
            <h3 className="course-card__title" style={{ marginBottom: '0.5rem' }}>No courses match this filter yet</h3>
            <p className="text-muted">Adjust the filters or head back to the full catalog.</p>
            <div style={{ marginTop: '1.5rem' }}>
              <button className="button button--primary button--pill" onClick={() => setFilter('all')}>
                Reset Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedCourse && (
        <CourseModal
          course={selectedCourse}
          onClose={() => setSelectedCourse(null)}
          onEnroll={handleEnroll}
        />
      )}
    </section>
  );
}