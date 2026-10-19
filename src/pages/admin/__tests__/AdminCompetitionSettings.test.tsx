import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminCompetitionSettings from '../AdminCompetitionSettings';
import { resolveCompetitionFlags } from '../../../../shared/competition/flags';

jest.mock('../../../services/firebase', () => ({
  getIdToken: jest.fn(async () => 'token-admin'),
}));

const response = (stored: Record<string, unknown> | null, audit: unknown[] = []) => ({
  ok: true,
  flags: resolveCompetitionFlags(stored as any, {}),
  audit,
  people: { admin1: { name: 'Ted' } },
});

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});
const reply = (body: unknown, ok = true) =>
  fetchMock.mockResolvedValueOnce({ ok, status: ok ? 200 : 403, json: async () => body });
const sent = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body);

describe('AdminCompetitionSettings', () => {
  it('shows each switch with its effective value and source, plus the audit list', async () => {
    reply(
      response({ discoveryEnabled: false, updatedAt: 1_790_000_000_000, updatedBy: 'admin1' }, [
        { id: 'a1', flag: 'discoveryEnabled', from: null, to: false, by: 'admin1', at: 1_790_000_000_000 },
      ]),
    );
    render(<AdminCompetitionSettings />);
    const discovery = await screen.findByRole('switch', { name: 'Découverte publique' });
    expect(discovery).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: "Création d'événements" })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('défini ici')).toBeInTheDocument();
    expect(screen.getAllByText('valeur par défaut du serveur')).toHaveLength(2);
    expect(screen.getByText('valeur par défaut → désactivé')).toBeInTheDocument();
    expect(sent(0)).toEqual({ action: 'platform-config' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-admin');
  });

  it('asks for confirmation before enabling creation, and does nothing when declined', async () => {
    reply(response(null));
    render(<AdminCompetitionSettings />);
    const creation = await screen.findByRole('switch', { name: "Création d'événements" });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(creation);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('BLOQUÉ'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    confirm.mockReturnValueOnce(true);
    reply(response({ creationEnabled: true }));
    fireEvent.click(creation);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sent(1)).toEqual({ action: 'platform-config-set', changes: { creationEnabled: true } });
    await waitFor(() => expect(creation).toHaveAttribute('aria-checked', 'true'));
    confirm.mockRestore();
  });

  it('turns discovery off without a confirmation and can reset a flag to the server default', async () => {
    reply(response(null));
    render(<AdminCompetitionSettings />);
    const confirm = jest.spyOn(window, 'confirm');
    const discovery = await screen.findByRole('switch', { name: 'Découverte publique' });
    reply(response({ discoveryEnabled: false }));
    fireEvent.click(discovery);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(confirm).not.toHaveBeenCalled();
    expect(sent(1)).toEqual({ action: 'platform-config-set', changes: { discoveryEnabled: false } });

    reply(response(null));
    fireEvent.click(await screen.findByRole('button', { name: /Revenir à la valeur par défaut/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(sent(2)).toEqual({ action: 'platform-config-set', changes: { discoveryEnabled: null } });
    confirm.mockRestore();
  });

  it('marks team modes as waiting for creation when only they are on', async () => {
    reply(response({ teamModesEnabled: true }));
    render(<AdminCompetitionSettings />);
    expect(await screen.findByRole('switch', { name: /Modes d'équipe/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/en attente de la création/)).toBeInTheDocument();
  });

  it('shows the server error when the caller is not an admin', async () => {
    reply({ error: 'not_admin' }, false);
    render(<AdminCompetitionSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not_admin');
  });
});
