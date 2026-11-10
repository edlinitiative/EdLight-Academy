import { resolveAppPath, type LinkTarget } from './arenaLinks';
import {
  inboxPath,
  isInboxTargetKind,
} from '../../../shared/competition/notifications';
/**
 * Where a competition push opens. The destination is rebuilt from the typed
 * (targetKind, targetId) reference; `path` is only a fallback and must be an
 * internal /arena/… path that resolves to the workspace. Anything else is
 * ignored rather than opened — the screen re-resolves permissions itself.
 */
export function competitionNotificationTarget(
  data: Record<string, unknown> | undefined,
): Extract<LinkTarget, { screen: 'CompetitionWorkspace' }> | null {
  if (!data || data.type !== 'competition') return null;
  const workspace = (target: LinkTarget | null) =>
    target?.screen === 'CompetitionWorkspace' && target.params.kind !== 'home'
      ? target
      : null;
  if (isInboxTargetKind(data.targetKind) && typeof data.targetId === 'string') {
    const typed = workspace(
      resolveAppPath(inboxPath(data.targetKind, data.targetId)),
    );
    if (typed) return typed;
  }
  return typeof data.path === 'string' && /^\/arena\/[^/]/.test(data.path)
    ? workspace(resolveAppPath(data.path))
    : null;
}
/** Only minimal typed destinations; no tokens, answers or private form text. */
export function savedCompetitionTarget(
  route: { name: string; params?: any } | undefined,
): LinkTarget | null {
  if (!route) return null;
  if (route.name === 'CompetitionWorkspace') {
    const kind = route.params?.kind;
    const paths: Record<string, string> = {
      event: 'evenements',
      team: 'equipes',
      invite: 'invitations',
      league: 'ligues',
      school: 'ecoles',
    };
    if (!kind || kind === 'home') return resolveAppPath('/arena/competitions');
    return paths[kind] && typeof route.params?.id === 'string'
      ? resolveAppPath(`/arena/${paths[kind]}/${route.params.id}`)
      : null;
  }
  if (route.name === 'Tournois')
    return route.params?.tournamentId
      ? resolveAppPath(`/tournois/${route.params.tournamentId}`)
      : resolveAppPath('/tournois');
  return null;
}
/**
 * How long a competition place stays worth reopening. A student who closed the
 * app mid-tournament comes back to it; one who left days ago does not. Records
 * without `savedAt` (written before this rule) are ignored, which also frees
 * phones stuck on Tournois by the old never-cleared key (TestFlight, Nov 2026).
 */
export const COMPETITION_PLACE_MAX_AGE_MS = 6 * 3_600_000;
export function restoreCompetitionTarget(
  raw: unknown,
  uid: string | null,
  now: number = Date.now(),
): LinkTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as { uid?: unknown; target?: any; savedAt?: unknown };
  if (record.uid !== null && record.uid !== uid) return null;
  if (typeof record.savedAt !== 'number' || now - record.savedAt > COMPETITION_PLACE_MAX_AGE_MS || record.savedAt - now > 60_000) return null;
  const target = record.target;
  return target && typeof target === 'object'
    ? savedCompetitionTarget({ name: target.screen, params: target.params })
    : null;
}
