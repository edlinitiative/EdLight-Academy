import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useStateMachine } from './stateMachine';
import { ceremonyMachine, CeremonyState } from './machines';
import { motionVars } from './tokens';
import { useReduced, useT } from './shared';
import Trophy from './Trophy';
import './motion.css';

/** The result as the server reports it — the authoritative input. */
export type ResultStatus = 'pending' | 'provisional' | 'tie' | 'confirmed';

export interface CeremonySchool {
  name: string;
  colors: { primary: string; secondary: string };
  points?: number;
}

export interface TrophyCeremonyProps {
  event: { title: string; subtitle: string; year?: string };
  winner: CeremonySchool & { roster: string[] };
  /** Schools level on points, for the `tie` state. */
  tied?: CeremonySchool[];
  status: ResultStatus;
  /** Reconnecting to an already-confirmed result: show it, don't replay it. */
  resume?: boolean;
  /** Labels the frame as demo data. */
  demo?: boolean;
  reducedMotion?: boolean;
  onStateChange?: (s: CeremonyState) => void;
  /**
   * The ceremony's words, for a result that is not the national title (e.g.
   * a confirmed duel win). Defaults are the championship's own.
   */
  labels?: { eyebrow?: string; tease?: string; roster?: string };
}

export interface TrophyCeremonyHandle {
  skip: () => void;
  replay: () => void;
}

const COSMETIC: CeremonyState[] = ['dark', 'anticipation', 'reveal', 'roster'];

const TrophyCeremony = forwardRef<TrophyCeremonyHandle, TrophyCeremonyProps>(function TrophyCeremony({
  event, winner, tied = [], status, resume = false, demo = false, reducedMotion, onStateChange, labels,
}, ref) {
  const t = useT();
  const reduced = useReduced(reducedMotion);
  const m = useStateMachine(ceremonyMachine, { onEnter: (e) => onStateChange?.(e.state) });
  useImperativeHandle(ref, () => ({ skip: () => m.send('skip'), replay: () => m.send('replay') }), [m]);

  const first = useRef(true);
  useEffect(() => {
    const restoring = first.current && resume;
    first.current = false;
    if (status === 'confirmed') m.send(restoring ? 'restore' : 'confirm');
    else if (status === 'provisional') m.send('provisional');
    else if (status === 'tie') m.send('tie');
    else m.send('reset');
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = m.state;
  const winnerShown = s === 'reveal' || s === 'roster' || s === 'settled';
  const cosmetic = COSMETIC.includes(s);
  const trophyLit = winnerShown;

  const chip: Record<CeremonyState, { label: string; tone: 'final' | 'prov' | 'muted' }> = {
    waiting: { label: t('Résultats à venir', 'Rezilta ap vini'), tone: 'muted' },
    dark: { label: t('Résultat final', 'Rezilta final'), tone: 'final' },
    anticipation: { label: t('Résultat final', 'Rezilta final'), tone: 'final' },
    reveal: { label: t('Résultat final', 'Rezilta final'), tone: 'final' },
    roster: { label: t('Résultat final', 'Rezilta final'), tone: 'final' },
    settled: { label: t('Résultat final', 'Rezilta final'), tone: 'final' },
    provisional: { label: t('Provisoire', 'Pwovizwa'), tone: 'prov' },
    tie: { label: t('Égalité — provisoire', 'Egalite — pwovizwa'), tone: 'prov' },
  };

  return (
    <div className="mo-tc" data-state={s} data-reduced={reduced ? 'true' : 'false'} style={motionVars}>
      <div
        className="mo-tc__stage"
        style={{ '--w1': winner.colors.primary, '--w2': winner.colors.secondary } as React.CSSProperties}
      >
        <span className="mo-tc__spot mo-tc__spot--l" aria-hidden="true" />
        <span className="mo-tc__spot mo-tc__spot--r" aria-hidden="true" />
        <span className="mo-tc__glow" aria-hidden="true" />

        <header className="mo-tc__head">
          <span className="mo-tc__event">
            <span className="mo-tc__eventTitle">{event.title}</span>
            <span className="mo-tc__eventSub">{event.subtitle}</span>
          </span>
          <span className="mo-tc__chips">
            {demo && <span className="mo-chip mo-chip--demo">{t('Démo', 'Demo')}</span>}
            <span className={`mo-chip mo-chip--${chip[s].tone}`}>{chip[s].label}</span>
          </span>
        </header>

        <div className="mo-tc__center">
          <div className="mo-tc__trophy">
            <Trophy lit={trophyLit} year={event.year} />
          </div>
        </div>

        <div className="mo-tc__copy" role="status" aria-live="polite">
          {s === 'waiting' && (
            <p className="mo-tc__note">{t('Le champion sera annoncé quand les résultats seront confirmés.', 'N ap anonse chanpyon an lè rezilta yo konfime.')}</p>
          )}
          {s === 'anticipation' && (
            <p className="mo-tc__tease">{labels?.tease ?? t('Le champion national est…', 'Chanpyon nasyonal la se…')}</p>
          )}
          {winnerShown && (
            <>
              <span className="mo-tc__eyebrow">{labels?.eyebrow ?? t('Champion national', 'Chanpyon nasyonal')}</span>
              <h3 className="mo-tc__school">{winner.name}</h3>
              <span className="mo-tc__band" aria-hidden="true" />
            </>
          )}
          {(s === 'roster' || s === 'settled') && (
            <ul className="mo-tc__roster" aria-label={labels?.roster ?? t('Équipe championne', 'Ekip chanpyon an')}>
              {winner.roster.map((n, i) => (
                <li key={n} style={{ '--i': i } as React.CSSProperties}>{n}</li>
              ))}
            </ul>
          )}
          {s === 'provisional' && (
            <>
              <h3 className="mo-tc__school mo-tc__school--quiet">{t('Résultats provisoires', 'Rezilta pwovizwa')}</h3>
              <p className="mo-tc__note">{t('Les résultats sont en cours de vérification. Aucun champion n’est déclaré avant leur confirmation.', 'Y ap verifye rezilta yo. Pa gen chanpyon ki deklare anvan yo konfime.')}</p>
            </>
          )}
          {s === 'tie' && (
            <>
              <h3 className="mo-tc__school mo-tc__school--quiet">{t('Égalité en tête', 'Egalite nan tèt')}</h3>
              <ul className="mo-tc__tied">
                {tied.map((sc) => (
                  <li key={sc.name} style={{ '--t1': sc.colors.primary } as React.CSSProperties}>
                    <span className="mo-tc__tiedName">{sc.name}</span>
                    {sc.points != null && <span className="mo-tc__tiedPts">{sc.points} pts</span>}
                  </li>
                ))}
              </ul>
              <p className="mo-tc__note">{t('Un départage désignera le champion.', 'Yon depatajman ap deside chanpyon an.')}</p>
            </>
          )}
        </div>

        {/* Always laid out (so nothing reflows when it goes), only shown while skippable. */}
        <button
          type="button"
          className={`mo-btn mo-btn--ghost mo-tc__skip${cosmetic ? '' : ' is-off'}`}
          onClick={() => m.send('skip')}
          tabIndex={cosmetic ? 0 : -1}
          aria-hidden={cosmetic ? undefined : true}
        >
          {t('Passer', 'Sote')}
        </button>
      </div>
    </div>
  );
});

export default TrophyCeremony;
