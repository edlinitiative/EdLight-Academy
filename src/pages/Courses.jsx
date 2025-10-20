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
    NSIII: 'NS III'
  };
  
  const subjectLabels = {
    MATH: 'Mathematics',
    PHYS: 'Physics',
    CHEM: 'Chemistry',
    ECON: 'Economics'
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner" />
      </div>
    );
  }

  const courses = data?.courses || [];
  
  const filteredCourses = courses.filter(course => {
    if (filter === 'enrolled') {
      return enrolledCourses.some(c => c.id === course.id);
    }
    if (filter === 'NSI' || filter === 'NSII' || filter === 'NSIII') {
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
    <div className="section">
      <div className="container">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Course Catalog</h1>
          
          <div className="flex gap-2">
            {Object.entries(filterLabels).map(([key, label]) => (
              <button
                key={key}
                className={`btn-sm ${filter === key ? 'btn' : 'btn-outline'}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredCourses.length > 0 ? (
          <div className="grid grid-3 gap-6">
            {filteredCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onPreview={() => setSelectedCourse(course)}
              />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-gray">No courses match these filters</p>
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
    </div>
  );
}