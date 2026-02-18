import React from 'react';
import { Link } from 'react-router-dom';
import './ExamLanding.css';

const ExamLanding = () => {
  return (
    <div className="exam-landing-container">
      <header className="exam-landing-header">
        <h1>Bienvenue aux Examens</h1>
        <p>Choisissez votre niveau pour commencer</p>
      </header>
      <div className="level-selection-container">
        <Link to="/exams/9e" className="level-card">
          <div className="level-card-content">
            <h2>9e Année</h2>
            <p>Examens pour la 9e année fondamentale.</p>
          </div>
        </Link>
        <Link to="/exams/terminale" className="level-card">
          <div className="level-card-content">
            <h2>Terminale</h2>
            <p>Examens de baccalauréat pour les classes de Terminale.</p>
          </div>
        </Link>
        <Link to="/exams/university" className="level-card">
          <div className="level-card-content">
            <h2>Université</h2>
            <p>Concours d'admission et autres examens universitaires.</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default ExamLanding;
