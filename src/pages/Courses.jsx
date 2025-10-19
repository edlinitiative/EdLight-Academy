import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useTracking';
import { useAppData } from '../hooks/useData';
import { CourseCard, CourseModal } from '../components/Course';
import useStore from '../contexts/store';

export default function Courses() {
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const { data, isLoading } = useAppData();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [filter, setFilter] = useState('all');
  const { enrolledCourses, isAuthenticated } = useStore();
  
  const texts = {
    title: {
      ht: 'Katalòg Kou yo',
      fr: 'Catalogue des Cours'
    },
    filters: {
      all: { ht: 'Tout', fr: 'Tous' },
      enrolled: { ht: 'Kou mwen yo', fr: 'Mes cours' },
      NSI: 'NS I',
      NSII: 'NS II',
      NSIII: 'NS III'
    },
    subjects: {
      MATH: { ht: 'Matematik', fr: 'Mathématiques' },
      PHYS: { ht: 'Fizik', fr: 'Physique' },
      CHEM: { ht: 'Chimi', fr: 'Chimie' },
      ECON: { ht: 'Ekonomi', fr: 'Économie' }
    },
    noResults: {
      ht: 'Pa gen kou ki koresponn ak filtè sa yo',
      fr: 'Aucun cours ne correspond à ces filtres'
    }
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
          <h1 className="text-3xl font-bold">{texts.title[currentLanguage]}</h1>
          
          <div className="flex gap-2">
            {Object.entries(texts.filters).map(([key, label]) => (
              <button
                key={key}
                className={`btn-sm ${filter === key ? 'btn' : 'btn-outline'}`}
                onClick={() => setFilter(key)}
              >
                {typeof label === 'string' ? label : label[currentLanguage]}
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
            <p className="text-gray">{texts.noResults[currentLanguage]}</p>
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