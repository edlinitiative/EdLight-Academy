import { normalizeName } from '../../../shared/leaderboardAgg';
import type { ArenaState } from '../../../shared/arena/state';

/**
 * What changing school from the Profil means, said before it happens.
 *
 * Two existing rules decide the words — neither is new here:
 *
 *  · THE WEEK MOVES WITH YOU. A leaderboard entry carries ONE school, and the
 *    award endpoint stamps the current school onto it on every game
 *    (api/leaderboard/award.ts). So the points a student earned this week
 *    count for the new school from now on; the old school loses them.
 *  · AN ARÈNE REGISTRATION DOES NOT MOVE. It is its own server record
 *    (`tournamentRegistrations/{tid}_{uid}.schoolKey`). While sign-up is open
 *    the student can re-register in the lobby to correct it (register.ts
 *    keeps their row); once the championship is live it is locked. Changing
 *    the profile never touches it, so nothing is blocked — the student is
 *    told, so they are not surprised on the night.
 */

export interface SchoolChangeArena {
  state: ArenaState;
  title: string;
}

export type SchoolChangePlan =
  | { kind: 'noop' }
  | { kind: 'save' }
  | { kind: 'confirm'; title: string; message: string; confirm: string; cancel: string };

const OPEN_FOR_SIGNUP: ArenaState[] = ['registration', 'doors'];

export function schoolChangePlan({
  from,
  to,
  arena,
  isCreole,
}: {
  from: string | null | undefined;
  to: string;
  arena: SchoolChangeArena | null;
  isCreole: boolean;
}): SchoolChangePlan {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const next = String(to || '').trim();
  if (!next) return { kind: 'noop' };
  // Same school, different spelling, is the SAME school on the board.
  if (from && normalizeName(from) === normalizeName(next)) return { kind: 'noop' };
  // A first choice moves nothing and binds nothing: save it.
  if (!from && !arena) return { kind: 'save' };

  const lines: string[] = [];
  if (from) {
    lines.push(t(
      `Tes points de cette semaine passent avec toi à ${next}.`,
      `Pwen ou fè semèn sa a ale avè w nan ${next}.`,
    ));
  }
  if (arena) {
    const name = arena.title ? `« ${arena.title} »` : t('en cours', 'k ap fèt la');
    lines.push(OPEN_FOR_SIGNUP.includes(arena.state)
      ? t(
        `Ton inscription au championnat ${name} ne change pas. Pour jouer pour ${next}, refais ton inscription dans l’Arène avant le début.`,
        `Enskripsyon ou nan chanpyona ${name} pa chanje. Pou jwe pou ${next}, refè enskripsyon ou nan Arèn nan anvan l kòmanse.`,
      )
      : t(
        `Le championnat ${name} reste joué pour l’école de ton inscription.`,
        `Chanpyona ${name} rete pou lekòl ou te enskri a.`,
      ));
  }

  return {
    kind: 'confirm',
    title: t('Changer d’école ?', 'Chanje lekòl ?'),
    message: lines.join('\n\n'),
    confirm: t('Changer', 'Chanje'),
    cancel: t('Annuler', 'Anile'),
  };
}
