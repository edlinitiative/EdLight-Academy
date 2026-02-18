import React from 'react';
import { Link } from 'react-router-dom';
import './ExamLanding.css';

const LEVELS = [
  {
    to: '/exams/9e',
    icon: '📚',
    heading: '9e Année',
    desc: 'Examens officiels pour la 9ème année fondamentale. Annales complètes avec corrections détaillées.',
    badge: 'Fondamental',
    color: '#0A66C2',
  },
  {
    to: '/exams/terminale',
    icon: '🎓',
    heading: 'Terminale',
    desc: 'Examens du baccalauréat haïtien. Toutes les matières, toutes les sessions — avec auto-correction intégrée.',
    badge: 'Baccalauréat',
    color: '#7c3aed',
  },
  {
    to: '/exams/university',
    icon: '🏛️',
    heading: 'Université',
    desc: "Concours d'admission et examens universitaires pour préparer vos études supérieures avec confiance.",
    badge: 'Supérieur',
    color: '#0891b2',
  },
];

const ExamLanding = () => {
  return (
    <div className="exam-landing">
      <header className="exam-landing__header">
        <span className="exam-landing__eyebrow">🎓 Examens Officiels MENFP</span>
        <h1 className="exam-landing__title">Choisissez votre niveau</h1>
        <p className="exam-landing__subtitle">
          Accédez à la banque d'examens officiels haïtiens avec corrections automatiques
          et suivi de votre progression.
        </p>
      </header>

      <div className="exam-landing__grid">
        {LEVELS.map((level) => (
          <Link
            key={level.to}
            to={level.to}
            className="level-card"
            style={{ '--level-color': level.color }}
          >
            <div className="level-card__accent" />
            <div className="level-card__body">
              <div className="level-card__icon">{level.icon}</div>
              <h2 className="level-card__heading">{level.heading}</h2>
              <p className="level-card__desc">{level.desc}</p>
            </div>
            <div className="level-card__footer">
              <span className="level-card__cta">Explorer →</span>
              <span className="level-card__badge">{level.badge}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ExamLanding;
