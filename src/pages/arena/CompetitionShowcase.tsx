import React from 'react';
import { useSearchParams } from 'react-router-dom';
import useStore from '../../contexts/store';
import { workspaceError } from '../../../shared/competition/client';
import { CompetitionWorkspaceView } from '../competition/CompetitionWorkspaceView';
import { CompetitionProjectorView } from '../competition/CompetitionProjectorView';
import {
  WORKSPACE_SCENARIOS,
  projectorScenarios,
  scenarioPage,
} from '../competition/fixtures';

/**
 * Studio section: the real competition renderers fed by fixtures through the
 * real page builder — no request leaves the browser. Deep links for review:
 * /arena/studio?cw=<scenario>&pj=<scenario>&lang=ht#competitions
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
      <div className="studio-cw__frame studio-cw__frame--projector" data-scenario={pj.id}>
        <CompetitionProjectorView
          eventId="ev1"
          event={pj.event}
          live={pj.live}
          board={pj.board}
          phase={pj.phase}
          error={pj.error ? workspaceError(pj.error, ht) : ''}
          now={now}
          ht={ht}
          onRetry={() => undefined}
        />
      </div>
    </div>
  );
}
