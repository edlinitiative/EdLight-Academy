import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { primaryEvent } from '../sceneContract';

/**
 * The other half of the substitution, when it stands alone.
 *
 * PLACEHOLDER. This renders the event truthfully and legibly so the stage is
 * never blank, but it is not the sequence section K describes. Replacing this
 * file is the whole job; nothing outside it needs to change.
 */
export default function PlayerLeavesTop5({ scene, reduceMotion, t }: SceneProps) {
  const event = primaryEvent(scene);
  return (
    <SceneFrame
      reduceMotion={reduceMotion}
      overline={t('EN DIRECT', 'AN DIRÈK')}
      figure={event ? event.type.replace(/_/g, ' ') : t('En cours', 'Ap kontinye')}
      support={null}
    />
  );
}
