import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Suivi, { releveFromPublic } from '../suivi/Suivi';
import PartagerSuivi from '../PartagerSuivi';
import useStore from '../../contexts/store';
import { shareRequest } from '../../services/progressShareService';
import type { PublicProgress } from '../../../shared/progressShare';

jest.mock('../../services/progressShareService', () => ({ shareRequest: jest.fn() }));
const request = shareRequest as jest.Mock;
const token = 'A'.repeat(32);
const summary = { points: 50, level: 'familiar', total: 2, mastered: 0, started: 2, counts: { none: 0, seen: 1, familiar: 0, proficient: 1, mastered: 0 } } as any;
const progress: PublicProgress = {
  scope: 'progress-v1', firstName: 'Marie', grade: 'NS4', generatedAt: Date.UTC(2026, 9, 19, 15), expiresAt: Date.UTC(2027, 0, 17, 15),
  lastActivityDay: '2026-10-18', streak: { current: 3, best: 9 }, xp: 1234, lessonsDone: 2,
  courses: [{ courseId: 'math-ns4', name: 'Maths NS4', lessonsCompleted: 2, lessonTotal: 10, mastery: summary, units: [{ unitId: 'U1', title: 'Fonctions', mastery: summary }] }],
  exams: [{ title: 'Bac Maths', subject: 'Maths', year: '2024', level: 'terminale', percentage: 72, submittedAtMs: Date.UTC(2026, 9, 1) }],
};
const renderSuivi = () => render(<MemoryRouter initialEntries={[`/suivi/${token}`]}><Routes><Route path="/suivi/:token" element={<Suivi />} /></Routes></MemoryRouter>);
const respond = (status: number, body: unknown) => { (global as any).fetch = jest.fn(async () => ({ status, ok: status < 400, json: async () => body })); };

beforeEach(() => { jest.clearAllMocks(); useStore.setState({ user: { uid: 'stu', name: 'Marie Claire' }, language: 'fr', isAuthenticated: true } as any); });

describe('/suivi/:token', () => {
  it('maps the public scope onto the relevé sheet with first name and class only', () => {
    const props = releveFromPublic(progress, false);
    expect(props.identity).toEqual([['Prénom', 'Marie'], ['Classe', 'NS4 · Terminale (Bac)']]);
    expect(props.accuracy).toBeNull();
    expect(props.exams[0]).toMatchObject({ title: 'Bac Maths', percentage: 72, levelLabel: 'Baccalauréat' });
    expect(props.courses[0]).toMatchObject({ name: 'Maths NS4', points: 0, badges: [] });
  });
  it('shows the record signed out, with a language switch, and marks the page noindex', async () => {
    useStore.setState({ user: null, isAuthenticated: false } as any);
    respond(200, { status: 'ok', progress });
    renderSuivi();
    expect(await screen.findByRole('heading', { name: 'Les progrès de Marie' })).toBeInTheDocument();
    expect(screen.getByText('Maths NS4')).toBeInTheDocument();
    expect(screen.getByText('1 234')).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
    expect((global as any).fetch).toHaveBeenCalledWith(`/api/progress-share?token=${token}`, expect.objectContaining({ referrerPolicy: 'no-referrer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kreyòl' }));
    expect(screen.getByRole('heading', { name: 'Pwogrè Marie' })).toBeInTheDocument();
  });
  it('a revoked or expired link gets a friendly page, not the record', async () => {
    respond(200, { status: 'revoked' });
    renderSuivi();
    expect(await screen.findByRole('heading', { name: 'Ce lien n’est plus actif' })).toBeInTheDocument();
    respond(200, { status: 'expired' });
    const { unmount } = renderSuivi();
    expect(await screen.findByRole('heading', { name: 'Ce lien a expiré' })).toBeInTheDocument();
    unmount();
  });
  it('says so when rate-limited and offers a retry', async () => {
    respond(429, { error: 'rate_limit' });
    renderSuivi();
    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de consultations');
  });
});

describe('Partager mon suivi', () => {
  it('creates a link with the chosen duration, shows the privacy line, and lists views', async () => {
    let shares: any[] = [];
    request.mockImplementation(async (action: string, values: any) => {
      if (action === 'list') return { shares };
      if (action === 'create') { shares = [{ id: 'h1', createdAt: Date.now(), expiresAt: Date.now() + values.days * 86400000, lastViewedAt: null, views: 0 }]; return { token, id: 'h1' }; }
      return { ok: true };
    });
    render(<MemoryRouter><PartagerSuivi /></MemoryRouter>);
    expect(await screen.findByText('Aucun lien actif.')).toBeInTheDocument();
    expect(screen.getByText(/jamais tes réponses/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/30 jours/));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le lien' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('create', { days: 30 }));
    expect(await screen.findByDisplayValue(`${window.location.origin}/suivi/${token}`)).toBeInTheDocument();
    expect(await screen.findByText('Pas encore ouvert')).toBeInTheDocument();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('revoke', { id: 'h1' }));
  });
});
