/**
 * Cross-tab navigation helpers.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS: React Navigation 7 changed `navigate` so it no longer
 * implicitly goes back to a screen already in the stack — it now either stays
 * (if focused) or PUSHES a new copy. See
 * https://reactnavigation.org/docs/upgrading-from-6.x
 *
 * That quietly breaks every "take me to this tab's home" call. Under v6,
 * `navigate('Courses', { screen: 'CourseList' })` popped a retained
 * `CourseDetail`; under v7 it pushes a second `CourseList` ON TOP of it, leaving
 * the stale screen underneath and the back button going somewhere absurd. That
 * is the same class of bug as the reported "voir tout opens the chemistry one".
 *
 * `pop: true` restores the old behaviour for a same-stack navigate, but it is an
 * option on the OUTER action and does not reliably propagate into a nested
 * navigator, which is exactly the shape used here. So for "go to the root of
 * that tab's stack" we dispatch an explicit reset scoped to the nested stack.
 * That is deterministic and independent of navigate's semantics in any version.
 */
import { CommonActions } from '@react-navigation/native';
import { gradeProfile } from '../config/trackConfig';

/**
 * Switch to `tabName` and show `rootName` as the ONLY route in its stack.
 *
 * Safe from any tab: when the target tab isn't focused, the reset rewrites its
 * stack and the follow-up navigate performs the tab switch itself.
 */
export function resetTabToRoot(
  navigation: any,
  tabName: string,
  rootName: string,
  params?: object,
) {
  const state = navigation.getState?.();
  const tabRoute = state?.routes?.find((r: any) => r.name === tabName);
  const nested = tabRoute?.state;

  // Stack not built yet (tab never visited): a plain nested navigate lands on
  // its initial route, which is what we want anyway.
  if (!nested?.key) {
    navigation.navigate(tabName, { screen: rootName, params });
    return;
  }

  navigation.dispatch({
    ...CommonActions.reset({ index: 0, routes: [{ name: rootName, params }] }),
    target: nested.key,
  });
  // The reset only rewrites the inner stack; this performs the tab switch. It is
  // a no-op when the tab is already focused.
  navigation.navigate(tabName);
}

/**
 * Switch to `tabName` and show exactly `routes` (bottom to top) in its stack.
 * Same mechanics as resetTabToRoot, for when the root must stay underneath.
 */
export function resetTabToStack(
  navigation: any,
  tabName: string,
  routes: { name: string; params?: object }[],
) {
  if (!routes.length) return;
  const state = navigation.getState?.();
  const nested = state?.routes?.find((r: any) => r.name === tabName)?.state;
  const top = routes[routes.length - 1];
  if (!nested?.key) {
    // Never built: `initial: false` keeps the stack's initial route (its root)
    // under the target. With a single route it simply lands on that route.
    navigation.navigate(tabName, routes.length > 1
      ? { screen: top.name, params: top.params, initial: false }
      : { screen: top.name, params: top.params });
    return;
  }
  navigation.dispatch({
    ...CommonActions.reset({ index: routes.length - 1, routes }),
    target: nested.key,
  });
  navigation.navigate(tabName);
}

/**
 * The root of the Exams tab's stack. Since TestFlight build 63 the tab mounts
 * ExamsNavigator for EVERY grade (7e–8e and NS1–NS3 used to get a Quiz-only
 * stack whose root was `Quizzes`, so they never saw the exam landing). Kept as
 * a function so exam screens that reset "home" have one place to ask.
 */
export function examStackRoot(_navigation?: any): 'ExamLanding' {
  return 'ExamLanding';
}

/**
 * "Practice" from Home / Profile cards: the Exams tab, with quick practice on
 * top for quiz-primary grades (7e–8e, NS1–NS3), where quizzes lead. The exam
 * landing always stays underneath, so Back (and a tab press) lands on it.
 */
export function openPractice(navigation: any, grade: string | null | undefined) {
  if (gradeProfile(grade).primaryTab === 'Quiz') {
    resetTabToStack(navigation, 'Exams', [{ name: 'ExamLanding' }, { name: 'Quizzes' }]);
  } else {
    resetTabToRoot(navigation, 'Exams', 'ExamLanding');
  }
}
