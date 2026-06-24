/**
 * Streak Components
 * ─────────────────
 * 1. StreakBadge      — small flame + count for the navbar
 * 2. StreakWidget     — sidebar card with heatmap + next milestone
 * 3. StreakMilestone  — full-screen celebration modal
 */

import React, { useEffect, useRef } from 'react';
import { Flame, Trophy, Shield, Zap, Dumbbell, Crown, Gem } from 'lucide-react';
import { useStreak } from '../hooks/useStreak';

// Maps a streak-milestone id to a monochrome Lucide icon (replaces emoji).
const MILESTONE_ICONS = {
  streak_3: Flame,
  streak_7: Flame,
  streak_14: Zap,
  streak_30: Dumbbell,
  streak_60: Crown,
  streak_100: Trophy,
  streak_365: Gem,
};

function MilestoneIcon({ id, size = 18 }) {
  const Cmp = MILESTONE_ICONS[id] || Flame;
  return <Cmp size={size} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. StreakBadge — lives in the Navbar, always visible to logged-in users
// ═══════════════════════════════════════════════════════════════════════════

export function StreakBadge() {
  const { streak, isLoading } = useStreak();

  if (isLoading) return null;

  const count = streak.currentStreak || 0;
  const isActive = count > 0;

  return (
    <div
      className={`streak-badge ${isActive ? 'streak-badge--active' : ''}`}
      title={`${count} jour${count !== 1 ? 's' : ''} de suite`}
    >
      <Flame
        size={18}
        className={`streak-badge__icon ${isActive ? 'streak-badge__icon--lit' : ''}`}
      />
      {count > 0 && (
        <span className="streak-badge__count">{count}</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. StreakWidget — sidebar card for StudyPlan and Dashboard
// ═══════════════════════════════════════════════════════════════════════════

export function StreakWidget({ isCreole = false }) {
  const { streak, heatmap, nextMilestone } = useStreak();
  const count = streak.currentStreak || 0;
  const longest = streak.longestStreak || 0;
  const freezes = streak.streakFreezes || 0;

  return (
    <div className="streak-widget">
      {/* Header with flame */}
      <div className="streak-widget__header">
        <div className="streak-widget__flame-ring">
          <Flame size={22} className={count > 0 ? 'streak-widget__flame--lit' : ''} />
        </div>
        <div className="streak-widget__stats">
          <span className="streak-widget__count">{count}</span>
          <span className="streak-widget__label">
            {isCreole
              ? `jou${count !== 1 ? '' : ''} youn dèyè lòt`
              : `jour${count !== 1 ? 's' : ''} de suite`}
          </span>
        </div>
        {longest > count && (
          <div className="streak-widget__best" title={isCreole ? 'Pi bon seri' : 'Meilleure série'}>
            <Trophy size={13} />
            <span>{longest}</span>
          </div>
        )}
      </div>

      {/* Heatmap calendar */}
      <div className="streak-heatmap">
        <div className="streak-heatmap__grid">
          {heatmap.map((week, wi) => (
            <div key={wi} className="streak-heatmap__col">
              {week.map((day) => (
                <div
                  key={day.date}
                  className={[
                    'streak-heatmap__cell',
                    day.active ? 'streak-heatmap__cell--active' : '',
                    day.isToday ? 'streak-heatmap__cell--today' : '',
                  ].join(' ')}
                  title={day.date}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="streak-heatmap__legend">
          <span>{isCreole ? 'Mwens' : 'Moins'}</span>
          <div className="streak-heatmap__cell" />
          <div className="streak-heatmap__cell streak-heatmap__cell--active" />
          <span>{isCreole ? 'Plis' : 'Plus'}</span>
        </div>
      </div>

      {/* Next milestone progress */}
      {nextMilestone && nextMilestone.remaining > 0 && (
        <div className="streak-widget__milestone">
          <div className="streak-widget__milestone-info">
            <span className="streak-widget__milestone-emoji"><MilestoneIcon id={nextMilestone.id} size={15} /></span>
            <span className="streak-widget__milestone-text">
              {isCreole
                ? `${nextMilestone.remaining} jou ankò pou ${nextMilestone.labelHt}`
                : `${nextMilestone.remaining} jour${nextMilestone.remaining !== 1 ? 's' : ''} avant ${nextMilestone.label}`}
            </span>
          </div>
          <div className="streak-widget__milestone-bar">
            <div
              className="streak-widget__milestone-fill"
              style={{
                width: `${Math.min(100, ((nextMilestone.days - nextMilestone.remaining) / nextMilestone.days) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Freeze tokens */}
      {freezes > 0 && (
        <div className="streak-widget__freezes">
          <Shield size={13} />
          <span>
            {freezes} {isCreole ? 'boukliye seri' : 'bouclier streak'}
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. StreakMilestoneModal — celebration overlay when a milestone is reached
// ═══════════════════════════════════════════════════════════════════════════

export function StreakMilestoneModal({ isCreole = false }) {
  const { newMilestones, dismissMilestones, streak } = useStreak();
  const modalRef = useRef(null);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (newMilestones.length === 0) return;
    const timer = setTimeout(dismissMilestones, 6000);
    return () => clearTimeout(timer);
  }, [newMilestones, dismissMilestones]);

  if (newMilestones.length === 0) return null;

  const milestone = newMilestones[newMilestones.length - 1]; // Show highest

  return (
    <div className="streak-milestone-overlay" onClick={dismissMilestones}>
      <div
        className="streak-milestone"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated emoji burst */}
        <div className="streak-milestone__burst">
          <span className="streak-milestone__emoji"><MilestoneIcon id={milestone.id} size={52} /></span>
        </div>

        <div className="streak-milestone__content">
          <h2 className="streak-milestone__title">
            <Flame size={22} className="streak-milestone__flame" />
            {streak.currentStreak} {isCreole ? 'jou' : 'jours'} !
          </h2>
          <p className="streak-milestone__message">
            {isCreole ? milestone.messageHt : milestone.message}
          </p>
          <div className="streak-milestone__badge">
            <Zap size={14} />
            {isCreole ? milestone.labelHt : milestone.label}
          </div>
        </div>

        <button className="streak-milestone__close" onClick={dismissMilestones}>
          {isCreole ? 'Kontinye' : 'Continuer'} →
        </button>
      </div>
    </div>
  );
}
