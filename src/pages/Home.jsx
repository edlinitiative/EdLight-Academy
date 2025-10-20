import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import { CourseCard } from '../components/Course';
import useStore from '../contexts/store';

export default function Home() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { toggleAuthModal, isAuthenticated } = useStore();
  
  // Featured courses (first 6)
  const featuredCourses = data?.courses?.slice(0, 6) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      <section className="hero-section">
        <div className="container grid grid-2" style={{ alignItems: 'center' }}>
          <div>
            <div className="badge mb-4">Physics • Chemistry • Math • Economics</div>
            <h1>Learning that meets Haiti where it is — and lifts students higher.</h1>
            <p className="text-gray text-lg mt-4 mb-8">
              Short video lessons, practice quizzes, and progress tracking. All in one place.
            </p>
            
            <div className="flex gap-4">
              <button 
                className="btn"
                onClick={() => isAuthenticated ? navigate('/dashboard') : toggleAuthModal()}
              >
                Start Learning
              </button>
              <button 
                className="btn-outline"
                onClick={() => navigate('/courses')}
              >
                Browse Courses
              </button>
            </div>

            <div className="stats-grid mt-12">
              <div>
                <div className="stat-number">1,000+</div>
                <div className="stat-label">Students</div>
              </div>
              <div>
                <div className="stat-number">40+</div>
                <div className="stat-label">Video Lessons</div>
              </div>
              <div>
                <div className="stat-number">200+</div>
                <div className="stat-label">Practice Quizzes</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <img 
              src="/assets/logo.png" 
              alt="EdLight Academy"
              className="hero-image"
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold">Featured Courses</h2>
            <button 
              className="btn-outline"
              onClick={() => navigate('/courses')}
            >
              View All Courses
            </button>
          </div>

          <div className="grid grid-3 gap-6">
            {featuredCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                onPreview={() => navigate(`/courses/${course.id}`)}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}