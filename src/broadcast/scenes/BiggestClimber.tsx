import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { BiggestClimberPayload } from '../../../shared/arena/events';
import MovementLanes, { CauseLine, rankedSchools, type LaneRow } from './MovementLanes';
import { composedClause, laneWindow, overtakeTravel } from './movement';
import './movement.css';

/**
 * Who moved furthest this round — and **the travel is the information**.
 *
 * Sequence 7's language, given a title. The difference is what each is for: an
 * overtake is a thing happening to the board right now and needs no
 * introduction, while this is the round's SUPERLATIVE — the line the
 * commentator reads and the halftime card reuses — so it says how far, out
 * loud, and then shows the distance being covered underneath.
 *
 * `gained` is places, not points: the number is the distance the lane travels,
 * which is why it can be the figure over a board that is also full of numbers.
 */

const LANES = 8;

export default function BiggestClimber({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<BiggestClimberPayload>(scene, 'BIGGEST_CLIMBER');

  const from = payload?.from ?? 0;
  const to = payload?.to ?? 0;
  const gained = payload?.gained ?? (from > to ? from - to : 0);

  const schools = rankedSchools(data.standings);
  const window = laneWindow(schools.length, [from, to], LANES);
  const visible = schools.filter((s) => s.rank >= window.start && s.rank <= window.end);
  const travel = overtakeTravel(from, to, visible.map((s) => s.rank), 1);

  const rows: LaneRow[] = visible.map((school, i) => {
    const move = travel[i];
    const isMover = move?.role === 'mover';
    return {
      key: school.key,
      rank: school.rank,
      shortName: school.shortName || school.label,
      label: school.label,
      teamAvg: school.teamAvg,
      travel: move?.offset ?? 0,
      gain: isMover,
      focus: isMover,
    };
  });

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      tone="coral"
      overline={t('PLUS BELLE PROGRESSION', 'PI GWO PWOGRÈ')}
      figure={<span className="mv-num">+{gained}</span>}
      support={(
        <>
          <span className="mv-short mv-name">{payload?.school.shortName || payload?.school.label}</span>
          {from > 0 && to > 0
            ? <> · {t(`de la ${from}e à la ${to}e place`, `soti ${from}yèm rive ${to}yèm plas`)}</>
            : null}
        </>
      )}
      cause={<CauseLine scene={scene} t={t} extra={composedClause(scene, t)} />}
    >
      {rows.length > 0 ? <MovementLanes rows={rows} /> : null}
    </SceneFrame>
  );
}
