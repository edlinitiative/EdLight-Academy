import React, { useEffect, useMemo, useState } from 'react';
import { QuizComponent } from '../components/Quiz';
import { useAppData } from '../hooks/useData';

const formatQuizLabel = (quiz, index) => {
  if (!quiz) return `Quiz ${index + 1}`;
  const rawId = quiz.quiz_id || quiz.id || '';
  if (rawId) {
    const parts = rawId.split('-');
    const suffix = parts.slice(-1)[0];
    if (suffix && suffix.length <= 3) {
      return `Quiz ${suffix}`;
    }
  }
  if (quiz.video_id) {
    const segments = quiz.video_id.split('-');
    const unit = segments.find((segment) => /^U\d+/i.test(segment));
    const lesson = segments.find((segment) => /^L\d+/i.test(segment));
    const unitLabel = unit ? unit.replace(/^U/i, 'Unit ') : null;
    const lessonLabel = lesson ? lesson.replace(/^L/i, 'Lesson ') : null;
    const combined = [unitLabel, lessonLabel].filter(Boolean).join(' · ');
    if (combined) return combined;
  }
  return `Quiz ${index + 1}`;
};

const Quizzes = () => {
  const { data, isLoading } = useAppData();
  const quizzes = useMemo(() => data?.quizzes ?? [], [data]);
  const [activeQuizIndex, setActiveQuizIndex] = useState(0);
  const activeQuiz = quizzes[activeQuizIndex] || null;

  useEffect(() => {
    if (quizzes.length === 0) {
      setActiveQuizIndex(0);
      return;
    }

    if (activeQuizIndex >= quizzes.length) {
      setActiveQuizIndex(0);
    }
  }, [quizzes.length, activeQuizIndex]);

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Practice Hub</span>
            <h1>Instant Feedback Quizzes</h1>
            <p className="text-muted">
              Pick a lesson quiz to reinforce key concepts. Each question provides immediate guidance.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="card card--centered card--loading">
            <div className="loading-spinner" />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="card card--message">
            <h2 className="section__title">Quizzes coming soon</h2>
            <p className="text-muted">We&apos;re curating new practice sets. Check back shortly for fresh challenges.</p>
          </div>
        ) : (
          <div className="quiz-page">
            <div className="filter-group quiz-page__filters">
              {quizzes.map((quiz, idx) => (
                <button
                  key={quiz.quiz_id || quiz.id || idx}
                  type="button"
                  className={['filter-pill', idx === activeQuizIndex ? 'filter-pill--active' : ''].join(' ')}
                  onClick={() => setActiveQuizIndex(idx)}
                >
                  {formatQuizLabel(quiz, idx)}
                </button>
              ))}
            </div>

            <QuizComponent quiz={activeQuiz} />
          </div>
        )}
      </div>
    </section>
  );
};

export default Quizzes;