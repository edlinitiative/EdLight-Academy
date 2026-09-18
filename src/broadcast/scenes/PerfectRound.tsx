import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { primaryEvent } from '../sceneContract';

/**
 * Sequence 10 — full-bleed: name, school, SANS FAUTE, the round's questions as filled marks.
 *
 * PLACEHOLDER. This renders the event truthfully and legibly so the stage is
 * never blank, but it is not the sequence section K describes. Replacing this
 * file is the whole job; nothing outside it needs to change.
 */
export default function PerfectRound({ scene, reduceMotion, t }: SceneProps) {
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
