/**
 * Onboarding coordinator — PURE (no React, no RN imports) so every sequencing
 * rule is unit-tested (audit #3, 2026-10-17).
 *
 * The first session used to be owned by two independent native modals:
 * WelcomeGradeModal (visible while !gradeChosen, then held open by local
 * `showMission` state) and NavTour (visible as soon as gradeChosen &&
 * !tourCompleted). Flipping gradeChosen made BOTH eligible at once. This module
 * replaces those two private rules with one explicit sequence:
 *
 *   1. welcome   language toggle + "which class?" (one sheet: the language
 *                switch sits on top of the grade question, so choosing a
 *                language never costs an extra screen)
 *   2. mission   the first useful activity (today's challenge) — brand-new
 *                students only
 *   3. navHelp   OPTIONAL tour of the tabs, offered (not imposed) only after a
 *                first successful action and only on Home
 *
 * At most ONE surface is ever eligible: `nextSurface` returns a single value.
 *
 * Invitations: a duel (edlight://defi/<code>, …/defi/<code>) or Arena
 * (…/arena, …/arena/<id>) link opened on a fresh install lands on its own
 * screen. Onboarding YIELDS to it: nothing is shown while the invite holds,
 * and the sequence resumes once the student comes back to the main tabs after
 * visiting the invite screen, or once the hold expires (an Arena link with no
 * tournament id lands on Home itself, so it can only expire).
 *
 * State sources (store.ts is owned elsewhere, so nothing new is added there):
 *   - gradeChosen, tourCompleted, hydrated, authConfirmed, focusMode,
 *     showAuthModal          → contexts/store (existing persisted flags)
 *   - missionStatus          → onboarding/onboardingState (own AsyncStorage key)
 *   - invite, routes         → onboarding/onboardingState (in memory: an invite
 *                              belongs to the launch that delivered it)
 *   - hasFirstSuccess        → derived from store activity (see hasFirstSuccess)
 */

export type InviteKind = 'duel' | 'arena';

export interface PendingInvite {
  kind: InviteKind;
  /** epoch ms when the link was received */
  receivedAt: number;
  /** true once the student has actually been on an invite screen */
  visited: boolean;
  /** true once they left the invite screen for the main tabs — onboarding resumes */
  resolved: boolean;
}

/** 'none' = never offered (returning users); 'pending' = owed; 'done' = taken or declined. */
export type MissionStatus = 'none' | 'pending' | 'done';

export type Surface = 'none' | 'welcome' | 'mission' | 'navHelp';

export interface OnboardingInputs {
  hydrated: boolean;
  authConfirmed: boolean;
  gradeChosen: boolean;
  tourCompleted: boolean;
  missionStatus: MissionStatus;
  /** Has the student finished at least one real activity (quiz, practice, lesson)? */
  hasFirstSuccess: boolean;
  invite: PendingInvite | null;
  /** Name of the focused ROOT route (e.g. 'Main', 'Defi', 'ArenaLobby'), null if unknown. */
  rootRoute: string | null;
  /** Focused tab inside Main (e.g. 'Dashboard'), null if unknown. */
  activeTab: string | null;
  focusMode: boolean;
  authModalOpen: boolean;
  now: number;
}

/** How long an invitation keeps onboarding away if the student never returns to the tabs. */
export const INVITE_HOLD_MS = 10 * 60 * 1000;

/** Root routes that ARE an invitation destination. */
const INVITE_ROUTES: Record<string, InviteKind> = {
  Defi: 'duel',
  ArenaLobby: 'arena',
  ArenaDoors: 'arena',
  ArenaLive: 'arena',
  ArenaResult: 'arena',
};

export function inviteKindForRoute(route: string | null | undefined): InviteKind | null {
  return (route && INVITE_ROUTES[route]) || null;
}

/**
 * Classify an incoming URL. Mirrors AppNavigator's linking config
 * (prefixes edlight:// and https://academy.edlight.org; defi/:code, arena,
 * arena/:tournamentId). Anything else is not an invitation.
 */
