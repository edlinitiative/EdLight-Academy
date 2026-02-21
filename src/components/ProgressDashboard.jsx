import React from 'react';
import { useAllProgress } from '../hooks/useProgress';
import { calculateCompletionPercentage } from '../hooks/useProgress';
import useStore from '../contexts/store';

export default function ProgressDashboard() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const { progress: allProgress, loading } = useAllProgress();

  if (loading) {
    return (
      <div className="card">
        <p className="text-muted">{isCreole ? 'Ap chaje pwogrè…' : 'Chargement de la progression…'}</p>
      </div>
    );
  }

  if (!allProgress || allProgress.length === 0) {
    return (
      <div className="card">
        <h3>{isCreole ? 'Pwogrè ou' : 'Votre progression'}</h3>
        <p className="text-muted">{isCreole ? 'Kòmanse aprann pou suiv pwogrè ou!' : 'Commencez à apprendre pour suivre votre progression !'}</p>
      </div>
    );
  }

  // Calculate total stats across all courses
  const totalPoints = allProgress.reduce((sum, p) => sum + (p.totalPoints || 0), 0);
  const allBadges = allProgress.flatMap(p => p.badges || []);
  const uniqueBadges = [...new Set(allBadges)];
  const maxStreak = Math.max(...allProgress.map(p => p.longestStreak || 0), 0);
  const currentStreak = allProgress[0]?.currentStreak || 0; // Most recent course streak

  return (
    <div className="progress-dashboard">
      <div className="progress-dashboard__header">
        <h2>{isCreole ? 'Vwayaj aprantisaj ou' : 'Votre parcours d’apprentissage'}</h2>
        <p className="text-muted">{isCreole ? 'Swiv reyalizasyon ak pwogrè ou' : 'Suivez vos réussites et votre progression'}</p>
      </div>

      <div className="progress-dashboard__stats">
        <div className="stat-card">
          <div className="stat-card__icon">🎯</div>
          <div className="stat-card__value">{totalPoints}</div>
          <div className="stat-card__label">{isCreole ? 'Total pwen' : 'Points totaux'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">🏆</div>
          <div className="stat-card__value">{uniqueBadges.length}</div>
          <div className="stat-card__label">{isCreole ? 'Badj ou genyen' : 'Badges obtenus'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">🔥</div>
          <div className="stat-card__value">{currentStreak}</div>
          <div className="stat-card__label">{isCreole ? 'Seri jou' : 'Série de jours'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">📚</div>
          <div className="stat-card__value">{allProgress.length}</div>
          <div className="stat-card__label">{isCreole ? 'Kou aktif' : 'Cours actifs'}</div>
        </div>
      </div>

      <div className="progress-dashboard__badges">
        <h3>{isCreole ? 'Dènye reyalizasyon' : 'Réussites récentes'}</h3>
        {uniqueBadges.length > 0 ? (
          <div className="badge-grid">
            {uniqueBadges.slice(0, 6).map((badge) => (
              <div key={badge} className="achievement-badge">
                <div className="achievement-badge__icon">
                  {getBadgeIcon(badge)}
                </div>
                <div className="achievement-badge__name">
                  {getBadgeName(badge, language)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">{isCreole ? 'Fè quiz ak leson pou ranmase badj!' : 'Terminez des quiz et des leçons pour gagner des badges !'}</p>
        )}
      </div>

      <div className="progress-dashboard__courses">
        <h3>{isCreole ? 'Pwogrè pa kou' : 'Progression par cours'}</h3>
        <div className="course-progress-list">
          {allProgress.map((progress) => {
            const completedCount = progress.completedLessons?.length || 0;
            // Note: We'd need total lesson count from course data for accurate percentage
            // For now, show completed count
            return (
              <div key={progress.courseId} className="course-progress-item">
                <div className="course-progress-item__header">
                  <span className="course-progress-item__name">{progress.courseId}</span>
                  <span className="course-progress-item__points">{progress.totalPoints || 0} pts</span>
                </div>
                <div className="course-progress-item__stats">
                  <span className="text-muted">{isCreole ? `${completedCount} leson fini` : `${completedCount} leçons terminées`}</span>
                  {progress.currentStreak > 0 && (
                    <span className="course-progress-item__streak">🔥 {progress.currentStreak} {isCreole ? 'jou' : 'jours'}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper functions for badge display
function getBadgeIcon(badgeId) {
  const icons = {
    first_lesson: '🎓',
    quiz_enthusiast: '📝',
    perfectionist: '💯',
    point_collector: '💎',
    week_streak: '🔥',
    month_streak: '⚡',
    legend_streak: '👑',
  };
  return icons[badgeId] || '🏅';
}

function getBadgeName(badgeId, language) {
  const isCreole = language === 'ht';

  const namesFr = {
    first_lesson: 'Première leçon',
    quiz_enthusiast: 'Passionné de quiz',
    perfectionist: 'Perfectionniste',
    point_collector: 'Collectionneur de points',
    week_streak: 'Série de 7 jours',
    month_streak: 'Série de 30 jours',
    legend_streak: 'Série de 100 jours',
  };

  const namesHt = {
    first_lesson: 'Premye leson',
    quiz_enthusiast: 'Moun ki renmen quiz',
    perfectionist: 'Pèfeksyonis',
    point_collector: 'Ranmase pwen',
    week_streak: 'Seri 7 jou',
    month_streak: 'Seri 30 jou',
    legend_streak: 'Seri 100 jou',
  };

  const label = (isCreole ? namesHt : namesFr)[badgeId];
  return label || badgeId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
