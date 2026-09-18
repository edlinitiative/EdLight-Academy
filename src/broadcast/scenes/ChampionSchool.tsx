import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { primaryEvent } from '../sceneContract';

/**
 * Sequence 17 — reveal from 5th up, hard cuts, #1 at full screen with its five players. Built to be clipped for social.
 *
 * PLACEHOLDER. This renders the event truthfully and legibly so the stage is
 * never blank, but it is not the sequence section K describes. Replacing this
 * file is the whole job; nothing outside it needs to change.
 */
export default function ChampionSchool({ scene, reduceMotion, t }: SceneProps) {
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
