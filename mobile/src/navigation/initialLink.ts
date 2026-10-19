/**
 * Cold-start link replay (P0 validation, 2026-10-19).
 *
 * `authConfirmed` is not persisted, so on a cold start the root stack mounts
 * with ONLY `Loading` registered and React Navigation discards the linking
 * state for anything else. The post-auth replay used to cover only the
 * competition screens, so a duel invite (`/defi/CODE`) or an Arène link that
 * launched the app landed on Home and the invitation was lost.
 *
 * Replay any resolved target unless the navigator is already showing it
 * (the warm path, where linking did apply).
 */
export function shouldReplayInitialTarget(
  target: { screen: string } | null | undefined,
  currentRouteName: string | null | undefined,
): boolean {
  if (!target) return false;
  // Main is where a cold start lands anyway; only replay it to reach a tab.
  if (target.screen === 'Main') return true;
  return currentRouteName !== target.screen;
}
