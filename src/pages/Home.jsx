import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import './Home.css';


export default function Home() {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated, language } = useStore();
  const isCreole = language === 'ht';
  const [heroSrc, setHeroSrc] = useState('/assets/landing-hero.png');

  const subjectThumbs = {
    PHYS: '/assets/physics-thumb.png',
    CHEM: '/assets/chemistry-thumb.jpg',
    MATH: '/assets/math-thumb.png',
    ECON: '/assets/economy-thumb.png',
  };


  const featuredCourses = [
    { id: 'phys-ns1', name: isCreole ? 'Fizik NS I' : 'Physique NS I', desc: isCreole ? 'Mekanik, Fòs, Enèji ak Mouvman' : 'Mécanique, Forces, Énergie et Mouvement', subject: 'PHYS', level: 'NS I', modules: 5, lessons: 24, duration: '8h' },
    { id: 'chem-ns1', name: isCreole ? 'Chimi NS I' : 'Chimie NS I', desc: isCreole ? 'Atòm, Molekil ak Reaksyon Chimik' : 'Atomes, Molécules et Réactions Chimiques', subject: 'CHEM', level: 'NS I', modules: 4, lessons: 20, duration: '6h' },
    { id: 'math-ns1', name: isCreole ? 'Matematik NS I' : 'Mathématiques NS I', desc: isCreole ? 'Aljèb, Fonksyon ak Ekwasyon' : 'Algèbre, Fonctions et Équations', subject: 'MATH', level: 'NS I', modules: 6, lessons: 30, duration: '10h' },
    { id: 'econ-ns1', name: isCreole ? 'Ekonomi NS I' : 'Économie NS I', desc: isCreole ? 'Mache, Demann ak Pwodwi Enteryè Brit' : 'Marché, Demande et Produit Intérieur Brut', subject: 'ECON', level: 'NS I', modules: 4, lessons: 18, duration: '5h' },
    { id: 'phys-ns2', name: isCreole ? 'Fizik NS II' : 'Physique NS II', desc: isCreole ? 'Elektrisite, Manyetis ak Ond' : 'Électricité, Magnétisme et Ondes', subject: 'PHYS', level: 'NS II', modules: 5, lessons: 22, duration: '7h' },
    { id: 'chem-ns2', name: isCreole ? 'Chimi NS II' : 'Chimie NS II', desc: isCreole ? 'Chimi Òganik ak Tèmodinamik' : 'Chimie Organique et Thermodynamique', subject: 'CHEM', level: 'NS II', modules: 5, lessons: 25, duration: '8h' },
    { id: 'math-ns2', name: isCreole ? 'Matematik NS II' : 'Mathématiques NS II', desc: isCreole ? 'Jewometri, Trigonometri ak Kalkil' : 'Géométrie, Trigonométrie et Calcul', subject: 'MATH', level: 'NS II', modules: 6, lessons: 28, duration: '9h' },
    { id: 'econ-ns2', name: isCreole ? 'Ekonomi NS II' : 'Économie NS II', desc: isCreole ? 'Makwoekonomik ak Komès Entènasyonal' : 'Macroéconomie et Commerce International', subject: 'ECON', level: 'NS II', modules: 5, lessons: 20, duration: '6h' },
  ];
  const doubled = [...featuredCourses, ...featuredCourses];

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="home-hero">
        <div className="home-hero__container">
          <div className="home-hero__grid">
            <div className="home-hero__content">
              <h1 className="home-hero__title">
                {isCreole ? 'Aprann ak' : 'Apprenez avec'}{' '}
                <span className="home-hero__title-highlight">EdLight Academy</span>
              </h1>

              <p className="home-hero__description">
                {isCreole
                  ? 'Kou kalite, egzèsis pratik, ak ti-kesyon entèaktif — fèt pou elèv ayisyen reyisi nan lekòl ak pi lwen.'
                  : "Des cours de qualité, des exercices pratiques et des quiz interactifs — conçus pour aider les élèves haïtiens à réussir à l'école et au-delà."}
              </p>

              <div className="home-hero__actions">
                <button
                  className="home-hero__button home-hero__button--cours"
                  onClick={() => navigate('/courses')}
                >
                  {isCreole ? 'Kou' : 'Cours'}
                </button>
                <button
                  className="home-hero__button home-hero__button--quiz"
                  onClick={() => navigate('/courses')}
                >
                  Quiz
                </button>
                <button
                  className="home-hero__button home-hero__button--examens"
                  onClick={() => navigate('/exams')}
                >
                  {isCreole ? 'Egzamen' : 'Examens'}
                </button>
                <button
                  className="home-hero__button home-hero__button--trivia"
                  onClick={() => navigate('/trivia')}
                >
                  Trivia
                </button>
              </div>
            </div>

            <div className="home-hero__visual">
              <img
                className="home-hero__image"
                src={heroSrc}
                alt={isCreole
                  ? 'Elèv segondè ap aprann sou yon òdinatè'
                  : 'Élève du secondaire apprenant sur un ordinateur portable'}
                loading="eager"
                onError={(e) => {
                  if (heroSrc !== '/assets/student-hero.svg') {
                    setHeroSrc('/assets/student-hero.svg');
                    e.target.alt = isCreole ? 'Ilistrasyon EdLight Academy' : 'Illustration EdLight Academy';
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Courses Marquee */}
      <section className="home-courses">
        <div className="home-courses__header-wrap">
          <div>
            <h2 className="home-courses__title">
              {isCreole ? 'Kou nou yo' : 'Nos cours'}
            </h2>
            <p className="home-courses__desc">
              {isCreole
                ? 'Eksplore kou konplè nan Fizik, Chimi, Matematik ak Ekonomi — de NS I jiska NS IV.'
                : 'Explorez des cours complets en Physique, Chimie, Mathématiques et Économie — du NS I au NS IV.'}
            </p>
          </div>
          <button className="home-courses__see-all" onClick={() => navigate('/courses')}>
            {isCreole ? 'Wè tout →' : 'Voir tout →'}
          </button>
        </div>
        <div className="home-courses__marquee">
          <div className="home-courses__track">
            {doubled.map((c, i) => (
              <div key={`${c.id}-${i}`} className="home-course-card" onClick={() => navigate('/courses')}>
                <div className="home-course-card__thumbnail">
                  <img className="home-course-card__img" src={subjectThumbs[c.subject]} alt={c.name} />
                </div>
                <div className="home-course-card__body">
                  <h3 className="home-course-card__name">{c.name}</h3>
                  <p className="home-course-card__desc">{c.desc}</p>
                  <div className="home-course-card__footer">
                    <span>{c.level}</span>
                    <span>{c.duration}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Exam Section */}
      <section className="home-exam-split">
        <div className="home-exam-split__container">
          <div className="home-exam-split__visual">
            <img className="home-exam-split__img" src="/assets/exam-thumb-1.png" alt={isCreole ? 'Egzamen ofisyèl' : 'Examens officiels'} />
            <img className="home-exam-split__img" src="/assets/exam-thumb-2.png" alt={isCreole ? 'Simulasyon egzamen' : 'Simulation examen'} />
          </div>
          <div className="home-exam-split__text">
            <h2 className="home-exam-split__title">
              {isCreole ? 'Prepare pou Egzamen Ofisyèl yo' : "Préparez-vous aux examens d'État"}
            </h2>
            <p className="home-exam-split__desc">
              {isCreole
                ? "Pratike ak egzamen ofisyèl Bac peyi Ayiti — Fizik, Chimi, Matematik ak Ekonomi. Pase egzamen blan nan kondisyon reyèl, ak yon kont a rebou, limit tan, ak yon nòt final. Jwenn repons ak eksplikasyon detaye apre chak sesyon."
                : "Entraînez-vous avec les examens officiels du Bac haïtien — Physique, Chimie, Mathématiques et Économie. Passez des examens blancs en conditions réelles, avec un compte à rebours, une limite de temps, et une note finale. Obtenez des réponses et explications détaillées après chaque session."}
            </p>
            <button className="home-exam-split__cta" onClick={() => navigate('/exams')}>
              {isCreole ? 'Kòmanse yon egzamen' : 'Commencer un examen'}
            </button>
          </div>
        </div>
      </section>

      {/* Quiz Section */}
      <section className="home-quiz-split">
        <div className="home-quiz-split__container">
          <div className="home-quiz-split__text">
            <h2 className="home-quiz-split__title">
              {isCreole ? 'Quiz Entèaktif' : 'Quiz Interactifs'}
            </h2>
            <p className="home-quiz-split__desc">
              {isCreole
                ? "Teste konesans ou apre chak leson ak quiz entèaktif. Jwenn repons imedyatman, wè eksplikasyon detaye, epi swiv pwogrè ou nan chak matyè. Ranfòse sa ou aprann ak pratik regilye."
                : "Testez vos connaissances après chaque leçon avec des quiz interactifs. Obtenez des réponses immédiates, consultez des explications détaillées et suivez vos progrès dans chaque matière. Renforcez vos acquis par la pratique régulière."}
            </p>
            <button className="home-quiz-split__cta" onClick={() => navigate('/courses')}>
              {isCreole ? 'Kòmanse yon quiz' : 'Commencer un quiz'}
            </button>
          </div>
          <div className="home-quiz-split__visual">
            <div className="home-quiz-split__preview">
              <div className="home-quiz-split__preview-header">
                <span className="home-quiz-split__preview-icon">Q</span>
                {isCreole ? 'Fizik — Fòs ak Mouvman' : 'Physique — Forces et Mouvement'}
              </div>
              <div className="home-quiz-split__question">
                <div className="home-quiz-split__question-label">
                  {isCreole ? 'Kesyon 7/10' : 'Question 7/10'}
                </div>
                <p className="home-quiz-split__question-text">
                  {isCreole
                    ? 'Ki inite SI pou fòs?'
                    : "Quelle est l'unité SI de la force ?"}
                </p>
              </div>
              <div className="home-quiz-split__options">
                <div className="home-quiz-split__option">
                  <span className="home-quiz-split__option-dot" />
                  Joule (J)
                </div>
                <div className="home-quiz-split__option home-quiz-split__option--correct">
                  <span className="home-quiz-split__option-dot" />
                  Newton (N)
                </div>
                <div className="home-quiz-split__option">
                  <span className="home-quiz-split__option-dot" />
                  Watt (W)
                </div>
                <div className="home-quiz-split__option">
                  <span className="home-quiz-split__option-dot" />
                  Pascal (Pa)
                </div>
              </div>
              <div className="home-quiz-split__progress">
                <span className="home-quiz-split__progress-text">65%</span>
                <div className="home-quiz-split__progress-bar">
                  <div className="home-quiz-split__progress-fill" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trivia Section */}
      <section className="home-trivia-split">
        <div className="home-trivia-split__container">
          <div className="home-trivia-split__visual">
            <img className="home-trivia-split__img" src="/assets/trivia-thumb.png" alt={isCreole ? 'Jwèt trivia' : 'Jeux trivia'} />
          </div>
          <div className="home-trivia-split__text">
            <h2 className="home-trivia-split__title">
              {isCreole ? 'Jwèt Trivia' : 'Jeux Trivia'}
            </h2>
            <p className="home-trivia-split__desc">
              {isCreole
                ? "Teste konesans ou sou mond lan nan yon fason amizan! Jwe jwèt sou kapital, lajan, ak drapo 196 peyi nan mond lan. Defi tèt ou epi amelyore kilti jeneral ou chak jou."
                : "Testez vos connaissances sur le monde de manière ludique ! Jouez à des jeux sur les capitales, les devises et les drapeaux des 196 pays du monde. Défiez-vous et améliorez votre culture générale chaque jour."}
            </p>
            <button className="home-trivia-split__cta" onClick={() => navigate('/trivia')}>
              {isCreole ? 'Jwe kounye a' : 'Jouer maintenant'}
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="home-features">
        <div className="home-features__container">
          <div className="home-features__grid">
            <div className="home-features__content">
              <h2 className="home-features__title">
                {isCreole ? 'Zouti pou reyisi' : 'Des outils pour réussir'}
              </h2>
              <ul className="home-features__list">
                <li className="home-features__item">
                  <span className="home-features__check">✓</span>
                  <div>
                    <strong>{isCreole ? 'Quiz entèaktif' : 'Quiz interactifs'}</strong>
                    <p>{isCreole ? 'Teste konesans ou apre chak leson' : 'Testez vos connaissances après chaque leçon'}</p>
                  </div>
                </li>
                <li className="home-features__item">
                  <span className="home-features__check">✓</span>
                  <div>
                    <strong>{isCreole ? 'Egzamen blan' : 'Examens blancs'}</strong>
                    <p>{isCreole ? 'Prepare pou egzamen eta ak pratik reyèl' : "Préparez-vous aux examens d'État avec des simulations réelles"}</p>
                  </div>
                </li>
                <li className="home-features__item">
                  <span className="home-features__check">✓</span>
                  <div>
                    <strong>{isCreole ? 'Jwèt trivia' : 'Jeux trivia'}</strong>
                    <p>{isCreole ? 'Aprann nan yon fason amizan ak jwèt kayital, lajan, drapo' : 'Apprenez de manière ludique avec des jeux sur les capitales, devises, drapeaux'}</p>
                  </div>
                </li>
                <li className="home-features__item">
                  <span className="home-features__check">✓</span>
                  <div>
                    <strong>{isCreole ? 'Plan etid pèsonalize' : 'Plan d\'étude personnalisé'}</strong>
                    <p>{isCreole ? 'Swiv pwogrè ou ak resevwa rekòmandasyon' : 'Suivez vos progrès et recevez des recommandations'}</p>
                  </div>
                </li>
              </ul>
              <button
                className="home-features__cta"
                onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}
              >
                {isCreole ? 'Kòmanse kounye a' : 'Commencer maintenant'}
              </button>
            </div>

            <div className="home-features__visual">
              <div className="home-features__preview">
                <div className="home-features__preview-header">
                  {isCreole ? 'Tablo de bò ou' : 'Votre tableau de bord'}
                </div>
                <div className="home-features__preview-body">
                  <div className="home-features__metric">
                    <div className="home-features__metric-value">12</div>
                    <div className="home-features__metric-label">
                      {isCreole ? 'Kou konplete' : 'Cours complétés'}
                    </div>
                  </div>
                  <div className="home-features__metric">
                    <div className="home-features__metric-value">85%</div>
                    <div className="home-features__metric-label">
                      {isCreole ? 'Metrize' : 'Maîtrise'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
