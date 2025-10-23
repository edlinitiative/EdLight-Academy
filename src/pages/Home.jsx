import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../hooks/useData';
import useStore from '../contexts/store';

export default function Home() {
  const navigate = useNavigate();
  const { data, isLoading } = useAppData();
  const { toggleAuthModal, isAuthenticated } = useStore();
  const [heroSrc, setHeroSrc] = useState('/assets/student-hero.jpg');
  
  // Home is a static, single-screen hero. No course listing here.

  if (isLoading) {
    return (
      <section className="section">
        <div className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
          <div className="loading-spinner" />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="hero hero--full">
        <div className="container grid grid--hero">
          <div className="hero__content">
            <span className="hero__badge">Physics · Chemistry · Mathematics · Economics</span>
            <h1 className="hero__title">Learn with <span>EdLight Academy</span></h1>
            <p className="hero__description">
              World-class courses, practice problems, and interactive quizzes — designed specifically for Haitian students to excel in academics and beyond.
            </p>

            <div className="hero__actions">
              <button 
                className="button button--primary button--pill"
                onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}
              >
                Start Learning
              </button>
              <button 
                className="button button--ghost button--pill"
                onClick={() => navigate('/courses')}
              >
                Browse Courses
              </button>
            </div>

            <div className="hero-card">
              <div className="hero-card__header">
                <span className="hero-card__badge">Live Academy Snapshot</span>
                <span className="chip chip--success">92% mastery rate</span>
              </div>
              <div className="hero-card__metric">
                <div className="hero-card__metric-item">
                  <h4>1,200+</h4>
                  <p>Active learners this term</p>
                </div>
                <div className="hero-card__metric-item">
                  <h4>200+</h4>
                  <p>Micro-quizzes to check understanding</p>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <img
              className="hero-visual__image"
              src={heroSrc}
              alt="High school student learning on a laptop"
              loading="eager"
              onError={(e) => {
                if (heroSrc !== '/assets/student-hero.svg') {
                  setHeroSrc('/assets/student-hero.svg');
                }
              }}
            />
            <div className="hero-visual__grid" style={{ marginTop: '1rem' }}>
              <div className="hero-visual__row">
                <span>Guided Learning Paths</span>
                <small>Structured units that mirror the Haitian curriculum.</small>
              </div>
              <div className="hero-visual__row">
                <span>Dual-Language Support</span>
                <small>Content in English with context for Kreyòl and French classrooms.</small>
              </div>
              <div className="hero-visual__row">
                <span>Real-Time Progress</span>
                <small>Track mastery across every lesson and quiz attempt.</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured courses section removed to prevent scrolling on home */}
    </>
  );
}