import React from 'react';
import { SCENES } from './scenes/registry';
import type { StageData } from './sceneContract';
import type { Scene } from '../../shared/arena/director';
import { useReduceMotion } from './useReduceMotion';

/**
 * The shell. It mounts whichever scene the director has chosen and does
 * nothing else.
 *
 * Two decisions live here and nowhere else.
 *
 * **The shell never decides what is on screen.** It reads `scene.kind` and
 * looks it up. Every rule about what may interrupt what, how long a scene must
 * hold before it can be cut, and which events combine into one story belongs to
 * `shared/arena/director.ts`, which is pure and tested. A shell that started
 * making those calls would be a second director disagreeing with the first at
 * 18:41 on a stream.
 *
 * **A scene is keyed by its identity, not its kind.** Two consecutive lead
 * changes are two scenes; keying by kind would leave React reconciling the
 * second into the first, and the entrance — which is the thing that says
 * something changed — would never play.
 */

export interface StageProps {
  scene: Scene;
  elapsed: number;
  data: StageData;
  t: (fr: string, ht: string) => string;
}

export default function Stage({ scene, elapsed, data, t }: StageProps) {
  const reduceMotion = useReduceMotion();
  const Scene = SCENES[scene.kind];

  // A kind with no component is a scene the director can produce and nobody
  // has built. Falling back to the board is the honest failure: the broadcast
  // keeps running and the viewer sees something true, rather than a blank
  // screen in the middle of a live event.
  const Chosen = Scene ?? SCENES.BOARD;
  const key = `${scene.kind}:${scene.event?.seq ?? scene.since}`;

  return (
    <div className="stage" data-scene={scene.kind}>
      <Chosen
        key={key}
        scene={scene}
        data={data}
        elapsed={elapsed}
        reduceMotion={reduceMotion}
        t={t}
      />
    </div>
  );
}
