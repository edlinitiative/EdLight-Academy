/**
 * Render tests for Home's first card while an event is on (SpotlightCard):
 * each Arène state + a user tournament, and the Reduce Motion still frame.
 */
import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import SpotlightCard, { spotlightCopy } from '../SpotlightCard';
import { arenaSpotlight, tournoiSpotlight } from '../../../../../shared/homeSpotlight';
import type { HomeSpotlight } from '../useHomeSpotlight';

interface TestNode {
  props: Record<string, any>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
  findAllByType(type: unknown): TestNode[];
}
const renderer: { create(el: React.ReactElement): { root: TestNode; unmount(): void } } = require('react-test-renderer');
const { act }: { act(cb: () => unknown): any } = require('react-test-renderer');

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
// The stage art is a large SVG; its own tests cover it.
jest.mock('../../arena/art/environment/ArenaWorld', () => () => null);

const H = 60 * 60 * 1000;
const now = Date.now();

function arenaTour(state: string, over: Record<string, any> = {}) {
  return {
    id: 'champ1', slug: 'c', title: 'Championnat d’octobre', state, startsAt: now + 3 * 24 * H, doorsAt: now + 3 * 24 * H - H,
    rounds: [], questionCount: 20, teamSize: 5, minPlayers: 5, prizes: [], currentRound: null, currentQuestion: null,
    counts: { schools: 12, players: 48, qualifiedSchools: 5 }, ...over,
  } as any;
}

function arenaItem(state: string, registered: boolean, over: Record<string, any> = {}): HomeSpotlight {
  const tour = arenaTour(state, over);
  const live = state === 'live' ? tour : null;
  const s = arenaSpotlight({ open: live ? null : tour, active: live, registered, now })!;
  return { ...s, tournament: tour };
}

const texts = (root: TestNode) => root.findAllByType(Text).map((n) => [].concat(n.props.children).join('')).join(' | ');
const byTestId = (root: TestNode, id: string) => root.findAll((n) => n.props.testID === id);

function render(item: HomeSpotlight, opts: { reduceMotion?: boolean; isCreole?: boolean } = {}) {
  const onOpen = jest.fn();
  let r: any;
  act(() => {
    r = renderer.create(<SpotlightCard item={item} isCreole={!!opts.isCreole} onOpen={onOpen} reduceMotion={opts.reduceMotion} />);
  });
  return { root: r.root as TestNode, onOpen, unmount: () => act(() => r.unmount()) };
}

afterEach(() => jest.useRealTimers());

describe('SpotlightCard — Arène states', () => {
  it('registration: title, Haiti date, countdown to doors, school progress, "Inscris ton école"', () => {
    const { root, onOpen, unmount } = render(arenaItem('registration', false));
    const all = texts(root);
    expect(all).toContain('Championnat d’octobre');
    expect(all).toContain('Inscriptions ouvertes');
    expect(all).toContain('heure d’Haïti');
    expect(all).toContain('Fin des inscriptions dans');
    expect(all).toContain('12 écoles inscrites · 48 joueurs');
    expect(all).toContain('5 qualifiées');
    expect(all).toContain('Inscris ton école');
    expect(byTestId(root, 'spotlight-countdown').length).toBeGreaterThan(0);
    act(() => byTestId(root, 'home-spotlight')[0].props.onPress());
    expect(onOpen).toHaveBeenCalledWith({ screen: 'ArenaLobby', params: { tournamentId: 'champ1' } });
    unmount();
  });

  it('registration, already registered: the team, with the team-size ask', () => {
    const { root, unmount } = render(arenaItem('registration', true));
    const all = texts(root);
    expect(all).toContain('Tu es inscrit');
    expect(all).toContain('il faut 5 joueurs par école');
    expect(all).toContain('Voir mon équipe');
    unmount();
  });

  it('doors: "Entrer dans l’Arène", counting to kick-off', () => {
    const { root, unmount } = render(arenaItem('doors', false, { startsAt: now + 20 * 60 * 1000 }));
    const all = texts(root);
    expect(all).toContain('Portes ouvertes');
    expect(all).toContain('Coup d’envoi dans');
    expect(all).toContain('Entrer dans l’Arène');
    unmount();
  });

  it('live + registered: "Rejoindre maintenant" → the live screen, no countdown', () => {
    const { root, onOpen, unmount } = render(arenaItem('live', true, { startsAt: now - H }));
    const all = texts(root);
    expect(all).toContain('En direct');
    expect(all).toContain('Rejoindre maintenant');
    expect(byTestId(root, 'spotlight-countdown')).toHaveLength(0);
    act(() => byTestId(root, 'home-spotlight')[0].props.onPress());
    expect(onOpen).toHaveBeenCalledWith({ screen: 'ArenaLive', params: { tournamentId: 'champ1' } });
    unmount();
  });

  it('live, not registered: watch, never a sign-up that has closed', () => {
    const item = arenaItem('live', false, { startsAt: now - H });
    expect(spotlightCopy(item, (fr) => fr).target).toEqual({ screen: 'ArenaWatch', params: { tournamentId: 'champ1' } });
    const { root, unmount } = render(item);
    expect(texts(root)).toContain('Regarder en direct');
    expect(texts(root)).not.toContain('Inscris');
    unmount();
  });

  it('speaks Kreyòl', () => {
    const { root, unmount } = render(arenaItem('registration', false), { isCreole: true });
    const all = texts(root);
    expect(all).toContain('Enskri lekòl ou');
    expect(all).toContain('lè Ayiti');
    expect(all).toContain('12 lekòl enskri');
    unmount();
  });

  it('hides the progress row when no school has registered yet', () => {
    const { root, unmount } = render(arenaItem('registration', false, { counts: { schools: 0, players: 0, qualifiedSchools: 0 } }));
    expect(byTestId(root, 'spotlight-progress')).toHaveLength(0);
    unmount();
  });
});

