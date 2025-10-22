import React from 'react';
import { Link } from 'react-router-dom';

export default function Help() {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Support center</span>
            <h1>Help</h1>
            <p className="text-muted">Guides to get you learning fast, plus troubleshooting tips.</p>
          </div>
        </div>

        <div className="practice-layout">
          <div className="practice-main">
            <div className="card card--compact" style={{ marginBottom: '0.75rem' }}>
              <h3 className="card__title">Getting started</h3>
              <ul className="list--bulleted text-muted">
                <li>Go to <Link className="footer__link" to="/courses">Courses</Link> and pick your subject and NS level.</li>
                <li>Open a course to see units and lessons. Use Next/Previous to navigate.</li>
                <li>Click Practice for curriculum questions tailored to your selection.</li>
              </ul>
            </div>

            <div className="card card--compact" style={{ marginBottom: '0.75rem' }}>
              <h3 className="card__title">Practice and unit quizzes</h3>
              <ul className="list--bulleted text-muted">
                <li>Practice: choose course, grade, and unit on the <Link className="footer__link" to="/quizzes">Quizzes</Link> page.</li>
                <li>Unit Quiz: open any course and select “Unit Quiz — 10 Questions” after the last subchapter.</li>
                <li>You get up to three tries with progressive hints; explanations reveal after the third try.</li>
              </ul>
            </div>

            <div className="card card--compact">
              <h3 className="card__title">Troubleshooting</h3>
              <ul className="list--bulleted text-muted">
                <li>Video not loading: try refreshing the page or checking your connection.</li>
                <li>No questions for a unit: try another unit or grade; new items are added weekly.</li>
                <li>Need help? <Link className="footer__link" to="/contact">Contact us</Link> with course and unit details.</li>
              </ul>
            </div>
          </div>

          <aside className="practice-aside">
            <div className="card card--compact">
              <h3 className="card__title">Shortcuts</h3>
              <ul className="list--bulleted text-muted">
                <li><Link className="footer__link" to="/courses">Browse courses</Link></li>
                <li><Link className="footer__link" to="/quizzes">Practice quizzes</Link></li>
                <li><Link className="footer__link" to="/contact">Contact support</Link></li>
                <li><Link className="footer__link" to="/faq">See FAQs</Link></li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
