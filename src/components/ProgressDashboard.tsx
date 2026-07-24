import React from 'react';
import { Target, Trophy, Flame, BookOpen, GraduationCap, PenLine, Award, Gem, Zap, Crown, Medal } from 'lucide-react';
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
        <p className="text-muted">{isCreole ? 'Kòmanse aprann pou swiv pwogrè ou!' : 'Commencez à apprendre pour suivre votre progression !'}</p>
      </div>
    );
  }

  // Calculate total stats across all courses
  const totalPoints = allProgress.reduce((sum, p) => sum + (p.totalPoints || 0), 0);
  const allBadges = allProgress.flatMap(p => p.badges || []);
  const uniqueBadges = [...new Set(allBadges)];
  const currentStreak = allProgress[0]?.currentStreak || 0; // Most recent course streak

  // Turn a raw course id like "CHEM-NSI" into a readable "Chimie · NS I" label,
  // instead of showing the internal id to the learner.
  const SUBJECT_FR: Record<string, string> = {
    CHEM: isCreole ? 'Chimi' : 'Chimie',
    PHYS: isCreole ? 'Fizik' : 'Physique',
    MATH: isCreole ? 'Matematik' : 'Mathématiques',
    ECON: isCreole ? 'Ekonomi' : 'Économie',
    BIO: isCreole ? 'Byoloji' : 'Biologie',
  };
  const courseLabel = (courseId: string): string => {
    const [subj, ...rest] = String(courseId || '').split('-');
    const subjLabel = SUBJECT_FR[subj?.toUpperCase()] || subj || courseId;
    const level = rest.join('-').replace(/^NS([IVX]+)$/i, 'NS $1');
    return level ? `${subjLabel} · ${level}` : subjLabel;
  };

  return (
    <div className="progress-dashboard">
      <div className="progress-dashboard__header">
        <h2>{isCreole ? 'Vwayaj aprantisaj ou' : 'Votre parcours d’apprentissage'}</h2>
        <p className="text-muted">{isCreole ? 'Swiv reyalizasyon ak pwogrè ou' : 'Suivez vos réussites et votre progression'}</p>
      </div>

      <div className="progress-dashboard__stats">
        <div className="stat-card">
          <div className="stat-card__icon"><Target size={28} /></div>
          <div className="stat-card__value">{totalPoints}</div>
          <div className="stat-card__label">{isCreole ? 'Total pwen' : 'Points totaux'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon"><Trophy size={28} /></div>
          <div className="stat-card__value">{uniqueBadges.length}</div>
          <div className="stat-card__label">{isCreole ? 'Badj ou genyen' : 'Badges obtenus'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon"><Flame size={28} /></div>
          <div className="stat-card__value">{currentStreak}</div>
          <div className="stat-card__label">{isCreole ? 'Seri jou' : 'Série de jours'}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__icon"><BookOpen size={28} /></div>
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
            // Total lesson count per course isn't loaded here, so we show the
            // completed count as a plain total (not an "X / Y" fraction that
            // would imply a denominator we don't have).
            return (
              <div key={progress.courseId} className="course-progress-item">
                <div className="course-progress-item__header">
                  <span className="course-progress-item__name">{courseLabel(progress.courseId)}</span>
                  <span className="course-progress-item__points">{progress.totalPoints || 0} pts</span>
                </div>
                <div className="course-progress-item__stats">
                  <span className="text-muted">{isCreole ? `${completedCount} leson fini` : `${completedCount} leçons terminées`}</span>
                  {progress.currentStreak > 0 && (
                    <span className="course-progress-item__streak"><Flame size={14} /> {progress.currentStreak} {isCreole ? 'jou' : 'jours'}</span>
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
  const map = {
    first_lesson: GraduationCap,
    quiz_enthusiast: PenLine,
    perfectionist: Award,
    point_collector: Gem,
    week_streak: Flame,
    month_streak: Zap,
    legend_streak: Crown,
  };
  const Cmp = map[badgeId] || Medal;
  return <Cmp size={22} />;
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
