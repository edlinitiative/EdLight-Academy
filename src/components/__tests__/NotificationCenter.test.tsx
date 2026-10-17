import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import NotificationCenter from '../NotificationCenter';

const mockState = { user: { uid: 'u1' }, language: 'fr' };
jest.mock('../../contexts/store', () => ({
  __esModule: true,
  default: (selector?: any) => (selector ? selector(mockState) : mockState),
}));

const now = Date.now();
const ts = (ms: number) => ({ toMillis: () => ms });
let mockRows: any[] | null = [];
const mockSvc = {
  getRecentNotifications: jest.fn(async (..._a: any[]) => mockRows),
  markNotificationRead: jest.fn(async (..._a: any[]) => true),
  markAllNotificationsRead: jest.fn(async (..._a: any[]) => ({ updated: 1, failed: 0 })),
  getNotificationPreferences: jest.fn(async (..._a: any[]) => ({ reminderTime: '18:00', studyReminders: true })),
  updateNotificationPreferences: jest.fn(async (..._a: any[]) => true),
  getUserReminders: jest.fn(async (..._a: any[]) => []),
  createStudyReminder: jest.fn(async (..._a: any[]) => 'reminder-1'),
  deleteReminder: jest.fn(async (..._a: any[]) => true),
};
jest.mock('../../services/notificationService', () => ({
  getRecentNotifications: (...a: any[]) => mockSvc.getRecentNotifications(...a),
  markNotificationRead: (...a: any[]) => mockSvc.markNotificationRead(...a),
  markAllNotificationsRead: (...a: any[]) => mockSvc.markAllNotificationsRead(...a),
  getNotificationPreferences: (...a: any[]) => mockSvc.getNotificationPreferences(...a),
  updateNotificationPreferences: (...a: any[]) => mockSvc.updateNotificationPreferences(...a),
  getUserReminders: (...a: any[]) => mockSvc.getUserReminders(...a),
  createStudyReminder: (...a: any[]) => mockSvc.createStudyReminder(...a),
  deleteReminder: (...a: any[]) => mockSvc.deleteReminder(...a),
}));
jest.mock('../../services/pushNotificationService', () => ({
  getPermission: () => 'default',
  requestNotificationPermission: jest.fn(),
  isNotificationSupported: () => true,
  showLocalNotification: jest.fn(),
  subscribeToPush: jest.fn(),
  sendSelfTestPush: jest.fn(),
}));

const renderInbox = () => render(<MemoryRouter><NotificationCenter onClose={() => {}} /></MemoryRouter>);

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [
    { id: 'a', type: 'achievement', title: 'New Achievement! 🎉', message: 'You\'ve earned the "Premier pas" badge!', read: false, createdAt: ts(now - 5 * 60000) },
    { id: 's', type: 'streak', title: 'Streak Milestone!', message: '🔥 Amazing!', streakDays: 7, read: true, createdAt: ts(now - 3 * 86400000) },
  ];
});

test('legacy English items render in French from their typed fields, grouped by day', async () => {
  renderInbox();
  expect(await screen.findByText('Nouveau succès')).toBeInTheDocument();
  expect(screen.getByText('Tu as gagné le badge « Premier pas »' + '.')).toBeInTheDocument();
  expect(screen.getByText('Série de 7 jours')).toBeInTheDocument();
  expect(screen.queryByText(/New Achievement/)).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Aujourd’hui' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Plus tôt' })).toBeInTheDocument();
});

test('marking read keeps the item in Toutes and removes it from Non lues', async () => {
  renderInbox();
  await screen.findByText('Nouveau succès');
  fireEvent.click(screen.getByRole('button', { name: 'Marquer comme lu' }));
  await waitFor(() => expect(mockSvc.markNotificationRead).toHaveBeenCalledWith('u1', 'a'));
  expect(screen.getByText('Nouveau succès')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Non lues' }));
  expect(screen.getByText('Tout est à jour.')).toBeInTheDocument();
  expect(screen.queryByText('Nouveau succès')).not.toBeInTheDocument();
});

test('a failed read write puts the row back to unread and says so', async () => {
  mockSvc.markNotificationRead.mockResolvedValueOnce(false);
  renderInbox();
  await screen.findByText('Nouveau succès');
  fireEvent.click(screen.getByRole('button', { name: 'Marquer comme lu' }));
  expect(await screen.findByText('Impossible de marquer comme lu. Réessaie.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Marquer comme lu' })).toBeInTheDocument();
});

test('mark-all reports a partial failure', async () => {
  mockSvc.markAllNotificationsRead.mockResolvedValueOnce({ updated: 1, failed: 2 });
  renderInbox();
  await screen.findByText('Nouveau succès');
  fireEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
  expect(await screen.findByText(/2 notifications n’ont pas pu être marquées/)).toBeInTheDocument();
});

test('a load failure is not shown as an empty inbox', async () => {
  mockRows = null;
  renderInbox();
  expect(await screen.findByText('Les notifications n’ont pas pu être chargées.')).toBeInTheDocument();
  expect(screen.queryByText('Aucune notification pour le moment.')).not.toBeInTheDocument();
});

test('a reminder is only created from the explicit form, with a schedule preview', async () => {
  renderInbox();
  await screen.findByText('Nouveau succès');
  fireEvent.click(screen.getByRole('tab', { name: 'Rappels' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nouveau rappel' }));
  expect(mockSvc.createStudyReminder).not.toHaveBeenCalled();
  const form = screen.getByRole('heading', { name: 'Nouveau rappel' }).closest('form') as HTMLElement;
  fireEvent.click(within(form).getByLabelText('Chaque semaine'));
  expect(within(form).getByText(/^Chaque .+ à 18:00, à partir du/)).toBeInTheDocument();
  fireEvent.click(within(form).getByRole('button', { name: 'Créer le rappel' }));
  await waitFor(() => expect(mockSvc.createStudyReminder).toHaveBeenCalledTimes(1));
  const [, data] = mockSvc.createStudyReminder.mock.calls[0] as any[];
  expect(data).toMatchObject({ recurring: true, recurringPattern: 'weekly' });
  expect(new Date(data.scheduledFor).getTime()).toBeGreaterThan(Date.now());
});

test('the row destination is a link and the read control is a separate button', async () => {
  renderInbox();
  await screen.findByText('Nouveau succès');
  const link = screen.getByRole('link', { name: /Nouveau succès/ });
  expect(link).toHaveAttribute('href', '/profile');
  expect(within(link).queryByRole('button')).toBeNull();
});
