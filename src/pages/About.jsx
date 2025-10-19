import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../hooks/useTracking';

export default function About() {
  const navigate = useNavigate();
  const { currentLanguage } = useLanguage();

  const texts = {
    mission: {
      title: {
        ht: 'Misyon nou',
        fr: 'Notre mission'
      },
      content: {
        ht: 'EdLight ap travay pou rann edikasyon kalite aksesib pou tout elèv Ayisyen. Nou kwè ke chak moun ta dwe gen aksè a bon jan edikasyon, kèlkeswa kote yo ye.',
        fr: 'EdLight travaille à rendre une éducation de qualité accessible à tous les étudiants haïtiens. Nous croyons que chacun devrait avoir accès à une bonne éducation, où qu\'il se trouve.'
      }
    },
    approach: {
      title: {
        ht: 'Metòd nou',
        fr: 'Notre approche'
      },
      points: [
        {
          ht: 'Videyo kout ak konsèp klè',
          fr: 'Vidéos courtes avec des concepts clairs'
        },
        {
          ht: 'Egzèsis pratik pou chak leson',
          fr: 'Exercices pratiques pour chaque leçon'
        },
        {
          ht: 'Swivi pwogrè pèsonalize',
          fr: 'Suivi des progrès personnalisé'
        },
        {
          ht: 'Kontni nan lang Kreyòl ak Fransè',
          fr: 'Contenu en Créole et en Français'
        }
      ]
    },
    stats: [
      {
        number: '1,000+',
        label: {
          ht: 'Elèv aktif',
          fr: 'Étudiants actifs'
        }
      },
      {
        number: '40+',
        label: {
          ht: 'Videyo leson',
          fr: 'Vidéos de cours'
        }
      },
      {
        number: '200+',
        label: {
          ht: 'Egzèsis pratik',
          fr: 'Exercices pratiques'
        }
      },
      {
        number: '4',
        label: {
          ht: 'Matyè prensipal',
          fr: 'Matières principales'
        }
      }
    ],
    team: {
      title: {
        ht: 'Ekip nou',
        fr: 'Notre équipe'
      },
      description: {
        ht: 'Nou se yon ekip pwofesè, edikatè, ak devlopè ki gen pasyon pou edikasyon.',
        fr: 'Nous sommes une équipe de professeurs, d\'éducateurs et de développeurs passionnés par l\'éducation.'
      }
    },
    cta: {
      title: {
        ht: 'Prè pou w kòmanse?',
        fr: 'Prêt à commencer?'
      },
      button: {
        ht: 'Eksplore kou yo',
        fr: 'Explorer les cours'
      }
    }
  };

  return (
    <div className="section">
      <div className="container">
        {/* Mission Section */}
        <section className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-6">{texts.mission.title[currentLanguage]}</h1>
          <p className="text-xl text-gray max-w-3xl mx-auto">
            {texts.mission.content[currentLanguage]}
          </p>
        </section>

        {/* Stats Section */}
        <section className="grid grid-4 gap-8 mb-16">
          {texts.stats.map((stat, idx) => (
            <div key={idx} className="card p-6 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">{stat.number}</div>
              <div className="text-gray">{stat.label[currentLanguage]}</div>
            </div>
          ))}
        </section>

        {/* Approach Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-8 text-center">
            {texts.approach.title[currentLanguage]}
          </h2>
          <div className="grid grid-2 gap-8">
            {texts.approach.points.map((point, idx) => (
              <div key={idx} className="card p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                    {idx + 1}
                  </div>
                  <div className="text-lg">{point[currentLanguage]}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-4 text-center">
            {texts.team.title[currentLanguage]}
          </h2>
          <p className="text-xl text-gray text-center mb-8">
            {texts.team.description[currentLanguage]}
          </p>
          <div className="grid grid-3 gap-8">
            {/* Add team member cards here */}
          </div>
        </section>

        {/* CTA Section */}
        <section className="card p-12 text-center">
          <h2 className="text-3xl font-bold mb-6">{texts.cta.title[currentLanguage]}</h2>
          <button 
            className="btn btn-lg"
            onClick={() => navigate('/courses')}
          >
            {texts.cta.button[currentLanguage]}
          </button>
        </section>
      </div>
    </div>
  );
}