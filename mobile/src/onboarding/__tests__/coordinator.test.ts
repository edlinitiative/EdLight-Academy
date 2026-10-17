import {
  nextSurface, parseInviteUrl, inviteOnRoute, receiveInvite, inviteHolds, hasFirstSuccess,
  missionAfterWelcome, inviteKindForRoute, INVITE_HOLD_MS,
  type OnboardingInputs, type Surface,
} from '../coordinator';

const T0 = 1_760_000_000_000;

function inputs(over: Partial<OnboardingInputs> = {}): OnboardingInputs {
  return {
    hydrated: true,
    authConfirmed: true,
    gradeChosen: false,
    tourCompleted: false,
    missionStatus: 'none',
    hasFirstSuccess: false,
    invite: null,
    rootRoute: 'Main',
    activeTab: 'Dashboard',
    focusMode: false,
    authModalOpen: false,
    now: T0,
    ...over,
  };
}

/**
 * The legacy rules, for the regression check below: grade modal visible while
 * !gradeChosen || showMission; NavTour visible when gradeChosen && !tourCompleted.
 */
const SURFACES: Surface[] = ['welcome', 'mission', 'navHelp'];

describe('nextSurface — one surface at a time', () => {
  it('fresh install: the welcome sheet (language + class) comes first', () => {
    expect(nextSurface(inputs())).toBe('welcome');
  });

  it('waits for hydration and auth before showing anything', () => {
    expect(nextSurface(inputs({ hydrated: false }))).toBe('none');
    expect(nextSurface(inputs({ authConfirmed: false }))).toBe('none');
  });

  it('select grade on a first run → mission, and NOT the nav tour (the old overlap)', () => {
    const mission = missionAfterWelcome({ isFirstRun: true, arrivedByInvite: false, previous: 'none' });
    expect(mission).toBe('pending');
    const s = nextSurface(inputs({ gradeChosen: true, missionStatus: mission }));
    expect(s).toBe('mission');
    // The legacy NavTour rule (gradeChosen && !tourCompleted) would also be true
    // here — the coordinator returns exactly one value, so it can't be.
    expect(s).not.toBe('navHelp');
  });

  it('skip grade on a first run behaves like select (mission still owed)', () => {
    const mission = missionAfterWelcome({ isFirstRun: true, arrivedByInvite: false, previous: 'none' });
    expect(nextSurface(inputs({ gradeChosen: true, missionStatus: mission }))).toBe('mission');
  });

  it('dismiss mission ("Plus tard") → nothing until a first success, then nav help on Home', () => {
    const base = inputs({ gradeChosen: true, missionStatus: 'done' });
    expect(nextSurface(base)).toBe('none');
    expect(nextSurface({ ...base, hasFirstSuccess: true })).toBe('navHelp');
  });

  it('nav help is contextual: only on Home, never over another tab, a game or an exam', () => {
    const base = inputs({ gradeChosen: true, missionStatus: 'done', hasFirstSuccess: true });
    expect(nextSurface({ ...base, activeTab: 'Trivia' })).toBe('none');
    expect(nextSurface({ ...base, focusMode: true })).toBe('none');
    expect(nextSurface({ ...base, rootRoute: 'Sandra' })).toBe('none');
    expect(nextSurface({ ...base, tourCompleted: true })).toBe('none');
  });

  it('a first success cancels an owed mission (straight to optional help)', () => {
    expect(nextSurface(inputs({ gradeChosen: true, missionStatus: 'pending', hasFirstSuccess: true }))).toBe('navHelp');
  });

  it('a returning student changing class from Profile gets no mission', () => {
    const mission = missionAfterWelcome({ isFirstRun: false, arrivedByInvite: false, previous: 'done' });
    expect(nextSurface(inputs({ gradeChosen: true, missionStatus: mission, tourCompleted: true }))).toBe('none');
  });

  it('the sign-in sheet always wins', () => {
    expect(nextSurface(inputs({ authModalOpen: true }))).toBe('none');
  });

  it('never returns two surfaces across every flag combination', () => {
    const bools = [false, true];
    for (const gradeChosen of bools) for (const tourCompleted of bools) for (const hasFirstSuccess of bools)
      for (const missionStatus of ['none', 'pending', 'done'] as const)
        for (const activeTab of ['Dashboard', 'Trivia'])
          for (const rootRoute of ['Main', 'Defi', 'ArenaLobby', null]) {
            const s = nextSurface(inputs({ gradeChosen, tourCompleted, hasFirstSuccess, missionStatus, activeTab, rootRoute }));
            expect(['none', ...SURFACES]).toContain(s);
            if (s === 'welcome') expect(gradeChosen).toBe(false);
            if (s === 'mission' || s === 'navHelp') expect(gradeChosen).toBe(true);
            if (s !== 'none') expect(rootRoute).toBe('Main');
          }
  });
});

