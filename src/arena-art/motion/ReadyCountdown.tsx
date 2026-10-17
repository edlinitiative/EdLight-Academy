import React, { useEffect, useRef } from 'react';
import { useStateMachine } from './stateMachine';
import { BEAT_OFFSET, countdownMachine, CountdownState, GO_HOLD_MS } from './machines';
import { motionVars } from './tokens';
import { useReduced, useT } from './shared';
import './motion.css';

export type Beat = 'three' | 'two' | 'one' | 'go';

export interface BeatInfo {
  /** How late, by the clock, this beat is being presented. */
  lateMs: number;
  /** True when the beat is too late to sync a sound to (e.g. a throttled tab). */
  stale: boolean;
}

export interface ReadyCountdownProps {
  /** Epoch ms of the real start ("Go"). null = not scheduled yet. */
  startsAt: number | null;
  onBeat?: (beat: Beat, info: BeatInfo) => void;
  reducedMotion?: boolean;
  onStateChange?: (s: CountdownState) => void;
  /** Injectable clock — e.g. a server-offset clock. Defaults to Date.now. */
  now?: () => number;
}

/** Beats later than this are shown but never sounded. */
export const STALE_BEAT_MS = 250;
const BOUNDARIES = [-3000, -2000, -1000, 0, GO_HOLD_MS];

export default function ReadyCountdown({
  startsAt, onBeat, reducedMotion, onStateChange, now = Date.now,
}: ReadyCountdownProps) {
  const t = useT();
  const reduced = useReduced(reducedMotion);
  const startRef = useRef(startsAt);
  startRef.current = startsAt;
  const cbRef = useRef({ onBeat, onStateChange });
  cbRef.current = { onBeat, onStateChange };

  const m = useStateMachine(countdownMachine, {
    now,
    onEnter: (e) => {
      cbRef.current.onStateChange?.(e.state);
      const st = startRef.current;
      if (st == null || e.state === 'idle' || e.state === 'done') return;
      const lateMs = Math.max(0, now() - (st + BEAT_OFFSET[e.state]));
      cbRef.current.onBeat?.(e.state, { lateMs, stale: lateMs > STALE_BEAT_MS });
    },
  });

  // Feed the clock into the NUMBER input. Wake exactly at the next beat
  // boundary (and every second while waiting, for the "in N s" readout);
  // resync whenever the tab becomes visible. The state is always derived from
  // `startsAt - now`, never counted, so a stalled timer cannot make it drift.
  useEffect(() => {
    m.set('armed', startsAt != null);
    if (startsAt == null) return undefined;
    let id = 0;
    const tick = () => {
      const n = now();
      const remaining = startsAt - n;
      m.set('remaining', remaining);
      const rel = n - startsAt;
      const next = BOUNDARIES.find((b) => b > rel);
      if (next == null) return;
      const toBoundary = next - rel;
      const toSecond = remaining > 3000 ? ((remaining - 3000) % 1000) || 1000 : Infinity;
      id = window.setTimeout(tick, Math.max(4, Math.min(toBoundary, toSecond) + 4));
    };
    tick();
    const onVis = () => { if (document.visibilityState === 'visible') { window.clearTimeout(id); tick(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearTimeout(id); document.removeEventListener('visibilitychange', onVis); };
  }, [startsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = m.state;
  const remaining = m.inputs.remaining;
  const waitingSecs = startsAt != null && s === 'idle' ? Math.ceil((remaining - 3000) / 1000) + 3 : null;
  const numeral: Record<CountdownState, string> = {
    idle: '', three: '3', two: '2', one: '1', go: t('Partez !', 'Ale !'), done: '',
  };
  const lit = { idle: 0, three: 1, two: 2, one: 3, go: 3, done: 3 }[s];
  const startLabel = startsAt != null
    ? new Date(startsAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const head = s === 'done'
    ? t('Le match est lancé', 'Match la lanse')
    : startsAt == null ? t('En attente du départ', 'N ap tann depa a') : t('Le match commence', 'Match la ap kòmanse');

  // Segment arcs of the ring: three 110° arcs with gaps, starting at the top.
  const R = 92;
  const C = 2 * Math.PI * R;
  const seg = C * (110 / 360);
  const gap = C / 3 - seg;

  return (
    <div className="mo-cd" data-state={s} data-reduced={reduced ? 'true' : 'false'} style={motionVars}>
      <div className="mo-cd__stage">
        <span className="mo-cd__beam mo-cd__beam--l" aria-hidden="true" />
        <span className="mo-cd__beam mo-cd__beam--r" aria-hidden="true" />
        <span key={`p-${s}`} className="mo-cd__pulse" aria-hidden="true" />
        <div className="mo-cd__head">
          <span className="mo-cd__eyebrow">{head}</span>
          {startLabel && <span className="mo-cd__time">{t('Départ à', 'Depa a')} {startLabel}</span>}
        </div>
        <div className="mo-cd__dial">
          <svg className="mo-cd__ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle className="mo-cd__track" cx="110" cy="110" r={R} />
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                className={`mo-cd__seg${i < lit ? ' is-lit' : ''}`}
                cx="110" cy="110" r={R}
                strokeDasharray={`${seg} ${C - seg}`}
                strokeDashoffset={-(i * (C / 3) + gap / 2)}
                transform="rotate(-90 110 110)"
              />
            ))}
          </svg>
          <div className="mo-cd__num" role="timer" aria-live="assertive" aria-atomic="true">
            {s === 'idle' && waitingSecs != null && (
              <span className="mo-cd__wait">
                <span className="mo-cd__waitN">{waitingSecs}</span>
                <span className="mo-cd__waitU">{t('secondes', 'segonn')}</span>
              </span>
            )}
            {s === 'idle' && waitingSecs == null && <span className="mo-cd__wait mo-cd__waitU">—</span>}
            {numeral[s] && (
              <span key={s} className={`mo-cd__beat${s === 'go' ? ' mo-cd__beat--go' : ''}`}>{numeral[s]}</span>
            )}
            {s === 'done' && <span className="mo-cd__live">{t('En jeu', 'Nan jwèt')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
