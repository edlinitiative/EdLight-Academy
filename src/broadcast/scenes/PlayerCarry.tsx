import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { PlayerCarryPayload } from '../../../shared/arena/events';
import { countUpAt } from './movement';
import './movement.css';

/**
 * One player carrying their school's five.
 *
 * A school's score is the mean of five students, so a share well above a fifth
 * is a real fact about one person doing the work — and it is the only fact in
 * this folder that is about a PROPORTION rather than a movement. So it borrows
 * sequence 8's hierarchy (the number is the subject, the person is named
 * beneath) and none of its motion: nothing overtook anything, so there is no
 * travel and no ray sweep.
 *
 * The bar is drawn at its true width once, at render, and grown with a
 * `scaleX` — never by animating a width, which would lay the page out again on
 * every frame of a scene that plays on a projector.
 */

const COUNT = { delayMs: 240, durationMs: 1200 };

export default function PlayerCarry({ scene, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<PlayerCarryPayload>(scene, 'PLAYER_CARRY');
  const share = Math.max(0, Math.min(100, payload?.sharePct ?? 0));
  const shown = countUpAt(share, elapsed, COUNT, reduceMotion);

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      overline={t('PORTE SON ÉCOLE', 'L AP POTE LEKÒL LA')}
      figure={<span className="mv-num">{shown.toFixed(1)}%</span>}
      support={(
        <>
          <span className="mv-name">{payload?.player.displayName}</span>
          {' · '}
          <span className="mv-short">{payload?.school.shortName || payload?.player.schoolShort}</span>
          {' · '}
          {t('des points des cinq', 'nan pwen senk yo')}
        </>
      )}
    >
      <div className="mv-share" aria-hidden="true">
        <div className="mv-share__fill" style={{ width: `${share}%` }} />
      </div>
      <div className="mv-share__ticks">
        <span>{payload?.player.displayName}</span>
        <span>{t('les quatre autres', '4 lòt yo')}</span>
      </div>
    </SceneFrame>
  );
}
