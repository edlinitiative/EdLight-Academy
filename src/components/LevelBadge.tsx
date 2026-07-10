import React from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useTrivia } from '../hooks/useTrivia';
import useStore from '../contexts/store';

/**
 * LevelBadge — compact XP-level chip for the navbar.
 * ─────────────────────────────────────────────────
 * Mirrors StreakBadge so the two read as a matched pair of "status" chips that
 * stay visible on every screen (including mobile). A thin progress donut around
 * the bolt shows how far the learner is toward their next level; tapping it
 * opens the profile where the full XP breakdown lives.
 */
export function LevelBadge() {
  const { level, isAuthed, isLoading } = useTrivia();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';

  if (!isAuthed || isLoading) return null;

  const lvl = level?.level || 1;
  const pct = Math.max(0, Math.min(100, level?.progressPct || 0));
  const xp = level?.xp || 0;

  return (
    <Link
      to="/profile"
      className="level-badge"
      title={isCreole ? `Nivo ${lvl} — ${xp} XP` : `Niveau ${lvl} — ${xp} XP`}
      aria-label={isCreole ? `Nivo ${lvl}, ${pct}% pou rive nan pwochen nivo a` : `Niveau ${lvl}, ${pct}% vers le niveau suivant`}
      style={{ '--lvl-pct': `${pct}%` } as React.CSSProperties}
    >
      <span className="level-badge__ring" aria-hidden="true">
        <Zap size={12} className="level-badge__icon" />
      </span>
      <span className="level-badge__num">{lvl}</span>
    </Link>
  );
}

export default LevelBadge;