describe('invitations', () => {
  it('parses duel and Arena links on both prefixes', () => {
    expect(parseInviteUrl('edlight://defi/ABC123')).toBe('duel');
    expect(parseInviteUrl('https://academy.edlight.org/defi/ABC123?x=1')).toBe('duel');
    expect(parseInviteUrl('https://academy.edlight.org/arena')).toBe('arena');
    expect(parseInviteUrl('edlight://arena/t-42')).toBe('arena');
    expect(parseInviteUrl('exp://192.168.1.2:8081/--/defi/X')).toBe(null); // dev URL shape, not a contract
    expect(parseInviteUrl('https://academy.edlight.org/courses')).toBe(null);
    expect(parseInviteUrl('edlight://defi')).toBe(null);
    expect(parseInviteUrl(null)).toBe(null);
    expect(parseInviteUrl('not a url')).toBe(null);
  });

  it('maps invite routes', () => {
    expect(inviteKindForRoute('Defi')).toBe('duel');
    expect(inviteKindForRoute('ArenaLive')).toBe('arena');
    expect(inviteKindForRoute('Main')).toBe(null);
  });

  it('launch via a duel invite: onboarding yields on the duel, resumes back on the tabs', () => {
    let invite = receiveInvite('duel', T0);
    // Linking opens the Defi screen.
    invite = inviteOnRoute(invite, 'Defi', T0 + 1000, true)!;
    expect(nextSurface(inputs({ invite, rootRoute: 'Defi' }))).toBe('none');
    // Even if they bounce to Home's tab state before leaving, nothing shows while the duel holds.
    expect(nextSurface(inputs({ invite: { ...invite }, rootRoute: 'Defi', now: T0 + 60_000 }))).toBe('none');
    // They close the duel → back on Main: invite resolves, welcome resumes.
    invite = inviteOnRoute(invite, 'Main', T0 + 120_000, true)!;
    expect(invite.resolved).toBe(true);
    expect(nextSurface(inputs({ invite, now: T0 + 120_000 }))).toBe('welcome');
    // And they don't get the "first quiz" pitch — the duel was their first activity.
    expect(missionAfterWelcome({ isFirstRun: true, arrivedByInvite: true, previous: 'none' })).toBe('none');
  });

  it('launch via an Arena invite to Home (no id): holds over Home, then expires', () => {
    const invite = receiveInvite('arena', T0);
    // The link resolves to Main itself — still held (the Arena card on Home is the point).
    expect(nextSurface(inputs({ invite, now: T0 + 5_000 }))).toBe('none');
    expect(inviteHolds(invite, T0 + INVITE_HOLD_MS - 1)).toBe(true);
    expect(nextSurface(inputs({ invite, now: T0 + INVITE_HOLD_MS + 1 }))).toBe('welcome');
  });

  it('launch via an Arena tournament link: yields through lobby → live → result, resumes on Main', () => {
    let invite = receiveInvite('arena', T0);
    for (const r of ['ArenaLobby', 'ArenaDoors', 'ArenaLive', 'ArenaResult']) {
      invite = inviteOnRoute(invite, r, T0 + 1000, true)!;
      expect(nextSurface(inputs({ invite, rootRoute: r }))).toBe('none');
    }
    invite = inviteOnRoute(invite, 'Main', T0 + 2000, true)!;
    // The Arena lobby's own grade sheet usually sets gradeChosen; then nothing is owed but help.
    expect(nextSurface(inputs({ invite, gradeChosen: true, missionStatus: 'none' }))).toBe('none');
    expect(nextSurface(inputs({ invite, gradeChosen: false }))).toBe('welcome');
  });

  it('an invite route reached before the URL listener fired still counts as an invite', () => {
    const invite = inviteOnRoute(null, 'Defi', T0, true);
    expect(invite).toEqual({ kind: 'duel', receivedAt: T0, visited: true, resolved: false });
    // …but not once onboarding is finished (normal in-app navigation).
    expect(inviteOnRoute(null, 'Defi', T0, false)).toBe(null);
  });

  it('a warm link mid-welcome takes over immediately', () => {
    expect(nextSurface(inputs())).toBe('welcome');
    const invite = receiveInvite('duel', T0);
    expect(nextSurface(inputs({ invite }))).toBe('none');
  });
});

describe('hasFirstSuccess', () => {
  it('reads any recorded activity', () => {
    expect(hasFirstSuccess({ quizAttempts: {}, review: {}, progress: {} })).toBe(false);
    expect(hasFirstSuccess({ quizAttempts: { a: [] } })).toBe(false);
    expect(hasFirstSuccess({ quizAttempts: { a: [{ score: 1 }] } })).toBe(true);
    expect(hasFirstSuccess({ review: { q1: {} } })).toBe(true);
    expect(hasFirstSuccess({ progress: { l1: { completed: true } } })).toBe(true);
    expect(hasFirstSuccess({ progress: { l1: { bestPct: 0 } } })).toBe(true);
    expect(hasFirstSuccess({ progress: { l1: {} } })).toBe(false);
  });
});
