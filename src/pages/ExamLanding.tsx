import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useStore from '../contexts/store';
import { TRACKS } from '../config/trackConfig';
import CardCover from '../components/CardCover';
import './ExamLanding.css';

const LEVELS = [
  {
    to: '/exams/9e',
    glyph: 'book',
    heading: '9e Année',
    desc: 'Examens officiels pour la 9ème année fondamentale. Annales complètes avec corrections détaillées.',
    badge: 'Fondamental',
    color: '#0A66C2',
  },
  {
    to: '/exams/terminale',
    glyph: 'cap',
    heading: 'Terminale',
    desc: 'Examens du baccalauréat haïtien. Toutes les matières, toutes les sessions, avec auto-correction intégrée.',
    badge: 'Baccalauréat',
    color: '#7c3aed',
  },
  {
    to: '/exams/university',
    glyph: 'campus',
    heading: 'Université',
    desc: "Concours d'admission et examens universitaires pour préparer vos études supérieures avec confiance.",
    badge: 'Supérieur',
    color: '#0891b2',
  },
];

const ExamLanding = () => {
  const navigate = useNavigate();
  const userTrack = useStore((s) => s.track);
  const setTrack = useStore((s) => s.setTrack);
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);

  const pickTrack = (code) => {
    setTrack(code);
    setOnboardingCompleted(true);
    navigate('/exams/terminale');
  };

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
            <CardCover className="level-card__cover" glyph={level.glyph} color={level.color} />
            <div className="level-card__body">
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

      {/* Filière quick-pick — sets the Bac track so scores are coefficient-weighted */}
      <section className="track-pick" aria-label="Choisir votre filière du Baccalauréat">
        <div className="track-pick__head">
          <h2 className="track-pick__title">Vous préparez le Baccalauréat ?</h2>
          <p className="track-pick__subtitle">
            Choisissez votre filière pour des examens ciblés et des scores pondérés
            selon les coefficients officiels.
          </p>
        </div>
        <div className="track-pick__grid">
          {TRACKS.map((t) => {
            const active = userTrack === t.code;
            return (
              <button
                key={t.code}
                type="button"
                className={`track-pick__card ${active ? 'track-pick__card--active' : ''}`}
                style={{ '--track-color': t.color }}
                onClick={() => pickTrack(t.code)}
                aria-pressed={active}
              >
                <CardCover className="track-pick__cover" glyph={t.glyph} color={t.color} />
                <span className="track-pick__body">
                  <span className="track-pick__label">{t.shortLabel}</span>
                  <span className="track-pick__desc">{t.description}</span>
                  {active && <span className="track-pick__current">Votre filière ✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default ExamLanding;
