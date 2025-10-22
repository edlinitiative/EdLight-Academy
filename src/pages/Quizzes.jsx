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
            <p className="text-muted">Choose your course, grade, and unit to get a targeted question. You’ll get up to three tries with helpful hints before the full explanation.</p>
          </div>
        </div>

        <div className="quiz-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1rem' }}>
          <div>
            <QuizComponent />
          </div>
          <aside>
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem' }}>How practice works</h3>
              <ul className="text-muted" style={{ margin: 0, paddingLeft: '1.2rem' }}>
                <li>Three tries per question</li>
                <li>New hint after each incorrect try</li>
                <li>See the correct answer and explanation after the third try</li>
                <li>Math formats are supported</li>
              </ul>
            </div>
            <div className="card" style={{ padding: '1rem', marginTop: '0.75rem' }}>
              <h3 style={{ margin: '0 0 0.5rem' }}>Tips</h3>
              <p className="text-muted" style={{ margin: 0 }}>
                Not seeing questions for a unit? Try another unit for the same course, or switch grades. We’re adding new practice every week.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default Quizzes;