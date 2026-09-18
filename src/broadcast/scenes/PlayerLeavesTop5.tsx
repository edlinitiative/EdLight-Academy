import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { IndividualStanding, PlayerLeavesTop5Payload } from '../../../shared/arena/events';
import { CauseLine, FiveSlots, rankedSchools, type SlotPerson } from './MovementLanes';
import { composedClause, substitutionSlots } from './movement';
import './movement.css';

/**
 * The other half of the substitution, when it stands alone.
 *
 * The director composes an entry and an exit about the same school into one
 * scene, so most nights this never plays: sequence 8 tells both halves at once.
 * It exists for the case where only the exit survived suppression — and when it
 * does play, it is deliberately the QUIET version of sequence 8. Same five
 * slots, same drop out of the vacated slot, but no coral, no counting figure
 * and no ray sweep: a ray sweep marks a gain, and this is not one.
 *
 * The player who left is the figure, because the scene is about a person losing
 * their place, and naming them is the least the stage owes them.
 */
export default function PlayerLeavesTop5({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<PlayerLeavesTop5Payload>(scene, 'PLAYER_LEAVES_TOP_5');
  const player = payload?.player ?? null;
  const incoming = payload?.replacedBy ?? null;
  const school = rankedSchools(data.standings).find((s) => s.key === payload?.school.key) ?? null;

  const { slots, vacatedIndex } = substitutionSlots(school?.top5 ?? [], incoming?.uid ?? null);

  const individuals: IndividualStanding[] = data.standings?.individuals ?? [];
  const person = (uid: string): SlotPerson | null => {
    const row = individuals.find((i) => i.uid === uid);
    if (row) return { uid, displayName: row.displayName, score: row.score };
    return uid === incoming?.uid && incoming ? { uid, displayName: incoming.displayName } : null;
  };

  return (
    <SceneFrame
      className={`mv-scene${reduceMotion ? ' mv-still' : ''}`}
      reduceMotion={reduceMotion}
      overline={t('SORT DES CINQ', 'SÒTI NAN SENK YO')}
      figure={<span className="mv-figure-name">{player?.displayName || t('Un joueur', 'Yon jwè')}</span>}
      support={(
        <>
          <span className="mv-short mv-name">{payload?.school.shortName || payload?.school.label}</span>
          {incoming
            ? <> · {t('remplacé par', 'ranplase pa')} <span className="mv-name">{incoming.displayName}</span></>
            : null}
        </>
      )}
      cause={<CauseLine scene={scene} t={t} extra={composedClause(scene, t)} />}
    >
      <FiveSlots
        slots={slots}
        person={person}
        vacatedIndex={vacatedIndex}
        outgoing={player}
        outLabel={t('SORT', 'SÒTI')}
      />
    </SceneFrame>
  );
}
