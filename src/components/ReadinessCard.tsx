/**
 * ReadinessCard — the flagship "Exam Readiness Score"
 * ───────────────────────────────────────────────────
 * One number parents, students and schools all understand. Shows the overall
 * coefficient-weighted score as a horizontal segmented gauge, a per-subject
 * breakdown (sorted by Bac weight), and a single "focus this week" tip.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Lightbulb, TrendingUp, ClipboardList, ChevronDown } from 'lucide-react';
import useStore from '../contexts/store';
import { useReadiness } from '../hooks/useReadiness';
import { localizeSubject } from '../utils/localizeSubject';
import './ReadinessCard.css';

const SEG_COUNT = 20;

// Semantic tone for a 0–100 figure: ≥70 good, ≥60 warn, else crit.
const toneVar = (pct: number) =>
  pct >= 70
    ? 'var(--st-good, #157f43)'
    : pct >= 60
      ? 'var(--st-warn, #bd6f0f)'
      : 'var(--st-crit, #c93434)';

// Map readiness band tones to the warm semantic tokens.
const BAND_TONE_VAR: Record<string, string> = {
  danger: 'var(--st-crit, #c93434)',
  warning: 'var(--st-warn, #bd6f0f)',
  caution: 'var(--st-warn, #bd6f0f)',
  good: 'var(--st-good, #157f43)',
  excellent: 'var(--st-good, #157f43)',
};

// Short mono chip code from a localized subject name (letters only, 4 chars).
const subjectCode = (name: string) =>
  (name || '').replace(/[^\p{L}]/gu, '').slice(0, 4).toUpperCase() || '···';

export default function ReadinessCard({ collapsedCount = 4 }) {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const [expanded, setExpanded] = useState(false);

  const {
    overall,
    hasData,
    band,
    subjects,
    focus,
    strongest,
    isLoading,
    track,
    subjectsWithData,
    subjectsTracked,
    totalAttempts,
  } = useReadiness();

  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  if (isLoading) {
    return (
      <div className="readiness-card readiness-card--loading">
        <div className="readiness-card__body">
          <div className="skeleton" style={{ height: 34, width: '45%', marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 13, width: '100%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 10, width: '70%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '85%' }} />
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
          <button className="button button--primary" onClick={() => navigate('/exams')}>
            {t('Choisir ma filière', 'Chwazi filyè m')}
          </button>
        </div>
      </div>
    );
  }

  const hiddenCount = Math.max(0, subjects.length - collapsedCount);
  const shownSubjects = expanded ? subjects : subjects.slice(0, collapsedCount);

  // Segmented gauge: fill cells up to overall%, the leading edge takes a
  // semantic tone so the bar reads its own health at a glance.
  const filled = hasData ? Math.min(SEG_COUNT, Math.ceil((overall / 100) * SEG_COUNT)) : 0;
  const leadColor = toneVar(overall);

  const statusColor = hasData
    ? (BAND_TONE_VAR[band.tone] || 'var(--st-accent, #0857a6)')
    : 'var(--st-muted, #746a59)';
  const statusLabel = hasData
    ? (isCreole ? band.labelHt : band.label)
    : t('Pas encore de score', 'Poko gen nòt');

  return (
    <div className="readiness-card" data-tone={band.tone}>
      <div className="readiness-card__header">
        <span className="readiness-card__eyebrow">
          <Target size={15} /> {t('Préparation au Bac', 'Preparasyon Bak')}
        </span>
        {strongest && hasData && (
          <span className="readiness-card__strong" title={t('Votre point fort', 'Pwen fò ou')}>
            <TrendingUp size={13} /> {localizeSubject(strongest.subject, language)}{' '}
            <span className="num">{strongest.pct}%</span>
          </span>
        )}
      </div>

      {/* ── Segmented readiness gauge ── */}
      <div className="readiness-gauge">
        <div className="readiness-gauge__head">
          <div className="readiness-gauge__value num">
            {hasData ? overall : '—'}
            <small>{t('% prêt', '% pare')}</small>
          </div>
          <span className="readiness-gauge__status" style={{ color: statusColor }}>
            <span className="readiness-gauge__status-dot" style={{ background: statusColor }} />
            {statusLabel}
          </span>
        </div>

        <div
          className="readiness-gauge__seg"
          role="img"
          aria-label={t(`Score de préparation ${overall} pour cent`, `Nòt preparasyon ${overall} pou san`)}
        >
          {Array.from({ length: SEG_COUNT }).map((_, i) => {
            const on = i < filled;
            const isLead = on && i === filled - 1;
            return (
              <span
                key={i}
                className={`readiness-gauge__cell${on ? ' is-on' : ''}${isLead ? ' is-lead' : ''}`}
                style={on ? { background: isLead ? leadColor : 'var(--st-accent, #0857a6)' } : undefined}
              />
            );
          })}
        </div>

        {hasData && (
          <div className="readiness-gauge__foot">
            <span className="readiness-gauge__foot-label">
              <span className="num">{subjectsWithData}/{subjectsTracked}</span>{' '}
              {t('matières évaluées', 'matyè evalye')}
            </span>
            <span className="readiness-gauge__foot-label">
              <span className="num">{totalAttempts}</span>{' '}
              {t('évaluations', 'evalyasyon')}
            </span>
          </div>
        )}
      </div>

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

      {hasData ? (
        <div className="readiness-card__subjects">
          {shownSubjects.map((s) => {
            const pctColor = s.hasData ? toneVar(s.pct) : 'var(--st-line-strong, rgba(64,50,26,0.22))';
            const localized = localizeSubject(s.subject, language);
            return (
              <div className="readiness-subject" key={s.subject}>
                <div className="readiness-subject__head">
                  <span className="readiness-subject__code">{subjectCode(localized)}</span>
                  <span className="readiness-subject__name">{localized}</span>
                  <span className="readiness-subject__coeff" title={t('Coefficient', 'Koyefisyan')}>
                    ×{s.coeff}
                  </span>
                  <span className="readiness-subject__pct num" style={{ color: pctColor }}>
                    {s.hasData ? `${s.pct}%` : '—'}
                  </span>
                </div>
                <div className="readiness-subject__bar">
                  <span
                    className="readiness-subject__fill"
                    style={{ width: `${s.hasData ? s.pct : 0}%`, background: pctColor }}
                  />
                </div>
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="readiness-subjects__toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded
                ? t('Réduire', 'Rediksyon')
                : t(`Voir les ${hiddenCount} autres matières`, `Wè ${hiddenCount} lòt matyè yo`)}
              <ChevronDown
                size={14}
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>
          )}
        </div>
      ) : (
        <button className="button button--primary readiness-card__cta" onClick={() => navigate('/exams')}>
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
