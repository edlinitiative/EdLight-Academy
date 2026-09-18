import React from 'react';
import type { SchoolStanding, StandingsSnapshot } from '../../../shared/arena/events';
import type { Scene } from '../../../shared/arena/director';
import { namedCauses, sceneCauses, schoolHue, type Translate } from './movement';

/**
 * The board, as the movement sequences need it.
 *
 * Sequences 7 and 9 explicitly KEEP the board — an overtake is a lane leaving
 * the standings and coming back to them, and a streak is a card beside a board
 * that never goes anywhere. So those scenes draw the lanes themselves rather
 * than importing `Board`, which belongs to the resting state and is owned
 * elsewhere. This is the shared strip they all use, so the four scenes that
 * need lanes cannot drift into four different boards.
 *
 * It renders what it is given and decides nothing: the rank order, the travel
 * offsets and which lane is the moment are all computed by the scene from
 * `movement.ts`.
 */

export interface LaneRow {
  key: string;
  rank: number;
  shortName: string;
  label?: string;
  teamAvg: number;
  /** FLIP origin, in lane heights. Positive starts the lane below. */
  travel?: number;
  /** A gain: this lane, and only a lane that gained, gets the ray sweep. */
  gain?: boolean;
  dim?: boolean;
  focus?: boolean;
  chip?: React.ReactNode;
}

export interface MovementLanesProps {
  rows: LaneRow[];
  /** A row's key, after which `interpose` is placed. The tie's margin block. */
  interposeAfter?: string;
  interpose?: React.ReactNode;
}

/** Schools that are actually competing, in rank order. Rank 0 is "not yet". */
export function rankedSchools(standings: StandingsSnapshot | null | undefined): SchoolStanding[] {
  return (standings?.schools || [])
    .filter((s) => s && typeof s.rank === 'number' && s.rank > 0)
    .slice()
    .sort((a, b) => a.rank - b.rank);
}

export default function MovementLanes({ rows, interposeAfter, interpose }: MovementLanesProps) {
  return (
    <ol className="mv-lanes">
      {(rows || []).map((row) => (
        <React.Fragment key={row.key}>
          <li
            className={[
              'mv-lane',
              row.travel !== undefined ? 'mv-lane--travel' : '',
              row.gain ? 'mv-lane--gain' : '',
              row.dim ? 'mv-lane--dim' : '',
              row.focus ? 'mv-lane--focus' : '',
            ].filter(Boolean).join(' ')}
            style={{
              ['--mv-hue' as string]: String(schoolHue(row.key)),
              ...(row.travel !== undefined
                ? { ['--mv-from' as string]: `calc(var(--mv-lane-h) * ${row.travel})` }
                : null),
            }}
          >
            <span className="mv-lane__hue" aria-hidden="true" />
            <span className="mv-lane__rank">{row.rank}</span>
            <span className="mv-lane__school">
              <span className="mv-lane__name">
                {row.shortName}
                {row.chip}
              </span>
              {row.label && row.label !== row.shortName
                ? <span className="mv-lane__full">{row.label}</span>
                : null}
            </span>
            <span className="mv-lane__score">{Math.round(row.teamAvg || 0)}</span>
          </li>
          {interpose && interposeAfter === row.key ? interpose : null}
        </React.Fragment>
      ))}
    </ol>
  );
}

/**
 * Who moved the board, named last.
 *
 * `causedBy` is the payoff of almost every sequence in this folder: an overtake
 * without it is a lane sliding for no reason. Three names is what a scene can
 * say out loud, so the rest are counted rather than listed, and the gain beside
 * each name is what makes it evidence instead of a caption.
 *
 * `extra` is where a composed scene appends its ONE additional clause — never a
 * second moment played after the first.
 */
export function CauseLine({ scene, t, extra }: { scene: Scene; t: Translate; extra?: string | null }) {
  const { named, others } = namedCauses(sceneCauses(scene));

  if (named.length === 0) {
    return extra ? <span className="mv-late">{extra}</span> : null;
  }

  return (
    <span className="mv-late">
      {t('Grâce à', 'Gras a')}{' '}
      {named.map((cause, i) => (
        <React.Fragment key={cause.uid}>
          {i > 0 ? ' · ' : ''}
          <span className="mv-name">{cause.displayName}</span>
          {cause.gained > 0 ? <span className="mv-num"> +{Math.round(cause.gained)}</span> : null}
        </React.Fragment>
      ))}
      {others > 0 ? ` ${t(`et ${others} autre${others > 1 ? 's' : ''}`, `ak ${others} lòt`)}` : ''}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

export interface SlotPerson { uid: string; displayName: string; score?: number }

/**
 * A school's five, as five slots — the shape both halves of the substitution
 * are drawn in.
 *
 * Framed as a substitution on purpose: a school's counting five is a team sheet
 * and a change to it is a player coming on for another, not a row appearing in
 * a list. So the arriving card slides INTO the slot the leaving card is
 * dropping out of, in the same beat, and the other four hold still — which is
 * the only way a viewer can see which slot changed.
 */
export function FiveSlots({
  slots,
  person,
  outgoing,
  vacatedIndex,
  outLabel,
}: {
  slots: Array<{ uid: string; index: number; role: 'incoming' | 'held' }>;
  person: (uid: string) => SlotPerson | null;
  outgoing?: { displayName: string } | null;
  vacatedIndex: number;
  outLabel: string;
}) {
  return (
    <div className="mv-slots">
      {slots.map((slot) => {
        const who = person(slot.uid);
        const incoming = slot.role === 'incoming';
        return (
          <div
            key={slot.uid || slot.index}
            className={`mv-slot${incoming ? ' mv-slot--incoming' : ''}`}
          >
            <div className={incoming ? 'mv-slot__in' : undefined}>
              <div className="mv-slot__n">{slot.index + 1}</div>
              <div className="mv-slot__name">{who?.displayName || '—'}</div>
              {typeof who?.score === 'number'
                ? <div className="mv-slot__meta">{Math.round(who.score)}</div>
                : null}
            </div>
            {outgoing && slot.index === vacatedIndex ? (
              <div className="mv-slot__out" aria-hidden="true">
                <div className="mv-slot__n">{outLabel}</div>
                <div className="mv-slot__name">{outgoing.displayName}</div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
