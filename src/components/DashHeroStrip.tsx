/**
 * DashHeroStrip — the countdown and the readiness score as ONE compact line.
 *
 * The dashboard used to open with two full cards, <ReadinessCard /> and
 * <Countdown />, side by side. Shrinking their padding and type was not enough:
 * a card is a card, and two of them still owned the first screen while the work
 * a student actually came for — Cours, Quiz, Examens, the study plan — started
 * below the fold. This replaces both with a single strip roughly the height of
 * one line of text.
 *
 * It carries the two numbers that earned their place, and nothing else:
 *   · how many days until the next exam session
 *   · the readiness score, when there is enough data to have one
 *
 * Everything the cards showed beyond that — the per-subject breakdown, the
 * strongest/focus subjects, the segmented gauge, the session date — still
 * exists on the pages that own it. The strip links there rather than
 * reproducing it.
 *
 * Both source components are still used elsewhere (ReadinessCard on Profile),
 * so neither was deleted. This reuses their data sources — `useReadiness()` and
 * `getNextExamSession()` — rather than recomputing anything, so the strip and
 * the full cards can never disagree.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { gradeProfile } from '../config/trackConfig';
import { getNextExamSession, preferredLevelForTrack } from '../config/examSchedule';
import { useReadiness } from '../hooks/useReadiness';
import './DashHeroStrip.css';

export default function DashHeroStrip() {
  const navigate = useNavigate();
  const grade = useStore((s) => s.grade);
  const track = useStore((s) => s.track);
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Hooks first, unconditionally, so hook order stays stable across renders —
  // the same reason ReadinessCard places its early return below its hooks.
  const { overall, hasData, band } = useReadiness();

  const session = getNextExamSession(preferredLevelForTrack(track));

  // The readiness score is a Bac concept. For 7e–8e / NS1–3 / 9e / préfac it is
  // noise, exactly as ReadinessCard decides for itself.
  const isBacTrack = gradeProfile(grade).examLevel === 'baccalaureat';
  const showScore = isBacTrack && hasData;

  // Nothing to say: no upcoming session AND no score. Render nothing rather
  // than an empty strip — a bar that says "—" is worse than no bar.
  if (!session && !showScore) return null;

  const days = session?.daysRemaining;
  const sessionLabel = session ? (isCreole ? session.labelHt : session.label) : null;
  const bandLabel = band ? (isCreole ? band.labelHt : band.label) : null;

  return (
    <button
      type="button"
      className="dash-strip"
      onClick={() => navigate(session ? '/exams' : '/quizzes')}
      aria-label={
        session
          ? t(
              `${days} jours avant ${sessionLabel}. Voir les examens.`,
              `${days} jou anvan ${sessionLabel}. Gade egzamen yo.`
            )
          : t('Voir votre préparation', 'Gade preparasyon ou')
      }
    >
      <CalendarClock size={16} className="dash-strip__icon" aria-hidden="true" />

      {session && (
        <span className="dash-strip__item">
          <strong className="dash-strip__value">
            {days === 0 ? t("Aujourd'hui", 'Jodi a') : `J-${days}`}
          </strong>
          <span className="dash-strip__label">{sessionLabel}</span>
        </span>
      )}

      {session && showScore && <span className="dash-strip__sep" aria-hidden="true" />}

      {showScore && (
        <span className="dash-strip__item">
          <strong className="dash-strip__value">{overall}%</strong>
          <span className="dash-strip__label">
            {t('préparation', 'preparasyon')}
            {bandLabel ? ` · ${bandLabel}` : ''}
          </span>
        </span>
      )}

      <ChevronRight size={16} className="dash-strip__chevron" aria-hidden="true" />
    </button>
  );
}
