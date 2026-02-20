import React from 'react';
import { Link } from 'react-router-dom';
import './ExamLanding.css';

const IconBook = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="10" y1="8" x2="16" y2="8"/>
    <line x1="10" y1="12" x2="14" y2="12"/>
  </svg>
);

const IconGradCap = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c0 1.657 2.686 3 6 3s6-1.343 6-3v-5"/>
  </svg>
);

const IconUniversity = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="10" width="2" height="9"/>
    <rect x="7" y="10" width="2" height="9"/>
    <rect x="11" y="10" width="2" height="9"/>
    <rect x="15" y="10" width="2" height="9"/>
    <rect x="19" y="10" width="2" height="9"/>
    <path d="M2 19h20"/>
    <path d="M12 2L2 10h20z"/>
  </svg>
);

const LEVELS = [
  {
    to: '/exams/9e',
    Icon: IconBook,
    heading: '9e Année',
    desc: 'Examens officiels pour la 9ème année fondamentale. Annales complètes avec corrections détaillées.',
    badge: 'Fondamental',
    color: '#0A66C2',
  },
  {
    to: '/exams/terminale',
    Icon: IconGradCap,
    heading: 'Terminale',
    desc: 'Examens du baccalauréat haïtien. Toutes les matières, toutes les sessions — avec auto-correction intégrée.',
    badge: 'Baccalauréat',
    color: '#7c3aed',
  },
  {
    to: '/exams/university',
    Icon: IconUniversity,
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
        <span className="exam-landing__eyebrow">Examens Officiels MENFP</span>
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
              <div className="level-card__icon"><level.Icon /></div>
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
