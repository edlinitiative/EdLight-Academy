/**
 * Shared game-over screen for the arcade games — score ring, per-game stat
 * rows, the XP reward block, and replay/exit actions. Reuses the
 * trivia-results CSS so every game ends with the same celebratory look.
 */

import React from 'react';
import { Trophy, Star, ThumbsUp, Dumbbell, Sparkles, Crown, RefreshCw } from 'lucide-react';
import Celebration from '../Celebration';
import { CountUp } from '../../hooks/useCountUp';

export default function GameOverCard({
  score,
  maxScore,
  stats = [],
  reward = null,
  onReplay,
  onExit,
  isCreole,
  accent = '#1B6FE0',
  highScore = null,
}) {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // Big-win moments earn a confetti burst: a fresh personal record, a level-up,
  // or a near-perfect round. Everyone still sees the score + message.
  const isNewRecord = highScore != null && score >= highScore && score > 0;
  const bigWin = pct >= 90 || isNewRecord || !!reward?.leveledUp;

  let IconCmp, message, messageHt;
  if (pct >= 90) {
    IconCmp = Trophy;
    message = 'Excellent ! Vous êtes un champion !';
    messageHt = 'Ekselan! Ou se yon chanpyon!';
  } else if (pct >= 70) {
    IconCmp = Star;
    message = 'Très bien ! Continuez comme ça !';
    messageHt = 'Trè byen! Kontinye konsa!';
  } else if (pct >= 50) {
    IconCmp = ThumbsUp;
    message = 'Pas mal ! Vous pouvez vous améliorer.';
    messageHt = 'Pa mal! Ou ka amelyore.';
  } else {
    IconCmp = Dumbbell;
    message = 'Courage ! Réessayez pour progresser.';
    messageHt = 'Kouraj! Eseye ankò pou pwogrese.';
  }

  return (
    <div className="trivia-results" style={{ '--cat-color': accent } as React.CSSProperties}>
      <div className="trivia-results__card">
        <Celebration active={bigWin} />
        <span className="trivia-results__emoji"><IconCmp size={48} /></span>
        <h2 className="trivia-results__title">{isCreole ? 'Rezilta Ou' : 'Vos Résultats'}</h2>
        <div className="trivia-results__score-ring">
          <svg viewBox="0 0 120 120" className="trivia-results__ring-svg">
            <circle cx="60" cy="60" r="52" className="trivia-results__ring-bg" />
            <circle
              cx="60" cy="60" r="52"
              className="trivia-results__ring-fill"
              style={{ strokeDasharray: `${(pct / 100) * 327} 327` }}
            />
          </svg>
          <span className="trivia-results__pct">{pct}%</span>
        </div>
        {stats.length > 0 && (
          <div className="game-over__stats">
            {stats.map((s) => (
              <div key={s.label} className="game-over__stat">
                <span className="game-over__stat-value">{s.value}</span>
                <span className="game-over__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {highScore != null && score >= highScore && score > 0 && (
          <p className="game-over__record">
            <Trophy size={14} /> {isCreole ? 'Nouvo rekò pèsonèl !' : 'Nouveau record personnel !'}
          </p>
        )}
        <p className="trivia-results__message">{isCreole ? messageHt : message}</p>
        {reward && reward.xpEarned > 0 && (
          <div className="trivia-reward">
            <span className="trivia-reward__xp">
              <Sparkles size={16} /> <CountUp value={reward.xpEarned} prefix="+" suffix=" XP" />
            </span>
            {reward.leveledUp && (
              <span className="trivia-reward__levelup">
                <Crown size={14} /> {isCreole ? `Nivo ${reward.newLevel} !` : `Niveau ${reward.newLevel} !`}
              </span>
            )}
            {reward.guest && (
              <span className="trivia-reward__guest">
                {isCreole ? 'Konekte pou anrejistre XP ou' : 'Connectez-vous pour sauvegarder vos XP'}
              </span>
            )}
          </div>
        )}
        <div className="trivia-results__actions">
          {onReplay && (
            <button className="button button--primary" onClick={onReplay}>
              <RefreshCw size={16} /> {isCreole ? 'Jwe ankò' : 'Rejouer'}
            </button>
          )}
          <button className="button button--ghost" onClick={onExit}>
            ← {isCreole ? 'Jwèt yo' : 'Les jeux'}
          </button>
        </div>
      </div>
    </div>
  );
}
