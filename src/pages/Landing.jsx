import React, { useState } from 'react';
import useStore from '../contexts/store';
import { useAppData } from '../hooks/useData';

export default function Landing() {
  const { toggleAuthModal } = useStore();
  const { data, isLoading } = useAppData();
  const [heroSrc, setHeroSrc] = useState('/assets/student-hero.jpg');

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const coursesCount = data?.courses?.length || 0;
  const quizzesCount = data?.quizzes?.length || 0;

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero__content">
          <div className="landing-hero__text">
            <h1 className="landing-hero__title">
              Welcome to <span className="landing-hero__brand">EdLight Academy</span>
            </h1>
            <p className="landing-hero__subtitle">
              World-class courses in Physics, Chemistry, Mathematics, and Economics — 
              designed specifically for Haitian students to excel in academics and beyond.
            </p>
            
            <div className="landing-hero__stats">
              <div className="landing-stat">
                <div className="landing-stat__value">{coursesCount}+</div>
                <div className="landing-stat__label">Courses</div>
              </div>
              <div className="landing-stat">
                <div className="landing-stat__value">{quizzesCount}+</div>
                <div className="landing-stat__label">Quizzes</div>
              </div>
              <div className="landing-stat">
                <div className="landing-stat__value">1,200+</div>
                <div className="landing-stat__label">Students</div>
              </div>
            </div>

            <div className="landing-hero__actions">
              <button 
                className="button button--primary button--large"
                onClick={() => {
                  toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                }}
              >
                Get Started Free
              </button>
              <button 
                className="button button--ghost button--large"
                onClick={() => toggleAuthModal()}
              >
                Sign In
              </button>
            </div>
          </div>

          <div className="landing-hero__visual">
            <img
              className="landing-hero__image"
              src={heroSrc}
              alt="Students learning"
              loading="eager"
              onError={(e) => {
                if (heroSrc !== '/assets/student-hero.svg') {
                  setHeroSrc('/assets/student-hero.svg');
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features">
        <h2 className="landing-features__title">Why Choose EdLight Academy?</h2>
        
        <div className="landing-features__grid">
          <div className="landing-feature">
            <div className="landing-feature__icon">📚</div>
            <h3 className="landing-feature__title">Comprehensive Curriculum</h3>
            <p className="landing-feature__description">
              Structured courses aligned with the Haitian educational system, from NS I to NS IV.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">🎯</div>
            <h3 className="landing-feature__title">Practice Quizzes</h3>
            <p className="landing-feature__description">
              Test your knowledge with hundreds of practice questions and instant feedback.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">📊</div>
            <h3 className="landing-feature__title">Track Progress</h3>
            <p className="landing-feature__description">
              Monitor your learning journey with detailed progress tracking and analytics.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">🌍</div>
            <h3 className="landing-feature__title">Dual Language</h3>
            <p className="landing-feature__description">
              Content in English with support for Kreyòl and French learners.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">⚡</div>
            <h3 className="landing-feature__title">Learn Anywhere</h3>
            <p className="landing-feature__description">
              Access your courses on any device - desktop, tablet, or mobile.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">🏆</div>
            <h3 className="landing-feature__title">Earn Badges</h3>
            <p className="landing-feature__description">
              Stay motivated with achievement badges and progress milestones.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <h2 className="landing-cta__title">Ready to Start Learning?</h2>
        <p className="landing-cta__description">
          Join thousands of students already learning with EdLight Academy
        </p>
        <button 
          className="button button--primary button--large"
          onClick={() => {
            toggleAuthModal();
            useStore.getState().setActiveTab('signup');
          }}
        >
          Create Your Free Account
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p className="landing-footer__text">
          © {new Date().getFullYear()} EdLight Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

