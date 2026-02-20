import React from 'react';
import { useNavigate } from 'react-router-dom';

const APPROACH_ITEMS = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    ),
    title: 'Short, focused videos',
    desc: 'Each concept is explained in a clear, concise video so you can learn at your own pace.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    ),
    title: 'Practice after every lesson',
    desc: 'Targeted quiz questions after each lesson to check and reinforce understanding.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    title: 'Personalized progress tracking',
    desc: 'Know exactly where you stand — per lesson, unit, and subject.',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    title: 'Bilingual content',
    desc: 'Learning resources available in French and Kreyòl to serve every Haitian student.',
  },
];

const VALUES = [
  { label: 'Accessibilité', desc: "L'éducation de qualité est un droit, pas un privilège." },
  { label: 'Excellence', desc: 'Nous visons les meilleurs standards pédagogiques haïtiens et mondiaux.' },
  { label: 'Communauté', desc: 'Construit par et pour les élèves et enseignants haïtiens.' },
];

export default function About() {
  const navigate = useNavigate();

  const stats = [
    { number: '1,000+', label: 'Active Students' },
    { number: '40+', label: 'Video Lessons' },
    { number: '200+', label: 'Practice Exercises' },
    { number: '4', label: 'Core Subjects' }
  ];

  return (
    <div className="section">
      <div className="container">

        {/* Hero */}
        <section className="about-hero">
          <span className="page-header__eyebrow">Notre mission</span>
          <h1 className="about-hero__title">Quality education for every Haitian student</h1>
          <p className="about-hero__copy">
            EdLight is building the infrastructure for accessible, high-quality STEM education
            in Haiti — structured courses, official exam practice, and real-time progress
            tracking, all in one place.
          </p>
        </section>

        {/* Stats */}
        <section className="about-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="card text-center">
              <div className="about-stats__number">{stat.number}</div>
              <div className="about-stats__label">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* Approach */}
        <section style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title" style={{ marginBottom: '1.75rem' }}>How we teach</h2>
          <div className="about-approach">
            {APPROACH_ITEMS.map((item) => (
              <div key={item.title} className="card about-approach__item">
                <div className="about-approach__icon">{item.icon}</div>
                <div>
                  <div className="about-approach__text">{item.title}</div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-500)', marginTop: '0.2rem', lineHeight: 1.55 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title" style={{ marginBottom: '1.75rem' }}>Nos valeurs</h2>
          <div className="about-values">
            {VALUES.map((v) => (
              <div key={v.label} className="card about-values__item">
                <h3 className="about-values__title">{v.label}</h3>
                <p className="about-values__desc">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Team */}
        <section className="about-team" style={{ marginBottom: 'clamp(2.5rem, 6vw, 4rem)' }}>
          <h2 className="section__title">Our Team</h2>
          <p className="text-muted about-team__copy">
            We are a dedicated team of Haitian teachers, educators, and engineers united
            by one belief: every student deserves a world-class learning experience,
            regardless of where they live.
          </p>
        </section>

        {/* CTA */}
        <section className="card about-cta text-center">
          <h2 className="section__title">Prêt à commencer ?</h2>
          <p className="text-muted" style={{ marginTop: '0.5rem', marginBottom: '1.5rem', fontSize: '1rem' }}>
            Rejoignez plus de 1 000 élèves qui apprennent avec EdLight Academy.
          </p>
          <button
            className="button button--primary button--pill"
            onClick={() => navigate('/courses')}
          >
            Explorer les cours
          </button>
        </section>

      </div>
    </div>
  );
}
