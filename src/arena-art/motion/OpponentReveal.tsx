import React, { useEffect, useState } from 'react';
import { useStateMachine } from './stateMachine';
import { revealMachine, RevealState, RevealTrigger } from './machines';
import { motionVars } from './tokens';
import { MotionPlayer, Portrait, schoolVars, useReduced, useT } from './shared';
import './motion.css';

/** The matchmaking phase as the server reports it — the authoritative input. */
export type MatchPhase = 'idle' | 'searching' | 'matched' | 'cancelled' | 'failed' | 'started';

const PHASE_TRIGGER: Record<MatchPhase, RevealTrigger> = {
  idle: 'reset', searching: 'search', matched: 'match', cancelled: 'cancel', failed: 'fail', started: 'start',
};

export interface OpponentRevealProps {
  me: MotionPlayer;
  opponent?: MotionPlayer | null;
  phase: MatchPhase;
  onCancel?: () => void;
  onRetry?: () => void;
  reducedMotion?: boolean;
  onStateChange?: (s: RevealState) => void;
}

function Card({ p, side, tag, mood, still }: {
  p: MotionPlayer; side: 'me' | 'op'; tag: string; mood: 'idle' | 'ready'; still: boolean;
}) {
  return (
    <div className={`mo-rv__card mo-rv__card--${side}`} style={schoolVars(p)}>
      <div className="mo-card">
        <span className="mo-card__band" aria-hidden="true" />
        <span className="mo-card__portrait"><Portrait player={p} size={112} mood={mood} still={still} /></span>
        <span className="mo-card__meta">
          <span className="mo-card__tag">{tag}</span>
          <strong className="mo-card__name">{p.name}</strong>
          <span className="mo-card__school">{p.school}</span>
        </span>
      </div>
    </div>
  );
}

function useElapsed(since: number, running: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running, since]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

export default function OpponentReveal({
  me, opponent, phase, onCancel, onRetry, reducedMotion, onStateChange,
}: OpponentRevealProps) {
  const t = useT();
  const reduced = useReduced(reducedMotion);
  const m = useStateMachine(revealMachine, { onEnter: (e) => onStateChange?.(e.state) });

  // Authoritative input: translate each server phase into its trigger.
  useEffect(() => { m.send(PHASE_TRIGGER[phase]); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = m.state;
  const matched = s === 'found' || s === 'introduce' || s === 'settled';
  const secs = useElapsed(m.snapshot.enteredAt, s === 'searching');
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const status: Record<RevealState, string> = {
    idle: t('Prêt à chercher un adversaire', 'Pare pou chèche yon advèsè'),
    searching: t('Recherche d’un adversaire…', 'N ap chèche yon advèsè…'),
    found: t('Adversaire trouvé', 'Nou jwenn yon advèsè'),
    introduce: t('Adversaire trouvé', 'Nou jwenn yon advèsè'),
    settled: t('Le match va commencer', 'Match la pral kòmanse'),
    cancelled: t('Recherche annulée', 'Rechèch la anile'),
    failed: t('La recherche n’a pas abouti', 'Rechèch la pa mache'),
  };
  const detail: Partial<Record<RevealState, string>> = {
    searching: clock,
    cancelled: t('Aucun match n’a été créé.', 'Pa gen match ki kreye.'),
    failed: t('Vérifie ta connexion, puis réessaie.', 'Verifye koneksyon ou, epi eseye ankò.'),
  };

  return (
    <div className="mo-rv" data-state={s} data-reduced={reduced ? 'true' : 'false'} style={motionVars}>
      <div
        className="mo-rv__stage"
        style={{ ...schoolVars(me, 'a'), ...(opponent ? schoolVars(opponent, 'b') : {}) } as React.CSSProperties}
      >
        <span className="mo-rv__wash mo-rv__wash--a" aria-hidden="true" />
        <span className="mo-rv__wash mo-rv__wash--b" aria-hidden="true" />
        <span className="mo-rv__floor" aria-hidden="true" />
        <span className="mo-rv__flash" aria-hidden="true" />

        <div className="mo-rv__status" role="status" aria-live="polite">
          <span className="mo-rv__statusText">
            {(s === 'found' || s === 'introduce' || s === 'settled') && <span className="mo-rv__check" aria-hidden="true" />}
            {status[s]}
          </span>
          {detail[s] && <span className="mo-rv__detail">{detail[s]}</span>}
        </div>

        <span className="mo-rv__rings" aria-hidden="true"><i /><i /><i /></span>
        <Card p={me} side="me" tag={t('Toi', 'Ou menm')} mood={matched ? 'ready' : 'idle'} still={reduced} />
        {opponent && (
          <Card p={opponent} side="op" tag={t('Adversaire', 'Advèsè')} mood={matched ? 'ready' : 'idle'} still={reduced} />
        )}
        <span className="mo-rv__vs" aria-hidden={!matched}><b>VS</b></span>
        {matched && opponent && (
          <span className="mo-sr">{`${me.name} (${me.school}) contre ${opponent.name} (${opponent.school})`}</span>
        )}

        <div className="mo-rv__foot">
          {s === 'searching' && onCancel && (
            <button type="button" className="mo-btn mo-btn--ghost" onClick={onCancel}>{t('Annuler', 'Anile')}</button>
          )}
          {(s === 'failed' || s === 'cancelled') && onRetry && (
            <button type="button" className="mo-btn mo-btn--primary" onClick={onRetry}>
              {s === 'failed' ? t('Réessayer', 'Eseye ankò') : t('Relancer la recherche', 'Chèche ankò')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
