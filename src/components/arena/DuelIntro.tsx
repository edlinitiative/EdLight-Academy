import React, { useEffect, useMemo, useRef, useState } from 'react';
import OpponentReveal from '../../arena-art/motion/OpponentReveal';
import ReadyCountdown from '../../arena-art/motion/ReadyCountdown';
import type { MotionPlayer } from '../../arena-art/motion/shared';
import { DUR, useReducedMotion } from '../../arena-art/motion/tokens';
import { useArenaSound } from '../../arena-art/sound/useArenaSound';
import SoundToggle from '../../arena-art/sound/SoundToggle';
import useStore from '../../contexts/store';
import './duelIntro.css';

/** How long the settled matchup holds before the countdown takes over. */
export const INTRO_HOLD_MS = 700;
/** The 3-2-1 before "Go", from ReadyCountdown's own beats. */
export const COUNTDOWN_MS = 3000;

/**
 * The start of a duel round (audit X1): the two faces meet (OpponentReveal,
 * when the opponent is known), then 3-2-1-Go (ReadyCountdown), then the
 * round. ONE timeline, fixed at mount: the reveal ends at `revealEnd`, Go is
 * at `goAt`, and the round mounts at Go — so this is the only director, and
 * the round's own 15-second timers start when the round actually appears.
 *
 * - Reduced motion: no reveal animation (the matchup is shown still) and the
 *   countdown numerals change without movement.
 * - Interruption: leaving unmounts it; every timer is cleared with it.
 * - Repeat play: each new duel round mounts a fresh intro — it is the start
 *   of a real round, never a routine action.
 * - "Commencer" skips straight to the round.
 */
export default function DuelIntro({ me, opponent, onGo }: {
  me: MotionPlayer;
  /** The opponent, when known (an accepted duel). Null: countdown only. */
  opponent?: MotionPlayer | null;
  onGo: () => void;
}) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const reduced = useReducedMotion();
  const { play } = useArenaSound();
  const timeline = useMemo(() => {
    const t0 = Date.now();
    const revealMs = opponent ? (reduced ? 900 : DUR.intro + INTRO_HOLD_MS) : 0;
    return { revealEnd: t0 + revealMs, goAt: t0 + revealMs + COUNTDOWN_MS };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fixed at mount
  const [stage, setStage] = useState<'reveal' | 'count'>(opponent ? 'reveal' : 'count');
  const gone = useRef(false);
  const go = () => { if (!gone.current) { gone.current = true; onGo(); } };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (stage !== 'reveal') return undefined;
    const id = window.setTimeout(() => setStage('count'), Math.max(0, timeline.revealEnd - Date.now()));
    return () => window.clearTimeout(id);
  }, [stage, timeline]);

  return (
    <section className="duel-intro" aria-label={t('Début du défi', 'Kòmansman defi a')}>
      {stage === 'reveal' && opponent ? (
        <OpponentReveal me={me} opponent={opponent} phase={reduced ? 'matched' : 'known'} reducedMotion={reduced} />
      ) : (
        <ReadyCountdown
          startsAt={timeline.goAt}
          reducedMotion={reduced}
          onBeat={(beat, info) => { if (beat === 'three' && !info.stale) { try { play('countdown'); } catch { /* silent */ } } }}
          onStateChange={(s) => { if (s === 'done') goRef.current(); }}
        />
      )}
      <div className="duel-intro__bar">
        <SoundToggle />
        <button type="button" className="duel-intro__skip" onClick={go}>{t('Commencer', 'Kòmanse')}</button>
      </div>
    </section>
  );
}
