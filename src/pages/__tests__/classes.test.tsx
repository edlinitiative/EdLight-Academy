import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Classes from '../Classes';
import useStore from '../../contexts/store';
import { classRequest } from '../../services/classService';
jest.mock('../../services/classService', () => ({ classRequest: jest.fn() }));
const request = classRequest as jest.Mock;
const home = { canTeach: false, classes: [{ id: 'c1', title: 'NS4 A', school: 'School', pending: false, teacher: false }] };
const detail = { classroom: { id: 'c1', title: 'NS4 A', school: 'School', grade: 'NS4', archived: false, assignments: [{ id: 'a1', title: 'Maths', examId: 'exam1', level: 'terminale', dueAt: 1792500000000 }] }, teacher: false, pending: [], members: [{ uid: 'student', name: 'Private student name', xp: 10, completed: 0 }], completed: [], completionCounts: {}, scores: {}, week: '2026-10-19' };
beforeEach(() => {
  jest.clearAllMocks(); useStore.setState({ user: { uid: 'student', name: 'Student' }, language: 'fr' } as any);
  request.mockImplementation(async (action) => action === 'read' ? detail : home);
});
it('opens a private class, links to its assignment, then clears it on account switch', async () => {
  render(<MemoryRouter><Classes /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
  expect(await screen.findByText('Private student name')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ouvrir l’examen' })).toHaveAttribute('href', '/exams/terminale/exam1');
  act(() => useStore.setState({ user: null }));
  await waitFor(() => expect(screen.queryByText('Private student name')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
});
it('requires the disclosure checkbox before joining and never offers creation to an unapproved account', async () => {
  render(<MemoryRouter><Classes /></MemoryRouter>);
  await screen.findByRole('button', { name: 'Ouvrir' });
  expect(screen.queryByRole('heading', { name: 'Créer une classe' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Demander à rejoindre' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Code de 6 caractères'), { target: { value: 'abc234' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Demander à rejoindre' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('join', { code: 'ABC234', consent: true, name: 'Student' }));
});
describe('teacher extensions', () => {
  afterEach(() => { delete (global as any).fetch; });
  const fixture = { id: 'f1', state: 'proposed', side: 'home', title: 'Défi de classes', opponent: null, code: 'FX2345', startsAt: 1792500000000, endsAt: 1792600000000, teamSize: 5, aggregate: 'average', questionCount: 10, tid: null, phase: 'waiting', mine: null, theirs: null, outcome: null };
  const teacher = { ...detail, teacher: true, classroom: { ...detail.classroom, code: 'ABC234' }, houses: [{ id: 'h1', name: 'Toussaint', color: 'azure', xp: 10, completed: 0, members: 1, rank: 1 }, { id: 'h2', name: 'Dessalines', color: 'rose', xp: 0, completed: 0, members: 0, rank: 2 }],
    members: [{ uid: 'student', name: 'Private student name', xp: 10, completed: 0, house: 'h1' }], fixtures: [fixture], fixtureCategories: [{ id: 'capitals', name: 'Capitales', nameHt: 'Kapital' }] };
  const analytics = { courses: [{ id: 'math-ns4', name: 'Maths NS4' }], courseId: 'math-ns4', shared: 1, notShared: 2,
    chapters: [{ id: 'U1', title: 'Fonctions', lessons: 1, counts: { none: 0, seen: 1, familiar: 0, proficient: 0, mastered: 0 }, percent: { none: 0, seen: 100, familiar: 0, proficient: 0, mastered: 0 }, avgPoints: 25, lessonRows: [] }],
    students: [{ uid: 'student', name: 'Private student name', points: 25, levels: { U1: 'seen' } }], weakest: ['U1'], assignments: [{ id: 'a1', title: 'Maths', dueAt: 1, completed: 1, onTime: 1, late: 0, rate: 100 }] };
  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => [] }));
    useStore.setState({ user: { uid: 't1', name: 'Prof' }, language: 'fr' } as any);
    request.mockImplementation(async (action) => action === 'read' ? teacher : action === 'analytics' ? analytics
      : action === 'fixture-preview' ? { id: 'f2', title: 'Match', home: { title: 'NS4 C', school: 'Lycée C' }, startsAt: 1792500000000, windowHours: 24, teamSize: 3, aggregate: 'sum', questionCount: 5, secondsPerQuestion: 20 }
      : action === 'home' ? { ...home, canTeach: true } : { ok: true });
  });
  it('shows analytics levels and weakest chapters, the waiting fixture code, houses, and accepts a colleague’s challenge', async () => {
    render(<MemoryRouter><Classes /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('Chapitres à retravailler')).toBeInTheDocument();
    expect(screen.getByText(/2 n’ont pas encore accepté le partage/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Private student name 25 Vu/ })).toBeInTheDocument();
    expect(screen.getByText('FX2345')).toBeInTheDocument();
    expect(screen.getByText('En attente de l’autre professeur')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Classement des maisons' })).toHaveTextContent('Toussaint');
    fireEvent.change(screen.getByLabelText('Code du défi'), { target: { value: 'zz2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voir le défi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accepter pour NS4 A' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('fixture-accept', { id: 'c1', code: 'ZZ2345' }));
    fireEvent.click(screen.getByRole('button', { name: 'Défier une autre classe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Capitales' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Somme des 5 meilleurs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le défi' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('fixture-propose', expect.objectContaining({ id: 'c1', categories: ['capitals'], aggregate: 'sum', teamSize: 5 })));
    fireEvent.change(screen.getByLabelText('Maison de Private student name'), { target: { value: 'h2' } });
    await waitFor(() => expect(request).toHaveBeenCalledWith('house-move', { id: 'c1', studentUid: 'student', houseId: 'h2' }));
  });
});
