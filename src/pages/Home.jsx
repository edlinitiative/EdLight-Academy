import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { useSiteStatCards } from '../hooks/useSiteStats';

export default function Home() {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated, language } = useStore();
  const isCreole = language === 'ht';
  const [heroSrc, setHeroSrc] = useState('/assets/student-hero.jpg');

  const { cards, masteryRatePercent, isLoading } = useSiteStatCards();

  // Keep the hero card layout stable: show up to 2 metrics.
  const preferredOrder = ['students', 'quizzes', 'videos', 'courses', 'exams', 'tracks'];
  const ordered = preferredOrder
    .map((k) => cards.find((c) => c.key === k))
    .filter(Boolean);
  const snapshotCards = ordered.slice(0, 2);
  const hasSnapshotCards = snapshotCards.length > 0;
  const snapshotBadge = hasSnapshotCards
    ? (isCreole ? 'Aperçu an dirèk' : 'Aperçu en direct')
    : (isCreole ? '100% pou ou' : '100% pour vous');
  
  // Home is a static, single-screen hero. No course listing here.

  return (
    <>
      <section className="hero hero--full">
        <div className="container grid grid--hero">
          <div className="hero__content">
            <span className="hero__badge">Physique · Chimie · Mathématiques · Économie</span>
            <h1 className="hero__title">
              {isCreole ? 'Aprann ak' : 'Apprenez avec'} <span>EdLight Academy</span>
            </h1>
            <p className="hero__description">
              {isCreole
                ? 'Kou kalite, egzèsis pratik, ak ti-kesyon entèaktif — fèt pou elèv ayisyen reyisi nan lekòl ak pi lwen.'
                : 'Des cours de qualité, des exercices pratiques et des quiz interactifs — conçus pour aider les élèves haïtiens à réussir à l’école et au-delà.'}
            </p>

            <div className="hero__actions">
              <button 
                className="button button--primary button--pill"
                onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}
              >
                {isCreole ? 'Kòmanse aprann' : 'Commencer'}
              </button>
              <button 
                className="button button--ghost button--pill"
                onClick={() => navigate('/courses')}
              >
                {isCreole ? 'Gade kou yo' : 'Explorer les cours'}
              </button>
            </div>

            <div className="hero-card">
              <div className="hero-card__header">
                <span className="hero-card__badge">{snapshotBadge}</span>
                {hasSnapshotCards && Number.isFinite(masteryRatePercent)
                  ? <span className="chip chip--success">{Math.round(masteryRatePercent)}% {isCreole ? 'metrize' : 'maîtrise'}</span>
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
                    <p>{isCreole ? 'Pou ou' : 'Pour vous'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <img
              className="hero-visual__image"
              src={heroSrc}
              alt={isCreole
                ? 'Elèv segondè ap aprann sou yon òdinatè'
                : 'Élève du secondaire apprenant sur un ordinateur portable'}
              loading="eager"
              onError={(e) => {
                if (heroSrc !== '/assets/student-hero.svg') {
                  setHeroSrc('/assets/student-hero.svg');
                  e.target.alt = isCreole ? 'Ilistrasyon EdLight Academy' : 'Illustration EdLight Academy';
                }
              }}
            />
            <div className="hero-visual__grid" style={{ marginTop: 0 }}>
              <div className="hero-visual__row">
                <span>{isCreole ? 'Chemen aprantisaj gide' : 'Parcours guidés'}</span>
                <small>{isCreole ? 'Inite ki byen òganize, menm jan ak pwogram Ayiti a.' : 'Des unités structurées, alignées sur le curriculum haïtien.'}</small>
              </div>
              <div className="hero-visual__row">
                <span>{isCreole ? 'Sipò 2 lang' : 'Support bilingue'}</span>
                <small>{isCreole ? 'Kontni an franse ak kreyòl pou salklas ann Ayiti.' : 'Du contenu en français et en kreyòl, adapté aux classes en Haïti.'}</small>
              </div>
              <div className="hero-visual__row">
                <span>{isCreole ? 'Pwogrè an tan reyèl' : 'Progression en temps réel'}</span>
                <small>{isCreole ? 'Swiv metrize ou pou chak leson ak chak esè quiz.' : 'Suivez votre maîtrise pour chaque leçon et chaque tentative de quiz.'}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured courses section removed to prevent scrolling on home */}
    </>
  );
}