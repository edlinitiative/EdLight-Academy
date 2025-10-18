import React, { useState } from 'react';
import { Play, BookOpen, Award, BarChart3, LogOut, Menu, X, CheckCircle, Lock } from 'lucide-react';

const EdLightAcademy = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [lang, setLang] = useState('fr');
  const [studentName, setStudentName] = useState('');
  const [classLevel, setClassLevel] = useState('NSI');
  const [currentCourse, setCurrentCourse] = useState(null);
  const [currentUnit, setCurrentUnit] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [showHints, setShowHints] = useState({});
  const [questionFeedback, setQuestionFeedback] = useState({});

  const translations = {
    fr: {
      welcome: 'Bienvenue à EdLight Academy',
      login: 'Connexion',
      email: 'Email',
      password: 'Mot de passe',
      signin: 'Se connecter',
      selectClass: 'Sélectionnez votre niveau',
      dashboard: 'Tableau de bord',
      courses: 'Cours',
      economics: 'Économie NS I',
      physics: 'Physique NS I',
      progress: 'Progression',
      achievements: 'Réalisations',
      logout: 'Déconnexion',
      unit: 'Unité',
      lesson: 'Leçon',
      quiz: 'Quiz',
      viewDetails: 'Voir les détails',
      startCourse: 'Commencer le cours',
      nextLesson: 'Leçon suivante',
      back: 'Retour',
      submit: 'Soumettre',
      score: 'Score',
      passed: 'Réussi!',
      tryAgain: 'Réessayer',
      introduction: 'Introduction à l\'Économie',
      lesson1: 'Qu\'est-ce que l\'économie?',
      lesson2: 'Besoins et ressources',
      lesson3: 'Micro vs Macroéconomie',
      quizTitle: 'Quiz - Introduction à l\'Économie',
      q1: 'Qu\'est-ce que l\'économie?',
      q1a: 'La science qui étudie comment la société utilise les ressources limitées',
      q1b: 'Un commerce de marchandises',
      q1c: 'Un système politique',
      q2: 'Quelle est la différence entre besoin primaire et secondaire?',
      q2a: 'Il n\'y a pas de différence',
      q2b: 'Les besoins primaires sont essentiels (nourriture), les secondaires sont supplémentaires',
      q2c: 'Les besoins secondaires sont plus importants',
      q3: 'La rareté en économie signifie:',
      q3a: 'Que les ressources sont limitées',
      q3b: 'Qu\'il n\'y a rien à vendre',
      q3c: 'Que tout le monde est pauvre',
      congratulations: 'Félicitations!',
      unitsCompleted: 'unités complétées',
      videosWatched: 'vidéos regardées',
      totalProgress: 'Progression totale',
    },
    kr: {
      welcome: 'Byenveni nan EdLight Academy',
      login: 'Koneksyon',
      email: 'Email',
      password: 'Modpas',
      signin: 'Konekte',
      selectClass: 'Chwazi nivo ou',
      dashboard: 'Panèl Kontwòl',
      courses: 'Kou',
      economics: 'Ekonomi NS I',
      physics: 'Fizik NS I',
      progress: 'Pwogresyon',
      achievements: 'Akonplisman',
      logout: 'Dekonekte',
      unit: 'Inite',
      lesson: 'Leçon',
      quiz: 'Kikis',
      viewDetails: 'Wè Detay',
      startCourse: 'Kòmanse kou',
      nextLesson: 'Pwochen Leçon',
      back: 'Tounen',
      submit: 'Soumèt',
      score: 'Pwen',
      passed: 'Réisit!',
      tryAgain: 'Eseye Ankò',
      introduction: 'Entwodiksyon nan Ekonomi',
      lesson1: 'Ki sa ki ekonomi?',
      lesson2: 'Bezwen ak Resous',
      lesson3: 'Mikwo vs Makroekonomi',
      quizTitle: 'Kikis - Entwodiksyon nan Ekonomi',
      q1: 'Ki sa ki ekonomi?',
      q1a: 'Syans ki etidye kouman sosyete itilize resous limite',
      q1b: 'Yon komès machandiz',
      q1c: 'Yon sistèm politik',
      q2: 'Ki diferans ant bezwen primè ak segondè?',
      q2a: 'Genyen pa genyen diferans',
      q2b: 'Bezwen primè esansyèl (manje), segondè siplemantè',
      q2c: 'Bezwen segondè pi enpòtan',
      q3: 'Rareté nan ekonomi vle di:',
      q3a: 'Ke resous limite',
      q3b: 'Ke genyen anyen pou vann',
      q3c: 'Ke tout moun pov',
      congratulations: 'Felisitasyon!',
      unitsCompleted: 'inite konplete',
      videosWatched: 'video regade',
      totalProgress: 'Pwogresyon Total',
    }
  };

  const t = translations[lang];

  const courses = [
    {
      id: 1,
      name: lang === 'fr' ? 'Économie NS I' : 'Ekonomi NS I',
      icon: '📊',
      progress: 35,
      units: [
        {
          id: 1,
          name: lang === 'fr' ? t.introduction : t.introduction,
          lessons: [
            { id: 1, name: t.lesson1, duration: 8, watched: true },
            { id: 2, name: t.lesson2, duration: 7, watched: true },
            { id: 3, name: t.lesson3, duration: 9, watched: false },
          ]
        },
        {
          id: 2,
          name: lang === 'fr' ? 'Les Agents Économiques' : 'Ajan Ekonomik',
          lessons: [
            { id: 4, name: lang === 'fr' ? 'Les Ménages' : 'Menaj', duration: 6, watched: false },
            { id: 5, name: lang === 'fr' ? 'Les Entreprises' : 'Antrepriz', duration: 7, watched: false },
          ]
        }
      ]
    },
    {
      id: 2,
      name: lang === 'fr' ? 'Physique NS I' : 'Fizik NS I',
      icon: '🔬',
      progress: 0,
      units: []
    }
  ];

  const correctAnswers = { q1: 'q1a', q2: 'q2b', q3: 'q3a' };

  const handleLogin = (e) => {
    e.preventDefault();
    if (studentName.trim()) {
      setCurrentPage('dashboard');
    }
  };

  const handleLogout = () => {
    setStudentName('');
    setCurrentPage('login');
    setCurrentCourse(null);
    setCurrentUnit(null);
    setCurrentLesson(null);
  };

  const openLesson = (course, unit, lesson) => {
    setCurrentCourse(course);
    setCurrentUnit(unit);
    setCurrentLesson(lesson);
    setCurrentPage('lesson');
    setQuizSubmitted(false);
    setQuizAnswers({});
  };

  const openQuiz = (course, unit) => {
    setCurrentCourse(course);
    setCurrentUnit(unit);
    setCurrentLesson(null);
    setCurrentPage('quiz');
    setQuizSubmitted(false);
    setQuizAnswers({});
  };

  // LOGIN PAGE
  if (currentPage === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">📚</div>
            <h1 className="text-3xl font-bold text-gray-800">EdLight Academy</h1>
            <p className="text-gray-500 mt-2">Online Learning Platform</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t.email}
              </label>
              <input
                type="email"
                placeholder="student@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t.password}
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t.selectClass}
              </label>
              <select
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option>NSI</option>
                <option>SII</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nom Complet
              </label>
              <input
                type="text"
                placeholder="Votre nom"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-3 rounded-lg hover:shadow-lg transition"
            >
              {t.signin}
            </button>
          </div>

          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setLang('fr')}
              className={`px-4 py-2 rounded font-semibold ${lang === 'fr' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              Français
            </button>
            <button
              onClick={() => setLang('kr')}
              className={`px-4 py-2 rounded font-semibold ${lang === 'kr' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            >
              Kreyòl
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DASHBOARD
  if (currentPage === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600">📚 EdLight Academy</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLang(lang === 'fr' ? 'kr' : 'fr')}
                className="px-3 py-1 bg-gray-200 rounded text-sm font-semibold"
              >
                {lang === 'fr' ? 'Kreyòl' : 'Français'}
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded"
              >
                <LogOut size={18} /> {t.logout}
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8 rounded-xl mb-8">
            <h2 className="text-3xl font-bold mb-2">{t.welcome} 👋</h2>
            <p className="text-lg">{studentName}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-3xl mb-2">🎯</div>
              <p className="text-gray-600 text-sm">{t.totalProgress}</p>
              <p className="text-2xl font-bold">24%</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-3xl mb-2">📹</div>
              <p className="text-gray-600 text-sm">{t.videosWatched}</p>
              <p className="text-2xl font-bold">5</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-3xl mb-2">⭐</div>
              <p className="text-gray-600 text-sm">{t.achievements}</p>
              <p className="text-2xl font-bold">2</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="text-3xl mb-2">🔥</div>
              <p className="text-gray-600 text-sm">Streak</p>
              <p className="text-2xl font-bold">7 jours</p>
            </div>
          </div>

          <h3 className="text-2xl font-bold mb-4">{t.courses}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map(course => (
              <div key={course.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition cursor-pointer" onClick={() => setCurrentPage('course')}>
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-20 flex items-center justify-center text-4xl">
                  {course.icon}
                </div>
                <div className="p-6">
                  <h4 className="text-xl font-bold mb-2">{course.name}</h4>
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-gray-600">{t.progress}</span>
                      <span className="text-sm font-bold">{course.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${course.progress}%` }}></div>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentPage('course')}
                    className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700"
                  >
                    {t.viewDetails}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // COURSE PAGE
  if (currentPage === 'course') {
    const course = courses[0];
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className="text-blue-600 font-bold hover:underline"
            >
              ← {t.back}
            </button>
            <h1 className="text-2xl font-bold">{course.name}</h1>
            <div></div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {course.units.map((unit, idx) => (
            <div key={unit.id} className="mb-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                {t.unit} {idx + 1}: {unit.name}
              </h3>
              <div className="space-y-3">
                {unit.lessons.map(lesson => (
                  <div key={lesson.id} className="bg-white p-5 rounded-lg shadow flex justify-between items-center hover:shadow-md transition">
                    <div className="flex items-center gap-4">
                      {lesson.watched ? <CheckCircle className="text-green-500" size={24} /> : <Play className="text-blue-600" size={24} />}
                      <div>
                        <p className="font-semibold text-gray-800">{lesson.name}</p>
                        <p className="text-sm text-gray-500">{lesson.duration} min</p>
                      </div>
                    </div>
                    <button
                      onClick={() => openLesson(course, unit, lesson)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      {lesson.watched ? 'Revoir' : 'Regarder'}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => openQuiz(course, unit)}
                  className="w-full mt-4 p-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg font-bold hover:shadow-lg transition"
                >
                  📝 {t.quiz} - {unit.name}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // LESSON PAGE
  if (currentPage === 'lesson' && currentLesson) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
            <button
              onClick={() => setCurrentPage('course')}
              className="text-blue-600 font-bold hover:underline"
            >
              ← {t.back}
            </button>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
            <div className="bg-gray-900 h-96 flex items-center justify-center text-6xl">
              ▶️
            </div>
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-2">{currentLesson.name}</h2>
              <p className="text-gray-600 mb-4">{currentLesson.duration} min</p>
              <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-600 mb-4">
                <p className="text-blue-900"><strong>📹 Vidéo YouTube intégrée ici</strong> - Qualité adaptée pour connexion faible</p>
              </div>
              <button
                onClick={() => setCurrentPage('course')}
                className="bg-blue-600 text-white px-6 py-3 rounded font-semibold hover:bg-blue-700"
              >
                {t.nextLesson}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // QUIZ PAGE - PERSEUS-LIKE INTERACTIVE QUESTIONS
  if (currentPage === 'quiz') {
    const quizQuestions = [
      {
        id: 'q1',
        type: 'multiple-choice',
        question: t.q1,
        options: [
          { id: 'q1a', text: t.q1a },
          { id: 'q1b', text: t.q1b },
          { id: 'q1c', text: t.q1c }
        ],
        correct: 'q1a',
        hint: lang === 'fr' ? 'Pensez à la définition de base de l\'économie. C\'est une science qui étudie...' : 'Panse de definisyon debaz ekonomi. Se yon syans ki etidye...',
        explanation: lang === 'fr' ? 'L\'économie est effectivement la science qui étudie comment les sociétés utilisent les ressources limitées pour satisfaire les besoins illimités.' : 'Ekonomi se vrèman syans ki etidye kouman sosyete yo itilize resous limite pou satisfè bezwen san limit.'
      },
      {
        id: 'q2',
        type: 'multiple-choice',
        question: t.q2,
        options: [
          { id: 'q2a', text: t.q2a },
          { id: 'q2b', text: t.q2b },
          { id: 'q2c', text: t.q2c }
        ],
        correct: 'q2b',
        hint: lang === 'fr' ? 'Les besoins primaires incluent la nourriture, l\'eau, le logement...' : 'Bezwen primè gen ladan manje, dlo, kay...',
        explanation: lang === 'fr' ? 'Les besoins primaires (nourriture, eau, abri) sont essentiels à la survie, tandis que les besoins secondaires (loisirs, technologie) améliorent la qualité de vie.' : 'Bezwen primè (manje, dlo, kay) esansyèl pou siviv, tandike bezwen segondè (divertissman, teknoloji) amelyore kalite vi.'
      },
      {
        id: 'q3',
        type: 'multiple-choice',
        question: t.q3,
        options: [
          { id: 'q3a', text: t.q3a },
          { id: 'q3b', text: t.q3b },
          { id: 'q3c', text: t.q3c }
        ],
        correct: 'q3a',
        hint: lang === 'fr' ? 'La rareté signifie qu\'il n\'y a pas assez de ressources pour tout le monde...' : 'Rareté vle di genyen pa genyen ase resous pou tout moun...',
        explanation: lang === 'fr' ? 'La rareté est le concept fondamental de l\'économie : les ressources sont limitées mais les besoins sont illimités, ce qui force les sociétés à faire des choix.' : 'Rareté se konsep fondamantal ekonomi: resous limite men bezwen san limit, ki fòs sosyete fè chwa.'
      }
    ];

    const score = Object.keys(correctAnswers).filter(q => quizAnswers[q] === correctAnswers[q]).length;
    const totalScore = Math.round((score / quizQuestions.length) * 100);
    const passed = totalScore >= 70;

    const checkAnswer = (questionId, selectedId) => {
      const isCorrect = selectedId === correctAnswers[questionId];
      setQuestionFeedback(prev => ({
        ...prev,
        [questionId]: isCorrect
      }));
      setQuizAnswers(prev => ({
        ...prev,
        [questionId]: selectedId
      }));
    };

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
            <button
              onClick={() => setCurrentPage('course')}
              className="text-blue-600 font-bold hover:underline"
            >
              ← {t.back}
            </button>
            <div className="text-center">
              <p className="text-sm text-gray-600">{Object.keys(quizAnswers).length} / {quizQuestions.length}</p>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 py-8">
          {!quizSubmitted ? (
            <div className="space-y-8">
              <div className="bg-white rounded-lg shadow-lg p-8">
                <h2 className="text-3xl font-bold mb-2">{t.quizTitle}</h2>
                <p className="text-gray-600 mb-6">{lang === 'fr' ? 'Répondez à toutes les questions. Vous pouvez demander des indices!' : 'Reponn tout kesyon yo. Ou ka mande indices!'}</p>
              </div>

              {quizQuestions.map((q, idx) => (
                <div key={q.id} className="bg-white rounded-lg shadow-lg p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <span className="inline-block bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold mb-2">
                        {lang === 'fr' ? `Question ${idx + 1}` : `Kesyon ${idx + 1}`}
                      </span>
                      <h3 className="text-xl font-bold text-gray-800">{q.question}</h3>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {q.options.map(option => {
                      const isSelected = quizAnswers[q.id] === option.id;
                      const isCorrect = questionFeedback[q.id] !== undefined && option.id === q.correct;
                      const isWrong = questionFeedback[q.id] === false && isSelected;
                      
                      return (
                        <button
                          key={option.id}
                          onClick={() => checkAnswer(q.id, option.id)}
                          className={`w-full text-left p-4 border-2 rounded-lg transition font-semibold ${
                            isSelected && isCorrect
                              ? 'border-green-500 bg-green-50 text-green-900'
                              : isSelected && isWrong
                              ? 'border-red-500 bg-red-50 text-red-900'
                              : isCorrect && questionFeedback[q.id] !== undefined
                              ? 'border-green-500 bg-green-50'
                              : isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 bg-white hover:border-blue-500 hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-center">
                            <div className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center ${
                              isCorrect ? 'border-green-500 bg-green-500 text-white' : 
                              isWrong ? 'border-red-500 bg-red-500 text-white' : 
                              isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-400'
                            }`}>
                              {isCorrect ? '✓' : isWrong ? '✗' : isSelected ? '●' : '○'}
                            </div>
                            <span>{option.text}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setShowHints(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                      className="px-4 py-2 bg-yellow-500 text-white rounded font-semibold hover:bg-yellow-600 text-sm"
                    >
                      💡 {lang === 'fr' ? 'Indice' : 'Endis'}
                    </button>
                  </div>

                  {showHints[q.id] && (
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                      <p className="text-yellow-900 text-sm"><strong>{lang === 'fr' ? 'Indice:' : 'Endis:'}</strong> {q.hint}</p>
                    </div>
                  )}

                  {questionFeedback[q.id] !== undefined && (
                    <div className={`border-l-4 p-4 ${
                      questionFeedback[q.id]
                        ? 'bg-green-50 border-green-400'
                        : 'bg-blue-50 border-blue-400'
                    }`}>
                      <p className={`text-sm font-semibold ${
                        questionFeedback[q.id] ? 'text-green-900' : 'text-blue-900'
                      }`}>
                        {questionFeedback[q.id] ? '✓ ' + (lang === 'fr' ? 'Correct!' : 'Kòrèk!') : lang === 'fr' ? 'Voyons la réponse...' : 'Gade repons...'}
                      </p>
                      <p className="text-sm mt-2">{q.explanation}</p>
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => setQuizSubmitted(true)}
                disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {lang === 'fr' ? '✓ Soumettre le quiz' : '✓ Soumèt kikis'}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="text-center mb-8">
                <div className="text-7xl mb-4">{passed ? '🎉' : '📚'}</div>
                <h2 className="text-4xl font-bold mb-2">{passed ? t.congratulations : (lang === 'fr' ? 'Bon effort!' : 'Bon efò!')}</h2>
                <p className="text-6xl font-bold text-blue-600 mb-2">{totalScore}%</p>
                <p className="text-xl text-gray-600">{score} / {quizQuestions.length} {lang === 'fr' ? 'réponses correctes' : 'repons kòrèk'}</p>
              </div>

              <div className="bg-gray-50 p-6 rounded-lg mb-8">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  📊 {lang === 'fr' ? 'Révision de vos réponses' : 'Revizyon repons w'}
                </h3>
                <div className="space-y-3">
                  {quizQuestions.map((q, idx) => {
                    const isCorrect = quizAnswers[q.id] === q.correct;
                    return (
                      <div key={q.id} className={`p-4 rounded border-l-4 ${isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-2xl font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                            {isCorrect ? '✓' : '✗'}
                          </span>
                          <p className="font-bold">{lang === 'fr' ? `Question ${idx + 1}:` : `Kesyon ${idx + 1}:`} {q.question}</p>
                        </div>
                        <p className="text-sm ml-10 text-gray-700">{q.explanation}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setQuizSubmitted(false);
                    setQuizAnswers({});
                    setQuestionFeedback({});
                    setShowHints({});
                  }}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded font-bold hover:bg-blue-700"
                >
                  {lang === 'fr' ? '🔄 Réessayer' : '🔄 Eseye Ankò'}
                </button>
                <button
                  onClick={() => setCurrentPage('course')}
                  className="flex-1 bg-gray-600 text-white px-6 py-3 rounded font-bold hover:bg-gray-700"
                >
                  {t.back}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
};

export default EdLightAcademy;