export function parseInviteUrl(url: string | null | undefined): InviteKind | null {
  if (!url || typeof url !== 'string') return null;
  let path = url.trim();
  const m = path.match(/^[a-z][a-z0-9+.-]*:\/\/(.*)$/i);
  if (!m) return null;
  path = m[1];
  // https://academy.edlight.org/... → strip the host. edlight://defi/x has the
  // first segment in the "host" position, so only strip known hosts.
  path = path.replace(/^(www\.)?academy\.edlight\.org(:\d+)?/i, '');
  path = path.replace(/^\/+/, '').split(/[?#]/)[0].toLowerCase();
  const [first, second] = path.split('/');
  if (first === 'defi' && second) return 'duel';
  if (first === 'arena') return 'arena';
  return null;
}

/** Does this invitation still hold onboarding back? */
export function inviteHolds(invite: PendingInvite | null, now: number): boolean {
  if (!invite || invite.resolved) return false;
  return now - invite.receivedAt < INVITE_HOLD_MS;
}

/** A link was opened (cold launch or warm). A newer invite replaces an older one. */
export function receiveInvite(kind: InviteKind, now: number): PendingInvite {
  return { kind, receivedAt: now, visited: false, resolved: false };
}

/**
 * Advance an invite on a navigation change. Visiting an invite route marks it
 * visited (also creates one when the route was reached without a URL we saw —
 * e.g. linking resolved before our listener attached); returning to 'Main'
 * after a visit resolves it.
 */
export function inviteOnRoute(
  invite: PendingInvite | null,
  rootRoute: string | null,
  now: number,
  /** true while the first-run sequence is still owed — only then is an unseen route treated as an invite */
  onboardingOwed: boolean,
): PendingInvite | null {
  const kind = inviteKindForRoute(rootRoute);
  if (kind) {
    if (invite && !invite.resolved) return invite.visited ? invite : { ...invite, visited: true };
    return onboardingOwed ? { kind, receivedAt: now, visited: true, resolved: false } : invite;
  }
  if (rootRoute === 'Main' && invite && invite.visited && !invite.resolved) {
    return { ...invite, resolved: true };
  }
  return invite;
}

/** Any recorded activity counts as a first success (store-derived, so it survives restarts). */
export function hasFirstSuccess(s: {
  quizAttempts?: Record<string, unknown[]> | null;
  review?: Record<string, unknown> | null;
  progress?: Record<string, { completed?: boolean; bestPct?: number; masteredAt?: number } | undefined> | null;
}): boolean {
  if (s.quizAttempts && Object.values(s.quizAttempts).some((a) => Array.isArray(a) && a.length > 0)) return true;
  if (s.review && Object.keys(s.review).length > 0) return true;
  if (s.progress) {
    for (const p of Object.values(s.progress)) {
      if (p && (p.completed || typeof p.bestPct === 'number' || p.masteredAt)) return true;
    }
  }
  return false;
}

/** The single surface that may own the student's attention right now. */
export function nextSurface(i: OnboardingInputs): Surface {
  if (!i.hydrated || !i.authConfirmed) return 'none';
  // Sign-in, an invite, or a focused activity (exam / game) always wins.
  if (i.authModalOpen || i.focusMode) return 'none';
  if (inviteHolds(i.invite, i.now)) return 'none';
  // Only over the main tabs — never on top of Sandra, a duel, the Arena, …
  if (i.rootRoute !== 'Main') return 'none';

  if (!i.gradeChosen) return 'welcome';
  if (i.missionStatus === 'pending' && !i.hasFirstSuccess) return 'mission';
  // Help is optional and contextual: after a first success, on Home.
  if (!i.tourCompleted && i.hasFirstSuccess && i.activeTab === 'Dashboard') return 'navHelp';
  return 'none';
}

/**
 * What the welcome step leaves behind. The mission is only for a brand-new
 * student who did not arrive through an invitation (they already have their
 * first activity: the duel or the Arena).
 */
export function missionAfterWelcome(opts: {
  isFirstRun: boolean;
  arrivedByInvite: boolean;
  previous: MissionStatus;
}): MissionStatus {
  if (opts.previous === 'done') return 'done';
  return opts.isFirstRun && !opts.arrivedByInvite ? 'pending' : opts.previous === 'pending' ? 'done' : 'none';
}

/** When will a holding invite stop holding? (for a re-evaluation timer) null if it doesn't hold. */
export function inviteExpiresAt(invite: PendingInvite | null, now: number): number | null {
  return inviteHolds(invite, now) ? invite!.receivedAt + INVITE_HOLD_MS : null;
}
