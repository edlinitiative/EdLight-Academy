import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MySchoolCard from '../MySchoolCard';

const mockState: any = { language: 'fr', user: { uid: 'me' }, setSchoolChosen: jest.fn() };
jest.mock('../../contexts/store', () => ({
  __esModule: true,
  default: (sel?: any) => (sel ? sel(mockState) : mockState),
}));
let mockProfile: any = null;
jest.mock('../../hooks/useTrivia', () => ({ useTrivia: () => ({ profile: mockProfile, isLoading: false }) }));
let mockBoard: any = { entries: [], myRank: null, myEntry: null, isLoading: false };
jest.mock('../../hooks/useLeaderboard', () => ({ useLeaderboard: () => mockBoard }));
let mockRace: any[] = [];
jest.mock('../../hooks/useSchoolRace', () => ({ useSchoolRace: () => ({ race: mockRace, isLoading: false }) }));
jest.mock('../../services/leaderboardService', () => ({ isValidAlias: (s: string) => /[a-z]/i.test(s || '') }));
jest.mock('../../utils/schoolInvite', () => ({
  schoolInviteMessage: () => 'msg', inviteRef: () => Promise.resolve({ code: 'X', link: 'L' }),
  sendInvite: jest.fn(), canNativeShare: () => false,
}));

const race = (key: string, place: number, members: number, teamXp: number) => ({
  key, label: key.toUpperCase(), place, members, teamXp, counted: Math.min(members, 5),
  qualified: members >= 5, needed: Math.max(0, 5 - members), rank: members >= 5 ? place : 0,
});

const renderCard = () => render(<MemoryRouter><MySchoolCard where="test" /></MemoryRouter>);

beforeEach(() => {
  mockProfile = { leaderboard: { school: 'lycee b', displayName: 'Mira' } };
  mockRace = [race('lycee a', 1, 5, 900), race('lycee b', 2, 2, 400), race('lycee c', 3, 1, 50)];
  mockBoard = {
    entries: [{ id: 'x', displayName: 'Doo', xp: 360 }, { id: 'me', displayName: 'Mira', xp: 110 }],
    myRank: 2, myEntry: { id: 'me', xp: 110 }, isLoading: false,
  };
});

test('shows the student’s weekly place with the gap to the one above', () => {
  renderCard();
  expect(screen.getByText('#2')).toBeInTheDocument();
  expect(screen.getByText(/110 XP · 250 XP derrière Doo/)).toBeInTheDocument();
});

test('shows the school’s place in the race and how many players it still needs', () => {
  renderCard();
  expect(screen.getByText('sur 3 écoles')).toBeInTheDocument();
  expect(screen.getByText(/2\/5 joueurs — il en manque 3 pour être classée/)).toBeInTheDocument();
});

test('a student without a pseudo is told how to appear, not shown a fake rank', () => {
  mockProfile = { leaderboard: { school: 'lycee b', displayName: '.' } };
  mockBoard = { entries: [], myRank: null, myEntry: null, isLoading: false };
  renderCard();
  expect(screen.getByRole('link', { name: 'Choisis un pseudo' })).toHaveAttribute('href', '/profile#reglages');
  expect(screen.queryByText(/^#\d/)).not.toBeInTheDocument();
});

test('without a school, the card still shows the weekly place and offers to add one', () => {
  mockProfile = { leaderboard: { displayName: 'Mira' } };
  renderCard();
  expect(screen.getByText('#2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Ajouter mon école/ })).toBeInTheDocument();
});
