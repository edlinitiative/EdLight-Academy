/**
 * Countdown — "days until the Bac" hero card (Structured-Technical look)
 * ─────────────────────────────────────────────────────────────────────
 * Accent-gradient card showing a large "J-{daysRemaining}" number for the
 * next upcoming national-exam session, with mono labels and a status tag.
 * Reads the session from `examSchedule` (preferred by the learner's track)
 * and navigates to that level's /exams route when clicked.
 *
 * Designed to live inside the `.dash--st` dashboard section, from which it
 * inherits the warm `--st-accent` / `--st-mono` tokens (with safe fallbacks
 * so it also renders correctly if used standalone).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getNextExamSession, preferredLevelForTrack } from '../config/examSchedule';
import useStore from '../contexts/store';
import './Countdown.css';

interface CountdownProps {
  className?: string;
}

/** "6 juillet 2026" — best-effort localized session caption from an ISO date. */
function formatSessionCaption(dateISO: string | undefined, isCreole: boolean): string | null {
  if (!dateISO) return null;
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return null;
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, d));
  } catch {
    return `${d}/${m}/${y}`;
  }
  // Note: dates read the same in FR/HT; isCreole reserved for future tuning.
}

export default function Countdown({ className }: CountdownProps) {
  const navigate = useNavigate();
  const track = useStore((s) => s.track);
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const session = getNextExamSession(preferredLevelForTrack(track));

  const rootClass = ['countdown-cd', className].filter(Boolean).join(' ');

  // Graceful fallback: no upcoming session configured.
  if (!session) {
    return (
      <button
        type="button"
        className={rootClass}
        onClick={() => navigate('/exams')}
      >
        <div className="countdown-cd__top">
          <div className="countdown-cd__eyebrow">{t('Compte à rebours', 'Kont a rebò')}</div>
          <div className="countdown-cd__big">{t('Bientôt', 'Talè')}</div>
        </div>
        <div className="countdown-cd__meta">
          <div className="countdown-cd__tag">
            <span className="countdown-cd__dot" />
            {t("Voir les annales", 'Gade ánal yo')}
          </div>
        </div>
      </button>
    );
  }

  const { daysRemaining, label, labelHt, level } = session;
  const caption = formatSessionCaption((session as { dateISO?: string }).dateISO, isCreole);

  return (
    <button
      type="button"
      className={rootClass}
      onClick={() => navigate(`/exams/${level}`)}
      aria-label={t(
        `${daysRemaining} jours avant ${label}`,
        `${daysRemaining} jou anvan ${labelHt}`,
      )}
    >
      <div className="countdown-cd__top">
        <div className="countdown-cd__eyebrow">{t('Compte à rebours', 'Kont a rebò')}</div>
        {daysRemaining === 0 ? (
          <div className="countdown-cd__big countdown-cd__big--today">
            {t("Aujourd'hui", 'Jodi a')}
          </div>
        ) : (
          <div className="countdown-cd__big">
            <span className="countdown-cd__prefix">J-</span>
            {daysRemaining}
          </div>
        )}
      </div>

      <div className="countdown-cd__meta">
        <div className="countdown-cd__label">{isCreole ? labelHt : label}</div>
        {caption && <b className="countdown-cd__caption">{t('Session', 'Sesyon')} · {caption}</b>}
        <div className="countdown-cd__tag">
          <span className="countdown-cd__dot" />
          {t("Plan d'étude à jour", 'Plan detid ajou')}
        </div>
      </div>
    </button>
  );
}
