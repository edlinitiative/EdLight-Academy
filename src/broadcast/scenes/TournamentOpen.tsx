import React from 'react';
import SceneFrame from '../SceneFrame';
import type { SceneProps } from '../sceneContract';
import { payloadOf } from '../sceneContract';
import type { TournamentOpenPayload } from '../../../shared/arena/events';
import './roundRhythm.css';

/**
 * The room is open — the first event of the night, and the last moment before
 * anything is at stake.
 *
 * It is not the pre-show. The pre-show (`segments/PreShow.tsx`) is what fills
 * the screen for the half hour while people arrive; this is the single beat
 * that marks the doors being open, and it earns priority 10 for one reason: it
 * is the first thing a spectator joining the stream sees, and it has to answer
 * "am I in the right place, and how big is this?" in one glance.
 *
 * So the figure is the PLAYER count, not the school count. The schools are the
 * competitors, but the players are the answer to "how big is this" — and one
 * number is the biggest thing on screen, so the schools go beneath, at the
 * scale of a caption. A stage that set both large would be asking the audience
 * which of the two facts it was supposed to care about.
 */
export default function TournamentOpen({ scene, data, reduceMotion, t }: SceneProps) {
  const payload = payloadOf<TournamentOpenPayload>(scene, 'TOURNAMENT_OPEN');
  const counts = data.tournament?.counts;

  // The payload is denormalised and authoritative; the tournament document is
  // the fallback for a stage that reconnected after the event scrolled off the
  // tail of the feed.
  const players = payload?.players ?? counts?.players ?? 0;
  const schools = payload?.schools ?? counts?.schools ?? 0;
  const qualified = counts?.qualifiedSchools ?? 0;

  return (
    <SceneFrame
      reduceMotion={reduceMotion}
      overline={t('Les portes sont ouvertes', 'Pòt yo louvri')}
      figure={players.toLocaleString('fr-FR')}
      support={t('joueurs inscrits', 'jouè ki enskri')}
    >
      <div className="ro-counts">
        <span className="ro-count">
          <span className="ro-count__value">{schools}</span>
          <span className="ro-count__label">{t('écoles', 'lekòl')}</span>
        </span>
        {qualified > 0 ? (
          <span className="ro-count">
            <span className="ro-count__value">{qualified}</span>
            <span className="ro-count__label">{t('qualifiées', 'kalifye')}</span>
          </span>
        ) : null}
        {data.unplacedSchools > 0 ? (
          // Shown honestly rather than hidden: a school we cannot place on the
          // map is still in the tournament, and quietly dropping it from a
          // count is how a school ends up believing it was left out.
          <span className="ro-count">
            <span className="ro-count__value">{data.unplacedSchools}</span>
            <span className="ro-count__label">{t('hors carte', 'pa sou kat la')}</span>
          </span>
        ) : null}
      </div>
    </SceneFrame>
  );
}
