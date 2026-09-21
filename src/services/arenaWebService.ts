/**
 * arenaWebService — what the WEB is allowed to do with a tournament.
 *
 * Ted's call, 2026-09-21: "only the play is now allowed on website, everything
 * else is." So the web registers a student, shows them the event and reports
 * their school's progress; the live questions stay in the app, because that is
 * where the integrity controls live (screen-capture blocking, device
 * attestation, a single attested session).
 *
 * Registration was mobile-only before this, which meant a student on a school
 * computer — a lot of this audience — hit a QR code and stopped there. The
 * expensive step (install the app) was demanded before the cheap one (say
 * which school you are with), and the cheap one is the one that has to happen
 * while a student's interest is live.
 *
 * SIGNED-IN ONLY, also Ted's call: registration writes a player row keyed by
 * uid, so it needs an identity before it can mean anything.
 */
import { getIdToken } from './firebase';

const REGISTER_URL = '/api/arena/register';

export interface ArenaSchoolCounts {
  registered: number;
  present: number;
  qualified: boolean;
  needed: number;
}

/**
 * One shape rather than a discriminated union: the root tsconfig runs with
 * `strictNullChecks: false`, and under it TypeScript will not narrow a
 * `{ok:true}|{ok:false}` union at the call site — the caller would have to
 * cast to read `error`. A flat result with optional fields tells the truth
 * about what the compiler can actually check here.
 */
export interface ArenaRegisterResult {
  ok: boolean;
  /** Present on success, when the server reported the school's tally. */
  counts?: ArenaSchoolCounts | null;
  /** Present on failure — a machine code, mapped by registerErrorMessage. */
  error?: string;
}

function countsFrom(data: any): ArenaSchoolCounts | null {
  const c = data?.counts;
  if (!c || typeof c !== 'object') return null;
  return {
    registered: Number(c.registered) || 0,
    present: Number(c.present) || 0,
    qualified: c.qualified === true,
    needed: Number(c.needed) || 0,
  };
}

/**
 * Register the signed-in student for a tournament.
 *
 * The server is the authority on every rule that matters — whether sign-up is
 * open, whether the grade may compete, whether the school key names a real
 * school — so this sends the three facts and reports back what it said. It
 * never decides eligibility locally; a client that "knows" the rules is a
 * client that disagrees with the server the day one changes.
 */
export async function registerForTournament(opts: {
  tournamentId: string;
  schoolKey: string;
  grade: string;
}): Promise<ArenaRegisterResult> {
  const token = await getIdToken();
  if (!token) return { ok: false, error: 'not_signed_in' };

  try {
    const res = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tournamentId: opts.tournamentId,
        schoolKey: opts.schoolKey,
        grade: opts.grade,
        // No deviceHash from the web. The field exists to make "forty accounts
        // from one phone" visible, and a browser has nothing equivalent to
        // offer — sending a fabricated value would be worse than sending none.
        deviceHash: null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error || `http_${res.status}`) };
    }
    return { ok: true, counts: countsFrom(data) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** The errors the register endpoint can answer with, in the student's words. */
export function registerErrorMessage(code: string, isCreole: boolean): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  switch (code) {
    case 'not_signed_in':
      return t('Connectez-vous pour vous inscrire.', 'Konekte pou w enskri.');
    case 'registration_closed':
      return t(
        'Les inscriptions sont fermées pour ce championnat.',
        'Enskripsyon yo fèmen pou chanpyona sa a.',
      );
    case 'grade_not_eligible':
      return t(
        'Ce championnat est réservé aux élèves du primaire et du secondaire.',
        'Chanpyona sa a se pou elèv primè ak segondè.',
      );
    case 'unknown_school':
      return t(
        'Cette école n’est pas encore dans notre liste. Choisissez-en une autre pour l’instant.',
        'Lekòl sa a poko nan lis nou an. Chwazi yon lòt pou kounye a.',
      );
    case 'offline':
      return t(
        'Pas de connexion — réessayez dans un instant.',
        'Pa gen koneksyon — eseye ankò nan yon ti moman.',
      );
    default:
      return t('Inscription impossible pour le moment.', 'Nou pa ka enskri w kounye a.');
  }
}
