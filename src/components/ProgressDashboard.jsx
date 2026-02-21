import React from 'react';
import { useAllProgress } from '../hooks/useProgress';
import { calculateCompletionPercentage } from '../hooks/useProgress';

export default function ProgressDashboard() {
  const { progress: allProgress, loading } = useAllProgress();

  if (loading) {
    return (
      <div className="card">
        <p className="text-muted">Loading progress...</p>
      </div>
    );
  }

  if (!allProgress || allProgress.length === 0) {
    return (
      <div className="card">
        <h3>Your Progress</h3>
        <p className="text-muted">Start learning to track your progress!</p>
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
        <h2>Your Learning Journey</h2>
        <p className="text-muted">Track your achievements and progress</p>
      </div>

      <div className="progress-dashboard__stats">
        <div className="stat-card">
          <div className="stat-card__icon">🎯</div>
          <div className="stat-card__value">{totalPoints}</div>
          <div className="stat-card__label">Total Points</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">🏆</div>
          <div className="stat-card__value">{uniqueBadges.length}</div>
          <div className="stat-card__label">Badges Earned</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">🔥</div>
          <div className="stat-card__value">{currentStreak}</div>
          <div className="stat-card__label">Day Streak</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon">📚</div>
          <div className="stat-card__value">{allProgress.length}</div>
          <div className="stat-card__label">Active Courses</div>
        </div>
      </div>

      <div className="progress-dashboard__badges">
        <h3>Recent Achievements</h3>
        {uniqueBadges.length > 0 ? (
          <div className="badge-grid">
            {uniqueBadges.slice(0, 6).map((badge) => (
              <div key={badge} className="achievement-badge">
                <div className="achievement-badge__icon">
                  {getBadgeIcon(badge)}
                </div>
                <div className="achievement-badge__name">
                  {getBadgeName(badge)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">Complete quizzes and lessons to earn badges!</p>
        )}
      </div>

      <div className="progress-dashboard__courses">
        <h3>Course Progress</h3>
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
                  <span className="text-muted">{completedCount} lessons completed</span>
                  {progress.currentStreak > 0 && (
                    <span className="course-progress-item__streak">🔥 {progress.currentStreak} day streak</span>
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

function getBadgeName(badgeId) {
  const names = {
    first_lesson: 'First Lesson',
    quiz_enthusiast: 'Quiz Enthusiast',
    perfectionist: 'Perfectionist',
    point_collector: 'Point Collector',
    week_streak: '7 Day Streak',
    month_streak: '30 Day Streak',
    legend_streak: '100 Day Streak',
  };
  return names[badgeId] || badgeId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
