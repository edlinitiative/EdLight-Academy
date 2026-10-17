/**
 * Runtime half of the onboarding coordinator (the rules live in ./coordinator).
 *
 * - `missionStatus` is persisted under its own AsyncStorage key, because
 *   contexts/store.ts is owned by another workstream and the coordinator must
 *   not need a new field there. Everything else the sequence needs is derived
 *   from flags that already exist (gradeChosen, tourCompleted, activity).
 * - `invite`, `rootRoute`, `activeTab` are in memory: an invitation belongs to
 *   the launch that delivered it; the next cold start simply resumes onboarding.
 */
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useStore from '../contexts/store';
import { navigationRef } from '../navigation/AppNavigator';
import {
  type MissionStatus, type PendingInvite, type Surface,
  nextSurface, parseInviteUrl, receiveInvite, inviteOnRoute, inviteExpiresAt,
  hasFirstSuccess as deriveFirstSuccess, missionAfterWelcome,
} from './coordinator';

export const ONBOARDING_KEY = '@edlight:onboarding_v1';

interface OnboardingState {
  missionStatus: MissionStatus;
  missionLoaded: boolean;
  /** the launch URL has been inspected (so an Arena link to Home can't race the welcome sheet) */
  linkChecked: boolean;
  invite: PendingInvite | null;
  /** true once any invite was resolved this launch (skips the first-quiz pitch). */
  arrivedByInvite: boolean;
  rootRoute: string | null;
  activeTab: string | null;
  /** bumped by timers so time-based rules (invite hold) re-evaluate */
  tick: number;
}

export const useOnboardingState = create<OnboardingState>(() => ({
  missionStatus: 'none',
  missionLoaded: false,
  linkChecked: false,
  invite: null,
  arrivedByInvite: false,
  rootRoute: null,
  activeTab: null,
  tick: 0,
}));

function persistMission(status: MissionStatus) {
  AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify({ missionStatus: status })).catch(() => {});
}

export function setMissionStatus(status: MissionStatus) {
  useOnboardingState.setState({ missionStatus: status });
  persistMission(status);
}

/** Called by the welcome sheet once a grade is picked or skipped. */
export function completeWelcomeStep(isFirstRun: boolean) {
  const s = useOnboardingState.getState();
  setMissionStatus(missionAfterWelcome({ isFirstRun, arrivedByInvite: s.arrivedByInvite, previous: s.missionStatus }));
  // The language shown while the grade was chosen is now the chosen language.
  useStore.getState().setLanguageChosen(true);
}

function onboardingOwed(): boolean {
  const st = useStore.getState();
  const o = useOnboardingState.getState();
  return !st.gradeChosen || !st.tourCompleted || o.missionStatus === 'pending';
}

function readRoutes(): { root: string | null; tab: string | null } {
  try {
    if (!navigationRef.isReady()) return { root: null, tab: null };
    const state: any = navigationRef.getRootState();
    const root = state?.routes?.[state.index ?? 0];
    const nested = root?.state;
    const tab = nested?.routes?.[nested.index ?? 0]?.name ?? (root?.name === 'Main' ? 'Dashboard' : null);
    return { root: root?.name ?? null, tab };
  } catch {
    return { root: null, tab: null };
  }
}

function syncRoutes() {
  const { root, tab } = readRoutes();
  const o = useOnboardingState.getState();
  const invite = inviteOnRoute(o.invite, root, Date.now(), onboardingOwed());
  const resolvedNow = !!invite?.resolved && !o.invite?.resolved;
  useOnboardingState.setState({
    rootRoute: root,
    activeTab: tab,
    invite,
    ...(resolvedNow ? { arrivedByInvite: true } : {}),
  });
}

function onUrl(url: string | null) {
  const kind = parseInviteUrl(url);
  if (!kind) return;
  useOnboardingState.setState({ invite: receiveInvite(kind, Date.now()) });
}

let started = false;

/**
 * Attach the listeners once for the app's lifetime (initial URL, warm links,
 * navigation state). Safe to call from several components — only the first
 * call does anything. Mounted from WelcomeGradeModal, which is always mounted
 * inside the NavigationContainer.
 */
export function startOnboardingRuntime(): void {
  if (started) return;
  started = true;

  AsyncStorage.getItem(ONBOARDING_KEY)
    .then((raw) => {
      let status: MissionStatus = 'none';
      try {
        const v = raw ? JSON.parse(raw) : null;
        if (v?.missionStatus === 'pending' || v?.missionStatus === 'done') status = v.missionStatus;
      } catch { /* default */ }
      // Keep a status set this session over the stored one.
      const cur = useOnboardingState.getState().missionStatus;
      useOnboardingState.setState({ missionStatus: cur !== 'none' ? cur : status, missionLoaded: true });
    })
    .catch(() => useOnboardingState.setState({ missionLoaded: true }));

  Linking.getInitialURL()
    .then(onUrl)
    .catch(() => {})
    .finally(() => useOnboardingState.setState({ linkChecked: true }));
  Linking.addEventListener('url', (e) => onUrl(e?.url ?? null));

  const attach = () => {
    navigationRef.addListener('state', syncRoutes);
    syncRoutes();
  };
  if (navigationRef.isReady()) attach();
  else {
    // The container becomes ready after auth resolves; poll briefly instead of
    // needing an onReady hook in AppNavigator (owned elsewhere).
    const id = setInterval(() => {
      if (navigationRef.isReady()) { clearInterval(id); attach(); }
    }, 250);
  }
}

/** The one onboarding surface eligible right now (see coordinator.nextSurface). */
export function useOnboardingSurface(): Surface {
  const hydrated = useStore((s) => s.hydrated);
  const authConfirmed = useStore((s) => s.authConfirmed);
  const gradeChosen = useStore((s) => s.gradeChosen);
  const tourCompleted = useStore((s) => s.tourCompleted);
  const focusMode = useStore((s) => s.focusMode);
  const authModalOpen = useStore((s) => s.showAuthModal);
  const firstSuccess = useStore((s) => deriveFirstSuccess(s));
  const o = useOnboardingState();

  // Re-evaluate when a holding invite expires.
  const [, force] = useState(0);
  useEffect(() => {
    const at = inviteExpiresAt(o.invite, Date.now());
    if (at == null) return;
    const id = setTimeout(() => force((n) => n + 1), Math.max(0, at - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [o.invite]);

  // Until the stored mission status is known, hold the post-welcome steps.
  if (!o.linkChecked || (gradeChosen && !o.missionLoaded)) return 'none';

  return nextSurface({
    hydrated,
    authConfirmed,
    gradeChosen,
    tourCompleted,
    missionStatus: o.missionStatus,
    hasFirstSuccess: firstSuccess,
    invite: o.invite,
    rootRoute: o.rootRoute,
    activeTab: o.activeTab,
    focusMode,
    authModalOpen,
    now: Date.now(),
  });
}
