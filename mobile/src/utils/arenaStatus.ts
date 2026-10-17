/**
 * The explicit status badge for every tournament state (audit M5).
 *
 * Pure: no React. ArenaKit's StatusPill renders these labels; the hub and the
 * spectator screen both derive their badge here, so a tournament that has not
 * started can never be called "En direct" on one surface and "Bientôt" on
 * another.
 */
import type { ArenaState } from '../../../shared/arena/state';

type T = (fr: string, ht: string) => string;

export type StatusLabel =
  | 'soon'
  | 'registration'
  | 'doors'
  | 'live'
  | 'delayed'
  | 'reconnecting'
  | 'grading'
  | 'provisional'
  | 'final'
  | 'void'
  | 'stale'
  | 'local';

export function statusLabelText(kind: StatusLabel, t: T): string {
  switch (kind) {
    case 'soon': return t('Bientôt', 'Talè');
    case 'registration': return t('Inscriptions ouvertes', 'Enskripsyon louvri');
    case 'doors': return t('Portes ouvertes', 'Pòt yo louvri');
    case 'live': return t('En direct', 'An dirèk');
    case 'delayed': return t('En différé', 'An reta');
    case 'reconnecting': return t('Reconnexion…', 'N ap rekonekte…');
    case 'grading': return t('Calcul des scores', 'N ap kalkile nòt yo');
    case 'provisional': return t('Provisoire', 'Pwovizwa');
    case 'final': return t('Officiel', 'Ofisyèl');
    case 'void': return t('Annulé', 'Anile');
    case 'stale': return t('Dernières données connues', 'Dènye done nou genyen');
    case 'local': return t('Pour toi seulement — ne compte pas', 'Pou ou sèlman — sa pa konte');
    default: return '';
  }
}

/**
 * The badge for a tournament state. Total over ArenaState: every state has
 * its own label, and only `live` is ever "En direct".
 */
export function stateStatus(state: ArenaState | string | null | undefined): StatusLabel {
  switch (state) {
    case 'registration': return 'registration';
    case 'doors': return 'doors';
    case 'live': return 'live';
    case 'grading': return 'grading';
    case 'provisional': return 'provisional';
    case 'final': return 'final';
    case 'void': return 'void';
    case 'draft':
    default:
      // Unknown or not yet open: never claim the event is running.
      return 'soon';
  }
}

/**
 * What the spectator header says. A failing connection outranks the state,
 * because "En direct" over last-known data is a lie about the data.
 */
export function watchStatus(opts: {
  state: ArenaState | string | null | undefined;
  stale: boolean;
  reconnecting: boolean;
}): StatusLabel {
  if (opts.stale || opts.reconnecting) return 'reconnecting';
  return stateStatus(opts.state);
}
