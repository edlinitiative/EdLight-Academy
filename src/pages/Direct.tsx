import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import useStore from '../contexts/store';
import { useReduceMotion } from '../broadcast/useReduceMotion';
import { useOnAir } from '../broadcast/useOnAir';
import { useStage } from '../broadcast/useStage';
import Stage from '../broadcast/Stage';
import PreShow from '../broadcast/segments/PreShow';
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
 * event model is built to avoid.
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
            {t('EN DIRECT', 'AN DIRÈK')}
          </span>
        </header>

        {atTheDoors ? (
          <PreShow
            data={stage.data}
            elapsed={Math.max(0, stage.data.now - (tournament?.doorsAt || stage.data.now))}
            reduceMotion={reduceMotion}
            t={t}
            /* The map lands here. Until then the pre-show widens the clock
               rather than showing an empty frame. */
          />
        ) : (
          <Stage scene={stage.scene} elapsed={stage.elapsed} data={stage.data} t={t} />
        )}
      </div>
    </div>
  );
}