describe('SpotlightCard — a tournament the student is in', () => {
  it('starting soon: countdown + "Ouvrir le tournoi"', () => {
    const item = tournoiSpotlight({ id: 't9', title: 'Tournoi NS4', state: 'scheduled', startsAt: now + 30 * 60 * 1000, playerCount: 7 }, now)!;
    const { root, onOpen, unmount } = render(item);
    const all = texts(root);
    expect(all).toContain('Ton tournoi');
    expect(all).toContain('Début dans');
    expect(all).toContain('7 joueurs inscrits');
    expect(all).toContain('Ouvrir le tournoi');
    act(() => byTestId(root, 'home-spotlight')[0].props.onPress());
    expect(onOpen).toHaveBeenCalledWith({ screen: 'Tournois', params: { tournamentId: 't9' } });
    unmount();
  });

  it('running: "Rejoindre maintenant"', () => {
    const item = tournoiSpotlight({ id: 't9', title: 'Tournoi NS4', state: 'running', startsAt: now - 60 * 1000 }, now)!;
    const { root, unmount } = render(item);
    expect(texts(root)).toContain('Rejoindre maintenant');
    unmount();
  });
});

describe('SpotlightCard — motion', () => {
  it('animates the glow, live pulse and button sheen by default', () => {
    const { root, unmount } = render(arenaItem('live', true, { startsAt: now - H }));
    expect(byTestId(root, 'spotlight-glow').length).toBeGreaterThan(0);
    expect(byTestId(root, 'spotlight-live-ring').length).toBeGreaterThan(0);
    // The sheen needs the button's measured width.
    const cta = root.findAll((n) => typeof n.props.onLayout === 'function')[0];
    act(() => cta.props.onLayout({ nativeEvent: { layout: { width: 300, height: 52, x: 0, y: 0 } } }));
    expect(byTestId(root, 'spotlight-sheen').length).toBeGreaterThan(0);
    unmount();
  });

  it('Reduce Motion: a still frame — no loops, the countdown still updates', () => {
    jest.useFakeTimers();
    const item = arenaItem('doors', false, { startsAt: Date.now() + 10 * 60 * 1000 });
    const { root, unmount } = render(item, { reduceMotion: true });
    const cta = root.findAll((n) => typeof n.props.onLayout === 'function')[0];
    act(() => cta.props.onLayout({ nativeEvent: { layout: { width: 300, height: 52, x: 0, y: 0 } } }));
    expect(byTestId(root, 'spotlight-glow')).toHaveLength(0);
    expect(byTestId(root, 'spotlight-glow-still').length).toBeGreaterThan(0);
    expect(byTestId(root, 'spotlight-live-ring')).toHaveLength(0);
    expect(byTestId(root, 'spotlight-sheen')).toHaveLength(0);
    const before = texts(root);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(texts(root)).not.toEqual(before);
    unmount();
  });

  it('follows the OS Reduce Motion setting when no override is given', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { root, unmount } = render(arenaItem('live', true, { startsAt: now - H }));
    await act(async () => { await Promise.resolve(); });
    expect(byTestId(root, 'spotlight-glow')).toHaveLength(0);
    expect(byTestId(root, 'spotlight-live-ring')).toHaveLength(0);
    unmount();
    spy.mockRestore();
  });
});
