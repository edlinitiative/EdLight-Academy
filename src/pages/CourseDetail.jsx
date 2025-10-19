import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useTracking';
import { useAppData } from '../hooks/useData';
import { QuizComponent } from '../Components/Quiz';
import useStore from '../contexts/store';

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const { data, isLoading } = useAppData();
  const [activeModule, setActiveModule] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const { isAuthenticated, enrolledCourses } = useStore();
  
  const course = data?.courses?.find(c => c.id === courseId);
  const isEnrolled = enrolledCourses.some(c => c.id === courseId);

  useEffect(() => {
    if (!isAuthenticated) {
      useStore.getState().toggleAuthModal();
    }
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="section">
        <div className="container">
          <div className="card p-8 text-center">
            <h2 className="text-xl font-bold mb-4">
              {currentLanguage === 'ht' ? 'Kou sa a pa disponib' : 'Ce cours n\'est pas disponible'}
            </h2>
            <button className="btn" onClick={() => navigate('/courses')}>
              {currentLanguage === 'ht' ? 'Retounen nan lis kou yo' : 'Retourner à la liste des cours'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="container">
        <div className="grid grid-3 gap-6">
          {/* Main Content */}
          <div className="col-span-2">
            <div className="card p-6 mb-6">
              <div className="aspect-video mb-4 bg-gray-100 rounded-lg">
                {/* Video player would go here */}
                <iframe
                  src={course.modules[activeModule].videoUrl}
                  title={course.modules[activeModule].title}
                  className="w-full h-full rounded-lg"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              <h1 className="text-2xl font-bold mb-2">{course.modules[activeModule].title}</h1>
              <p className="text-gray">{course.modules[activeModule].description}</p>

              <div className="flex justify-between items-center mt-6">
                <div className="flex gap-2">
                  <button
                    className="btn-outline btn-sm"
                    disabled={activeModule === 0}
                    onClick={() => setActiveModule(m => m - 1)}
                  >
                    {currentLanguage === 'ht' ? 'Anvan' : 'Précédent'}
                  </button>
                  <button
                    className="btn-outline btn-sm"
                    disabled={activeModule === course.modules.length - 1}
                    onClick={() => setActiveModule(m => m + 1)}
                  >
                    {currentLanguage === 'ht' ? 'Aprè' : 'Suivant'}
                  </button>
                </div>

                <button
                  className="btn btn-sm"
                  onClick={() => setShowQuiz(true)}
                >
                  {currentLanguage === 'ht' ? 'Fè Egzèsis' : 'Faire l\'exercice'}
                </button>
              </div>
            </div>

            {showQuiz && (
              <QuizComponent
                quiz={course.modules[activeModule].quiz}
                onComplete={(isCorrect) => {
                  if (isCorrect && activeModule < course.modules.length - 1) {
                    setActiveModule(m => m + 1);
                  }
                  setShowQuiz(false);
                }}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="col-span-1">
            <div className="card p-6">
              <h3 className="text-xl font-bold mb-4">
                {currentLanguage === 'ht' ? 'Kontni Kou a' : 'Contenu du Cours'}
              </h3>
              
              <div className="space-y-2">
                {course.modules.map((module, idx) => (
                  <button
                    key={idx}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      idx === activeModule
                        ? 'bg-blue-50 text-blue-600'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveModule(idx)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                        idx === activeModule
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{module.title}</div>
                        <div className="text-sm text-gray">
                          {module.duration} min
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}