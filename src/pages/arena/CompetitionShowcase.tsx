import React from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import useStore from '../../contexts/store';
import { workspaceError } from '../../../shared/competition/client';
import { CompetitionWorkspaceView } from '../competition/CompetitionWorkspaceView';
import { CompetitionProjectorView } from '../competition/CompetitionProjectorView';
import {
  WORKSPACE_SCENARIOS,
  projectorScenarios,
  roomScenarios,
  scenarioPage,
} from '../competition/fixtures';
import { RoomView } from '../tournois/TournoisRoom';

/**
 * Replays a reorder: shows `before` for a beat, then `after`, so the review
 * sees the rows travel (and, under reduced motion, simply change).
 */
function useReplay<T>(after: T, before: T | null | undefined, id: string): [T, () => void] {
  const [epoch, setEpoch] = React.useState(0);
  const [showAfter, setShowAfter] = React.useState(!before);
  React.useEffect(() => {
    if (!before) { setShowAfter(true); return undefined; }
    setShowAfter(false);
    const timer = window.setTimeout(() => setShowAfter(true), 900);
    return () => window.clearTimeout(timer);
  }, [id, before, epoch]);
  return [showAfter || !before ? after : before, () => setEpoch((e) => e + 1)];
}

/**
 * Studio section: the real competition renderers fed by fixtures through the
 * real page builder — no request leaves the browser. Deep links for review:
 * /arena/studio?cw=<scenario>&pj=<scenario>&room=<scenario>&lang=ht#competitions
 * Add &full=1 to show the public screen alone, full window (1920×1080 /
 * 1280×720 review: it must fit without scrolling).
 */
export default function CompetitionShowcase() {
  const [params, setParams] = useSearchParams();
  const storeHt = useStore((s) => s.language) === 'ht';
  const lang = params.get('lang');
  const ht = lang ? lang === 'ht' : storeHt;
  const cw = params.get('cw') || WORKSPACE_SCENARIOS[0].id;
  const scenario =
    WORKSPACE_SCENARIOS.find((s) => s.id === cw) || WORKSPACE_SCENARIOS[0];
  const [now] = React.useState(() => Date.now());
  const projectors = React.useMemo(() => projectorScenarios(now), [now]);
  const pj = projectors.find((p) => p.id === params.get('pj')) || projectors[0];
  const [pjBoard, replayPj] = useReplay(pj.board, pj.boardBefore, pj.id);
  const rooms = React.useMemo(() => roomScenarios(now), [now]);
  const room = rooms.find((r) => r.id === params.get('room')) || rooms[0];
  const [roomBoard, replayRoom] = useReplay(room.standings, room.standingsBefore, room.id);
  const full = params.get('full') === '1';
  const [notice, setNotice] = React.useState('');
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setNotice('');
  };
  return (
    <div className="studio-cw">
      <div className="studio-cw__bar" role="group" aria-label="Langue">
        {(['fr', 'ht'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={ht === (l === 'ht')}
            onClick={() => set('lang', l)}
          >
            {l === 'fr' ? 'Français' : 'Kreyòl'}
          </button>
        ))}
      </div>
      <div className="studio-cw__bar" role="group" aria-label="Scénario">
        {WORKSPACE_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === scenario.id}
            onClick={() => set('cw', s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="studio-cw__frame" data-scenario={scenario.id}>
        <CompetitionWorkspaceView
          kind={scenario.target.kind}
          page={scenario.loading ? null : scenarioPage(scenario, now)}
          ht={ht}
          uid={scenario.uid}
          loading={!!scenario.loading}
          error={scenario.error ? workspaceError(scenario.error, ht) : ''}
          notice={notice}
          pageKey={scenario.id}
          filter={{ school: '', department: '' }}
          onFilter={() => undefined}
          onRetry={() => undefined}
          onSignIn={() => undefined}
          onMore={scenario.more ? () => undefined : undefined}
          execute={async () => {
            await new Promise((r) => setTimeout(r, 400));
            setNotice(ht ? 'Aksyon an konfime.' : 'Action confirmée.');
          }}
        />
      </div>
      <h3 className="studio__title studio-cw__h">
        {ht ? 'Ekran piblik' : 'Écran public'}
      </h3>
      <div className="studio-cw__bar" role="group" aria-label="Écran">
        {projectors.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === pj.id}
            onClick={() => set('pj', p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {pj.boardBefore ? (
        <div className="studio-cw__bar">
          <button type="button" onClick={replayPj}>Rejouer le reclassement</button>
        </div>
      ) : null}
      {(() => {
        const screen = (
      <div
        className={`studio-cw__frame studio-cw__frame--projector${full ? ' studio-pj-full' : ''}`}
        data-scenario={pj.id}
      >
        <CompetitionProjectorView
          eventId="ev1"
          event={pj.event}
          live={pj.live}
          board={pjBoard}
          phase={pj.phase}
          teamRule={pj.teamRule}
          error={pj.error ? workspaceError(pj.error, ht) : ''}
          now={now}
          ht={ht}
          onRetry={() => undefined}
          embedded
        />
      </div>
        );
        // Full window: above the app chrome, like the real /arena/ecran route.
        return full ? createPortal(screen, document.body) : screen;
      })()}
      <h3 className="studio__title studio-cw__h">
        {ht ? 'Sal tounwa a' : 'Salle de tournoi'}
      </h3>
      <div className="studio-cw__bar" role="group" aria-label="Salle">
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={r.id === room.id}
            onClick={() => set('room', r.id)}
          >
            {r.label}
          </button>
        ))}
        {room.standingsBefore ? (
          <button type="button" onClick={replayRoom}>Rejouer le reclassement</button>
        ) : null}
      </div>
      <div className="studio-cw__frame studio-cw__frame--room" data-scenario={room.id}>
        <RoomView
          key={room.id}
          tour={room.tour}
          roster={room.roster}
          live={room.live}
          progress={room.progress}
          standings={roomBoard}
          matches={[]}
          me={room.me}
          now={now}
          offset={0}
        />
      </div>
    </div>
  );
}
