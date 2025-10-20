import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { user, enrolledCourses, progress, quizAttempts} = useStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner" />
      </div>
    );
  }

  // Calculate statistics
  const coursesInProgress = enrolledCourses.length;
  const quizCount = Object.keys(quizAttempts).length;
  const avgScore = quizCount > 0
    ? Object.values(quizAttempts)
        .flat()
        .reduce((sum, attempt) => sum + attempt.score, 0) / quizCount
    : 0;

  return (
    <div className="section">
      <div className="container">
        <h1 className="text-3xl font-bold mb-8">Welcome, {user?.name}!</h1>

        {/* Statistics Cards */}
        <div className="grid grid-3 gap-6 mb-8">
          <div className="card p-6">
            <h3 className="text-lg text-gray mb-2">Courses in Progress</h3>
            <div className="text-3xl font-bold">{coursesInProgress}</div>
          </div>
          <div className="card p-6">
            <h3 className="text-lg text-gray mb-2">Quizzes Taken</h3>
            <div className="text-3xl font-bold">{quizCount}</div>
          </div>
          <div className="card p-6">
            <h3 className="text-lg text-gray mb-2">Average Score</h3>
            <div className="text-3xl font-bold">{Math.round(avgScore * 100)}%</div>
          </div>
        </div>

        {/* Enrolled Courses */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Enrolled Courses</h2>
          
          {enrolledCourses.length > 0 ? (
            <div className="grid grid-2 gap-6">
              {enrolledCourses.map(course => {
                const courseProgress = progress[course.id] || { completed: 0, total: course.modules };
                const progressPercent = Math.round((courseProgress.completed / courseProgress.total) * 100);
                
                return (
                  <div key={course.id} className="card course-card-hover p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="badge mb-2">{course.badge}</span>
                        <h3 className="text-xl font-bold">{course.title}</h3>
                        <p className="text-gray mt-1">{course.instructor}</p>
                      </div>
                      <button 
                        className="btn-outline btn-sm"
                        onClick={() => navigate(`/courses/${course.id}`)}
                      >
                        Continue
                      </button>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{progressPercent}% complete</span>
                        <span className="text-gray">
                          {courseProgress.completed}/{courseProgress.total} modules
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card p-8 text-center">
              <p className="text-gray mb-4">No enrolled courses. Explore the catalog to get started!</p>
              <button 
                className="btn"
                onClick={() => navigate('/courses')}
              >
                Explore Courses
              </button>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Recent Activity</h2>
          <div className="card p-6">
            {Object.entries(quizAttempts)
              .flatMap(([quizId, attempts]) => 
                attempts.map(attempt => ({
                  ...attempt,
                  quizId,
                  quiz: data.quizzes.find(q => q.quiz_id === quizId)
                }))
              )
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .slice(0, 5)
              .map((activity, index) => (
                <div 
                  key={`${activity.quizId}-${index}`}
                  className="flex items-center gap-4 py-3"
                >
                  <div className={`indicator ${activity.score === 1 ? 'indicator-green' : 'indicator-red'}`} />
                  <div>
                    <p className="font-medium">{activity.quiz?.question}</p>
                    <p className="text-sm text-gray">
                      {new Date(activity.date).toLocaleDateString()} - 
                      {activity.score === 1 ? ' Correct' : ' Incorrect'}
                    </p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}