import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import './roundRhythm.css';

/**
 * Sequence 16 — calculating. The one sequence whose job is to say nothing.
 *
 * Twenty to forty seconds pass between the last answer and the champion, while
 * the server re-scores the tournament from an immutable answer log. Every
 * instinct says to fill that with something: a progress bar, a percentage, a
 * count of schools processed, the standings-so-far. All of them are wrong, and
 * for the same reason — they would be showing the room a result before the
 * result exists, and the moment the final numbers differ from the ones on
 * screen the broadcast has lied.
 *
 * So this scene WITHHOLDS, deliberately. It is a held breath, not a spinner.
 * The phrase is the biggest thing on screen; there is no figure beside it,
 * because there is no number here that is true yet. The ray field sweeps once
 * per second — enough to say the machine is running, refusing to say how far
 * along it is. A bar that creeps toward an edge promises a finish it cannot
 * time, and the audience starts watching the bar instead of the room.
 *
 * The one thing it does say is the line the whole integrity model rests on:
 * results are provisional until verified. Saying it HERE, before the winner is
 * named, is what makes removing a cheat afterwards the rule working as stated
 * rather than a reversal.
 */
export default function Grading({ reduceMotion, t }: SceneProps) {
  return (
    <div className="rg">
      {/* One sweep per second. Declared as an infinite CSS animation rather than
          re-keyed from `elapsed`: a forty-second scene would otherwise remount
          this element forty times for no visible difference, on the machine
          that also has to hold a live stream up. */}
      {reduceMotion ? null : <div className="rg__sweep" aria-hidden="true" />}

      <SceneFrame
        reduceMotion={reduceMotion}
        overline={t('Fin du tournoi', 'Fen tounwa a')}
        figure={t('Calcul des scores…', 'N ap kalkile nòt yo…')}
        support={t(
          'Chaque réponse est re-notée depuis le serveur.',
          'Chak repons ap re-kalkile depi sou sèvè a.',
        )}
        cause={t(
          'Les résultats sont provisoires jusqu’à vérification.',
          'Rezilta yo pwovizwa jiskaske nou verifye.',
        )}
      />
    </div>
  );
}
