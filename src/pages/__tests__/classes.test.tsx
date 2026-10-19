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
