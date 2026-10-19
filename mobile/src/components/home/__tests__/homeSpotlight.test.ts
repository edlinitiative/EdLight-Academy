/**
 * The Home spotlight's ordering and states (shared/homeSpotlight.ts) — one
 * time-sensitive item at a time: live now > starting soon > registration.
 */
import {
  arenaSpotlight, haitiDateTime, nearestTournoi, pickSpotlight, spotlightCountdown,
  tournoiSpotlight, SOON_WINDOW_MS, LATE_START_GRACE_MS,
} from '../../../../../shared/homeSpotlight';

const NOW = Date.UTC(2026, 9, 19, 15, 0, 0); // Sun 19 Oct 2026, 11:00 in Port-au-Prince (UTC-4)
const H = 60 * 60 * 1000;

const tour = (over: Partial<{ id: string; title: string; state: string; startsAt: number; doorsAt: number }> = {}) => ({
  id: 'c1', title: 'Championnat', state: 'registration', startsAt: NOW + 72 * H, doorsAt: NOW + 71 * H, ...over,
});

describe('arenaSpotlight', () => {
  it('is null with nothing open or live', () => {
    expect(arenaSpotlight({ open: null, active: null, registered: false, now: NOW })).toBeNull();
  });

  it('registration, not registered → register, counting to the doors', () => {
    const s = arenaSpotlight({ open: tour(), active: null, registered: false, now: NOW })!;
    expect(s.phase).toBe('register');
    expect(s.urgency).toBe('registration');
    expect(s.countdownKind).toBe('doors');
    expect(s.countdownTo).toBe(NOW + 71 * H);
  });

  it('registration, registered and starting within the window → soon', () => {
    const s = arenaSpotlight({ open: tour({ startsAt: NOW + H, doorsAt: NOW + 0.5 * H }), active: null, registered: true, now: NOW })!;
    expect(s.phase).toBe('registered');
    expect(s.urgency).toBe('soon');
  });

  it('never counts to a date already behind us', () => {
    const s = arenaSpotlight({ open: tour({ startsAt: NOW - H, doorsAt: NOW - 2 * H }), active: null, registered: false, now: NOW })!;
    expect(s.countdownTo).toBeNull();
    expect(s.countdownKind).toBeNull();
  });

  it('doors → soon, counting to the start', () => {
    const s = arenaSpotlight({ open: tour({ state: 'doors', startsAt: NOW + 0.25 * H }), active: null, registered: false, now: NOW })!;
    expect(s.phase).toBe('doors');
    expect(s.urgency).toBe('soon');
    expect(s.countdownKind).toBe('start');
  });

  it('live outranks an open announcement; registration decides play vs watch', () => {
    const live = tour({ id: 'L', state: 'live', startsAt: NOW - 0.2 * H });
    expect(arenaSpotlight({ open: tour(), active: live, registered: true, now: NOW })!.phase).toBe('live-play');
    expect(arenaSpotlight({ open: null, active: live, registered: false, now: NOW })!.phase).toBe('live-watch');
    expect(arenaSpotlight({ open: null, active: live, registered: false, now: NOW })!.urgency).toBe('live');
  });

  it('grading / provisional are not spotlighted (results stay in the tile)', () => {
    expect(arenaSpotlight({ open: null, active: tour({ state: 'provisional' }), registered: true, now: NOW })).toBeNull();
  });
});

