import React from 'react';
import { ENTER_EASE, ENTER_MS, TRAVEL_PX } from './sceneContract';

/**
 * The shared skeleton every takeover scene is built on.
 *
 * Not a style helper — a constraint. Section K gives each sequence one job and
 * one hierarchy: an overline that names what happened, ONE number or name that
 * is the biggest thing on screen, and a line of support beneath it. Twenty
 * sequences written freehand would each invent their own type scale, and the
 * cut between them would read as twenty different programmes.
 *
 * The rule that is easiest to break and matters most: **one number is the
 * biggest thing on screen, never two.** `figure` is the only slot that gets
 * display type. If a scene needs a second number it goes in `support`, smaller,
 * or it does not belong in that scene.
 */

export interface SceneFrameProps {
  /** What happened, in two or three words. Small caps, dim. */
  overline?: React.ReactNode;
  /** The one thing this scene is about. Display type. */
  figure: React.ReactNode;
  /** A line beneath the figure. Never competes with it. */
  support?: React.ReactNode;
  /** Who caused it — named last, because the cause is the payoff. */
  cause?: React.ReactNode;
  /** Anything bespoke: a lane, a map, five slots. Sits below the support line. */
  children?: React.ReactNode;
  reduceMotion?: boolean;
  /** Milliseconds to delay the entrance, for staggered groups. */
  delayMs?: number;
  className?: string;
  /** `coral` for a gain, `gold` for a win, default for everything else. */
  tone?: 'default' | 'coral' | 'gold';
}

export default function SceneFrame({
  overline,
  figure,
  support,
  cause,
  children,
  reduceMotion = false,
  delayMs = 0,
  className = '',
  tone = 'default',
}: SceneFrameProps) {
  const style: React.CSSProperties = reduceMotion
    ? { animation: 'none' }
    : {
      animation: `stage-enter ${ENTER_MS}ms ${ENTER_EASE} ${delayMs}ms both`,
      // Declared so the keyframe and the constant can never drift apart.
      ['--stage-travel' as string]: `${TRAVEL_PX}px`,
    };

  return (
    <div className={`stage-scene stage-scene--${tone} ${className}`} style={style}>
      {overline ? <div className="stage-scene__overline">{overline}</div> : null}
      <div className="stage-scene__figure">{figure}</div>
      {support ? <div className="stage-scene__support">{support}</div> : null}
      {children}
      {cause ? <div className="stage-scene__cause">{cause}</div> : null}
    </div>
  );
}
