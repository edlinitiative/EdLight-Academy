import React from 'react';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { SchoolStreakPayload } from '../../../shared/arena/events';
import MovementLanes, { rankedSchools, type LaneRow } from './MovementLanes';
import './movement.css';

/**
 * A school on a run — sequence 9's treatment, for a school.
 *
 * Deliberately the same card in the same corner over the same untouched board,
 * because it is the same KIND of fact: something true about a competitor while
 * the match continues, worth a line and not worth the screen. Giving a school
 * streak its own visual language would say it mattered more than a player's,
 * which it does not.
 *
 * The school's own lane is marked rather than pulled out of the board: it is
 * still in the race, in the position the race has put it in.
 */

const LANES = 6;

export default function SchoolStreak({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<SchoolStreakPayload>(scene, 'SCHOOL_STREAK');

  const rows: LaneRow[] = rankedSchools(data.standings).slice(0, LANES).map((school) => ({
    key: school.key,
    rank: school.rank,
    shortName: school.shortName || school.label,
    label: school.label,
    teamAvg: school.teamAvg,
    focus: school.key === payload?.school.key,
  }));

  return (
    <div className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}>
      {rows.length > 0 ? <MovementLanes rows={rows} /> : null}

      <aside className="mv-aside">
        <div className="stage-scene__overline">{t('SÉRIE D’ÉCOLE', 'SERI LEKÒL')}</div>
        <div className="mv-card__figure">
          <span className="mv-num">{payload?.count ?? 0}</span>
          <span className="mv-card__unit">{t('BONNES RÉPONSES', 'BON REPONS')}</span>
        </div>
        <div className="mv-card__line">
          <span className="mv-short mv-name">{payload?.school.shortName || payload?.school.label}</span>
          {' · '}
          {t('sans se tromper', 'san yo pa twonpe')}
        </div>
      </aside>
    </div>
  );
}
