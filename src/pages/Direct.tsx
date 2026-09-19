import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import useStore from '../contexts/store';
import { useReduceMotion } from '../broadcast/useReduceMotion';
import { useOnAir } from '../broadcast/useOnAir';
import { useStage } from '../broadcast/useStage';
import { useMapPlaces } from '../broadcast/useMapPlaces';
import Stage from '../broadcast/Stage';
import PreShow from '../broadcast/segments/PreShow';
import PostGame from '../broadcast/segments/PostGame';
import HaitiMap from '../components/arena/HaitiMap';
import '../broadcast/stage.css';
import './Live.css';

/**
 * `/direct` — the projector page.
 *
 * Somebody points a screen at this in a school hall and leaves it there. That
 * one fact decides almost everything about this file:
 *
 * **It resolves its own tournament.** No arguments in the URL, because nobody
 * is typing a tournament id at 18:39 with a room filling up. `useOnAir` picks
 * what a viewer walking in now would want to see, and keeps picking as the
 * evening moves from registration to doors to live.
 *
 * **It is never blank.** Between tournaments — which is most of the month —
 * the stage falls back to the weekly school race, which is real live data and
 * has been the content of this page since it was built. A projector showing an
 * empty "no tournament" card for three weeks is a projector somebody unplugs.
 *
 * **The evening has segments, and the director owns only one of them.** Before
 * the first question there are no events to direct, so the pre-show is
 * rendered straight — a countdown, the schools arriving, the map filling. Once
 * the feed starts, the director takes over and this page stops deciding
 * anything. Handing the pre-show to the director instead would mean inventing
 * a synthetic event for "nothing has happened yet", which is a lie the whole
 * event model is built to avoid. `final` is the same shape at the other end:
 * the feed is done, the podium is the story, and `PostGame` renders directly
 * for the same reason `PreShow` does.
 *
 * **The map shows schools, not players, for now.** `useMapPlaces` joins the
 * standings' school rows against the client-readable `schools` collection —
 * safe, because a school is not a person. A student's own ville is written
 * only to `tournaments/{tid}/players/{uid}`, which `firestore.rules` denies
 * to every client, including the player it belongs to — the same wall that
 * hides a player's own score mid-tournament. Nothing here works around that,
 * and nothing should without a server-side aggregation step that publishes
 * pre-summed counts per commune rather than a uid-keyed list, because most of
 * this audience is under 18 and `standings/current` is public.
 *
 * **It owns the chrome; the director owns the content.** The rays, the horizon
 * and the header belong to the page and never change. What sits inside is
 * whatever `shared/arena/director.ts` says should be on screen — the board at
 * rest, a takeover when something happened. This page makes no decision about
 * which scene wins; that rule lives in one pure, tested module and must not be
 * re-implemented by whatever is rendering it.
 */

// The resting page. Lazy because on a tournament night it is never rendered,
// and it drags in the leaderboard aggregation with it.
const Live = lazy(() => import('./Live'));

export default function Direct() {
  const [params] = useSearchParams();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const reduceMotion = useReduceMotion();
  const { tid, none, loading } = useOnAir(params.get('tid'));
  const stage = useStage(tid, { isCreole });

  // The map's school layer — see the file header on why only schools, not
  // players, can be read from a client today. Called unconditionally (React's
  // rule, not a style choice): the early return below must never change which
  // hooks ran on the previous render.
  const map = useMapPlaces(stage.data.standings?.schools);

  // Nothing on air, or a tid that names nothing: show the weekly race.
  if (none || (!loading && !tid) || stage.absent) {
    return (
      <Suspense fallback={<div className="live" />}>
        <Live />
      </Suspense>
    );
  }

  const tournament = stage.data.tournament;

  // `doors` is the ten minutes before the first question — the one stretch of
  // the evening with no event feed to direct.
  const atTheDoors = tournament?.state === 'doors' || tournament?.state === 'registration';
  const isFinal = tournament?.state === 'final';

  const mapElement = (
    <HaitiMap
      places={map.places}
      mode={atTheDoors ? 'arrivals' : 'density'}
    />
  );

  // `stage.data` carries `places`/`unplacedSchools` as part of the shared
  // scene contract, but `useStage` has no way to compute them itself — it
  // does not know about the map. Merged here, once, rather than left at
  // useStage's placeholder zero: `PostGame`'s "N écoles sans commune" line
  // reads `data.unplacedSchools` directly, and a merge that only happened for
  // PostGame specifically would silently leave every OTHER scene reading the
  // real StageData contract's promise unfulfilled.
  const stageData = { ...stage.data, places: map.places, unplacedSchools: map.schoolsWithoutLocation };

  return (
    <div className="live">
      <div className="live__rays" aria-hidden />
      <div className="live__horizon" aria-hidden />

      <div className="live__inner">
        <header className="live__head">
          <div className="live__brand">
            <img className="live__mark" src="/assets/logo.png" alt="EdLight" />
            <div>
              <h1 className="live__title">{tournament?.title || t('L’Arène', 'Arèn nan')}</h1>
              <p className="live__subtitle">
                {tournament && tournament.questionCount > 0 && tournament.currentIndex >= 0
                  ? t(
                    `Question ${tournament.currentIndex + 1} / ${tournament.questionCount}`,
                    `Kesyon ${tournament.currentIndex + 1} / ${tournament.questionCount}`,
                  )
                  : t('Championnat inter-écoles', 'Chanpyona ant lekòl')}
              </p>
            </div>
          </div>
          <span className="live__onair">
            <span className="live__onair-dot" />
            {isFinal ? t('TERMINÉ', 'FINI') : t('EN DIRECT', 'AN DIRÈK')}
          </span>
        </header>

        {atTheDoors ? (
          <PreShow
            data={stageData}
            elapsed={Math.max(0, stage.data.now - (tournament?.doorsAt || stage.data.now))}
            reduceMotion={reduceMotion}
            t={t}
            mapSlot={mapElement}
          />
        ) : isFinal ? (
          <PostGame
            data={stageData}
            // `finalAt` is the real moment `state.ts` wrote provisional → final
            // — the same way PreShow anchors to `doorsAt` rather than to when
            // this component happened to mount, so a projector opened hours
            // into the post-game shows the right beat of its 38s cycle rather
            // than restarting it from zero.
            elapsed={Math.max(0, stage.data.now - (tournament?.finalAt || stage.data.now))}
            reduceMotion={reduceMotion}
            t={t}
            mapSlot={mapElement}
          />
        ) : (
          <Stage scene={stage.scene} elapsed={stage.elapsed} data={stageData} t={t} />
        )}
      </div>
    </div>
  );
}
