/**
 * Shared tab-press behaviour, used by BOTH tab bars (the native iOS one and the
 * JS one Android still runs), so the two can never drift.
 */
import { CommonActions } from '@react-navigation/native';

/**
 * Builds a `tabPress` handler that sends a tab back to its stack root.
 *
 * The trap this exists to avoid: `e.preventDefault()` cancels the TAB SWITCH,
 * and a reset dispatched with `target: <nested stack key>` only rewrites that
 * inner stack — it never changes which tab is active. Calling preventDefault
 * unconditionally therefore made the tab look completely dead when pressed from
 * a different tab ("it does nothing when i click on it"). So: only intercept
 * when the tab is ALREADY focused; otherwise let the navigator do the switch and
 * simply clear the stale inner stack on the way in.
 */
export function popToRootOnTabPress(
  navigation: any,
  tabName: string,
  rootName: string,
  makeParams?: () => object,
) {
  return (e: { preventDefault: () => void }) => {
    const state = navigation.getState();
    const nested = (state.routes.find((r: any) => r.name === tabName) as any)?.state;
    // Stack not built yet → the default action lands on its initial route anyway.
    if (!nested) return;
    const top = nested.routes[nested.index ?? nested.routes.length - 1]?.name;
    // Already showing the root: do nothing, so useScrollToTop still fires.
    if (top === rootName) return;
    const isFocused = state.routes[state.index]?.name === tabName;
    // Stay put and pop to the root. When NOT focused we must let the default
    // run, or the tab never changes.
    if (isFocused) e.preventDefault();
    navigation.dispatch({
      ...CommonActions.reset({
        index: 0,
        routes: [{ name: rootName, params: makeParams?.() }],
      }),
      target: nested.key,
    });
  };
}