describe('tournoiSpotlight / nearestTournoi', () => {
  const doc = (state: string, startsAt: number) => ({ id: 't1', title: 'Tournoi de la classe', state, startsAt, playerCount: 6 });

  it('running → live', () => {
    expect(tournoiSpotlight(doc('running', NOW - H), NOW)!.urgency).toBe('live');
  });
  it('scheduled within the window → soon with a countdown', () => {
    const s = tournoiSpotlight(doc('scheduled', NOW + 20 * 60 * 1000), NOW)!;
    expect(s.urgency).toBe('soon');
    expect(s.countdownTo).toBe(NOW + 20 * 60 * 1000);
  });
  it('scheduled too far ahead, finished, cancelled or long-stale → nothing', () => {
    expect(tournoiSpotlight(doc('scheduled', NOW + SOON_WINDOW_MS + 1), NOW)).toBeNull();
    expect(tournoiSpotlight(doc('finished', NOW - H), NOW)).toBeNull();
    expect(tournoiSpotlight(doc('cancelled', NOW + 10), NOW)).toBeNull();
    expect(tournoiSpotlight(doc('scheduled', NOW - LATE_START_GRACE_MS - 1), NOW)).toBeNull();
  });
  it('scheduled but just past its start (not ticked yet) → live', () => {
    expect(tournoiSpotlight(doc('scheduled', NOW - 60 * 1000), NOW)!.urgency).toBe('live');
  });
  it('watches the nearest relevant tournament only', () => {
    const mine = [
      { tid: 'old', startsAt: NOW - 30 * H },
      { tid: 'far', startsAt: NOW + 30 * H },
      { tid: 'soon', startsAt: NOW + 0.5 * H },
      { tid: 'later', startsAt: NOW + 1.5 * H },
    ];
    expect(nearestTournoi(mine, NOW)!.tid).toBe('soon');
    expect(nearestTournoi([{ tid: 'far', startsAt: NOW + 30 * H }], NOW)).toBeNull();
    expect(nearestTournoi(null, NOW)).toBeNull();
  });
});

describe('pickSpotlight (one at a time)', () => {
  const item = (urgency: 'live' | 'soon' | 'registration', startsAt: number, id: string) => ({ urgency, startsAt, id });

  it('live now > starting soon > registration', () => {
    const reg = item('registration', NOW + 2 * H, 'reg');
    const soon = item('soon', NOW + H, 'soon');
    const live = item('live', NOW - H, 'live');
    expect(pickSpotlight([reg, soon, live])!.id).toBe('live');
    expect(pickSpotlight([reg, soon])!.id).toBe('soon');
    expect(pickSpotlight([reg, null, undefined])!.id).toBe('reg');
  });
  it('same urgency → the earlier start', () => {
    expect(pickSpotlight([item('soon', NOW + 2 * H, 'b'), item('soon', NOW + H, 'a')])!.id).toBe('a');
  });
  it('nothing → null (Home keeps its usual layout)', () => {
    expect(pickSpotlight([null, undefined])).toBeNull();
  });
  it('a live user tournament outranks the Arène in registration', () => {
    const arena = arenaSpotlight({ open: tour(), active: null, registered: false, now: NOW });
    const mine = tournoiSpotlight({ id: 't', title: 'T', state: 'running', startsAt: NOW - H }, NOW);
    expect(pickSpotlight<any>([arena, mine])!.kind).toBe('tournoi');
  });
});

describe('time, in Haiti', () => {
  it('formats on the Port-au-Prince clock, FR and Kreyòl', () => {
    // 23:00 UTC on Sun 25 Oct 2026 = 19:00 in Port-au-Prince (EDT, UTC-4).
    const ms = Date.UTC(2026, 9, 25, 23, 0, 0);
    expect(haitiDateTime(ms, false)).toBe('dimanche 25 octobre · 19 h 00, heure d’Haïti');
    expect(haitiDateTime(ms, true)).toBe('dimanch 25 oktòb · 19:00, lè Ayiti');
    // 02:30 UTC on Mon 26 Oct is still Sunday evening in Haiti.
    expect(haitiDateTime(Date.UTC(2026, 9, 26, 2, 30), false)).toBe('dimanche 25 octobre · 22 h 30, heure d’Haïti');
    expect(haitiDateTime(0, false)).toBe('');
  });
  it('counts down in the lobby format', () => {
    expect(spotlightCountdown(2 * H + 14 * 60 * 1000 + 9000)).toBe('02:14:09');
    expect(spotlightCountdown(2 * 24 * H + 3 * H + 4 * 60 * 1000 + 5000)).toBe('2j 03:04:05');
    expect(spotlightCountdown(-1)).toBe('00:00:00');
  });
});
