/**
 * MasteryBadge — how far up the ladder one lesson (or a whole unit) has got.
 *
 * Deliberately the quietest thing that can still carry the information: a
 * small dot and a word. No background, no border, no capsule — a lesson list
 * is 10-30 rows long, and a coloured pill on every row turns the list into
 * decoration instead of a reading order.
 *
 * Two rules the surface depends on:
 *
 * 1. `none` renders NOTHING. A course you haven't started must not sprout a
 *    column of "À découvrir" markers — that reads as a wall of failure rather
 *    than an invitation. Absence is the correct rendering of zero.
 * 2. The colour comes from `masteryRole()` in the shared model, resolved here
 *    to a CSS custom property. The shared model deliberately doesn't know
 *    about colours, so web and mobile can paint the same five states out of
 *    their own palettes without either one hardcoding the other's.
 */

import React from 'react';
import { masteryLabel, masteryRole, type MasteryLevel } from '../../shared/mastery';
import './MasteryBadge.css';

type Props = {
  level: MasteryLevel;
  /** Dot only — for tight rows where the label would wrap. */
  dotOnly?: boolean;
  isCreole?: boolean;
  className?: string;
};

export default function MasteryBadge({ level, dotOnly = false, isCreole = false, className = '' }: Props) {
  // Quiet at zero: nothing earned yet, so nothing to show.
  if (!level || level === 'none') return null;

  const label = masteryLabel(level, isCreole);

  return (
    <span
      className={`mastery-badge mastery-badge--${masteryRole(level)} ${className}`.trim()}
      // The dot is decorative, so the accessible name has to come from
      // somewhere; when the label is hidden, the title/aria-label carries it.
      title={dotOnly ? label : undefined}
      aria-label={dotOnly ? label : undefined}
    >
      <span className="mastery-badge__dot" aria-hidden="true" />
      {!dotOnly && <span className="mastery-badge__label">{label}</span>}
    </span>
  );
}
