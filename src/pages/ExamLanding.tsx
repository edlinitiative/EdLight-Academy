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
    desc: 'Examens du baccalauréat haïtien, toutes les sessions, avec auto-correction intégrée.',
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
      <div className="exam-landing__grid">
        {LEVELS.map((level) => {
          // The Terminale (Baccalauréat) card embeds the filière quick-pick so the
          // whole "choose your level / choose your série" flow fits one screen
          // without a separate section forcing the page to scroll.
          if (level.to === '/exams/terminale') {
            return (
              <div
                key={level.to}
                className="level-card level-card--bac"
                style={{ '--level-color': level.color }}
              >
                <Link to={level.to} className="level-card__link">
                  <CardCover className="level-card__cover" glyph={level.glyph} color={level.color} />
                  <div className="level-card__body">
                    <h2 className="level-card__heading">{level.heading}</h2>
                  </div>
                </Link>

                <div className="level-card__tracks" aria-label="Choisir votre filière du Baccalauréat">
                  <span className="level-card__tracks-label">Choisissez votre filière</span>
                  <div className="level-card__chips">
                    {TRACKS.map((t) => {
                      const active = userTrack === t.code;
                      return (
                        <button
                          key={t.code}
                          type="button"
                          className={`bac-chip ${active ? 'bac-chip--active' : ''}`}
                          style={{ '--track-color': t.color }}
                          onClick={() => pickTrack(t.code)}
                          aria-pressed={active}
                          title={t.label}
                        >
                          {t.shortLabel}
                          {active && <span className="bac-chip__check" aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="level-card__footer">
                  <Link to={level.to} className="level-card__cta">Explorer →</Link>
                  <span className="level-card__badge">{level.badge}</span>
                </div>
              </div>
            );
          }

          return (
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
          );
        })}
      </div>
    </div>
  );
};

export default ExamLanding;
