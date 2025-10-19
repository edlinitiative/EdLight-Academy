import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useTracking';
import { useAppData } from '../hooks/useData';
import { CourseCard } from '../Components/Course';
import useStore from '../contexts/store';

export default function Home() {
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();
  const { data, isLoading } = useAppData();
  const { toggleAuthModal, isAuthenticated } = useStore();
  
  // Featured courses (first 3)
  const featuredCourses = data?.courses?.slice(0, 3) || [];

  const texts = {
    hero: {
      title: {
        ht: 'Aprann ak EdLight, grandi ak kominote a',
        fr: 'Apprenez avec EdLight, grandissez avec la communauté'
      },
      subtitle: {
        ht: 'Fizik, Chimi, Matematik, ak Ekonomi — videyo kout, egzèsis pratik, ak swivi pwogrè ou. Tout nan yon sèl kote.',
        fr: 'Physique, Chimie, Mathématiques et Économie — courtes vidéos, exercices pratiques et suivi des progrès. Tout en un seul endroit.'
      }
    },
    stats: [
      { 
        number: '1,000+',
        label: { ht: 'Elèv', fr: 'Étudiants' }
      },
      {
        number: '40+',
        label: { ht: 'Videyo', fr: 'Vidéos' }
      },
      {
        number: '200+',
        label: { ht: 'Egzèsis', fr: 'Exercices' }
      }
    ],
    cta: {
      main: {
        ht: 'Kòmanse aprann',
        fr: 'Commencez à apprendre'
      },
      secondary: {
        ht: 'Gade kou yo',
        fr: 'Voir les cours'
      }
    }
  };

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
            <h1>{texts.hero.title[currentLanguage]}</h1>
            <p className="text-gray text-lg mt-4 mb-8">{texts.hero.subtitle[currentLanguage]}</p>
            
            <div className="flex gap-4">
              <button 
                className="btn"
                onClick={() => isAuthenticated ? navigate('/dashboard') : toggleAuthModal()}
              >
                {texts.cta.main[currentLanguage]}
              </button>
              <button 
                className="btn-outline"
                onClick={() => navigate('/courses')}
              >
                {texts.cta.secondary[currentLanguage]}
              </button>
            </div>

            <div className="stats-grid mt-12">
              {texts.stats.map((stat, idx) => (
                <div key={idx}>
                  <div className="stat-number">{stat.number}</div>
                  <div className="stat-label">{stat.label[currentLanguage]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <img 
              src="/assets/hero-image.jpg" 
              alt="Students learning"
              className="hero-image"
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold">
              {currentLanguage === 'ht' ? 'Kou Popilè yo' : 'Cours Populaires'}
            </h2>
            <button 
              className="btn-outline"
              onClick={() => navigate('/courses')}
            >
              {currentLanguage === 'ht' ? 'Wè tout kou yo' : 'Voir tous les cours'}
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