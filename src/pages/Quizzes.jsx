import React from 'react';
import { QuizComponent } from '../components/Quiz';

// Simplified Quizzes page: curriculum practice only (Course/Grade/Unit)
const Quizzes = () => {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Practice Hub</span>
            <h1>Curriculum Practice</h1>
            <p className="text-muted">
              Choose your course, grade, and unit to get a targeted practice question with hints.
            </p>
          </div>
        </div>

        <div className="quiz-page">
          <QuizComponent />
        </div>
      </div>
    </section>
  );
};

export default Quizzes;