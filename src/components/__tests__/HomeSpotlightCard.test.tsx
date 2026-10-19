/**
 * The web Dashboard's first content card while an event is on: each Arène
 * state + a user tournament, the test-edition filter, and the reduced-motion
 * contract (CSS-only motion, so the stylesheet is what is checked).
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
// jest.mock calls below are hoisted above these imports by babel-jest.
import { SpotlightCardView, webSpotlightCopy } from '../HomeSpotlightCard';
import { splitArenaDocs, toSpotlightArenaDoc, type WebHomeSpotlight } from '../../hooks/useHomeSpotlight';
import { arenaSpotlight, tournoiSpotlight } from '../../../shared/homeSpotlight';

jest.mock('../../services/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), onSnapshot: jest.fn(() => () => {}), query: jest.fn(), where: jest.fn() }));
jest.mock('../../services/arenaWebService', () => ({ subscribeRegistration: jest.fn(() => () => {}) }));
jest.mock('../../services/tournoisService', () => ({ listMine: jest.fn(async () => []), watchTournament: jest.fn(() => () => {}) }));
jest.mock('../../arena-art/environment/ArenaWorld', () => () => null);


const H = 60 * 60 * 1000;
const now = Date.now();

function arenaItem(state: string, registered: boolean, over: Record<string, any> = {}): WebHomeSpotlight {
  const doc = toSpotlightArenaDoc('champ1', {
    title: 'Championnat d’octobre', titleHt: 'Chanpyona oktòb', state,
    startsAt: now + 72 * H, doorsAt: now + 71 * H, minPlayers: 5,
    counts: { schools: 12, players: 48, qualifiedSchools: 5 }, ...over,
  });
  const live = state === 'live' ? doc : null;
  const s = arenaSpotlight({ open: live ? null : doc, active: live, registered, now })!;
  return { ...s, doc };
}

const view = (item: WebHomeSpotlight, isCreole = false) =>
  render(<MemoryRouter><SpotlightCardView item={item} isCreole={isCreole} /></MemoryRouter>);

describe('SpotlightCardView — Arène', () => {
  it('registration: title, Haiti time, countdown, schools, "Inscris ton école"', () => {
    view(arenaItem('registration', false));
    expect(screen.getByRole('heading', { name: 'Championnat d’octobre' })).toBeInTheDocument();
    expect(screen.getByText(/heure d’Haïti/)).toBeInTheDocument();
    expect(screen.getByText('Fin des inscriptions dans')).toBeInTheDocument();
    expect(screen.getByTestId('hs-countdown')).toBeInTheDocument();
    expect(screen.getByText(/12 écoles inscrites · 48 joueurs/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('link', { name: /Inscris ton école/ })).toHaveAttribute('href', '/arena/championnat');
  });

  it('registered: the team ask uses the event’s own minimum', () => {
    view(arenaItem('registration', true));
    expect(screen.getByText('Tu es inscrit')).toBeInTheDocument();
    expect(screen.getByText(/il faut 5 joueurs par école/)).toBeInTheDocument();
  });

  it('doors: "Entrer dans l’Arène"', () => {
    view(arenaItem('doors', false, { startsAt: now + 0.25 * H }));
    expect(screen.getByText('Portes ouvertes')).toBeInTheDocument();
    expect(screen.getByText('Coup d’envoi dans')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Entrer dans l’Arène/ })).toBeInTheDocument();
  });

  it('live: play when registered, watch otherwise; no countdown', () => {
    const { unmount } = view(arenaItem('live', true, { startsAt: now - H }));
    expect(screen.getByRole('link', { name: /Rejoindre maintenant/ })).toHaveAttribute('href', '/arena/jouer/champ1');
    expect(screen.queryByTestId('hs-countdown')).toBeNull();
    unmount();
    view(arenaItem('live', false, { startsAt: now - H }));
    expect(screen.getByRole('link', { name: /Regarder en direct/ })).toHaveAttribute('href', '/direct');
  });

  it('Kreyòl, with the Kreyòl title', () => {
    view(arenaItem('registration', false), true);
    expect(screen.getByRole('heading', { name: 'Chanpyona oktòb' })).toBeInTheDocument();
    expect(screen.getByText(/lè Ayiti/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enskri lekòl ou/ })).toBeInTheDocument();
  });
});

describe('SpotlightCardView — a tournament the student is in', () => {
  it('starting soon → the room, with a countdown', () => {
    const item = tournoiSpotlight({ id: 't9', title: 'Tournoi NS4', state: 'scheduled', startsAt: now + 0.5 * H, playerCount: 7 }, now)!;
    view(item);
    expect(screen.getByText('Début dans')).toBeInTheDocument();
    expect(screen.getByText('7 joueurs inscrits')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir le tournoi/ })).toHaveAttribute('href', '/tournois/t9');
    expect(webSpotlightCopy(item, (fr) => fr).live).toBe(false);
  });
});

describe('splitArenaDocs', () => {
  it('never announces test / demo editions, prefers doors, and finds the live one', () => {
    const rows = [
      toSpotlightArenaDoc('t', { title: 'Arène de test', state: 'doors' }),
      toSpotlightArenaDoc('r', { title: 'Championnat', state: 'registration', startsAt: 2 }),
      toSpotlightArenaDoc('d', { title: 'Championnat bis', state: 'doors', startsAt: 3 }),
      toSpotlightArenaDoc('l', { title: 'Finale', state: 'live', startsAt: 1 }),
      toSpotlightArenaDoc('x', { title: 'Flag', state: 'live', isTest: true }),
    ];
    const { open, live } = splitArenaDocs(rows);
    expect(open?.id).toBe('d');
    expect(live?.id).toBe('l');
  });
});

describe('reduced motion', () => {
  it('every animated piece is switched off under prefers-reduced-motion', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'HomeSpotlightCard.css'), 'utf8');
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/\.hs__glow[^{]*\{[^}]*animation: none/);
    expect(block).toContain('.hs__cta::after { display: none; }');
    expect(block).toContain('.hs--live .hs__dot::after { display: none; }');
  });
});
