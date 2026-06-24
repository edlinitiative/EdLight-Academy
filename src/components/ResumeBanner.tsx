import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History, Play, X } from 'lucide-react';
import useStore from '../contexts/store';

/**
 * "Reprendre où vous étiez" — surfaces the learner's most recent resumable
 * point (a lesson or an in-progress mock exam) so they can jump straight back
 * in from the landing page. Renders nothing when there's no saved activity.
 */
export default function ResumeBanner() {
  const { t } = useTranslation();
  const lastActivity = useStore((s) => s.lastActivity);
  const clearActivity = useStore((s) => s.clearActivity);

  if (!lastActivity?.path || !lastActivity?.title) return null;

  const badge =
    lastActivity.type === 'exam'
      ? t('resume.examBadge')
      : lastActivity.type === 'quiz'
      ? t('resume.quizBadge')
      : t('resume.lessonBadge');

  return (
    <div className="resume-banner" role="region" aria-label={t('resume.title')}>
      <div className="resume-banner__icon" aria-hidden="true">
        <History size={20} />
      </div>
      <div className="resume-banner__body">
        <p className="resume-banner__eyebrow">{t('resume.title')}</p>
        <p className="resume-banner__title">
          <span className="resume-banner__badge">{badge}</span>
          <span className="resume-banner__name">{lastActivity.title}</span>
        </p>
        {lastActivity.subtitle ? (
          <p className="resume-banner__subtitle">{lastActivity.subtitle}</p>
        ) : null}
      </div>
      <div className="resume-banner__actions">
        <Link className="button button--primary resume-banner__cta" to={lastActivity.path}>
          <Play size={15} aria-hidden="true" />
          {t('resume.cta')}
        </Link>
        <button
          type="button"
          className="resume-banner__dismiss"
          onClick={clearActivity}
          aria-label={t('resume.dismiss')}
          title={t('resume.dismiss')}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
