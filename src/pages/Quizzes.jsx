import React, { useEffect } from 'react';
import { QuizComponent } from '../components/Quiz';

// Quizzes page: curriculum practice only (Course/Grade/Unit), polished layout
const Quizzes = () => {
  // Lock page scroll while on the Quizzes screen to keep a fixed, app-like viewport
  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  return (
    <section className="section practice-screen">
      <div className="container practice-screen__inner">
        <div className="practice-screen__header">
          <span className="page-header__eyebrow">Practice Hub</span>
          <h1>Curriculum Practice</h1>
          <p className="text-muted">Choose your course, grade, and unit to get a targeted question. You’ll get up to three tries with helpful hints before the full explanation.</p>
        </div>

        <div className="practice-layout practice-screen__content">
          <div className="practice-main practice-screen__main">
            <div className="quiz-stage">
              <QuizComponent />
            </div>
          </div>
          <aside className="practice-aside practice-screen__aside">
            <div className="card card--compact">
              <h3 className="card__title">How practice works</h3>
              <ul className="text-muted list--bulleted">
                <li>Three tries per question</li>
                <li>New hint after each incorrect try</li>
                <li>Reveal the correct answer and explanation after the third try</li>
                <li>Math formatting is supported</li>
              </ul>
            </div>
            <div className="card card--compact">
              <h3 className="card__title">Tips</h3>
              <ul className="text-muted list--bulleted">
                <li>If a unit has few questions, try another unit in the same course.</li>
                <li>Switch grades (NS I–IV) to broaden topics.</li>
                <li>We add new practice weekly—check back often.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default Quizzes;