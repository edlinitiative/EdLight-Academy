/**
 * The hub's event card copy, as a pure function of real tournament data.
 * No React; tested in utils/__tests__/arenaHubCopy.test.ts.
 */
import { stateStatus, type StatusLabel } from '../../utils/arenaStatus';
import { formatCountdown } from '../../services/arenaService';

type T = (fr: string, ht: string) => string;

export type HubKind = 'rejoin' | 'results' | 'open' | 'watch';

interface TourLike {
  state: string;
  startsAt: number;
  doorsAt: number;
}

export interface HubEventCopy {
  pill: StatusLabel | null;
  line: string;
  action: string;
  /** A real countdown to doors or start, when one applies. */
  countdown: string | null;
}

export function formatEventDate(ms: number, isCreole: boolean): string {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat(isCreole ? 'fr-HT' : 'fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

export function hubEventCopy(kind: HubKind, tour: TourLike, now: number, t: T): HubEventCopy {
  const toDoors = tour.doorsAt - now;
  const toStart = tour.startsAt - now;
  switch (kind) {
    case 'rejoin':
      return tour.state === 'live'
        ? { pill: 'live', line: t('Tu es inscrit et la partie est en cours.', 'Ou enskri e pati a ap jwe kounye a.'), action: t('Revenir dans la partie', 'Retounen nan pati a'), countdown: null }
        : {
          pill: stateStatus(tour.state),
          line: t('Les portes sont ouvertes. Entre pour compter dans les présents.', 'Pòt yo louvri. Antre pou yo konte w prezan.'),
          action: t('Entrer dans l’Arène', 'Antre nan Arèn nan'),
          countdown: toStart > 0 ? formatCountdown(toStart) : null,
        };
    case 'results':
      return {
        pill: stateStatus(tour.state),
        line: tour.state === 'grading'
          ? t('Les scores sont en cours de calcul.', 'N ap kalkile nòt yo.')
          : tour.state === 'final'
            ? t('Les résultats sont officiels.', 'Rezilta yo ofisyèl.')
            : t('Résultats provisoires, en attente de vérification.', 'Rezilta pwovizwa, n ap tann verifikasyon.'),
        action: t('Voir les résultats', 'Wè rezilta yo'),
        countdown: null,
      };
    case 'watch':
      return {
        pill: 'live',
        line: t('Le championnat est en cours. Suis ton école en direct.', 'Chanpyona a ap jwe. Swiv lekòl ou an dirèk.'),
        action: t('Regarder', 'Gade'),
        countdown: null,
      };
    case 'open':
    default:
      if (tour.state === 'doors') {
        return {
          pill: 'doors',
          line: t('Les portes sont ouvertes maintenant.', 'Pòt yo louvri kounye a.'),
          action: t('Ouvrir le lobby', 'Louvri lobi a'),
          countdown: toStart > 0 ? formatCountdown(toStart) : null,
        };
      }
      return {
        pill: stateStatus(tour.state),
        line: t('Inscriptions ouvertes. Inscris-toi avec ton école.', 'Enskripsyon louvri. Enskri ak lekòl ou.'),
        action: t('S’inscrire', 'Enskri'),
        countdown: toDoors > 0 ? formatCountdown(toDoors) : null,
      };
  }
}
