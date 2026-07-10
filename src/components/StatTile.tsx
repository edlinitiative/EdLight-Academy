/**
 * StatTile — a single "mission-control" stat tile for the warm
 * Structured-Technical dashboard skin.
 *
 * Layout (matching the approved `.tile` design):
 *   • a mono, uppercase micro-label on top
 *   • a row with the big tabular-nums value + an optional small muted unit
 *   • an optional mono delta/caption line, colored by `tone`
 *
 * NOTE: intentionally NO sparkline. The app does not log per-day history,
 * so a trend line would be fabricated data-viz. This is the honest version.
 *
 * Tokens (--st-*) live on the ancestor `.dash--st`; every var() here carries a
 * light fallback so the tile also renders standalone. Dark mode is handled in
 * StatTile.css (token flips inside .dash--st, plus explicit dark fallbacks).
 *
 * Purely presentational — pass already-formatted strings/numbers in as props.
 */

import React from 'react';
import './StatTile.css';

export type StatTileTone = 'accent' | 'good' | 'warn' | 'muted';

export interface StatTileProps {
  /** Mono uppercase micro-label, e.g. "Série" or "XP total". */
  label: string;
  /** Big value — pass pre-formatted (e.g. "1 340", "#4", 87). */
  value: string | number;
  /** Small muted unit shown next to the value, e.g. "j" or "%". */
  unit?: string;
  /** Optional delta/caption line, e.g. "+180 cette semaine". */
  delta?: string;
  /** Color + marker of the delta line. Defaults to "muted". */
  tone?: StatTileTone;
  /** Optional small icon rendered next to the label. */
  icon?: React.ReactNode;
}

/** Leading marker per tone — ▲ for positive tones, ● neutral for muted. */
const TONE_MARKER: Record<StatTileTone, string> = {
  good: '▲',
  accent: '▲',
  warn: '▲',
  muted: '●',
};

export function StatTile({ label, value, unit, delta, tone = 'muted', icon }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">
        {icon != null && <span className="stat-tile__icon" aria-hidden="true">{icon}</span>}
        <span className="stat-tile__label-text">{label}</span>
      </div>

      <div className="stat-tile__row">
        <span className="stat-tile__value">
          {value}
          {unit ? <span className="stat-tile__unit">{unit}</span> : null}
        </span>
      </div>

      {delta ? (
        <div className={`stat-tile__delta stat-tile__delta--${tone}`}>
          <span className="stat-tile__delta-marker" aria-hidden="true">{TONE_MARKER[tone]}</span>
          {' '}
          {delta}
        </div>
      ) : null}
    </div>
  );
}

/**
 * StatTileRow — responsive grid wrapper for StatTiles.
 * 4-up on wide screens, 2-up on narrow (≤ 640px), matching the `.tiles` grid.
 */
export function StatTileRow({ children }: { children: React.ReactNode }) {
  return <div className="stat-tile-row">{children}</div>;
}

export default StatTile;
