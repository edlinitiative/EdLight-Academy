import React from 'react';
import type { SceneProps } from '../sceneContract';

/**
 * The resting state — the board, and the thing every other scene returns to.
 *
 * The director treats this as home rather than as a scene among scenes, which
 * is the architectural difference between a broadcast and a notification feed:
 * something always has the screen, and what it returns to is the standings
 * already settled into their new order. A takeover that hands back to a board
 * mid-animation reads as a glitch; a takeover that hands back to a board which
 * has ALREADY absorbed the change reads as the change having happened.
 *
 * PLACEHOLDER. The lane treatment, the travel on a rank move, and the ambient
 * callout when `scene.needsAmbient` is set all still have to be built.
 */
export default function Board({ data, t }: SceneProps) {
  const schools = data.standings?.schools ?? [];
  return (
    <div className="stage-board">
      {schools.length === 0 ? (
        <p className="stage-board__empty">{t('En attente des écoles…', 'N ap tann lekòl yo…')}</p>
      ) : (
        <ol className="stage-board__lanes">
          {schools.slice(0, 8).map((s: any) => (
            <li key={s.key} className="stage-board__lane">
              <span className="stage-board__rank">{s.rank}</span>
              <span className="stage-board__name">{s.short || s.label}</span>
              <span className="stage-board__score">{Math.round(s.teamAvg ?? 0)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
