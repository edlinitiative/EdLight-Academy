import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useStore from '../contexts/store';
import { TRACKS } from '../config/trackConfig';
import CardCover from '../components/CardCover';
import './ExamLanding.css';

// Level cards are data-driven; the visible strings (heading/description/badge)
// are resolved from i18n via `key` so the whole page localizes cleanly.
const LEVELS = [
  { to: '/exams/9e', glyph: 'book', key: 'grade9', color: '#0A66C2' },
  { to: '/exams/terminale', glyph: 'cap', key: 'terminale', color: '#7c3aed' },
  { to: '/exams/university', glyph: 'campus', key: 'university', color: '#0891b2' },
];

const ExamLanding = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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
          const heading = t(`examLanding.${level.key}Heading`);
          const desc = t(`examLanding.${level.key}Desc`);
          const badge = t(`examLanding.${level.key}Badge`);

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
                    <h2 className="level-card__heading">{heading}</h2>
                  </div>
                </Link>

                <div className="level-card__tracks" aria-label={t('examLanding.chooseTrackAria')}>
                  <span className="level-card__tracks-label">{t('examLanding.chooseTrack')}</span>
                  <div className="level-card__chips">
                    {TRACKS.map((track) => {
                      const active = userTrack === track.code;
                      return (
                        <button
                          key={track.code}
                          type="button"
                          className={`bac-chip ${active ? 'bac-chip--active' : ''}`}
                          style={{ '--track-color': track.color }}
                          onClick={() => pickTrack(track.code)}
                          aria-pressed={active}
                          title={track.label}
                        >
                          {track.shortLabel}
                          {active && <span className="bac-chip__check" aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="level-card__footer">
                  <Link to={level.to} className="level-card__cta">{t('examLanding.explore')} →</Link>
                  <span className="level-card__badge">{badge}</span>
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
                <h2 className="level-card__heading">{heading}</h2>
                <p className="level-card__desc">{desc}</p>
              </div>
              <div className="level-card__footer">
                <span className="level-card__cta">{t('examLanding.explore')} →</span>
                <span className="level-card__badge">{badge}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default ExamLanding;
