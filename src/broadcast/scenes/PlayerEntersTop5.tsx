import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { IndividualStanding, PlayerEntersTop5Payload } from '../../../shared/arena/events';
import { CauseLine, FiveSlots, rankedSchools, type SlotPerson } from './MovementLanes';
import { composedClause, substitutionSlots, valueAt } from './movement';
import './movement.css';

/**
 * Sequence 8 — a player comes into their school's five.
 *
 * **Framed as a substitution**, which is the whole design decision: only five
 * players count for a school, so this is not "a name appeared in a list", it is
 * a team-mate coming off. The five slots are shown, the arriving card slides
 * into the slot the leaving card is dropping out of, and the team average
 * recounts — from what it was to what it now is, which the payload gives us
 * exactly, so the counter never shows a number that was not true at one end or
 * the other.
 *
 * The team average is the one number on screen. The substitution delta sits
 * beside the names as a small chip: it is the size of the change, not the
 * subject of the scene.
 */

const COUNT = { delayMs: 300, durationMs: 1400 };

export default function PlayerEntersTop5({ scene, data, elapsed, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<PlayerEntersTop5Payload>(scene, 'PLAYER_ENTERS_TOP_5');
  const player = payload?.player ?? null;
  const school = rankedSchools(data.standings).find((s) => s.key === payload?.school.key) ?? null;

  const { slots, vacatedIndex } = substitutionSlots(school?.top5 ?? [], player?.uid ?? null);

  const individuals: IndividualStanding[] = data.standings?.individuals ?? [];
  const person = (uid: string): SlotPerson | null => {
    const row = individuals.find((i) => i.uid === uid);
    if (row) return { uid, displayName: row.displayName, score: row.score };
    // The standings can be thinned; the arriving player is always named in the
    // payload, so the slot that matters most is the one that can never be blank.
    return uid === player?.uid && player ? { uid, displayName: player.displayName } : null;
  };

  const newAvg = payload?.newTeamAvg ?? school?.teamAvg ?? 0;
  const delta = payload?.delta ?? 0;
  const shown = Math.round(valueAt(newAvg - delta, newAvg, elapsed, COUNT, reduceMotion));
  const deltaLabel = Math.round(delta * 10) / 10;

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      tone="coral"
      overline={t('REMPLACEMENT DANS LES CINQ', 'CHANJMAN NAN SENK YO')}
      figure={<span className="mv-num">{shown}</span>}
      support={(
        <>
          <span className="mv-card__unit">{t('MOYENNE D’ÉQUIPE', 'MWAYÈN EKIP')}</span>
          {deltaLabel !== 0
            ? <span className="mv-chip mv-chip--quiet">{deltaLabel > 0 ? '+' : ''}{deltaLabel}</span>
            : null}
          <div className="mv-lead__over">
            <span className="mv-name">{player?.displayName}</span>
            {' '}
            <span className="mv-short">{payload?.school.shortName || payload?.school.label}</span>
            {payload?.displaced
              ? <> · {t('à la place de', 'nan plas')} {payload.displaced.displayName}</>
              : null}
          </div>
        </>
      )}
      cause={<CauseLine scene={scene} t={t} extra={composedClause(scene, t)} />}
    >
      <FiveSlots
        slots={slots}
        person={person}
        vacatedIndex={vacatedIndex}
        outgoing={payload?.displaced ?? null}
        outLabel={t('SORT', 'SÒTI')}
      />
    </SceneFrame>
  );
}
