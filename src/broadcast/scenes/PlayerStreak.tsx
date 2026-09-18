import React from 'react';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { PlayerStreakPayload } from '../../../shared/arena/events';
import MovementLanes, { rankedSchools, type LaneRow } from './MovementLanes';
import './movement.css';

/**
 * Sequence 9 — a player on a run.
 *
 * **The board stays.** This is never a takeover, and the restraint is the
 * point: a streak is a fact about someone while the match carries on, not an
 * interruption of it. A five-in-a-row that stopped the broadcast would be worth
 * less than the board it covered, and there are a lot of them in a night.
 *
 * So: the lanes as they are, untouched, and a card in the corner. No travel, no
 * ray sweep — nothing here gained a place.
 */

const LANES = 6;

export default function PlayerStreak({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<PlayerStreakPayload>(scene, 'PLAYER_STREAK');

  const rows: LaneRow[] = rankedSchools(data.standings).slice(0, LANES).map((school) => ({
    key: school.key,
    rank: school.rank,
    shortName: school.shortName || school.label,
    label: school.label,
    teamAvg: school.teamAvg,
    focus: school.key === payload?.school.key,
  }));

  const seconds = payload && payload.avgMs > 0 ? (payload.avgMs / 1000).toFixed(1) : null;

  return (
    <div className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}>
      {rows.length > 0 ? <MovementLanes rows={rows} /> : null}

      <aside className="mv-aside">
        <div className="stage-scene__overline">{t('SÉRIE EN COURS', 'SERI AP KONTINYE')}</div>
        <div className="mv-card__figure">
          <span className="mv-num">{payload?.streak ?? 0}</span>
          <span className="mv-card__unit">{t('DE SUITE', 'DAFILE')}</span>
        </div>
        <div className="mv-card__line">
          <span className="mv-name">{payload?.player.displayName}</span>
          {' · '}
          <span className="mv-short">{payload?.school.shortName || payload?.player.schoolShort}</span>
          {seconds ? <> · <span className="mv-num">{seconds}s</span> {t('en moyenne', 'an mwayèn')}</> : null}
        </div>
      </aside>
    </div>
  );
}
