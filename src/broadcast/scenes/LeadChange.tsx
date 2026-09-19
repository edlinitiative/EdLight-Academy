import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { LeadChangePayload } from '../../../shared/arena/events';
import { CauseLine, rankedSchools } from './MovementLanes';
import { composedClause, countUpAt, schoolHue } from './movement';
import './movement.css';

/**
 * Sequence 6 — the lead changes.
 *
 * The biggest moment the board can produce, and the only one that is allowed to
 * take the whole screen for four and a half seconds. The order it says things
 * in is the design:
 *
 *   1. the new leader's short name, at full display size — the school is the
 *      headline, never the page;
 *   2. its team average, COUNTING UP rather than cutting to a number, because a
 *      figure that arrives already settled reads as a fact and a figure that
 *      counts reads as something that just happened;
 *   3. the school it displaced, small, beneath — "dépasse SLDG";
 *   4. the student who caused it, LAST. The cause is the payoff: without it
 *      this is a table updating, and with it it is a girl in Gonaïves putting
 *      her school in front.
 *
 * The board's own exit — pushing down and out — belongs to the board: the stage
 * mounts one scene at a time, so by the time this renders the board has already
 * handed the screen over. What this scene owns is everything after that.
 */

/** The count-up. Long enough to read as a climb, done well before the cut. */
const COUNT = { delayMs: 240, durationMs: 1500 };

export default function LeadChange({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<LeadChangePayload>(scene, 'LEAD_CHANGE');
  const leader = payload?.newLeader ?? null;

  // `teamAvg` is not in the payload — it is the board's own number, and the
  // board is authoritative. Reading it here also means the figure this scene
  // lands on is the figure the board shows when it comes back.
  const school = rankedSchools(data.standings).find((s) => s.key === leader?.key) ?? null;
  const teamAvg = school?.teamAvg ?? 0;
  const shown = Math.round(countUpAt(teamAvg, elapsed, COUNT, reduceMotion));

  const displaced = payload?.displaced ?? null;
  const margin = Math.round((payload?.margin ?? 0) * 10) / 10;

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      overline={t('NOUVEAU LEADER', 'NOUVO LIDÈ')}
      figure={(
        <span className="mv-lead" style={{ ['--mv-hue' as string]: String(schoolHue(leader?.key ?? '')) }}>
          <span className="mv-lead__bar" aria-hidden="true" />
          {leader?.shortName || leader?.label || t('EN TÊTE', 'NAN TÈT LA')}
        </span>
      )}
      support={(
        <>
          <span className="mv-num mv-lead__avg">{shown}</span>
          <span className="mv-card__unit">{t('MOYENNE D’ÉQUIPE', 'MWAYÈN EKIP')}</span>
          <div className="mv-lead__over">
            {displaced
              ? <>{t('dépasse', 'depase')} <span className="mv-short mv-name">{displaced.shortName}</span></>
              : t('première école en tête', 'premye lekòl nan tèt la')}
            {margin > 0
              ? <span className="mv-chip mv-chip--quiet">+{margin}</span>
              : null}
          </div>
        </>
      )}
      cause={<CauseLine scene={scene} t={t} extra={composedClause(scene, t)} />}
    />
  );
}
