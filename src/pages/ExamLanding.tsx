import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History, PlayCircle } from 'lucide-react';
import useStore from '../contexts/store';
import { TRACKS, gradeProfile } from '../config/trackConfig';
import CardCover from '../components/CardCover';
import { levelToSlug } from '../utils/examLevels';
import './ExamLanding.css';

/** Newest local in-progress exam draft (ExamTake's synchronous mirror keys). */
function newestLocalDraft(): { examId: string; draft: any } | null {
  let best: { examId: string; draft: any } | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('edlight-exam-draft-')) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const draft = JSON.parse(raw);
      const hasProgress =
        (draft?.answers && Object.keys(draft.answers).length > 0) || (draft?.currentQ ?? 0) > 0;
      if (!hasProgress || draft?.status === 'submitted') continue;
      const ms = draft?.updated_at_ms ?? draft?.started_at_ms ?? 0;
      if (!best || ms > (best.draft?.updated_at_ms ?? best.draft?.started_at_ms ?? 0)) {
        best = { examId: k.slice('edlight-exam-draft-'.length), draft };
      }
    }
  } catch { /* localStorage unavailable */ }
  return best;
}

// Level cards are data-driven; the visible strings (heading/description/badge)
// are resolved from i18n via `key` so the whole page localizes cleanly.
const LEVELS = [
  { to: '/exams/9e', glyph: 'book', key: 'grade9', color: '#1B6FE0' },
  { to: '/exams/terminale', glyph: 'cap', key: 'terminale', color: '#7c3aed' },
  { to: '/exams/university', glyph: 'campus', key: 'university', color: '#0891b2' },
];

// gradeProfile().examLevel → the level card route, so a student's grade can
// lead with the relevant path (POSTBAC → université concours, 9e → 9ème,
// else Bac). Mirrors the mobile ExamLanding ordering.
const EXAM_LEVEL_TO_PATH = {
  baccalaureat: '/exams/terminale',
  universite: '/exams/university',
  '9eme_af': '/exams/9e',
};

const ExamLanding = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userTrack = useStore((s) => s.track);
  const grade = useStore((s) => s.grade);
  const setTrack = useStore((s) => s.setTrack);
  const setOnboardingCompleted = useStore((s) => s.setOnboardingCompleted);

  // Lead with the level that matches the student's grade so the relevant path
  // is the top card; everyone else keeps the default order. The Bac (Terminale)
  // card still carries the filière quick-pick wherever it lands.
  const myLevelPath = EXAM_LEVEL_TO_PATH[gradeProfile(grade).examLevel ?? ''] ?? null;
  const orderedLevels = myLevelPath
    ? [...LEVELS].sort((a, b) => (a.to === myLevelPath ? -1 : b.to === myLevelPath ? 1 : 0))
    : LEVELS;

  const pickTrack = (code) => {
    setTrack(code);
    setOnboardingCompleted(true);
    navigate('/exams/terminale');
  };

  // "Continue where you left off" — read once on mount (local mirror only;
  // the Dashboard already surfaces cross-device Firestore drafts).
  const [resume, setResume] = useState<{ examId: string; draft: any } | null>(null);
  useEffect(() => { setResume(newestLocalDraft()); }, []);
  const answered = resume?.draft?.answers ? Object.keys(resume.draft.answers).length : 0;

  return (
    <div className="exam-landing">
      <div className="exam-landing__toolbar">
        {resume ? (
          <button
            type="button"
            className="exam-landing__resume"
            onClick={() =>
              navigate(`/exams/${levelToSlug(resume.draft?.level)}/${resume.examId}/take`, { state: { autostart: true } })
            }
          >
            <PlayCircle size={18} aria-hidden />
            <span className="exam-landing__resume-text">
              <strong>{t('examLanding.resume')}</strong>
              <span>
                {resume.draft?.exam_title || resume.draft?.subject || ''}
                {answered > 0 ? ` · ${t('examLanding.resumeAnswered', { count: answered })}` : ''}
              </span>
            </span>
            <span aria-hidden>→</span>
          </button>
        ) : <span />}
        <Link to="/exams/resultats" className="exam-landing__history">
          <History size={16} aria-hidden /> {t('examLanding.myResults')}
        </Link>
      </div>
      <div className="exam-landing__grid">
        {orderedLevels.map((level) => {
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
