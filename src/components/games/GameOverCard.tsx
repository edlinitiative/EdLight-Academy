/**
 * Shared game-over screen for the arcade games. Built on the trivia match's
 * results language (.mx-res in TriviaGames.css): one big score, a sentence-case
 * headline, the round's facts as solid tiles, the XP it earned, then one coral
 * action ("Rejouer") and a quiet way back. Every figure is the round's own.
 */

import React from 'react';
import { Trophy, Crown, Sparkles, RefreshCw } from '../icons';
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
  unit = null,
  gameName = null,
}: {
  score: number;
  maxScore: number;
  stats?: { label: string; value: React.ReactNode }[];
  reward?: any;
  onReplay?: () => void;
  onExit: () => void;
  isCreole: boolean;
  accent?: string;
  highScore?: number | null;
  /** What the big number counts ("bonnes réponses", "points"…). */
  unit?: string | null;
  gameName?: string | null;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  // A fresh personal record, a level-up or a near-perfect round earn the
  // confetti; everyone still sees the score and the line under it.
  const isNewRecord = highScore != null && score >= highScore && score > 0;
  const bigWin = pct >= 90 || isNewRecord || !!reward?.leveledUp;

  const headline = pct >= 90
    ? t('Excellent, du grand jeu !', 'Ekselan, se gwo jwèt !')
    : pct >= 70
      ? t('Très bien, continue comme ça !', 'Trè byen, kontinye konsa !')
      : pct >= 50
        ? t('Pas mal ! Tu peux encore progresser.', 'Pa mal ! Ou ka pwogrese plis toujou.')
        : t('Courage ! Chaque partie te fait progresser.', 'Kouraj ! Chak pati fè w pwogrese.');

  return (
    <div className="mx-page go-page" style={{ '--cat-color': accent } as React.CSSProperties}>
      <section className="mx-res" data-size={bigWin ? 'big' : 'routine'} aria-labelledby="go-title">
        <header className="mx-res__head mx-in go-head">
          <Celebration active={bigWin} />
          {gameName && <p className="mx-res__eyebrow">{gameName}</p>}
          <div className="mx-res__scoreline">
            {bigWin && <span className="mx-res__medal" aria-hidden="true">{reward?.leveledUp ? <Crown size={30} /> : <Trophy size={30} />}</span>}
            <p className="mx-res__score">
              <span className="mx-num">{score}</span>
              <span className="mx-res__cap">{unit || t('points', 'pwen')}</span>
            </p>
          </div>
          <h2 id="go-title" className="mx-res__headline">{headline}</h2>
        </header>

        {(stats.length > 0 || isNewRecord) && (
          <ul className="mx-res__facts mx-in" aria-label={t('Ta partie', 'Pati ou')}>
            {isNewRecord && (
              <li className="mx-fact mx-fact--record">
                <span className="mx-fact__label"><span className="mx-fact__icon" aria-hidden="true"><Trophy size={16} /></span>{t('Nouveau record personnel', 'Nouvo rekò pèsonèl')}</span>
                <strong className="mx-fact__value mx-num">{score}</strong>
                {highScore != null && highScore !== score && <span className="mx-fact__detail">{t(`avant : ${highScore}`, `anvan : ${highScore}`)}</span>}
              </li>
            )}
            {stats.map((s) => (
              <li key={s.label} className="mx-fact">
                <span className="mx-fact__label">{s.label}</span>
                <strong className="mx-fact__value mx-num">{s.value}</strong>
              </li>
            ))}
          </ul>
        )}

        {reward && reward.xpEarned > 0 && (
          <div className="mx-res__earn mx-in">
            <div className="mx-xp">
              <div className="mx-xp__top">
                <p className="mx-xp__amount"><Sparkles size={18} aria-hidden="true" /> <span className="mx-num"><CountUp value={reward.xpEarned} prefix="+" suffix=" XP" /></span></p>
                {reward.leveledUp && <p className="mx-xp__why"><Crown size={14} aria-hidden="true" /> {t(`Niveau ${reward.newLevel} atteint !`, `Ou rive nivo ${reward.newLevel} !`)}</p>}
              </div>
              {reward.guest && <p className="mx-res__note">{t('Aperçu : connecte-toi pour garder tes XP et tes records.', 'Apèsi : konekte pou kenbe XP ou ak rekò ou.')}</p>}
            </div>
          </div>
        )}

        <div className="mx-res__actions mx-in">
          {onReplay && (
            <button type="button" className="an-go" onClick={onReplay}>
              <RefreshCw size={16} aria-hidden="true" /> {t('Rejouer', 'Rejwe')}
            </button>
          )}
          <button type="button" className="an-ghost" onClick={onExit}>
            ← {t('Les jeux', 'Jwèt yo')}
          </button>
        </div>
      </section>
    </div>
  );
}
