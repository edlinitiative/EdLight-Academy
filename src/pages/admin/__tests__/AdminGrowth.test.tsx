import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminGrowth from '../AdminGrowth';
import { ambassadorRequest } from '../../../services/ambassadorService';

jest.mock('../../../services/adminService', () => ({ listUsers: jest.fn(async () => []) }));
jest.mock('../../../services/ambassadorService', () => ({ ambassadorRequest: jest.fn() }));
const row = (extra: Record<string, unknown>) => ({ uid: 'u', name: 'Jean', school: 'Lycée Pétion', period: '2026-10', active: true, recruits: 1, retained: 0,
  retainedUnflagged: 0, pending: 1, notRetained: 0, flagged: 0, rewardDelivered: false, rewardNotes: '', ...extra });

it('shows where each designation came from, with the Apply application id and reviewer', async () => {
  (ambassadorRequest as jest.Mock).mockResolvedValue({ period: '2026-10', rows: [
    row({ uid: 'a', name: 'Jean', source: 'edlight-apply', applicationId: 'app_42', reviewerName: 'Marie' }),
    row({ uid: 'b', name: 'Rose', source: 'admin' }),
  ] });
  render(<AdminGrowth />);
  expect(await screen.findByText('Candidature app_42 · Marie')).toBeInTheDocument();
  expect(screen.getByText('Console admin')).toBeInTheDocument();
});
