/**
 * ReadinessCard — the flagship "Exam Readiness Score"
 * ───────────────────────────────────────────────────
 * One number parents, students and schools all understand. Shows the overall
 * coefficient-weighted score, a per-subject breakdown (sorted by Bac weight),
 * and a single "focus this week" recommendation.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Lightbulb, TrendingUp, ClipboardList } from 'lucide-react';
import useStore from '../contexts/store';
import { useReadiness } from '../hooks/useReadiness';
import { subjectColor } from '../utils/examUtils';
import { localizeSubject } from '../utils/localizeSubject';
import './ReadinessCard.css';

export default function ReadinessCard({ maxSubjects = 6 }) {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  const { overall, hasData, band, subjects, focus, strongest, isLoading, track } = useReadiness();

  const t = (fr, ht) => (isCreole ? ht : fr);

  if (isLoading) {
    return (
      <div className="readiness-card readiness-card--loading">
        <div className="skeleton readiness-card__ring-skeleton" />
        <div className="readiness-card__body">
          <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 10, width: '100%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '90%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '80%' }} />
        </div>
      </div>
    );
  }

  // No track chosen yet → invite the learner to set one (drives everything).
  if (!track) {
    return (
      <div className="readiness-card readiness-card--empty">
        <div className="readiness-card__empty-icon"><Target size={28} /></div>
        <div className="readiness-card__empty-body">
          <h3 className="readiness-card__title">{t('Score de préparation au Bac', 'Nòt preparasyon Bak')}</h3>
          <p className="text-muted">
            {t(
              'Choisissez votre filière pour activer votre score de préparation personnalisé.',
              'Chwazi filyè ou pou aktive nòt preparasyon pèsonalize ou.',
            )}
          </p>
          <button className="button button--primary button--pill" onClick={() => navigate('/exams')}>
            {t('Choisir ma filière', 'Chwazi filyè m')}
          </button>
        </div>
      </div>
    );
  }

  const shownSubjects = subjects.slice(0, maxSubjects);
  const ringColor = hasData ? band.color : '#cbd5e1';

  return (
    <div className="readiness-card" data-tone={band.tone}>
      <div className="readiness-card__header">
        <span className="readiness-card__eyebrow">
          <Target size={15} /> {t('Préparation au Bac', 'Preparasyon Bak')}
        </span>
        {strongest && hasData && (
          <span className="readiness-card__strong" title={t('Votre point fort', 'Pwen fò ou')}>
            <TrendingUp size={13} /> {localizeSubject(strongest.subject, language)} {strongest.pct}%
          </span>
        )}
      </div>

      <div className="readiness-card__main">
        <div
          className="readiness-ring"
          style={{ '--pct': `${hasData ? overall : 0}%`, '--ring-color': ringColor } as React.CSSProperties}
          role="img"
          aria-label={t(`Score de préparation ${overall}%`, `Nòt preparasyon ${overall}%`)}
        >
          <div className="readiness-ring__inner">
            <span className="readiness-ring__value">{hasData ? `${overall}` : '—'}</span>
            <span className="readiness-ring__unit">{hasData ? '%' : ''}</span>
          </div>
        </div>

        <div className="readiness-card__summary">
          <span className="readiness-card__band" style={{ color: hasData ? band.color : 'var(--text-500)' }}>
            {hasData ? (isCreole ? band.labelHt : band.label) : t('Pas encore de score', 'Poko gen nòt')}
          </span>
          <p className="readiness-card__caption text-muted">
            {hasData
              ? t(
                  'Score pondéré par les coefficients de votre filière.',
                  'Nòt ki kalkile selon koyefisyan filyè ou.',
                )
              : t(
                  'Faites un examen blanc pour générer votre score.',
                  'Fè yon egzamen blan pou jenere nòt ou.',
                )}
          </p>
        </div>
      </div>

      {hasData ? (
        <div className="readiness-card__subjects">
          {shownSubjects.map((s) => {
            const color = subjectColor(s.subject);
            return (
              <div className="readiness-subject" key={s.subject}>
                <div className="readiness-subject__head">
                  <span className="readiness-subject__name">{localizeSubject(s.subject, language)}</span>
                  <span className="readiness-subject__coeff" title={t('Coefficient', 'Koyefisyan')}>
                    ×{s.coeff}
                  </span>
                  <span className="readiness-subject__pct">
                    {s.hasData ? `${s.pct}%` : t('—', '—')}
                  </span>
                </div>
                <div className="readiness-subject__bar">
                  <span
                    className="readiness-subject__fill"
                    style={{ width: `${s.hasData ? s.pct : 0}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <button className="button button--primary button--pill readiness-card__cta" onClick={() => navigate('/exams')}>
          <ClipboardList size={16} /> {t('Commencer un examen blanc', 'Kòmanse yon egzamen blan')}
        </button>
      )}

      {focus && (
        <button
          className="readiness-focus"
          onClick={() => navigate('/study-plan')}
          type="button"
        >
          <span className="readiness-focus__icon"><Lightbulb size={16} /></span>
          <span className="readiness-focus__text">
            {focus.hasData
              ? t(
                  `Concentrez-vous sur ${localizeSubject(focus.subject, language)} cette semaine.`,
                  `Konsantre sou ${localizeSubject(focus.subject, language)} semèn sa a.`,
                )
              : t(
                  `Commencez ${localizeSubject(focus.subject, language)} — fort coefficient (×${focus.coeff}).`,
                  `Kòmanse ${localizeSubject(focus.subject, language)} — gwo koyefisyan (×${focus.coeff}).`,
                )}
          </span>
          <span className="readiness-focus__cta">→</span>
        </button>
      )}
    </div>
  );
}
