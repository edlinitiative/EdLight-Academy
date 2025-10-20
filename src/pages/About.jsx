import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function About() {
  const navigate = useNavigate();

  const missionPoints = [
    'Short videos with clear concepts',
    'Practice exercises for each lesson',
    'Personalized progress tracking',
    'Content in Kreyòl and French (coming soon)'
  ];

  const stats = [
    { number: '1,000+', label: 'Active Students' },
    { number: '40+', label: 'Video Lessons' },
    { number: '200+', label: 'Practice Exercises' },
    { number: '4', label: 'Core Subjects' }
  ];

  return (
    <div className="section">
      <div className="container">
        <section className="about-hero">
          <h1 className="about-hero__title">Our Mission</h1>
          <p className="about-hero__copy">
            EdLight is working to make quality education accessible to all Haitian students.
            We believe that everyone should have access to good education, wherever they are.
          </p>
        </section>

        <section className="about-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="card text-center">
              <div className="about-stats__number">{stat.number}</div>
              <div className="about-stats__label">{stat.label}</div>
            </div>
          ))}
        </section>

        <section className="about-team">
          <h2 className="section__title">Our Approach</h2>
          <div className="about-approach">
            {missionPoints.map((point, idx) => (
              <div key={point} className="card about-approach__item">
                <span className="about-approach__index">{idx + 1}</span>
                <span className="about-approach__text">{point}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="about-team">
          <h2 className="section__title">Our Team</h2>
          <p className="text-muted about-team__copy">
            We are a team of teachers, educators, and developers passionate about education.
          </p>
        </section>

        <section className="card about-cta text-center">
          <h2 className="section__title">Ready to Get Started?</h2>
          <button
            className="button button--primary button--pill"
            onClick={() => navigate('/courses')}
          >
            Explore Courses
          </button>
        </section>
      </div>
    </div>
  );
}
