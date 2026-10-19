/**
 * The Arène arcade's cabinets — what each one is called and where it goes.
 * The phone twin of the web /arena keys 1–6 (src/pages/arena/ArenaArcade).
 *
 * Pure (no React): the hub renders these, and the tests pin every
 * destination so a cabinet can never point at a screen that does not exist.
 */
import type { ArenaHubPrimary } from '../../hooks/useArena';

export type CabinetKey = 'champ' | 'story' | 'duel' | 'quick' | 'room' | 'mini' | 'board' | 'activity';

export type CabinetAction =
  | { kind: 'navigate'; screen: string; params?: Record<string, unknown> }
  /** A practice round on the Jeux tab. */
  | { kind: 'practice' }
  /** A round that ends in a duel invitation (Défi d'un ami). */
  | { kind: 'duel' }
  /** The Jeux tab's mini-games. */
  | { kind: 'mini' };

/** The grid under the championship, in order (the championship leads, apart). */
export const GRID_CABINETS: readonly CabinetKey[] = ['story', 'duel', 'quick', 'room', 'mini', 'board'];

/**
 * Where a cabinet goes. The championship follows the one event action that
 * applies right now (the same rule as the hub's event card); with no event it
 * opens the hub's championship section, which explains the format honestly.
 */
export function cabinetAction(key: CabinetKey, primary: ArenaHubPrimary | null | undefined): CabinetAction {
  switch (key) {
    case 'champ': {
      if (!primary || primary.kind === 'none') return { kind: 'navigate', screen: 'ArenaHub', params: { section: 'championnat' } };
      const id = primary.tournament.id;
      if (primary.kind === 'rejoin') {
        return { kind: 'navigate', screen: primary.tournament.state === 'live' ? 'ArenaLive' : 'ArenaDoors', params: { tournamentId: id } };
      }
      if (primary.kind === 'results') return { kind: 'navigate', screen: 'ArenaResult', params: { tournamentId: id } };
      if (primary.kind === 'watch') return { kind: 'navigate', screen: 'ArenaWatch', params: { tournamentId: id } };
      return { kind: 'navigate', screen: 'ArenaLobby', params: { tournamentId: id } };
    }
    case 'story': return { kind: 'navigate', screen: 'ArenaStory' };
    case 'duel': return { kind: 'duel' };
    case 'quick': return { kind: 'practice' };
    case 'room': return { kind: 'navigate', screen: 'Tournois' };
    case 'mini': return { kind: 'mini' };
    case 'board': return { kind: 'navigate', screen: 'Leaderboard' };
    case 'activity': return { kind: 'navigate', screen: 'CompetitionWorkspace', params: { kind: 'home' } };
    default: return { kind: 'navigate', screen: 'ArenaHub' };
  }
}

type T = (fr: string, ht: string) => string;

export interface CabinetCopy {
  /** The marquee — the mode's name. */
  title: string;
  /** One line under the screen. */
  sub: string;
  /** The verb on its button. */
  cta: string;
  /** Marquee bulbs and art accent (never gold: gold is earned only). */
  accent: string;
}

export function cabinetCopy(key: CabinetKey, t: T, extra: { storyNextDept?: string | null; storyStarted?: boolean } = {}): CabinetCopy {
  switch (key) {
    case 'champ':
      return { title: t('Championnat', 'Chanpyona'), sub: t('Une soirée par mois, toutes les écoles en direct.', 'Yon swa chak mwa, tout lekòl yo an dirèk.'), cta: t('Voir', 'Gade'), accent: '#FF6A45' };
    case 'story':
      return {
        title: t('Mode Histoire', 'Mòd Istwa'),
        sub: extra.storyNextDept
          ? t(`Le tour d’Ayiti. Prochaine étape : ${extra.storyNextDept}.`, `Tou Ayiti a. Pwochen etap : ${extra.storyNextDept}.`)
          : t('Campagne terminée — reviens chercher les étoiles.', 'Kanpay la fini — retounen chèche zetwal yo.'),
        cta: extra.storyStarted ? t('Continuer', 'Kontinye') : t('Commencer', 'Kòmanse'),
        accent: '#2FD18C',
      };
    case 'duel':
      return { title: t('Défi d’un ami', 'Defi yon zanmi'), sub: t('5 questions, un lien, le meilleur score gagne.', '5 kesyon, yon lyen, pi bon nòt la genyen.'), cta: t('Défier', 'Defye'), accent: '#5EA2FF' };
    case 'quick':
      return { title: t('Partie rapide', 'Pati rapid'), sub: t('Une partie tout de suite. Tes points comptent.', 'Yon pati touswit. Pwen ou konte.'), cta: t('Jouer', 'Jwe'), accent: '#FFB547' };
    case 'room':
      return { title: t('Tournoi privé', 'Tounwa prive'), sub: t('Crée une salle, partage le code, jouez ensemble.', 'Kreye yon sal, pataje kòd la, jwe ansanm.'), cta: t('Créer ou rejoindre', 'Kreye oswa antre'), accent: '#B69CFF' };
    case 'mini':
      return { title: t('Mini-jeux', 'Mini jwèt'), sub: t('Vrai ou faux, Mémoire, Mo Kaché, Calcul, Suites.', 'Vre oswa fo, Memwa, Mo Kache, Kalkil, Swit.'), cta: t('Jouer', 'Jwe'), accent: '#3DDC97' };
    case 'board':
      return { title: t('Classement', 'Klasman'), sub: t('Les écoles et les joueurs de la semaine.', 'Lekòl ak jwè semèn nan.'), cta: t('Voir', 'Gade'), accent: '#7FB2FF' };
    case 'activity':
    default:
      return { title: t('Mon activité', 'Aktivite mwen'), sub: t('Équipes et compétitions', 'Ekip ak konpetisyon'), cta: t('Ouvrir', 'Louvri'), accent: '#A3B5DC' };
  }
}
