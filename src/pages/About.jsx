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
        {/* Mission Section */}
        <section className="text-center mb-16" style={{ marginBottom: '4rem' }}>
          <h1 className="text-4xl font-bold mb-6" style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>
            Our Mission
          </h1>
          <p className="text-xl text-gray" style={{ fontSize: '1.25rem', maxWidth: '48rem', margin: '0 auto' }}>
            EdLight is working to make quality education accessible to all Haitian students. 
            We believe that everyone should have access to good education, wherever they are.
          </p>
        </section>

        {/* Stats Section */}
        <section className="stats-grid mb-16" style={{ marginBottom: '4rem' }}>
          {stats.map((stat, idx) => (
            <div key={idx} className="card p-6 text-center" style={{ padding: '1.5rem' }}>
              <div className="stat-number">{stat.number}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* Approach Section */}
        <section className="mb-16" style={{ marginBottom: '4rem' }}>
          <h2 className="text-3xl font-bold mb-8 text-center" style={{ fontSize: '2rem', marginBottom: '2rem' }}>
            Our Approach
          </h2>
          <div className="grid grid-2 gap-8">
            {missionPoints.map((point, idx) => (
              <div key={idx} className="card p-6" style={{ padding: '1.5rem' }}>
                <div className="flex items-center gap-4" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: '3rem',
                    height: '3rem',
                    borderRadius: '50%',
                    background: '#E6F1FB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0A66C2',
                    fontWeight: 'bold',
                    fontSize: '1.25rem'
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ fontSize: '1.125rem' }}>{point}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Team Section */}
        <section className="mb-16" style={{ marginBottom: '4rem' }}>
          <h2 className="text-3xl font-bold mb-4 text-center" style={{ fontSize: '2rem', marginBottom: '1rem' }}>
            Our Team
          </h2>
          <p className="text-xl text-gray text-center mb-8" style={{ fontSize: '1.125rem', marginBottom: '2rem' }}>
            We are a team of teachers, educators, and developers passionate about education.
          </p>
        </section>

        {/* CTA Section */}
        <section className="card p-12 text-center" style={{ padding: '3rem' }}>
          <h2 className="text-3xl font-bold mb-6" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
            Ready to Get Started?
          </h2>
          <button 
            className="btn"
            onClick={() => navigate('/courses')}
            style={{ padding: '0.75rem 2rem', fontSize: '1.125rem' }}
          >
            Explore Courses
          </button>
        </section>
      </div>
    </div>
  );
}
