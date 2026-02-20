import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { useSiteStatCards } from '../hooks/useSiteStats';

export default function Home() {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated } = useStore();
  const [heroSrc, setHeroSrc] = useState('/assets/student-hero.jpg');

  const { cards, masteryRatePercent, isLoading } = useSiteStatCards();

  // Keep the hero card layout stable: show up to 2 metrics.
  const preferredOrder = ['students', 'quizzes', 'videos', 'courses', 'exams', 'tracks'];
  const ordered = preferredOrder
    .map((k) => cards.find((c) => c.key === k))
    .filter(Boolean);
  const snapshotCards = ordered.slice(0, 2);
  const hasSnapshotCards = snapshotCards.length > 0;
  const snapshotBadge = hasSnapshotCards ? 'Live Academy Snapshot' : '100% for you';
  
  // Home is a static, single-screen hero. No course listing here.

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
                <span className="hero-card__badge">{snapshotBadge}</span>
                {hasSnapshotCards && Number.isFinite(masteryRatePercent)
                  ? <span className="chip chip--success">{Math.round(masteryRatePercent)}% mastery rate</span>
                  : null}
              </div>
              <div className="hero-card__metric">
                {hasSnapshotCards ? snapshotCards.map((m) => (
                  <div key={m.key} className="hero-card__metric-item">
                    <h4>{m.value}</h4>
                    <p>{m.label}</p>
                  </div>
                )) : (
                  <div className="hero-card__metric-item">
                    <h4>100%</h4>
                    <p>For you</p>
                  </div>
                )}
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
                  e.target.alt = 'EdLight Academy illustration';
                }
              }}
            />
            <div className="hero-visual__grid" style={{ marginTop: 0 }}>
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